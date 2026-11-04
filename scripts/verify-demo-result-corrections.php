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
$draw = Draw::whereIn('id', $settings['draw_ids'])->with('lottery')->orderByDesc('closes_at')->get()->first(
    fn ($d) => $d->lottery->active && ! array_diff(['quiniela', 'pale', 'tripleta'], $d->modalities) && ($config->window($d)['open'] ?? false));
if (! $draw) throw new RuntimeException('No hay un sorteo abierto compatible. No se modificaron datos.');
$check = function (bool $condition, string $message): void {
    if (! $condition) throw new RuntimeException($message);
};
$saleTime = $config->clock();
$date = $saleTime->toDateString();
$afterClose = $config->window($draw)['closes_at']->addMinute();
$beforeResults = DrawResult::where('draw_id', $draw->id)->where('business_date', $date)->get()->toJson();
$beforeTickets = Ticket::count();
$report = ['tested_at' => $saleTime->toIso8601String(), 'bank' => $bank->code, 'draw' => $draw->name,
    'execution' => 'MySQL local; transacción revertida, reloj posterior al cierre simulado solo en PHP.'];
DB::beginTransaction();
try {
    $ticket = app(SaleService::class)->sell($user, $bank, ['lines' => [
        ['draw_id' => $draw->id, 'modality' => 'quiniela', 'numbers' => '12', 'amount' => '10'],
        ['draw_id' => $draw->id, 'modality' => 'quiniela', 'numbers' => '34', 'amount' => '10'],
        ['draw_id' => $draw->id, 'modality' => 'pale', 'numbers' => '12-34', 'amount' => '1'],
        ['draw_id' => $draw->id, 'modality' => 'tripleta', 'numbers' => '12-34-56', 'amount' => '1'],
    ], 'discount' => false, 'request_key' => (string) Str::uuid()]);
    $lines = $ticket->lines->all();
    $report['ticket'] = $ticket->code;
    $report['line_order'] = ['Quiniela 12 RD$10', 'Quiniela 34 RD$10', 'Palé 12-34 RD$1', 'Tripleta 12-34-56 RD$1'];
    Carbon::setTestNow($afterClose);
    CarbonImmutable::setTestNow($afterClose);
    $service = app(ResultService::class);
    $data = ['draw_id' => $draw->id, 'business_date' => $date, 'confirmed' => true,
        'evidence' => 'Prueba de corrección ficticia; transacción revertida.'];
    $rate = fn ($i, $key) => $lines[$i]->amount_minor * $lines[$i]->rules['payouts'][$key];
    $cases = [
        ['name' => 'Resultado inicial', 'numbers' => ['12', '34', '56'], 'expected' => [$rate(0, '1'), $rate(1, '2'), $rate(2, '1-2'), $rate(3, '3')]],
        ['name' => 'Corrección reduce y elimina premios', 'numbers' => ['78', '12', '90'], 'expected' => [$rate(0, '2'), 0, 0, 0]],
        ['name' => 'Corrección deja todas las jugadas sin premio', 'numbers' => ['78', '90', '11'], 'expected' => [0, 0, 0, 0]],
        ['name' => 'Corrección vuelve a generar premios', 'numbers' => ['34', '12', '56'], 'expected' => [$rate(0, '2'), $rate(1, '1'), $rate(2, '1-2'), $rate(3, '3')]],
    ];
    foreach ($cases as $case) {
        $service->record([...$data, 'numbers' => $case['numbers']], $user);
        $actual = $ticket->lines()->orderBy('id')->get()->map(fn ($l) => (int) $l->prize_minor)->all();
        $check($actual === $case['expected'], 'Recálculo incorrecto: '.$case['name']);
        $check($ticket->lines()->whereNotNull('paid_at')->count() === 0, 'Un recálculo marcó pagos indebidamente.');
        $report['before_payment'][] = [...$case, 'actual_minor' => $actual, 'passed' => true];
    }
    $service->pay($user, $ticket);
    $expectedPayment = array_sum($cases[3]['expected']);
    $payment = LotteryAudit::where('action', 'ticket.paid')->where('payload->ticket', $ticket->code)->sole();
    $check((int) $payment->payload['amount_minor'] === $expectedPayment, 'Pago calculado sobre un resultado obsoleto.');
    $report['paid_minor'] = $payment->payload['amount_minor'];
    $resultSnapshot = DrawResult::where('draw_id', $draw->id)->where('business_date', $date)->sole()->toJson();
    $lineSnapshot = $ticket->lines()->orderBy('id')->get()->toJson();
    $auditCount = LotteryAudit::count();
    try {
        $service->record([...$data, 'numbers' => ['78', '90', '11']], $user);
        throw new RuntimeException('Se permitió corregir un resultado con premios pagados.');
    } catch (HttpException $e) {
        $check($e->getStatusCode() === 422, 'Código inesperado al rechazar la corrección.');
        $report['correction_after_payment'] = ['rejected' => true, 'status' => $e->getStatusCode(), 'message' => $e->getMessage()];
    }
    $check(DrawResult::where('draw_id', $draw->id)->where('business_date', $date)->sole()->toJson() === $resultSnapshot, 'El rechazo alteró el resultado.');
    $check($ticket->lines()->orderBy('id')->get()->toJson() === $lineSnapshot, 'El rechazo alteró premios o pagos.');
    $check(LotteryAudit::count() === $auditCount, 'El rechazo dejó cambios parciales en auditoría.');
    // Reimporting exactly the confirmed result must be an idempotent no-op.
    $service->record([...$data, 'numbers' => $cases[3]['numbers']], $user);
    $check(LotteryAudit::count() === $auditCount && $ticket->lines()->orderBy('id')->get()->toJson() === $lineSnapshot, 'Repetir el mismo resultado modificó pagos.');
    $report['rejected_correction_preserved_result_prizes_payments'] = true;
    $report['identical_result_is_noop'] = true;
} finally {
    DB::rollBack();
    Carbon::setTestNow();
    CarbonImmutable::setTestNow();
}
$check(Ticket::count() === $beforeTickets, 'Quedó un ticket ficticio.');
$check(DrawResult::where('draw_id', $draw->id)->where('business_date', $date)->get()->toJson() === $beforeResults, 'Quedaron resultados ficticios.');
$report['rolled_back'] = true;
$report['passed'] = true;
$json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
file_put_contents(storage_path('app/demo-result-corrections-verification.json'), $json);
echo $json.PHP_EOL;
