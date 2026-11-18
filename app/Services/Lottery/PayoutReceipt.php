<?php

namespace App\Services\Lottery;

use App\Models\{LotteryAudit, Ticket};

class PayoutReceipt
{
    public function make(Ticket $ticket, LotteryAudit $payment): array
    {
        abort_unless($payment->office_id === $ticket->office_id && $payment->action === 'ticket.paid'
            && ($payment->payload['ticket'] ?? null) === $ticket->code, 404);
        $receipt = $payment->payload['receipt'] ?? null;
        abort_unless(is_array($receipt), 422, 'Este pago no tiene un comprobante registrado.');
        $receipt = app(ReceiptDrawNames::class)->fullNames($receipt);
        $display = app(DateTimePreferences::class)->forBranch(\App\Models\BranchOffice::with('office')->findOrFail($ticket->branch_office_id));
        return [...$receipt, 'document_type' => 'payout', 'payment_id' => $payment->id,
            'print_settings' => [...($receipt['print_settings'] ?? []), 'date_time' => $display],
            'payment_reference' => 'P-'.str_pad((string) $payment->office_number, 6, '0', STR_PAD_LEFT),
            'code' => $ticket->code, 'reference' => $ticket->reference,
            'created_at' => $payment->created_at->toIso8601String(),
            'date' => app(DateTimePreferences::class)->format($payment->created_at, $display, true)];
    }
}
