<?php

use App\Models\{BranchOffice, Draw, LotteryAudit, Office, Ticket, User};
use App\Services\Lottery\{ResultService, SaleService};
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
$database = $worker ? ($argv[2] ?? '') : 'lotoenlace_paytest_'.bin2hex(random_bytes(6));
if (! preg_match('/^lotoenlace_paytest_[a-f0-9]{12}$/D', $database)) throw new RuntimeException('Base temporal inválida.');
$connect = function () use ($database): void {
    config(['database.connections.payment_test' => array_replace(config('database.connections.mysql'), ['database' => $database]),
        'database.default' => 'payment_test']);
};
if ($worker) {
    $connect();
    $ticket = Ticket::findOrFail((int) $argv[3]);
    $user = User::findOrFail((int) $argv[4]);
    $readyPath = $argv[5];
    $start = microtime(true);
    $connectionId = DB::selectOne('SELECT CONNECTION_ID() AS id')->id;
    file_put_contents($readyPath, json_encode(['pid' => getmypid(), 'connection_id' => $connectionId]));
    try {
        app(ResultService::class)->pay($user, $ticket);
        $result = ['outcome' => 'paid'];
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
    $exit = Artisan::call('migrate', ['--database' => 'payment_test', '--force' => true]);
    $check($exit === 0, 'Fallaron las migraciones de la base temporal.');
    (new LotteryDemoSeeder)->run();
    $bank = BranchOffice::where('code', 'PRUEBA-001')->firstOrFail();
    $users = [User::factory()->create(), User::factory()->create()];
    $draw = Draw::where('source_key', 'resultados-new-york-noche')->firstOrFail();
    Carbon::setTestNow(CarbonImmutable::parse('2026-10-20 10:00:00', 'America/Santo_Domingo'));
    CarbonImmutable::setTestNow(Carbon::now());
    $ticket = app(SaleService::class)->sell($users[0], $bank, ['lines' => [[
        'draw_id' => $draw->id, 'modality' => 'quiniela', 'numbers' => '12', 'amount' => '10',
    ]], 'discount' => false, 'request_key' => (string) Str::uuid()]);
    Carbon::setTestNow(CarbonImmutable::parse('2026-10-20 23:00:00', 'America/Santo_Domingo'));
    CarbonImmutable::setTestNow(Carbon::now());
    app(ResultService::class)->record(['draw_id' => $draw->id, 'business_date' => '2026-10-20',
        'numbers' => ['12', '34', '56'], 'confirmed' => true], $users[0]);
    Carbon::setTestNow();
    CarbonImmutable::setTestNow();
    $expected = (int) $ticket->lines()->sole()->prize_minor;
    $check($expected === 60000, 'Premio de prueba inesperado.');
    $report += ['ticket' => $ticket->code, 'expected_prize_minor' => $expected];

    // Hold the very same office row used by ResultService::pay, until BOTH clients are waiting.
    DB::beginTransaction();
    Office::whereKey($bank->office_id)->lockForUpdate()->firstOrFail();
    foreach ($users as $index => $user) {
        $ready = storage_path('app/'.$database.'-'.$index.'.ready');
        $readyPaths[] = $ready;
        $process = proc_open([PHP_BINARY, __FILE__, '--worker', $database, (string) $ticket->id, (string) $user->id, $ready],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, base_path(), null, ['bypass_shell' => true]);
        $check(is_resource($process), 'No se pudo iniciar el proceso de pago.');
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
        usleep(50000);
    } while (microtime(true) < $deadline);
    $check(count($waiting) === 2, 'No se pudo demostrar que ambos pagos estaban esperando simultáneamente el bloqueo.');
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
    $successful = array_values(array_filter($report['attempts'], fn ($r) => $r['outcome'] === 'paid'));
    $rejected = array_values(array_filter($report['attempts'], fn ($r) => $r['outcome'] === 'rejected' && $r['status'] === 422));
    $check(count($successful) === 1 && count($rejected) === 1, 'No hubo exactamente un éxito y un rechazo.');
    $line = $ticket->lines()->sole();
    $audits = LotteryAudit::where('action', 'ticket.paid')->where('payload->ticket', $ticket->code)->get();
    $check($audits->count() === 1, 'Se duplicó la auditoría del pago.');
    $check((int) $audits->first()->payload['amount_minor'] === $expected, 'Importe pagado incorrecto.');
    $check($line->paid_at !== null && $line->paid_by === $successful[0]['user_id'] && $audits->first()->user_id === $line->paid_by, 'El pago no pertenece al proceso ganador.');
    $report += ['paid_lines' => $ticket->lines()->whereNotNull('paid_at')->count(), 'payment_audit_count' => $audits->count(),
        'total_paid_minor' => $audits->sum(fn ($a) => $a->payload['amount_minor']), 'paid_by' => $line->paid_by, 'passed' => true];
} finally {
    while (DB::connection('payment_test')->transactionLevel() > 0) DB::connection('payment_test')->rollBack();
    foreach ($processes as $entry) {
        if (is_resource($entry['process'])) { proc_terminate($entry['process']); proc_close($entry['process']); }
    }
    Carbon::setTestNow();
    CarbonImmutable::setTestNow();
    DB::purge('payment_test');
    // Only the unique database created by this invocation can reach this cleanup.
    $control->exec("DROP DATABASE `$database`");
    foreach ($readyPaths as $path) if (is_file($path)) unlink($path);
}
$report['temporary_database_removed'] = true;
$json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
file_put_contents(storage_path('app/concurrent-payments-verification.json'), $json);
echo $json.PHP_EOL;
