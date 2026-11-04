<?php

use App\Models\{BranchOffice, Draw, DrawResult, LotteryAudit, Ticket, User};
use App\Services\Lottery\{Configuration, ResultService, SaleService};
use Carbon\{Carbon, CarbonImmutable};
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (! $app->environment('local')) throw new RuntimeException('Solo se permite en local.');
$bank = BranchOffice::where('code', 'PRUEBA-001')->whereHas('office', fn ($q) => $q->where('name', 'Consorcio de prueba LotoEnlace'))->firstOrFail();
$user = User::where('email', 'admin@lotoenlace.test')->firstOrFail();
$config = app(Configuration::class);
$settings = $config->effective($bank);
$draws = Draw::whereIn('id', $settings['draw_ids'])->with('lottery')->orderByDesc('closes_at')->get()
    ->filter(fn ($d) => $d->lottery->active && in_array('super_pale', $d->modalities) && ($config->window($d)['open'] ?? false))->take(2)->sortBy('id')->values();
if ($draws->count() !== 2) throw new RuntimeException('No hay dos sorteos abiertos. No se modificaron datos.');
$check = function (bool $condition, string $message): void {
    if (! $condition) throw new RuntimeException($message);
};
$report = ['tested_at' => $config->clock()->toIso8601String(), 'bank' => $bank->code, 'draws' => $draws->pluck('name')->all(),
    'execution' => 'MySQL local, transacción revertida; reloj simulado solo en este proceso después de vender'];
