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
$order = $worker ? null : ($argv[1] ?? 'cancel-first');
if (! $worker && ! in_array($order, ['cancel-first', 'sale-first'], true)) throw new RuntimeException('Orden inválido.');
$database = $worker ? ($argv[2] ?? '') : 'lotoenlace_mixedtest_'.bin2hex(random_bytes(6));
if (! preg_match('/^lotoenlace_mixedtest_[a-f0-9]{12}$/D', $database)) throw new RuntimeException('Base temporal inválida.');
$connect = function () use ($database): void {
    config(['database.connections.mixed_test' => array_replace(config('database.connections.mysql'), ['database' => $database]),
        'database.default' => 'mixed_test']);
};
if ($worker) {
    $connect();
    Carbon::setTestNow(CarbonImmutable::parse('2026-10-20 10:00:01', 'America/Santo_Domingo'));
    CarbonImmutable::setTestNow(Carbon::now());
    $ticket = Ticket::findOrFail((int) $argv[3]);
    $user = User::findOrFail((int) $argv[4]);
    $readyPath = $argv[5];
    $action = $argv[6];
    $workerBank = BranchOffice::findOrFail($user->active_branch_office_id);
    $start = microtime(true);
    $connectionId = DB::selectOne('SELECT CONNECTION_ID() AS id')->id;
    file_put_contents($readyPath, json_encode(['pid' => getmypid(), 'connection_id' => $connectionId]));
    try {
        if ($action === 'cancel') {
            app(SaleService::class)->cancel($user, $ticket, $ticket->payment_pin);
            $result = ['outcome' => 'cancelled', 'ticket' => $ticket->code];
        } else {
            $newTicket = app(SaleService::class)->sell($user, $workerBank, ['lines' => [[
                'draw_id' => $ticket->lines()->sole()->draw_id, 'modality' => 'quiniela', 'numbers' => '10', 'amount' => '60',
            ]], 'discount' => false, 'request_key' => (string) Str::uuid()]);
            $result = ['outcome' => 'sold', 'ticket' => $newTicket->code];
        }
    } catch (ValidationException $e) {
        $result = ['outcome' => 'rejected', 'status' => 422, 'errors' => $e->errors()];
    } catch (HttpException $e) {
        $result = ['outcome' => 'rejected', 'status' => $e->getStatusCode(), 'message' => $e->getMessage()];
    }
    echo json_encode([...$result, 'action' => $action, 'bank' => $workerBank->code, 'pid' => getmypid(), 'connection_id' => $connectionId, 'elapsed_ms' => round((microtime(true) - $start) * 1000)]);
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
    $exit = Artisan::call('migrate', ['--database' => 'mixed_test', '--force' => true]);
    $check($exit === 0, 'Fallaron las migraciones de la base temporal.');
    (new LotteryDemoSeeder)->run();
    $bank = BranchOffice::where('code', 'PRUEBA-001')->firstOrFail();
    $secondBank = BranchOffice::create(['office_id' => $bank->office_id, 'code' => 'PRUEBA-002',
        'name' => 'Segunda banca de concurrencia', 'is_active' => true, 'lottery_settings' => []]);
    $banks = [$bank, $secondBank];
    $users = [User::factory()->create(['active_branch_office_id' => $bank->id]), User::factory()->create(['active_branch_office_id' => $secondBank->id])];
    foreach ($users as $user) $user->branchOffices()->attach($user->active_branch_office_id, ['is_default' => true]);
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
    $report['order'] = $order;
    $orderedUsers = $order === 'cancel-first' ? $users : array_reverse($users);
    foreach ($orderedUsers as $index => $user) {
        $action = $user->id === $users[0]->id ? 'cancel' : 'sell';
        $ready = storage_path('app/'.$database.'-'.$index.'.ready');
        $readyPaths[] = $ready;
        $process = proc_open([PHP_BINARY, __FILE__, '--worker', $database, (string) $ticket->id, (string) $user->id, $ready, $action],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, base_path(), null, ['bypass_shell' => true]);
        $check(is_resource($process), 'No se pudo iniciar el proceso de anulación.');
        fclose($pipes[0]);
        $processes[] = ['process' => $process, 'pipes' => $pipes, 'user_id' => $user->id];
        if ($index === 0) {
            $deadlineFirst = microtime(true) + 15;
            $firstWaiting = false;
            do {
                clearstatcache();
                if (is_file($ready)) {
                    $id = (int) json_decode(file_get_contents($ready), true, flags: JSON_THROW_ON_ERROR)['connection_id'];
                    $rows = $control->query('SELECT trx_mysql_thread_id, trx_state FROM information_schema.innodb_trx')->fetchAll(PDO::FETCH_ASSOC);
                    $firstWaiting = count(array_filter($rows, fn ($r) => (int) $r['trx_mysql_thread_id'] === $id && $r['trx_state'] === 'LOCK WAIT')) === 1;
                    if ($firstWaiting) break;
                }
                usleep(500000);
            } while (microtime(true) < $deadlineFirst);
            $check($firstWaiting, 'No se confirmó el primer proceso esperando el bloqueo.');
        }

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
    $check(count($waiting) === 2, 'No se pudo demostrar que ambas operaciones estaban esperando simultáneamente el bloqueo.');
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
    $cancelAttempt = collect($report['attempts'])->firstWhere('action', 'cancel');
    $saleAttempt = collect($report['attempts'])->firstWhere('action', 'sell');
    $check($cancelAttempt['outcome'] === 'cancelled', 'Falló la anulación.');
    $expectedSold = $order === 'cancel-first';
    $check($saleAttempt['outcome'] === ($expectedSold ? 'sold' : 'rejected'), 'El orden observado no corresponde al escenario.');
    $check($ticket->fresh()->status === 'cancelled', 'El ticket original sigue vendido.');
    $after = [];
    foreach ($banks as $candidate) {
        $after[$candidate->code] = app(LimitEngine::class)->available($candidate->fresh(), $probe);
        $check($after[$candidate->code] === ($expectedSold ? 4000 : 10000), 'Cupo compartido incorrecto.');
    }
    $check(Ticket::where('status', 'sold')->count() === ($expectedSold ? 1 : 0), 'Cantidad de ventas activas incorrecta.');
    $check(Ticket::count() === ($expectedSold ? 2 : 1), 'Hay tickets residuales.');
    $check(LotteryAudit::where('action', 'ticket.cancelled')->count() === 1, 'Anulación duplicada.');
    $check(LotteryAudit::where('action', 'ticket.sold')->count() === ($expectedSold ? 2 : 1), 'Venta duplicada.');
    // Office serialization makes committed audit order the sequence of inventory changes.
    $running = 0;
    $sequence = [];
    foreach (LotteryAudit::whereIn('action', ['ticket.sold', 'ticket.cancelled'])->orderBy('id')->get() as $audit) {
        $amount = (int) Ticket::where('code', $audit->payload['ticket'])->sole()->gross_minor;
        $running += $audit->action === 'ticket.sold' ? $amount : -$amount;
        $check($running >= 0 && $running <= 10000, 'El cupo se excedió en una transición confirmada.');
        $sequence[] = ['action' => $audit->action, 'consumed_minor' => $running, 'available_minor' => 10000 - $running];
    }
    $check($running === (int) Ticket::where('status', 'sold')->sum('gross_minor'), 'El consumo no coincide con la auditoría.');
    $report += ['available_after_by_bank_minor' => $after, 'committed_transitions' => $sequence,
        'active_sales_minor' => $running, 'cancellation_audit_count' => 1, 'sale_audit_count' => $expectedSold ? 2 : 1,
        'limit_exceeded' => false, 'passed' => true];
} finally {
    while (DB::connection('mixed_test')->transactionLevel() > 0) DB::connection('mixed_test')->rollBack();
    foreach ($processes as $entry) {
        if (is_resource($entry['process'])) { proc_terminate($entry['process']); proc_close($entry['process']); }
    }
    Carbon::setTestNow();
    CarbonImmutable::setTestNow();
    DB::purge('mixed_test');
    // Only the unique database created by this invocation can reach this cleanup.
    $control->exec("DROP DATABASE `$database`");
    foreach ($readyPaths as $path) if (is_file($path)) unlink($path);
}
$report['temporary_database_removed'] = true;
$json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
file_put_contents(storage_path('app/concurrent-cancel-sale-'.$order.'-verification.json'), $json);
echo $json.PHP_EOL;
