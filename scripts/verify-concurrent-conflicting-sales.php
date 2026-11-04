<?php

use App\Models\{BranchOffice, Draw, LotteryAudit, Office, Ticket, User};
use App\Services\Lottery\{Configuration, LimitEngine, SaleService};
use Carbon\{Carbon, CarbonImmutable};
use Database\Seeders\LotteryDemoSeeder;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\{Artisan, DB};
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (! $app->environment('local')) throw new RuntimeException('Solo se permite en local.');
$worker = ($argv[1] ?? '') === '--worker';
$database = $worker ? ($argv[2] ?? '') : 'lotoenlace_conflicttest_'.bin2hex(random_bytes(6));
if (! preg_match('/^lotoenlace_conflicttest_[a-f0-9]{12}$/D', $database)) throw new RuntimeException('Base temporal inválida.');
$connect = function () use ($database): void {
    config(['database.connections.sale_test' => array_replace(config('database.connections.mysql'), ['database' => $database]),
        'database.default' => 'sale_test']);
};
if ($worker) {
    $connect();
    $bank = BranchOffice::findOrFail((int) $argv[3]);
    $draw = Draw::where('source_key', 'resultados-new-york-noche')->firstOrFail();
    Carbon::setTestNow(CarbonImmutable::parse('2026-10-20 10:00:00', 'America/Santo_Domingo'));
    CarbonImmutable::setTestNow(Carbon::now());
    $user = User::findOrFail((int) $argv[4]);
    $readyPath = $argv[5];
    $start = microtime(true);
    $connectionId = DB::selectOne('SELECT CONNECTION_ID() AS id')->id;
    file_put_contents($readyPath, json_encode(['pid' => getmypid(), 'connection_id' => $connectionId]));
    try {
        $ticket = app(SaleService::class)->sell($user, $bank, ['lines' => [[
            'draw_id' => $draw->id, 'modality' => 'quiniela', 'numbers' => '10', 'amount' => $argv[7],
        ]], 'discount' => false, 'request_key' => $argv[6]]);
        $result = ['outcome' => 'sold', 'ticket' => $ticket->code, 'gross_minor' => $ticket->gross_minor];
    } catch (HttpException $e) {
        $result = ['outcome' => 'rejected', 'status' => $e->getStatusCode(), 'message' => $e->getMessage()];
    } catch (ValidationException $e) {
        $result = ['outcome' => 'rejected', 'status' => 422, 'errors' => $e->errors()];
    }
    echo json_encode([...$result, 'requested_amount' => $argv[7], 'pid' => getmypid(), 'connection_id' => $connectionId, 'elapsed_ms' => round((microtime(true) - $start) * 1000)]);
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
    $exit = Artisan::call('migrate', ['--database' => 'sale_test', '--force' => true]);
    $check($exit === 0, 'Fallaron las migraciones de la base temporal.');
    (new LotteryDemoSeeder)->run();
    $bank = BranchOffice::where('code', 'PRUEBA-001')->firstOrFail();
    $seller = User::factory()->create(['active_branch_office_id' => $bank->id]);
    $seller->branchOffices()->attach($bank->id, ['is_default' => true]);
    $users = [$seller, $seller];
    $requestKey = (string) Str::uuid();
    $draw = Draw::where('source_key', 'resultados-new-york-noche')->firstOrFail();
    Carbon::setTestNow(CarbonImmutable::parse('2026-10-20 10:00:00', 'America/Santo_Domingo'));
    CarbonImmutable::setTestNow(Carbon::now());
    $probe = app(Configuration::class)->prepare($bank, ['draw_id' => $draw->id, 'modality' => 'quiniela', 'numbers' => '10', 'amount' => '60']);
    $before = app(LimitEngine::class)->available($bank, $probe);
    $check($before === 10000, 'Cupo inicial inesperado.');
    $report += ['bank' => $bank->code, 'draw' => $draw->name, 'numbers' => '10', 'available_before_minor' => $before,
        'attempt_amounts_minor' => [3000, 6000], 'request_key' => $requestKey, 'user_id' => $seller->id];
    // Hold the SaleService office lock until both independent connections are waiting.
    DB::beginTransaction();
    Office::whereKey($bank->office_id)->lockForUpdate()->firstOrFail();
    foreach ($users as $index => $user) {
        $ready = storage_path('app/'.$database.'-'.$index.'.ready');
        $readyPaths[] = $ready;
        $process = proc_open([PHP_BINARY, __FILE__, '--worker', $database, (string) $bank->id, (string) $user->id, $ready, $requestKey, $index === 0 ? '30' : '60'],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, base_path(), null, ['bypass_shell' => true]);
        $check(is_resource($process), 'No se pudo iniciar el proceso de venta.');
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
    $check(count($waiting) === 2, 'No se pudo demostrar que ambas ventas estaban esperando simultáneamente el bloqueo.');
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
    $successful = array_values(array_filter($report['attempts'], fn ($r) => $r['outcome'] === 'sold'));
    $rejected = array_values(array_filter($report['attempts'], fn ($r) => $r['outcome'] === 'rejected' && $r['status'] === 409));
    $check(count($successful) === 1 && count($rejected) === 1, 'Se requiere una venta y un rechazo por conflicto 409.');
    $check($rejected[0]['message'] === 'La solicitud ya se usó con otra venta.', 'El rechazo no fue por reutilizar la clave.');
    $acceptedAmount = (int) $successful[0]['requested_amount'] * 100;
    $check((int) $successful[0]['gross_minor'] === $acceptedAmount, 'La respuesta aceptada no conserva su monto.');
    $check(Ticket::count() === 1, 'Se creó más de un ticket.');
    $ticket = Ticket::sole();
    $check($ticket->request_key === $requestKey, 'El ticket no conserva la clave de solicitud.');
    $check($ticket->code === $successful[0]['ticket'], 'La respuesta no coincide con el ticket persistido.');
    $check($ticket->status === 'sold' && (int) $ticket->gross_minor === $acceptedAmount, 'Importe o estado incorrecto.');
    $check($ticket->lines()->count() === 1 && (int) $ticket->lines()->sum('amount_minor') === $acceptedAmount, 'Se excedió el monto vendido.');
    $remaining = app(LimitEngine::class)->available($bank->fresh(), $probe);
    $check($remaining === 10000 - $acceptedAmount, 'El cupo no coincide exclusivamente con el monto aceptado.');
    $audits = LotteryAudit::where('action', 'ticket.sold')->get();
    $check($audits->count() === 1 && $audits->first()->payload['ticket'] === $ticket->code, 'Auditoría de venta duplicada o incorrecta.');
    $check($ticket->user_id === $successful[0]['user_id'], 'El ticket no corresponde al proceso aceptado.');
    $report += ['sold_tickets' => Ticket::count(), 'sale_audit_count' => $audits->count(),
        'total_sold_minor' => (int) Ticket::sum('gross_minor'), 'available_after_minor' => $remaining, 'conflict_status' => 409, 'only_accepted_amount_consumed' => true, 'limit_exceeded' => false, 'passed' => true];
} finally {
    while (DB::connection('sale_test')->transactionLevel() > 0) DB::connection('sale_test')->rollBack();
    foreach ($processes as $entry) {
        if (is_resource($entry['process'])) { proc_terminate($entry['process']); proc_close($entry['process']); }
    }
    Carbon::setTestNow();
    CarbonImmutable::setTestNow();
    DB::purge('sale_test');
    // Only the unique database created by this invocation can reach this cleanup.
    $control->exec("DROP DATABASE `$database`");
    foreach ($readyPaths as $path) if (is_file($path)) unlink($path);
}
$report['temporary_database_removed'] = true;
$json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
file_put_contents(storage_path('app/concurrent-conflicting-sales-verification.json'), $json);
echo $json.PHP_EOL;