$date = $config->clock()->toDateString();
$beforeResults = DrawResult::whereIn('draw_id', $draws->pluck('id'))->where('business_date', $date)->get()->toJson();
$ticketsBefore = Ticket::count();
$results = app(ResultService::class);
DB::beginTransaction();
try {
    $ticket = app(SaleService::class)->sell($user, $bank, ['lines' => [[
        'draw_id' => $draws[0]->id, 'second_draw_id' => $draws[1]->id, 'modality' => 'super_pale',
        'numbers' => '12-34', 'amount' => '10',
    ]], 'discount' => false, 'request_key' => (string) Str::uuid()]);
    $line = $ticket->lines->first();
    $rate = $line->rules['payouts']['1-1'];
    $expected = 1000 * $rate;
    $report += ['ticket' => $ticket->code, 'numbers' => $line->numbers, 'wager_minor' => $line->amount_minor,
        'category' => '1-1', 'multiplier' => $rate, 'expected_prize_minor' => $expected];
    // Advance only this PHP process; neither system time nor draw schedules change.
    $afterClose = $config->window($draws[0])['closes_at']->max($config->window($draws[1])['closes_at'])->addMinute();
    Carbon::setTestNow($afterClose);
    CarbonImmutable::setTestNow($afterClose);
    $report['simulated_result_time'] = $afterClose->toIso8601String();
    $firstData = ['draw_id' => $draws[0]->id, 'business_date' => $date, 'numbers' => ['12', '56', '78'], 'confirmed' => true,
        'evidence' => 'Resultado ficticio para prueba transaccional; se revierte al finalizar.'];
    $secondData = [...$firstData, 'draw_id' => $draws[1]->id, 'numbers' => ['34', '90', '11']];
    $results->record($firstData, $user);
    $check($line->fresh()->prize_minor === null, 'Se calculó el premio sin confirmar ambos sorteos.');
    $report['after_first_result_prize_minor'] = $line->fresh()->prize_minor;
    try {
        $results->pay($user, $ticket);
        throw new RuntimeException('Se permitió pagar sin los dos resultados.');
    } catch (HttpException $e) {
        $check($e->getStatusCode() === 422, 'Código inesperado al pagar antes de tiempo.');
        $report['premature_payment'] = ['rejected' => true, 'message' => $e->getMessage()];
    }
    $results->record($secondData, $user);
    $check((int) $line->fresh()->prize_minor === $expected, 'Premio incorrecto.');
    $report['results'] = [$firstData['numbers'], $secondData['numbers']];
    $report['actual_prize_minor'] = $line->fresh()->prize_minor;
    $results->pay($user, $ticket);
    $paid = $line->fresh();
    $check($paid->paid_at !== null && $paid->paid_by === $user->id, 'No se registró el pago.');
    $report['payment'] = ['paid_at' => $paid->paid_at->toIso8601String(), 'paid_by' => $paid->paid_by];
    $auditCount = fn () => LotteryAudit::where('action', 'ticket.paid')->where('payload->ticket', $ticket->code)->count();
    $check($auditCount() === 1, 'El primer pago no tiene un único asiento de auditoría.');
    try {
        $results->pay($user, $ticket->fresh());
        throw new RuntimeException('Se permitió pagar dos veces.');
    } catch (HttpException $e) {
        $check($e->getStatusCode() === 422, 'Código inesperado al intentar pagar dos veces.');
        $report['second_payment'] = ['rejected' => true, 'status' => $e->getStatusCode(), 'message' => $e->getMessage()];
    }
    $check($auditCount() === 1, 'Se duplicó la auditoría del pago.');
    $check($line->fresh()->paid_at->eq($paid->paid_at), 'El segundo intento modificó el pago.');
    $report['payment_audit_count'] = $auditCount();
    $resultSnapshot = DrawResult::whereIn('draw_id', $draws->pluck('id'))->where('business_date', $date)->orderBy('draw_id')->get()->toJson();
    $lineSnapshot = $line->fresh()->toJson();
    $ticketSnapshot = $ticket->fresh()->toJson();
    $paymentSnapshot = LotteryAudit::where('action', 'ticket.paid')->where('payload->ticket', $ticket->code)->get()->toJson();
    $allAuditCount = LotteryAudit::count();
    foreach ([$firstData, $secondData] as $original) {
        try {
            $results->record([...$original, 'numbers' => ['88', '77', '66']], $user);
            throw new RuntimeException('Se permitió corregir un sorteo de un súper palé ya pagado.');
        } catch (HttpException $e) {
            $check($e->getStatusCode() === 422, 'Código inesperado al rechazar la corrección.');
            $attempt = ['draw_id' => $original['draw_id'], 'draw' => $draws->firstWhere('id', $original['draw_id'])->name,
                'attempted_numbers' => ['88', '77', '66'], 'rejected' => true, 'status' => $e->getStatusCode(), 'message' => $e->getMessage()];
        }
        $check(DrawResult::whereIn('draw_id', $draws->pluck('id'))->where('business_date', $date)->orderBy('draw_id')->get()->toJson() === $resultSnapshot, 'La corrección rechazada cambió resultados.');
        $check($line->fresh()->toJson() === $lineSnapshot, 'La corrección rechazada cambió premio o pago.');
        $check($ticket->fresh()->toJson() === $ticketSnapshot, 'La corrección rechazada cambió el ticket.');
        $check(LotteryAudit::where('action', 'ticket.paid')->where('payload->ticket', $ticket->code)->get()->toJson() === $paymentSnapshot, 'La corrección rechazada alteró la auditoría del pago.');
        $check(LotteryAudit::count() === $allAuditCount, 'La corrección rechazada dejó cambios parciales.');
        $report['correction_attempts'][] = [...$attempt, 'both_results_unchanged' => true, 'prize_and_paid_fields_unchanged' => true,
            'ticket_unchanged' => true, 'payment_audit_unchanged' => true];
    }

} finally {
    DB::rollBack();
    Carbon::setTestNow();
    CarbonImmutable::setTestNow();
}
$check(Ticket::count() === $ticketsBefore && ! Ticket::where('code', $report['ticket'])->exists(), 'La reversión dejó el ticket de prueba.');
$check(DrawResult::whereIn('draw_id', $draws->pluck('id'))->where('business_date', $date)->get()->toJson() === $beforeResults, 'La reversión modificó resultados existentes.');
$report['rolled_back'] = true;
$report['passed'] = true;
$json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
file_put_contents(storage_path('app/demo-paid-super-pale-corrections-verification.json'), $json);
echo $json.PHP_EOL;
