<?php

use App\Models\{BranchOffice, Draw, LotteryAudit, Office, Ticket, User};
use App\Services\Lottery\{Configuration, LimitEngine, SaleService};
use Carbon\{Carbon, CarbonImmutable};
use Database\Seeders\LotteryDemoSeeder;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\{Artisan, DB};
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (! $app->environment('local')) throw new RuntimeException('Solo se permite en local.');
$worker = ($argv[1] ?? '') === '--worker';
$database = $worker ? ($argv[2] ?? '') : 'lotoenlace_canceltest_'.bin2hex(random_bytes(6));
if (! preg_match('/^lotoenlace_canceltest_[a-f0-9]{12}$/D', $database)) throw new RuntimeException('Base temporal inválida.');
$connect = function () use ($database): void {
    config(['database.connections.cancel_test' => array_replace(config('database.connections.mysql'), ['database' => $database]),
        'database.default' => 'cancel_test']);
};
if ($worker) {
    $connect();
    Carbon::setTestNow(CarbonImmutable::parse('2026-10-20 10:00:01', 'America/Santo_Domingo'));
    CarbonImmutable::setTestNow(Carbon::now());
    $ticket = Ticket::findOrFail((int) $argv[3]);
    $user = User::findOrFail((int) $argv[4]);
    $readyPath = $argv[5];
    $start = microtime(true);
    $connectionId = DB::selectOne('SELECT CONNECTION_ID() AS id')->id;
    file_put_contents($readyPath, json_encode(['pid' => getmypid(), 'connection_id' => $connectionId]));
    try {
        app(SaleService::class)->cancel($user, $ticket, $ticket->payment_pin);
        $result = ['outcome' => 'cancelled'];
    } catch (HttpException $e) {
        $result = ['outcome' => 'rejected', 'status' => $e->getStatusCode(), 'message' => $e->getMessage()];
    }
    echo json_encode([...$result, 'pid' => getmypid(), 'connection_id' => $connectionId, 'elapsed_ms' => round((microtime(true) - $start) * 1000)]);
    exit;
}
$check = function (bool $ok, string $message): void {
    if (! $ok) throw new RuntimeException($message);
};
$control = DB::connection('mysql')->getPdo();
$control->exec("CREATE DATABASE `$database` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$processes = [];
$readyPaths = [];
$report = ['tested_at' => date(DATE_ATOM), 'database' => $database, 'isolation' => 'Base MySQL temporal independiente; dos procesos PHP y dos conexiones reales.'];
try {
    $connect();
    $exit = Artisan::call('migrate', ['--database' => 'cancel_test', '--force' => true]);
    $check($exit === 0, 'Fallaron las migraciones de la base temporal.');
    (new LotteryDemoSeeder)->run();
    $bank = BranchOffice::where('code', 'PRUEBA-001')->firstOrFail();
    $secondBank = BranchOffice::create(['office_id' => $bank->office_id, 'code' => 'PRUEBA-002',
        'name' => 'Segunda banca de concurrencia', 'is_active' => true, 'lottery_settings' => []]);
    $banks = [$bank, $secondBank];
    $users = [User::factory()->create(['active_branch_office_id' => $bank->id]), User::factory()->create(['active_branch_office_id' => $bank->id])];
    foreach ($users as $user) $user->branchOffices()->attach($bank->id, ['is_default' => true]);
    $draw = Draw::where('source_key', 'resultados-new-york-noche')->firstOrFail();
    Carbon::setTestNow(CarbonImmutable::parse('2026-10-20 10:00:00', 'America/Santo_Domingo'));
    CarbonImmutable::setTestNow(Carbon::now());
    $ticket = app(SaleService::class)->sell($users[0], $bank, ['lines' => [[
        'draw_id' => $draw->id, 'modality' => 'quiniela', 'numbers' => '10', 'amount' => '60',
    ]], 'discount' => false, 'request_key' => (string) Str::uuid()]);
    $probe = app(Configuration::class)->prepare($bank, ['draw_id' => $draw->id, 'modality' => 'quiniela', 'numbers' => '10', 'amount' => '60']);
    $before = [];
    foreach ($banks as $candidate) {
        $before[$candidate->code] = app(LimitEngine::class)->available($candidate, $probe);
        $check($before[$candidate->code] === 4000, 'El cupo después de vender no es RD$40.');
    }
    $report += ['ticket' => $ticket->code, 'gross_minor' => 6000, 'shared_limit_minor' => 10000,
        'available_before_cancellation_by_bank_minor' => $before];
    // Hold the same consortium row locked by cancellation until both clients are waiting.
    DB::beginTransaction();
    Office::whereKey($bank->office_id)->lockForUpdate()->firstOrFail();
    foreach ($users as $index => $user) {
        $ready = storage_path('app/'.$database.'-'.$index.'.ready');
        $readyPaths[] = $ready;
        $process = proc_open([PHP_BINARY, __FILE__, '--worker', $database, (string) $ticket->id, (string) $user->id, $ready],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, base_path(), null, ['bypass_shell' => true]);
        $check(is_resource($process), 'No se pudo iniciar el proceso de anulación.');
        fclose($pipes[0]);
        $processes[] = ['process' => $process, 'pipes' => $pipes, 'user_id' => $user->id];
    }
    $deadline = microtime(true) + 15;
    $waiting = [];
    do {
        clearstatcache();
        if (is_file($readyPaths[0]) && is_file($readyPaths[1])) {
            $ids = array_map(fn ($p) => (int) json_decode(file_get_contents($p), true, flags: JSON_THROW_ON_ERROR)['connection_id'], $readyPaths);
            $waiting = $control->query('SELECT trx_mysql_thread_id, trx_state FROM information_schema.innodb_trx WHERE trx_mysql_thread_id IN ('.implode(',', $ids).") AND trx_state = 'LOCK WAIT'")->fetchAll(PDO::FETCH_ASSOC);
            if (count($waiting) === 2) break;
        }
        usleep(500000);
    } while (microtime(true) < $deadline);
    $check(count($waiting) === 2, 'No se pudo demostrar que ambas anulaciones estaban esperando simultáneamente el bloqueo.');
    $report['simultaneous_lock_waits'] = $waiting;
    DB::commit();
    foreach ($processes as $entry) {
        $output = stream_get_contents($entry['pipes'][1]);
        $error = stream_get_contents($entry['pipes'][2]);
        fclose($entry['pipes'][1]);
        fclose($entry['pipes'][2]);
        $exit = proc_close($entry['process']);
        $check($exit === 0, 'Proceso falló: '.$error.$output);
        $report['attempts'][] = [...json_decode($output, true, flags: JSON_THROW_ON_ERROR), 'user_id' => $entry['user_id']];
    }
    $processes = [];
    $successful = array_values(array_filter($report['attempts'], fn ($r) => $r['outcome'] === 'cancelled'));
    $rejected = array_values(array_filter($report['attempts'], fn ($r) => $r['outcome'] === 'rejected' && $r['status'] === 422));
    $check(count($successful) === 1 && count($rejected) === 1, 'No hubo exactamente un éxito y un rechazo.');
    $ticket->refresh();
    $check($ticket->status === 'cancelled' && $ticket->cancelled_at !== null, 'El ticket no quedó anulado.');
    $check($rejected[0]['message'] === 'El ticket ya fue anulado.', 'El segundo intento falló por una causa distinta de la anulación previa.');
    $audits = LotteryAudit::where('action', 'ticket.cancelled')->where('payload->ticket', $ticket->code)->get();
    $check($audits->count() === 1 && $audits->first()->user_id === $successful[0]['user_id'], 'La auditoría no corresponde a una única anulación exitosa.');
    $after = [];
    foreach ($banks as $candidate) {
        $after[$candidate->code] = app(LimitEngine::class)->available($candidate->fresh(), $probe);
        $check($after[$candidate->code] === 10000 && $after[$candidate->code] - $before[$candidate->code] === 6000,
            'El cupo no se liberó exactamente una vez en '.$candidate->code);
    }
    $check(Ticket::count() === 1 && Ticket::where('status', 'sold')->count() === 0, 'El ticket se duplicó o sigue vendido.');
    $check(LotteryAudit::where('action', 'ticket.sold')->count() === 1, 'Se alteró la auditoría de venta original.');
    $report += ['final_status' => $ticket->status, 'cancelled_at' => $ticket->cancelled_at->toIso8601String(),
        'cancellation_audit_count' => $audits->count(), 'sale_audit_count' => 1,
        'available_after_cancellation_by_bank_minor' => $after, 'released_minor' => 6000,
        'active_sales_minor' => (int) Ticket::where('status', 'sold')->sum('gross_minor'), 'passed' => true];
} finally {
    while (DB::connection('cancel_test')->transactionLevel() > 0) DB::connection('cancel_test')->rollBack();
    foreach ($processes as $entry) {
        if (is_resource($entry['process'])) { proc_terminate($entry['process']); proc_close($entry['process']); }
    }
    Carbon::setTestNow();
    CarbonImmutable::setTestNow();
    DB::purge('cancel_test');
    // Only the unique database created by this invocation can reach this cleanup.
    $control->exec("DROP DATABASE `$database`");
    foreach ($readyPaths as $path) if (is_file($path)) unlink($path);
}
$report['temporary_database_removed'] = true;
$json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
file_put_contents(storage_path('app/concurrent-cancellations-verification.json'), $json);
echo $json.PHP_EOL;
