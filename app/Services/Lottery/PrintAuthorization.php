<?php

namespace App\Services\Lottery;

use App\Models\{BranchOffice, LotteryAudit, Ticket};
use RuntimeException;

class PrintAuthorization
{
    public function publicKey(): string
    {
        $path = config('printing.private_key_path');
        if (! is_file($path)) throw new RuntimeException('Falta configurar la firma del agente de impresión.');
        $key = openssl_pkey_get_private(file_get_contents($path));
        if (! $key) throw new RuntimeException('No se pudo abrir la clave de impresión.');
        return openssl_pkey_get_details($key)['key'];
    }

    public function issue(Ticket $ticket, BranchOffice $bank, LotteryAudit $event): array
    {
        if (($event->payload['document_type'] ?? '') === 'payout') return $this->issuePayout($ticket, $event);
        $continuations = app(ContinuationTicket::class);
        if (($event->payload['document_type'] ?? '') === 'continuation') {
            $payment = LotteryAudit::where('office_id', $ticket->office_id)->findOrFail($event->payload['payment_id']);
            return $this->issueContinuation($ticket, $payment, $event);
        }
        if ($payment = $continuations->latestPayment($ticket)) return $this->issueContinuation($ticket, $payment, $event);
        $ticket->loadMissing(['lines.draw:id,name', 'lines.secondDraw:id,name']);
        $p = $event->payload;
        $expires = now()->addMinutes(2)->timestamp;
        if (! app(PrintPolicy::class)->isTestOffice($ticket->office_id)) {
            $expires = min($expires, $ticket->created_at->copy()->addMinutes((int) ($ticket->settings_snapshot['reprint_minutes'] ?? 15))->timestamp);
        }
        $data = [
            'version' => 1, 'id' => $p['attempt_key'], 'issuer' => rtrim(config('app.url'), '/'),
            'issued_at' => now()->timestamp, 'expires_at' => $expires,
            'audit_id' => $event->id, 'audit_number' => $event->office_number,
            'target' => array_intersect_key($p, array_flip(['device_id', 'printer', 'profile', 'paper_width', 'cut', 'feed_lines'])),
            'receipt' => [
                'reference' => $ticket->reference, 'code' => $ticket->code, 'pin' => $ticket->payment_pin,
                'test_reprint' => (bool) ($p['test_reprint'] ?? false), 'status' => $ticket->status,
                'branch' => $bank->code, 'currency' => $ticket->currency,
                'company_name' => $bank->office->name, 'branch_name' => $bank->name ?: $bank->code,
                'date' => $ticket->created_at->copy()->timezone('America/Santo_Domingo')->format('d/m/Y h:i:s A'),
                'lines' => $ticket->lines->map(fn ($line) => [
                    'draw_id' => $line->draw_id, 'second_draw_id' => $line->second_draw_id,
                    'draw' => $line->draw->name.($line->secondDraw ? ' + '.$line->secondDraw->name : ''),
                    'modality' => $line->modality, 'numbers' => $line->numbers, 'amount_minor' => $line->amount_minor,
                ])->values()->all(),
                'gross_minor' => $ticket->gross_minor, 'discount_minor' => $ticket->discount_minor,
                'payment_method'=>$ticket->payment_method ?? 'cash', 'payment_method_label'=>$ticket->payment_method_label, 'sale_payment_reference'=>$ticket->payment_reference,
                'net_minor' => $ticket->net_minor, 'received_minor' => $ticket->received_minor, 'change_minor' => $ticket->change_minor,
                'show_qr' => (bool) app(Configuration::class)->effective($bank)['show_qr'],
                'footer' => $ticket->settings_snapshot['footer'] ?? '',
                'kind' => $p['kind'], 'sequence' => $p['sequence'],
            ],
        ];
        return $this->sign($data);
    }

    private function issuePayout(Ticket $ticket, LotteryAudit $event): array
    {
        $p = $event->payload;
        $payment = LotteryAudit::where('office_id', $ticket->office_id)->where('action', 'ticket.paid')->where('payload->ticket', $ticket->code)->findOrFail($p['payment_id']);
        return $this->sign([
            'version' => 1, 'id' => $p['attempt_key'], 'issuer' => rtrim(config('app.url'), '/'),
            'issued_at' => now()->timestamp, 'expires_at' => now()->addMinutes(2)->timestamp,
            'audit_id' => $event->id, 'audit_number' => $event->office_number,
            'target' => array_intersect_key($p, array_flip(['device_id', 'printer', 'profile', 'paper_width', 'cut', 'feed_lines'])),
            'receipt' => [...app(PayoutReceipt::class)->make($ticket, $payment), 'test_reprint' => (bool) ($p['test_reprint'] ?? false), 'kind' => $p['kind'], 'sequence' => $p['sequence']],
        ]);
    }

    private function issueContinuation(Ticket $ticket, LotteryAudit $payment, LotteryAudit $event): array
    {
        $p = $event->payload;
        return $this->sign([
            'version' => 1, 'id' => $p['attempt_key'], 'issuer' => rtrim(config('app.url'), '/'),
            'issued_at' => now()->timestamp, 'expires_at' => now()->addMinutes(2)->timestamp,
            'audit_id' => $event->id, 'audit_number' => $event->office_number,
            'target' => array_intersect_key($p, array_flip(['device_id', 'printer', 'profile', 'paper_width', 'cut', 'feed_lines'])),
            'receipt' => [...app(ContinuationTicket::class)->make($ticket, $payment, true), 'test_reprint' => (bool) ($p['test_reprint'] ?? false), 'kind' => $p['kind'], 'sequence' => $p['sequence']],
        ]);
    }

    private function sign(array $data): array
    {
        $json = json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $key = openssl_pkey_get_private(file_get_contents(config('printing.private_key_path')));
        if (! $key || ! openssl_sign($json, $signature, $key, OPENSSL_ALGO_SHA256)) throw new RuntimeException('No se pudo firmar la impresión.');
        return ['payload' => base64_encode($json), 'signature' => base64_encode($signature)];
    }
}
