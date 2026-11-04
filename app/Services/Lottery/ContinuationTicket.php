<?php

namespace App\Services\Lottery;

use App\Models\{BranchOffice, LotteryAudit, Office, Ticket};
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class ContinuationTicket
{
    public function latestPayment(Ticket $ticket): ?LotteryAudit
    {
        return LotteryAudit::where('office_id', $ticket->office_id)->where('action', 'ticket.paid')->where('payload->ticket', $ticket->code)->latest('id')->first();
    }

    public function snapshot(Ticket $ticket, BranchOffice $bank, Collection $lines): array
    {
        $qr = (bool) app(Configuration::class)->effective($bank)['show_qr'];
        $gross = $lines->sum('amount_minor');
        $net = $lines->sum('net_minor');
        return [
            'branch' => $bank->code, 'branch_id' => $bank->id, 'company_name' => $bank->office->name, 'branch_name' => $bank->name ?: $bank->code,
            'currency' => $ticket->currency, 'gross_minor' => $gross, 'discount_minor' => $gross - $net, 'net_minor' => $net,
            'show_qr' => $qr, 'print_settings' => ['show_qr' => $qr, 'company_name' => $bank->office->name, 'branch_name' => $bank->name ?: $bank->code],
            'footer' => $ticket->settings_snapshot['footer'] ?? '',
            'lines' => $lines->load(['draw:id,name', 'secondDraw:id,name'])->map(fn ($line) => [
                'ticket_line_id' => $line->id, 'draw_id' => $line->draw_id, 'second_draw_id' => $line->second_draw_id,
                'draw' => $line->draw->name.($line->secondDraw ? ' + '.$line->secondDraw->name : ''),
                'modality' => $line->modality, 'numbers' => $line->numbers, 'amount_minor' => $line->amount_minor,
            ])->values()->all(),
        ];
    }

    public function make(Ticket $ticket, LotteryAudit $payment, bool $withPin = false): array
    {
        if ($withPin) return DB::transaction(function () use ($ticket, $payment) {
            Office::whereKey($ticket->office_id)->lockForUpdate()->firstOrFail();
            $ticket->refresh();
            return [...$this->make($ticket, $payment), 'pin' => $ticket->payment_pin];
        });
        abort_unless($payment->office_id === $ticket->office_id && $payment->action === 'ticket.paid' && ($payment->payload['ticket'] ?? null) === $ticket->code, 404);
        abort_unless($this->latestPayment($ticket)?->id === $payment->id, 409, 'Este ticket de continuación fue sustituido por un pago posterior. Consulta el ticket actual.');
        $snapshot = $payment->payload['continuation'] ?? null;
        abort_unless($ticket->status === 'sold' && is_array($snapshot) && !empty($snapshot['lines']), 422, 'No hay jugadas pendientes en este pago.');
        return [...$snapshot, 'document_type' => 'continuation', 'payment_id' => $payment->id, 'status' => $ticket->status,
            'reference' => $ticket->reference, 'code' => $ticket->code,
            'payment_reference' => 'P-'.str_pad((string) $payment->office_number, 6, '0', STR_PAD_LEFT),
            'paid_minor' => $payment->payload['amount_minor'], 'paid_by' => $payment->payload['receipt']['paid_by'] ?? '',
            'created_at' => $payment->created_at->toIso8601String(),
            'date' => $payment->created_at->copy()->timezone('America/Santo_Domingo')->format('d/m/Y h:i:s A')];
    }
}
