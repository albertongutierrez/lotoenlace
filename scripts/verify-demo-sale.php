<?php

use App\Models\{BranchOffice, Draw, Ticket, User};
use App\Services\Lottery\{Configuration, LimitEngine, SaleService};
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (! $app->environment('local')) {
    throw new RuntimeException('Esta comprobación solo se permite en local.');
}
$bank = BranchOffice::where('code', 'PRUEBA-001')->whereHas('office', fn ($q) => $q->where('name', 'Consorcio de prueba LotoEnlace'))->firstOrFail();
$user = User::where('email', 'admin@lotoenlace.test')->firstOrFail();
$config = app(Configuration::class);
$limits = app(LimitEngine::class);
$sales = app(SaleService::class);
$settings = $config->effective($bank);
$draw = Draw::whereIn('id', $settings['draw_ids'])->with('lottery')->orderByDesc('closes_at')->get()
    ->first(fn ($d) => $d->lottery->active && in_array('quiniela', $d->modalities) && ($config->window($d)['open'] ?? false));
if (! $draw) {
    throw new RuntimeException('No hay sorteos abiertos actualmente. No se modificaron horarios ni se generaron tickets.');
}
$line = ['draw_id' => $draw->id, 'modality' => 'quiniela', 'numbers' => '10', 'amount' => '40'];
$prepared = $config->prepare($bank, $line);
$before = $limits->available($bank, $prepared);
$blocked = [...$line, 'numbers' => '00', 'amount' => '1'];
if ($before < 4000 || $limits->available($bank, $config->prepare($bank, $blocked)) !== 0) {
    throw new RuntimeException('La configuración actual no permite este escenario de prueba sin alterar datos.');
}
$check = function (bool $ok, string $message): void {
    if (! $ok) throw new RuntimeException($message);
};
$report = ['tested_at' => $config->clock()->toIso8601String(), 'bank' => $bank->code, 'draw' => $draw->name, 'currency' => $bank->office->currency, 'available_before_minor' => $before];
$ticket = null;
try {
    $ticket = $sales->sell($user, $bank, ['lines' => [$line], 'discount' => true, 'request_key' => (string) Str::uuid()]);
    $report += ['ticket' => $ticket->code, 'gross_minor' => $ticket->gross_minor, 'discount_minor' => $ticket->discount_minor, 'net_minor' => $ticket->net_minor, 'commission_minor' => $ticket->commission_minor];
    $check($ticket->gross_minor == 4000 && $ticket->discount_minor == 400 && $ticket->net_minor == 3600 && $ticket->commission_minor == 360, 'Importes inesperados en la venta con descuento.');
    $after = $limits->available($bank, $prepared);
    $report['available_after_sale_minor'] = $after;
    $check($after === $before - 4000, 'El consumo del cupo no coincide con el monto bruto.');
    foreach (['blocked' => $blocked, 'over_limit' => [...$line, 'amount' => number_format(($after + 100) / 100, 2, '.', '')]] as $scenario => $attempt) {
        $count = Ticket::count();
        try {
            $unexpected = $sales->sell($user, $bank, ['lines' => [$attempt], 'discount' => false, 'request_key' => (string) Str::uuid()]);
            $sales->cancel($user, $unexpected, $unexpected->payment_pin);
            throw new RuntimeException('Se aceptó una jugada que debía rechazarse: '.$scenario);
        } catch (ValidationException $e) {
            $report[$scenario] = ['rejected' => true, 'errors' => $e->errors(), 'ticket_created' => Ticket::count() !== $count];
            $check(Ticket::count() === $count, 'El rechazo dejó un ticket persistido.');
        }
    }
} finally {
    if ($ticket && $ticket->fresh()->status === 'sold') {
        $sales->cancel($user, $ticket, $ticket->payment_pin);
    }
}
$report['final_status'] = $ticket->fresh()->status;
$report['available_after_cancel_minor'] = $limits->available($bank, $prepared);
$check($report['final_status'] === 'cancelled', 'El ticket no quedó anulado.');
$check($report['available_after_cancel_minor'] === $before, 'No se liberó el cupo completo.');
$report['passed'] = true;
$json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
file_put_contents(storage_path('app/demo-sale-verification.json'), $json);
echo $json.PHP_EOL;
