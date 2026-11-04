<?php

namespace App\Services\Lottery;

use App\Models\Draw;
use App\Models\DrawResult;
use App\Models\LotteryAudit;
use App\Models\Office;
use App\Models\Ticket;
use App\Models\TicketLine;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class ResultService
{
    public function record(array $data, ?User $user = null): void
    {
        DB::transaction(function () use ($data, $user) {
            // Serialize result changes and payments using the same ordered consortium locks.
            Office::orderBy('id')->lockForUpdate()->get();
            $draw = Draw::findOrFail($data['draw_id']);
            $close = CarbonImmutable::parse($data['business_date'].' '.$draw->closes_at, 'America/Santo_Domingo');
            abort_if($close->isFuture(), 422, 'No se pueden registrar resultados antes del cierre.');
            $affected = TicketLine::where(fn ($q) => $q->where('draw_id', $draw->id)->orWhere('second_draw_id', $draw->id))
                ->whereHas('ticket', fn ($q) => $q->where('business_date', $data['business_date'])->where('status', 'sold'))->get();
            $existing = DrawResult::where('draw_id', $draw->id)->where('business_date', $data['business_date'])->first();
            if ($existing && $existing->numbers === $data['numbers'] && $existing->status === 'confirmed' && ($data['confirmed'] ?? false)) {
                return;
            }
            abort_if($affected->contains(fn ($l) => $l->paid_at !== null), 422, 'Hay premios pagados: la corrección requiere conciliación y no se puede sobrescribir.');
            $result = DrawResult::updateOrCreate(['draw_id' => $draw->id, 'business_date' => $data['business_date']], [
                'numbers' => $data['numbers'], 'status' => ($data['confirmed'] ?? false) ? 'confirmed' : 'pending',
                'confirmed_by' => ($data['confirmed'] ?? false) ? $user?->id : null, 'source_url' => $data['source_url'] ?? null, 'evidence' => $data['evidence'] ?? null]);
            LotteryAudit::create(['user_id' => $user?->id, 'action' => 'result.updated', 'payload' => ['before' => $existing?->toArray(), 'after' => $result->toArray()]]);
            foreach ($affected as $line) {
                $line->update(['prize_minor' => $this->prize($line)]);
            }
        }, 3);
    }

    /** Repair unclassified wagers when a confirmed result was already imported. Never touch paid prizes. */
    public function reconcilePublished(int $drawId,string $date):array
    {
        return DB::transaction(function()use($drawId,$date){
            Office::orderBy('id')->lockForUpdate()->get();
            if(!DrawResult::where('draw_id',$drawId)->where('business_date',$date)->where('status','confirmed')->exists())return ['lines'=>0,'ticket_ids'=>[]];
            $lines=TicketLine::whereNull('prize_minor')->whereNull('paid_at')->where(fn($q)=>$q->where('draw_id',$drawId)->orWhere('second_draw_id',$drawId))->whereHas('ticket',fn($q)=>$q->where('business_date',$date)->where('status','sold'))->get();
            $ids=[];$changed=0;
            foreach($lines as $line){$prize=$this->prize($line);if($prize===null)continue;$line->update(['prize_minor'=>$prize]);$changed++;$ids[]=$line->ticket_id;}
            if($changed)LotteryAudit::create(['action'=>'result.tickets_reconciled','payload'=>['draw_id'=>$drawId,'business_date'=>$date,'lines'=>$changed,'tickets'=>count(array_unique($ids))]]);
            return ['lines'=>$changed,'ticket_ids'=>array_values(array_unique($ids))];
        },3);
    }

    public function remove(DrawResult $result, ?User $user = null): void
    {
        DB::transaction(function () use ($result, $user) {
            Office::orderBy('id')->lockForUpdate()->get();
            $result = DrawResult::whereKey($result->id)->lockForUpdate()->firstOrFail();
            $affected = TicketLine::where(fn ($q) => $q->where('draw_id', $result->draw_id)->orWhere('second_draw_id', $result->draw_id))
                ->whereHas('ticket', fn ($q) => $q->where('business_date', $result->business_date)->where('status', 'sold'))->get();
            abort_if($affected->contains(fn ($line) => $line->paid_at !== null), 422, 'Hay premios pagados: no se puede eliminar este resultado.');
            $before = $result->toArray();
            $result->delete();
            foreach ($affected as $line) {
                $line->update(['prize_minor' => $this->prize($line)]);
            }
            LotteryAudit::create(['user_id' => $user?->id, 'action' => 'result.deleted', 'payload' => ['before' => $before]]);
        }, 3);
    }

    public function prize(TicketLine $line): ?int
    {
        $date = $line->ticket->business_date;
        $first = DrawResult::where('draw_id', $line->draw_id)->where('business_date', $date)->where('status', 'confirmed')->first();
        if (! $first) {
            return null;
        }
        $second = $line->second_draw_id ? DrawResult::where('draw_id', $line->second_draw_id)->where('business_date', $date)->where('status', 'confirmed')->first() : null;
        if ($line->second_draw_id && ! $second) {
            return null;
        }
        $numbers = explode('-', $line->numbers);
        $rates = $line->rules['payouts'];
        $winning = [];
        if ($line->modality === 'quiniela') {
            foreach ($first->numbers as $i => $number) {
                if ($number === $numbers[0]) {
                    $winning[] = (string) ($i + 1);
                }
            }
        } elseif ($line->modality === 'tripleta') {
            $available = $first->numbers;
            $matches = 0;
            foreach ($numbers as $number) {
                $i = array_search($number, $available, true);
                if ($i !== false) {
                    $matches++;
                    unset($available[$i]);
                }
            }
            if ($matches >= 2) {
                $winning[] = (string) $matches;
            }
        } else {
            $categories = $line->modality === 'super_pale' ? ['1-1', '1-2', '1-3'] : ['1-2', '1-3', '2-3'];
            foreach ($categories as $category) {
                [$a,$b] = array_map('intval', explode('-', $category));
                $reverse = $second && (int) ($line->rules['primary_draw_id'] ?? $line->draw_id) === (int) $line->second_draw_id;
                $pair = $reverse ? [$second->numbers[$a - 1] ?? null, $first->numbers[$b - 1] ?? null] : [$first->numbers[$a - 1] ?? null, ($second ?? $first)->numbers[$b - 1] ?? null];
                if (in_array(null, $pair, true)) {
                    continue;
                }
                $target = $numbers;
                if (! ($line->rules['ordered'] ?? false)) {
                    sort($pair);
                    sort($target);
                }
                if ($pair === $target) {
                    $winning[] = $category;
                }
            }
        }
        // One award per wager: the highest matching configured category, including repeated results.
        $multiplier = 0;
        foreach ($winning as $category) {
            $multiplier = max($multiplier, (int) ($rates[$category] ?? 0));
        }

        return $line->amount_minor * $multiplier;
    }

    public function pay(User $user, Ticket $ticket, string $pin): LotteryAudit
    {
        $attemptKey = 'ticket-payment:'.$user->id.':'.$ticket->id;

        $payment = DB::transaction(function () use ($user, $ticket, $pin, $attemptKey) {
            Office::whereKey($ticket->office_id)->lockForUpdate()->firstOrFail();
            $ticket->refresh();
            abort_if(RateLimiter::tooManyAttempts($attemptKey, 5), 429, 'Demasiados intentos. Espera un minuto antes de volver a intentar.');
            if (! preg_match('/^[0-9]{6}$/D', $pin) || ! $ticket->payment_pin || ! hash_equals($ticket->payment_pin, $pin)) {
                RateLimiter::hit($attemptKey, 60);
                throw ValidationException::withMessages(['pin' => 'El PIN no corresponde a este ticket.']);
            }
            abort_unless($ticket->status === 'sold', 422, 'Ticket anulado.');
            $lines = $ticket->lines()->where('prize_minor', '>', 0)->whereNull('paid_at')->get();
            abort_if($lines->isEmpty(), 422, 'No hay premios pendientes de pago.');
            $bank = \App\Models\BranchOffice::with('office')->findOrFail($ticket->branch_office_id);
            $cash = app(CashService::class)->forOperation($bank);
            if ($cash) app(CashService::class)->record($cash, $user, 'prize', -$lines->sum('prize_minor'), 'prize:'.$ticket->id.':'.hash('sha256', $lines->sortBy('id')->pluck('id')->implode(',')), 'Pago de premios '.$ticket->code, $ticket->id);
            foreach ($lines as $line) {
                $line->update(['paid_at' => now(), 'paid_by' => $user->id]);
            }
            $pending = $ticket->lines()->whereNull('prize_minor')->whereNull('paid_at')->get();
            $continuation = null;
            if ($pending->isNotEmpty()) {
                do { $newPin = Ticket::generatePaymentPin(); } while (hash_equals($ticket->payment_pin, $newPin));
                $ticket->update(['payment_pin' => $newPin]);
                $continuation = app(ContinuationTicket::class)->snapshot($ticket, $bank, $pending);
            }
            return LotteryAudit::create(['office_id' => $ticket->office_id, 'user_id' => $user->id, 'action' => 'ticket.paid', 'payload' => [
                'ticket' => $ticket->code, 'amount_minor' => $lines->sum('prize_minor'),
                'pin_rotated' => $continuation !== null, 'continuation' => $continuation,
                'receipt' => [
                    'company_name' => $bank->office->name, 'branch_name' => $bank->name ?: $bank->code,
                    'branch' => $bank->code, 'branch_id' => $bank->id, 'paid_by' => $user->name,
                    'currency' => $ticket->currency, 'net_minor' => $lines->sum('prize_minor'),
                    'gross_minor' => $lines->sum('prize_minor'), 'discount_minor' => 0,
                    'show_qr' => false, 'print_settings' => ['show_qr' => false, 'company_name' => $bank->office->name, 'branch_name' => $bank->name ?: $bank->code],
                    'lines' => $lines->load(['draw:id,name', 'secondDraw:id,name'])->map(fn ($line) => [
                        'ticket_line_id' => $line->id, 'draw_id' => $line->draw_id, 'second_draw_id' => $line->second_draw_id,
                        'draw' => $line->draw->name.($line->secondDraw ? ' + '.$line->secondDraw->name : ''),
                        'modality' => $line->modality, 'numbers' => $line->numbers, 'amount_minor' => $line->prize_minor,
                    ])->values()->all(),
                ],
            ]]);
        }, 3);
        RateLimiter::clear($attemptKey);
        return $payment;
    }
}
