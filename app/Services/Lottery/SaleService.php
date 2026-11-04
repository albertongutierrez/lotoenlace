<?php

namespace App\Services\Lottery;

use App\Models\BranchOffice;
use App\Models\LotteryAudit;
use App\Models\Office;
use App\Models\Ticket;
use App\Models\User;
use Brick\Math\BigInteger;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class SaleService
{
    public function __construct(private Configuration $configuration, private LimitEngine $limits) {}

    public function sell(User $user, BranchOffice $branch, array $data): Ticket
    {
        return DB::transaction(function () use ($user, $branch, $data) {
            // One consortium lock serializes every sale, cancellation and settings/limit mutation.
            $office = Office::whereKey($branch->office_id)->lockForUpdate()->firstOrFail();
            $branch->refresh()->setRelation('office', $office);
            abort_unless($office->is_active && $branch->is_active, 422, 'Banca o consorcio inactivo.');
            $received = isset($data['received']) ? Money::minor($data['received']) : null;
            $hashData = [$branch->id, $data['lines'], $data['discount'] ?? false];
            if ($received !== null) $hashData[] = $received;
            $method = $data['payment_method'] ?? 'cash';
            $reference = trim($data['payment_reference'] ?? '');
            if ($method !== 'cash' || $reference !== '') $hashData[] = [$method, $reference];
            $hash = hash('sha256', json_encode($hashData));
            $existing = Ticket::where('office_id', $office->id)->where('request_key', $data['request_key'])->first();
            if ($existing) {
                abort_unless($existing->request_hash === $hash && $existing->user_id === $user->id, 409, 'La solicitud ya se usó con otra venta.');

                return $existing->load('lines');
            }
            $cash = app(CashService::class)->forOperation($branch);
            $settings = $this->configuration->effective($branch);
            if (!in_array($method, $settings['payment_methods'], true)) throw ValidationException::withMessages(['payment_method'=>'Este medio de cobro no está habilitado en la banca. Actualiza la página y elige uno disponible.']);
            if (($settings['payment_reference_required'][$method] ?? false) && $reference === '') {
                throw ValidationException::withMessages(['payment_reference'=>'Indica la referencia del cobro por '.$settings['payment_method_labels'][$method].'.']);
            }
            $lines = array_map(fn ($line) => $this->configuration->prepare($branch, $line), $data['lines']);
            $this->limits->check($branch, $lines);
            $gross = array_sum(array_column($lines, 'amount_minor'));
            $discount = 0;
            if ($data['discount'] ?? false) {
                if (! $settings['discount_enabled']) {
                    throw ValidationException::withMessages(['discount' => 'El descuento no está habilitado.']);
                }
                $discount = intdiv($gross, $settings['discount_every_minor']) * $settings['discount_amount_minor'];
            }
            $received ??= $gross - $discount;
            if ($method !== 'cash' && $received !== $gross - $discount) throw ValidationException::withMessages(['received'=>'Los cobros sin efectivo deben coincidir con el total, sin devolución.']);
            if ($received < $gross - $discount) {
                throw ValidationException::withMessages(['received' => 'El dinero recibido no cubre el total a cobrar.']);
            }
            $allocated = $accumulated = $commission = 0;
            foreach ($lines as &$line) {
                $accumulated += $line['amount_minor'];
                $target = BigInteger::of($discount)->multipliedBy($accumulated)->quotient($gross)->toInt();
                $line['net_minor'] = $line['amount_minor'] - ($target - $allocated);
                $allocated = $target;
                $line['commission_minor'] = intdiv($line['net_minor'] * (int) ($line['rules']['commission_bps'] ?? 0) + 5000, 10000);
                $commission += $line['commission_minor'];
            }
            unset($line);
            $ticket = Ticket::create(['code' => (string) Str::uuid(), 'office_id' => $office->id, 'branch_office_id' => $branch->id,
                'cash_session_id' => $cash?->id, 'user_id' => $user->id, 'request_key' => $data['request_key'], 'request_hash' => $hash, 'currency' => $office->currency,
                'business_date' => $this->configuration->clock()->toDateString(), 'gross_minor' => $gross, 'discount_minor' => $discount,
                'net_minor' => $gross - $discount, 'received_minor' => $received, 'change_minor' => $received - ($gross - $discount),
                'payment_method'=>$method, 'payment_method_label'=>$settings['payment_method_labels'][$method], 'payment_reference'=>$reference === '' ? null : $reference,
                'commission_minor' => $commission, 'settings_snapshot' => $settings]);
            $ticket->lines()->createMany($lines);
            if ($cash) app(CashService::class)->record($cash, $user, 'sale', $ticket->net_minor, 'sale:'.$ticket->id, 'Venta '.$ticket->code, $ticket->id, $method, $ticket->payment_method_label);
            LotteryAudit::create(['office_id' => $office->id, 'user_id' => $user->id, 'action' => 'ticket.sold', 'payload' => ['ticket' => $ticket->code]]);

            return $ticket->load('lines');
        }, 3);
    }

    public function cancel(User $user, Ticket $ticket, string $pin): void
    {
        $attemptKey = 'ticket-cancellation:'.$user->id.':'.$ticket->id;
        DB::transaction(function () use ($user, $ticket, $pin, $attemptKey) {
            Office::whereKey($ticket->office_id)->lockForUpdate()->firstOrFail();
            $ticket->refresh()->load('lines');
            abort_if(RateLimiter::tooManyAttempts($attemptKey, 5), 429, 'Demasiados intentos. Espera un minuto antes de volver a intentar.');
            if (! preg_match('/^[0-9]{6}$/D', $pin) || ! $ticket->payment_pin || ! hash_equals($ticket->payment_pin, $pin)) {
                RateLimiter::hit($attemptKey, 60);
                throw ValidationException::withMessages(['pin' => 'El PIN no corresponde a este ticket.']);
            }
            $cancellation = app(CancellationPolicy::class)->state($ticket);
            abort_unless($cancellation['allowed'], 422, $cancellation['reason'] ?? 'No se puede anular este ticket.');
            $cash = app(CashService::class)->forOperation(BranchOffice::findOrFail($ticket->branch_office_id));
            if ($cash) app(CashService::class)->record($cash, $user, 'refund', -$ticket->net_minor, 'refund:'.$ticket->id, 'Devolución por anulación '.$ticket->code, $ticket->id, $ticket->payment_method ?? 'cash', $ticket->payment_method_label);
            $ticket->update(['status' => 'cancelled', 'cancelled_at' => now()]);
            LotteryAudit::create(['office_id' => $ticket->office_id, 'user_id' => $user->id, 'action' => 'ticket.cancelled', 'payload' => ['ticket' => $ticket->code]]);
        }, 3);
        RateLimiter::clear($attemptKey);
    }
}
