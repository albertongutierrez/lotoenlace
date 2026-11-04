<?php

// Local-only setup and inspection for the user-authorized Sales screen test.
use App\Models\{BranchOffice, Draw, Lottery, LotteryAudit, Ticket, User};
use App\Services\Lottery\{CashService, Configuration, ResultService};
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (! $app->environment('local')) throw new RuntimeException('Solo se permite en local.');
$bank = BranchOffice::where('code', 'PRUEBA-001')->whereHas('office', fn ($q) => $q->where('name', 'Consorcio de prueba LotoEnlace'))->firstOrFail();
if (! in_array($bank->office_id, config('printing.test_reprint_office_ids'), true)) throw new RuntimeException('El consorcio debe estar en modo prueba.');
$path = storage_path('app/sales-continuation-screen-test.json');
$operation = $argv[1] ?? 'inspect';
if ($operation === 'prepare') {
    if (is_file($path)) throw new RuntimeException('Ya hay una prueba preparada. Inspecciónala antes de crear otra.');
    $fixture = DB::transaction(function () use ($bank) {
        $lottery = Lottery::create(['name' => 'Prueba continuación 58mm', 'active' => true]);
        $fields = ['lottery_id' => $lottery->id, 'opens_at' => '00:00:00', 'closes_at' => '23:59:00', 'draws_at' => '23:59:30',
            'weekdays' => [0,1,2,3,4,5,6], 'modalities' => ['quiniela'], 'active' => true, 'result_count' => 3];
        $winner = Draw::create([...$fields, 'name' => 'Prueba ganador 58mm']);
        $pending = Draw::create([...$fields, 'name' => 'Prueba pendiente 58mm']);
        $officeSettings = $bank->office->lottery_settings ?? [];
        $bankSettings = $bank->lottery_settings ?? [];
        foreach ([$winner, $pending] as $draw) {
            $officeSettings['draw_ids'][] = $draw->id;
            $officeSettings['rules'][$draw->id.':quiniela'] = ['payouts' => ['1' => 60, '2' => 10, '3' => 5], 'commission_bps' => 0];
            if (isset($bankSettings['draw_ids'])) $bankSettings['draw_ids'][] = $draw->id;
        }
        $bank->office->update(['lottery_settings' => $officeSettings]);
        $bank->update(['lottery_settings' => $bankSettings]);
        return ['office_id' => $bank->office_id, 'branch_id' => $bank->id, 'lottery_id' => $lottery->id,
            'winner_draw_id' => $winner->id, 'pending_draw_id' => $pending->id, 'date' => app(Configuration::class)->clock()->toDateString()];
    });
    file_put_contents($path, json_encode($fixture, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
} else {
    $fixture = json_decode(file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
}
if ($fixture['office_id'] !== $bank->office_id || $fixture['branch_id'] !== $bank->id) throw new RuntimeException('Consorcio incorrecto.');
$ticket = isset($argv[2]) ? Ticket::where('office_id', $bank->office_id)->where('branch_office_id', $bank->id)
    ->withReference($argv[2])->firstOrFail() : null;
if ($ticket && ($ticket->business_date !== $fixture['date'] || $ticket->lines()->count() !== 2 || $ticket->lines()->whereNotIn('draw_id', [$fixture['winner_draw_id'], $fixture['pending_draw_id']])->exists())) throw new RuntimeException('Ticket ajeno a esta prueba.');
if ($operation === 'publish') {
    if (! $ticket) throw new RuntimeException('Indica el ticket de la prueba.');
    $draw = Draw::where('lottery_id', $fixture['lottery_id'])->findOrFail($fixture['winner_draw_id']);
    $draw->update(['closes_at' => app(Configuration::class)->clock()->subMinute()->format('H:i:s')]);
    app(ResultService::class)->record(['draw_id' => $draw->id, 'business_date' => $fixture['date'], 'numbers' => ['10','33','44'], 'confirmed' => true,
        'evidence' => 'RESULTADO FICTICIO: prueba solicitada de continuación desde Ventas, consorcio de prueba.'], User::where('email', 'admin@lotoenlace.test')->firstOrFail());
}
if ($operation === 'pin') {
    if (! $ticket) throw new RuntimeException('Indica el ticket de la prueba.');
    file_put_contents(storage_path('framework/testing/sales-continuation-pin.json'), json_encode(['pin' => $ticket->payment_pin], JSON_THROW_ON_ERROR));
}
$cash = app(CashService::class)->current($bank);
$report = ['fixture' => $fixture, 'cash_open' => (bool) $cash, 'cash_balance_minor' => $cash?->balance_minor];
if ($ticket) {
    $ticket->refresh();
    $report['ticket'] = ['reference' => $ticket->reference, 'code' => $ticket->code, 'net_minor' => $ticket->net_minor,
        'lines' => $ticket->lines()->get(['draw_id','numbers','amount_minor','prize_minor','paid_at'])->toArray()];
    $report['payments'] = LotteryAudit::where('office_id', $bank->office_id)->where('action', 'ticket.paid')->where('payload->ticket', $ticket->code)->get()->map(fn ($event) => ['id' => $event->id, 'amount_minor' => $event->payload['amount_minor'], 'pin_rotated' => $event->payload['pin_rotated'] ?? false])->all();
    $report['prints'] = LotteryAudit::where('office_id', $bank->office_id)->where('action', 'ticket.print_requested')->where('payload->ticket', $ticket->code)->get()->map(fn ($event) => ['id' => $event->id, 'document_type' => $event->payload['document_type'] ?? 'sale', 'paper_width' => $event->payload['paper_width'] ?? null, 'delivery' => $event->payload['delivery'] ?? null])->all();
    if ($operation === 'verify') {
        $oldPin = json_decode(file_get_contents(storage_path('framework/testing/sales-continuation-pin.json')), true, flags: JSON_THROW_ON_ERROR)['pin'];
        $user = User::where('email', 'admin@lotoenlace.test')->firstOrFail();
        $oldRejected = false;
        try { app(ResultService::class)->pay($user, $ticket, $oldPin); }
        catch (\Illuminate\Validation\ValidationException $e) { $oldRejected = isset($e->errors()['pin']); }
        if (! $oldRejected || hash_equals($oldPin, $ticket->fresh()->payment_pin)) throw new RuntimeException('No se invalidó el PIN anterior.');
        $movements = \App\Models\CashMovement::where('ticket_id', $ticket->id);
        $report['verification'] = ['old_pin_rejected' => true, 'new_pin_different' => true,
            'sales' => (clone $movements)->where('type', 'sale')->count(),
            'payments' => (clone $movements)->where('type', 'prize')->count(),
            'paid_minor' => -(clone $movements)->where('type', 'prize')->sum('amount_minor'),
            'pending_wagers' => $ticket->lines()->whereNull('prize_minor')->whereNull('paid_at')->count()];
        if ($report['verification']['sales'] !== 1 || $report['verification']['payments'] !== 1 || $report['verification']['paid_minor'] !== 6000 || $report['verification']['pending_wagers'] !== 1) throw new RuntimeException('Movimientos inesperados.');
        $events = LotteryAudit::where('office_id', $bank->office_id)->where('action', 'ticket.print_requested')->where('payload->ticket', $ticket->code)->get();
        if ($events->count() !== 3 || $events->contains(fn ($event) => ($event->payload['paper_width'] ?? null) !== 58 || ($event->payload['delivery']['status'] ?? null) !== 'submitted')) throw new RuntimeException('Falta una impresión de 58mm confirmada.');
        $authorizations = $events->filter(fn ($event) => in_array($event->payload['document_type'] ?? '', ['continuation', 'payout'], true))
            ->map(fn ($event) => ['authorization' => app(\App\Services\Lottery\PrintAuthorization::class)->issue($ticket, $bank, $event), 'delivery' => $event->payload['delivery']])->values()->all();
        file_put_contents(storage_path('framework/testing/sales-continuation-printed-jobs.json'), json_encode(['old_pin' => $oldPin, 'jobs' => $authorizations], JSON_THROW_ON_ERROR));
        file_put_contents(storage_path('app/sales-continuation-screen-verification.json'), json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    }
}
echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR).PHP_EOL;
