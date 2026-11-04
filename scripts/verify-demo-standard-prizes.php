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
    'execution' => 'Servicios de ventas, resultados y pagos sobre MySQL local. Transacción revertida por escenario; reloj posterior al cierre simulado en PHP.', 'scenarios' => []];
$scenarios = [
    ['quiniela', '12', ['12', '34', '56'], '1'],
    ['quiniela', '12', ['34', '12', '56'], '2'],
    ['quiniela', '12', ['34', '56', '12'], '3'],
    ['pale', '12-34', ['12', '34', '56'], '1-2'],
    ['pale', '12-34', ['12', '56', '34'], '1-3'],
    ['pale', '12-34', ['56', '12', '34'], '2-3'],
    ['tripleta', '12-34-56', ['56', '12', '34'], '3'],
    ['tripleta', '12-34-56', ['12', '34', '78'], '2'],
    ['quiniela', '12', ['34', '56', '78'], null],
    ['pale', '12-34', ['12', '56', '78'], null],
    ['tripleta', '12-34-56', ['12', '78', '90'], null],
];
foreach ($scenarios as [$modality, $numbers, $winning, $category]) {
    DB::beginTransaction();
    try {
        Carbon::setTestNow($saleTime);
        CarbonImmutable::setTestNow($saleTime);
        $ticket = app(SaleService::class)->sell($user, $bank, ['lines' => [[
            'draw_id' => $draw->id, 'modality' => $modality, 'numbers' => $numbers, 'amount' => '10',
        ]], 'discount' => false, 'request_key' => (string) Str::uuid()]);
        $line = $ticket->lines->first();
        $rate = $category === null ? 0 : (int) $settings['rules'][$draw->id.':'.$modality]['payouts'][$category];
        $expected = 1000 * $rate;
        $check($category === null || (int) $line->rules['payouts'][$category] === $rate, 'La tarifa guardada no coincide con la configuración.');
        Carbon::setTestNow($afterClose);
        CarbonImmutable::setTestNow($afterClose);
        $results = app(ResultService::class);
        $results->record(['draw_id' => $draw->id, 'business_date' => $date, 'numbers' => $winning, 'confirmed' => true,
            'evidence' => 'Prueba transaccional de premios: resultado ficticio revertido al finalizar.'], $user);
        $check((int) $line->fresh()->prize_minor === $expected, 'Premio incorrecto: '.$modality.' '.$category);
        $payments = fn () => LotteryAudit::where('action', 'ticket.paid')->where('payload->ticket', $ticket->code)->get();
        $item = ['ticket' => $ticket->code, 'modality' => $modality, 'numbers' => $numbers, 'results' => $winning,
            'category' => $category, 'wager_minor' => 1000, 'configured_rate' => $rate,
            'expected_prize_minor' => $expected, 'actual_prize_minor' => $line->fresh()->prize_minor];
        if ($expected > 0) {
            $results->pay($user, $ticket);
            $paid = $line->fresh();
            $check($paid->paid_at !== null && $paid->paid_by === $user->id, 'Pago no registrado.');
            $check($payments()->count() === 1 && (int) $payments()->first()->payload['amount_minor'] === $expected, 'Importe pagado incorrecto.');
            $item['paid_minor'] = $payments()->first()->payload['amount_minor'];
        }
        try {
            $results->pay($user, $ticket->fresh());
            throw new RuntimeException('Se permitió un pago duplicado o un pago sin premio.');
        } catch (HttpException $e) {
            $check($e->getStatusCode() === 422, 'Código inesperado al rechazar el pago.');
            $item[$expected > 0 ? 'duplicate_payment' : 'nonwinning_payment'] = ['rejected' => true, 'message' => $e->getMessage()];
        }
        $check($payments()->count() === ($expected > 0 ? 1 : 0), 'Cantidad incorrecta de pagos.');
        if ($expected > 0) $check($line->fresh()->paid_at->eq($paid->paid_at), 'El segundo intento alteró el pago.');
        else $check($line->fresh()->paid_at === null, 'Jugada perdedora marcada como pagada.');
        $item['passed'] = true;
        $report['scenarios'][] = $item;
    } finally {
        DB::rollBack();
        Carbon::setTestNow();
        CarbonImmutable::setTestNow();
    }
}
$check(Ticket::count() === $beforeTickets, 'Quedaron tickets ficticios.');
$check(DrawResult::where('draw_id', $draw->id)->where('business_date', $date)->get()->toJson() === $beforeResults, 'Quedaron resultados ficticios.');
$report['rolled_back'] = true;
$report['passed'] = true;
$json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
file_put_contents(storage_path('app/demo-standard-prizes-verification.json'), $json);
echo $json.PHP_EOL;
