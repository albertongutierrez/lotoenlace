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
    ->filter(fn ($d) => $d->lottery->active && in_array('super_pale', $d->modalities) && ($config->window($d)['open'] ?? false))->take(2)->sortBy('closes_at')->values();
if ($draws->count() !== 2) throw new RuntimeException('No hay dos sorteos abiertos. No se modificaron datos.');
$check = function (bool $condition, string $message): void {
    if (! $condition) throw new RuntimeException($message);
};
$date = $config->clock()->toDateString();
$report = ['tested_at' => $config->clock()->toIso8601String(), 'bank' => $bank->code,
    'draws_in_result_order' => $draws->pluck('name')->all(),
    'execution' => 'MySQL local; transacción revertida. Reloj simulado por cierre solo en este proceso.'];
$beforeResults = DrawResult::whereIn('draw_id', $draws->pluck('id'))->where('business_date', $date)->get()->toJson();
$beforeTickets = Ticket::count();
$service = app(ResultService::class);
DB::beginTransaction();
try {
    $ticket = app(SaleService::class)->sell($user, $bank, ['lines' => [
        ['draw_id' => $draws[0]->id, 'modality' => 'quiniela', 'numbers' => '34', 'amount' => '10'],
        ['draw_id' => $draws[1]->id, 'modality' => 'quiniela', 'numbers' => '12', 'amount' => '20'],
        ['draw_id' => $draws[0]->id, 'second_draw_id' => $draws[1]->id, 'modality' => 'super_pale', 'numbers' => '12-34', 'amount' => '10'],
    ], 'discount' => false, 'request_key' => (string) Str::uuid()]);
    [$first, $second, $super] = $ticket->lines->all();
    $expectedFirst = 1000 * $first->rules['payouts']['1'];
    $expectedSecond = 2000 * $second->rules['payouts']['1'];
    $expectedSuper = 1000 * $super->rules['payouts']['1-1'];
    $report['ticket'] = $ticket->code;
    $report['gross_minor'] = $ticket->gross_minor;
    $payments = fn () => LotteryAudit::where('action', 'ticket.paid')->where('payload->ticket', $ticket->code)->orderBy('id')->get();
    $rejectRepeat = function () use ($service, $user, $ticket, $check, $payments): array {
        $count = $payments()->count();
        try {
            $service->pay($user, $ticket->fresh());
            throw new RuntimeException('Se permitió duplicar un pago.');
        } catch (HttpException $e) {
            $check($e->getStatusCode() === 422 && $payments()->count() === $count, 'El rechazo dejó un pago adicional.');
            return ['rejected' => true, 'message' => $e->getMessage()];
        }
    };
    $atFirstClose = $config->window($draws[0])['closes_at']->addMinute();
    Carbon::setTestNow($atFirstClose);
    CarbonImmutable::setTestNow($atFirstClose);
    $service->record(['draw_id' => $draws[0]->id, 'business_date' => $date, 'numbers' => ['34', '56', '78'],
        'confirmed' => true, 'evidence' => 'Prueba ficticia de pago parcial; transacción revertida.'], $user);
    $check((int) $first->fresh()->prize_minor === $expectedFirst, 'Primer premio incorrecto.');
    $check($second->fresh()->prize_minor === null && $super->fresh()->prize_minor === null, 'Se resolvieron jugadas sin el segundo resultado.');
    $service->pay($user, $ticket);
    $paidFirst = $first->fresh();
    $check($paidFirst->paid_at !== null && $paidFirst->paid_by === $user->id, 'El primer premio no se marcó pagado.');
    $check($second->fresh()->paid_at === null && $super->fresh()->paid_at === null, 'Se pagaron jugadas pendientes.');
    $check($payments()->count() === 1 && (int) $payments()->first()->payload['amount_minor'] === $expectedFirst, 'Primer pago incorrecto.');
    $report['first_payment'] = ['draw' => $draws[0]->name, 'amount_minor' => $expectedFirst,
        'unresolved_lines' => 2, 'repeat_attempt' => $rejectRepeat()];

    $atSecondClose = CarbonImmutable::parse($date.' '.$draws[1]->closes_at, 'America/Santo_Domingo')->addMinute();
    Carbon::setTestNow($atSecondClose);
    CarbonImmutable::setTestNow($atSecondClose);
    $service->record(['draw_id' => $draws[1]->id, 'business_date' => $date, 'numbers' => ['12', '90', '11'],
        'confirmed' => true, 'evidence' => 'Prueba ficticia de pago parcial; transacción revertida.'], $user);
    $check((int) $second->fresh()->prize_minor === $expectedSecond && (int) $super->fresh()->prize_minor === $expectedSuper, 'Premios posteriores incorrectos.');
    $check($first->fresh()->paid_at->eq($paidFirst->paid_at), 'El segundo resultado alteró el pago anterior.');
    $service->pay($user, $ticket->fresh());
    $check($payments()->count() === 2 && (int) $payments()->last()->payload['amount_minor'] === $expectedSecond + $expectedSuper, 'El segundo pago incluyó importes anteriores o excluyó pendientes.');
    $check($first->fresh()->paid_at->eq($paidFirst->paid_at) && $first->fresh()->paid_by === $paidFirst->paid_by, 'Se sobrescribió el primer pago.');
    $check($second->fresh()->paid_at !== null && $super->fresh()->paid_at !== null, 'Quedaron premios sin pagar.');
    $report['second_payment'] = ['draw' => $draws[1]->name, 'quiniela_minor' => $expectedSecond,
        'super_pale_minor' => $expectedSuper, 'amount_minor' => $expectedSecond + $expectedSuper,
        'previous_payment_unchanged' => true, 'repeat_attempt' => $rejectRepeat()];
    $total = $payments()->sum(fn ($p) => $p->payload['amount_minor']);
    $check($total === $expectedFirst + $expectedSecond + $expectedSuper, 'El total pagado difiere del total ganado.');
    $check($ticket->lines()->where('prize_minor', '>', 0)->whereNull('paid_at')->count() === 0, 'Quedan premios pendientes.');
    $report['payment_count'] = $payments()->count();
    $report['total_paid_minor'] = $total;
    $report['pending_winning_lines'] = 0;
} finally {
    DB::rollBack();
    Carbon::setTestNow();
    CarbonImmutable::setTestNow();
}
$check(Ticket::count() === $beforeTickets, 'Quedó un ticket ficticio.');
$check(DrawResult::whereIn('draw_id', $draws->pluck('id'))->where('business_date', $date)->get()->toJson() === $beforeResults, 'Quedaron resultados ficticios.');
$report['rolled_back'] = true;
$report['passed'] = true;
$json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
file_put_contents(storage_path('app/demo-partial-payments-verification.json'), $json);
echo $json.PHP_EOL;
