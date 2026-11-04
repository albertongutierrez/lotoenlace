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
$saleTime = $config->clock();
$date = $saleTime->toDateString();
$afterClose = $config->window($draws[0])['closes_at']->max($config->window($draws[1])['closes_at'])->addMinute();
$pairRule = $settings['pairs'][$draws[0]->id.'-'.$draws[1]->id];
$primaryId = (int) ($pairRule['primary_draw_id'] ?? $draws[0]->id);
$secondaryId = $primaryId === $draws[0]->id ? $draws[1]->id : $draws[0]->id;
$report = ['tested_at' => $saleTime->toIso8601String(), 'bank' => $bank->code,
    'draws' => $draws->pluck('name')->all(), 'configured_rates' => $pairRule['payouts'],
    'execution' => 'MySQL local; cada escenario se revierte. Reloj posterior al cierre simulado solo en PHP.', 'scenarios' => []];
$before = DrawResult::whereIn('draw_id', $draws->pluck('id'))->where('business_date', $date)->get()->toJson();
$ticketsBefore = Ticket::count();
$scenarios = [
    ['name' => 'Primer premio + segundo', 'secondary' => ['90', '34', '11'], 'categories' => ['1-2']],
    ['name' => 'Primer premio + tercero', 'secondary' => ['90', '11', '34'], 'categories' => ['1-3']],
    ['name' => 'Coinciden segundo y tercero', 'secondary' => ['90', '34', '34'], 'categories' => ['1-2', '1-3']],
    ['name' => 'Coinciden las tres categorías', 'secondary' => ['34', '34', '34'], 'categories' => ['1-1', '1-2', '1-3']],
];
foreach ($scenarios as $scenario) {
    DB::beginTransaction();
    try {
        Carbon::setTestNow($saleTime);
        CarbonImmutable::setTestNow($saleTime);
        $ticket = app(SaleService::class)->sell($user, $bank, ['lines' => [[
            'draw_id' => $draws[0]->id, 'second_draw_id' => $draws[1]->id, 'modality' => 'super_pale',
            'numbers' => '12-34', 'amount' => '10',
        ]], 'discount' => false, 'request_key' => (string) Str::uuid()]);
        $line = $ticket->lines->first();
        $rates = array_map(fn ($category) => (int) $line->rules['payouts'][$category], $scenario['categories']);
        $expected = 1000 * max($rates);
        Carbon::setTestNow($afterClose);
        CarbonImmutable::setTestNow($afterClose);
        $service = app(ResultService::class);
        foreach ([$primaryId => ['12', '56', '78'], $secondaryId => $scenario['secondary']] as $drawId => $numbers) {
            $service->record(['draw_id' => $drawId, 'business_date' => $date, 'numbers' => $numbers,
                'confirmed' => true, 'evidence' => 'Prueba secundaria transaccional; resultado ficticio revertido.'], $user);
        }
        $actual = (int) $line->fresh()->prize_minor;
        $check($actual === $expected, 'Premio incorrecto en '.$scenario['name']);
        if (count($rates) > 1) $check($actual !== 1000 * array_sum($rates), 'Se sumaron varios premios.');
        $service->pay($user, $ticket);
        $payments = LotteryAudit::where('action', 'ticket.paid')->where('payload->ticket', $ticket->code)->get();
        $check($payments->count() === 1 && (int) $payments->first()->payload['amount_minor'] === $expected, 'El pago no coincide con el premio único.');
        $report['scenarios'][] = ['name' => $scenario['name'], 'ticket' => $ticket->code, 'wager_minor' => 1000,
            'primary_results' => ['12', '56', '78'], 'secondary_results' => $scenario['secondary'],
            'matching_categories' => $scenario['categories'], 'matching_rates' => $rates,
            'expected_prize_minor' => $expected, 'actual_prize_minor' => $actual,
            'payment_minor' => $payments->first()->payload['amount_minor'], 'passed' => true];
    } finally {
        DB::rollBack();
        Carbon::setTestNow();
        CarbonImmutable::setTestNow();
    }
}
$check(Ticket::count() === $ticketsBefore, 'Quedaron tickets ficticios.');
$check(DrawResult::whereIn('draw_id', $draws->pluck('id'))->where('business_date', $date)->get()->toJson() === $before, 'Se modificaron resultados existentes.');
$report['rolled_back'] = true;
$report['passed'] = true;
$json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
file_put_contents(storage_path('app/demo-secondary-prizes-verification.json'), $json);
echo $json.PHP_EOL;
