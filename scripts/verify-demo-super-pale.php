<?php

use App\Models\{BetLimit, BranchOffice, Draw, Ticket, User};
use App\Services\Lottery\{Configuration, LimitEngine, SaleService};
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (! $app->environment('local')) throw new RuntimeException('Solo se permite en local.');
$bank = BranchOffice::where('code', 'PRUEBA-001')->whereHas('office', fn ($q) => $q->where('name', 'Consorcio de prueba LotoEnlace'))->firstOrFail();
$user = User::where('email', 'admin@lotoenlace.test')->firstOrFail();
$config = app(Configuration::class);
$limits = app(LimitEngine::class);
$sales = app(SaleService::class);
$settings = $config->effective($bank);
$draws = Draw::whereIn('id', $settings['draw_ids'])->with('lottery')->orderByDesc('closes_at')->get()
    ->filter(fn ($d) => $d->lottery->active && in_array('super_pale', $d->modalities) && ($config->window($d)['open'] ?? false)
        && $config->window($d)['closes_at']->gt($config->clock()->addMinutes(3)))->take(2)->values();
if ($draws->count() !== 2) throw new RuntimeException('No hay dos sorteos abiertos con margen suficiente. No se modificaron horarios.');
$ids = $draws->pluck('id')->all();
sort($ids);
$pair = implode('-', $ids);
$line = ['draw_id' => $ids[0], 'second_draw_id' => $ids[1], 'modality' => 'super_pale', 'numbers' => '10-20', 'amount' => '40'];
$prepared = $config->prepare($bank, $line);
$check = function (bool $condition, string $message): void {
    if (! $condition) throw new RuntimeException($message);
};
$available = fn () => $limits->available($bank, $prepared);
$before = $available();
$check($before === 10000, 'El cupo inicial no es RD$100; no se alterará la configuración actual.');
$tickets = [];
$temporary = null;
$report = ['tested_at' => $config->clock()->toIso8601String(), 'bank' => $bank->code,
    'draws' => $draws->pluck('name')->all(), 'pair' => $pair, 'currency' => 'DOP'];
$sell = function (array $input) use ($sales, $user, $bank, &$tickets): Ticket {
    $ticket = $sales->sell($user, $bank, ['lines' => [$input], 'discount' => false, 'request_key' => (string) Str::uuid()]);
    $tickets[] = $ticket;
    return $ticket;
};
$reject = function (array $input) use ($sell, $check): array {
    $count = Ticket::count();
    try {
        $sell($input);
    } catch (ValidationException $e) {
        $check(Ticket::count() === $count, 'Un rechazo generó un ticket.');
        return ['rejected' => true, 'ticket_created' => false, 'errors' => $e->errors()];
    }
    throw new RuntimeException('Se aceptó una jugada que debía rechazarse.');
};
try {
    $ticket = $sell($line);
    $check($available() === 6000, 'El límite general no consumió RD$40.');
    $report['general'] = ['before_minor' => $before, 'ticket' => $ticket->code, 'sold_minor' => $ticket->gross_minor,
        'after_sale_minor' => $available(), 'over_limit_61' => $reject([...$line, 'amount' => '61']),
        'blocked_00_00' => $reject([...$line, 'numbers' => '00-00', 'amount' => '1'])];
    $sales->cancel($user, $ticket, $ticket->payment_pin);
    $check($available() === $before, 'La primera anulación no restauró el límite general.');
    $report['general']['after_cancel_minor'] = $available();

    $temporary = BetLimit::create(['office_id' => $bank->office_id, 'branch_office_id' => $bank->id,
        'name' => 'VERIFICACIÓN TEMPORAL súper palé '.$pair.' '.Str::uuid(), 'modality' => 'super_pale',
        'category' => '1-3', 'match_type' => 'exact', 'numbers' => '10-20', 'pairs' => [$pair],
        'aggregation' => 'shared', 'amount_minor' => 2500, 'active' => true,
        'starts_on' => $config->clock()->toDateString(), 'ends_on' => $config->clock()->toDateString()]);
    $check($available() === 2500, 'No se aplica el límite específico de pareja.');
    // Inspect another configured pair without placing a sale, even if that pair has closed.
    $otherId = collect($settings['draw_ids'])->first(fn ($id) => ! in_array($id, $ids));
    $otherIds = [$ids[0], $otherId];
    sort($otherIds);
    $other = [...$prepared, 'draw_id' => $otherIds[0], 'second_draw_id' => $otherIds[1], 'rules' => $settings['pairs'][implode('-', $otherIds)]];
    $check($limits->available($bank, $other) === 10000, 'La regla de pareja afecta otra combinación.');
    $ticket = $sell([...$line, 'amount' => '20']);
    $check($available() === 500, 'La pareja no consumió RD$20.');
    $check($limits->available($bank, $other) === 8000, 'La venta de pareja no consumió también el límite general compartido.');
    $report['specific_pair'] = ['rule_id' => $temporary->id, 'before_minor' => 2500, 'ticket' => $ticket->code,
        'sold_minor' => $ticket->gross_minor, 'after_sale_minor' => $available(),
        'general_remaining_via_other_pair_minor' => $limits->available($bank, $other),
        'over_limit_6_reversed_numbers' => $reject([...$line, 'numbers' => '20-10', 'amount' => '6']),
        'blocked_00_00' => $reject([...$line, 'numbers' => '00-00', 'amount' => '1'])];
    $sales->cancel($user, $ticket, $ticket->payment_pin);
    $check($available() === 2500, 'No se liberó el cupo específico.');
    $check($limits->available($bank, $other) === 10000, 'No se liberó el cupo general.');
    $report['specific_pair']['after_cancel_minor'] = $available();
    $report['specific_pair']['general_after_cancel_minor'] = $limits->available($bank, $other);
} finally {
    try {
        foreach ($tickets as $ticket) {
            if ($ticket->fresh()->status === 'sold') $sales->cancel($user, $ticket, $ticket->payment_pin);
        }
    } finally {
        if ($temporary) $temporary->update(['active' => false]);
    }
}
$report['tickets'] = array_map(fn ($t) => ['code' => $t->code, 'status' => $t->fresh()->status], $tickets);
$report['temporary_rule_active'] = $temporary->fresh()->active;
$report['final_available_minor'] = $available();
$check($available() === $before, 'El cupo final no coincide con el inicial.');
$report['passed'] = true;
$json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
file_put_contents(storage_path('app/demo-super-pale-verification.json'), $json);
echo $json.PHP_EOL;
