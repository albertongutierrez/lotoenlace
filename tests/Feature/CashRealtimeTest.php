<?php

namespace Tests\Feature;

use App\Events\CashStatusChanged;
use App\Events\CashModeChanged;
use App\Models\{BranchOffice, CashSession, Office, Permission, Role, User};
use App\Services\Lottery\CashService;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\{Broadcast, DB, Event};
use Illuminate\Support\Str;
use Tests\TestCase;

class CashRealtimeTest extends TestCase
{
    use DatabaseMigrations;

    private function bank(): array
    {
        $this->seed();
        $office = Office::create(['name' => 'Consorcio avisos', 'currency' => 'DOP', 'is_active' => true]);
        $bank = BranchOffice::create(['office_id' => $office->id, 'name' => 'Banca avisos', 'code' => 'AVISOS', 'is_active' => true]);
        $user = User::factory()->create(['active_branch_office_id' => $bank->id]);
        $user->roles()->attach(Role::where('slug', 'admin')->first()->id, ['office_id' => $office->id]);
        return [$user, $bank->load('office')];
    }

    public function test_reconciliation_mode_notifications_only_leave_after_commit_and_expose_no_money(): void
    {
        [$user, $bank] = $this->bank();
        Event::fake([CashModeChanged::class]);
        $payload=['scope'=>'branch','office_id'=>$bank->office_id,'branch_id'=>$bank->id,'currency'=>'DOP','settings'=>['reconciliation_mode'=>'report']];
        DB::beginTransaction();
        $this->actingAs($user)->postJson('/lottery/settings',$payload)->assertRedirect();
        Event::assertNotDispatched(CashModeChanged::class);
        DB::rollBack();
        Event::assertNotDispatched(CashModeChanged::class);
        $this->postJson('/lottery/settings',$payload)->assertRedirect();
        Event::assertDispatchedTimes(CashModeChanged::class,1);
        Event::assertDispatched(CashModeChanged::class,fn($event)=>$event->broadcastWith()===['office_id'=>$bank->office_id,'branch_id'=>$bank->id,'session_id'=>null,'state'=>'configuration_changed']);
    }

    public function test_private_channel_requires_permission_and_the_active_authorized_bank(): void
    {
        [$user, $bank] = $this->bank();
        config(['broadcasting.default' => 'reverb', 'broadcasting.connections.reverb.key' => 'test-key', 'broadcasting.connections.reverb.secret' => 'test-secret', 'broadcasting.connections.reverb.app_id' => 'test']);
        $payload = ['socket_id' => '123.456', 'channel_name' => "private-lottery.cash.{$bank->office_id}.{$bank->id}"];
        $this->postJson('/broadcasting/auth', $payload)->assertUnauthorized();
        $this->actingAs($user)->postJson('/broadcasting/auth', $payload)->assertOk()->assertJsonStructure(['auth']);
        $this->postJson('/broadcasting/auth', [...$payload, 'channel_name' => "private-lottery.cash.999.{$bank->id}"])->assertForbidden();
        $other = BranchOffice::create(['office_id' => $bank->office_id, 'name' => 'Otra', 'code' => 'OTRA', 'is_active' => true]);
        $this->postJson('/broadcasting/auth', [...$payload, 'channel_name' => "private-lottery.cash.{$bank->office_id}.{$other->id}"])->assertForbidden();
        $permission = Permission::where('slug', 'lottery.sell')->firstOrFail();
        Role::where('slug', 'admin')->first()->permissions()->detach($permission->id);
        $this->postJson('/broadcasting/auth', $payload)->assertForbidden();
    }

    public function test_events_only_leave_after_commit_and_rollback_emits_nothing(): void
    {
        [$user, $bank] = $this->bank();
        Event::fake([CashStatusChanged::class]);
        DB::beginTransaction();
        app(CashService::class)->open($user, $bank, ['amount' => '1', 'request_key' => (string) Str::uuid()]);
        Event::assertNotDispatched(CashStatusChanged::class);
        DB::rollBack();
        Event::assertNotDispatched(CashStatusChanged::class);
        $this->assertSame(0, CashSession::count());
        DB::beginTransaction();
        app(CashService::class)->open($user, $bank, ['amount' => '1', 'request_key' => (string) Str::uuid()]);
        Event::assertNotDispatched(CashStatusChanged::class);
        DB::commit();
        Event::assertDispatchedTimes(CashStatusChanged::class, 1);
    }

    public function test_close_publishes_once_without_exposing_amounts_or_notes(): void
    {
        [$user, $bank] = $this->bank();
        Event::fake([CashStatusChanged::class]);
        $service = app(CashService::class);
        $cash = $service->open($user, $bank, ['amount' => '100', 'request_key' => (string) Str::uuid()]);
        $service->close($user, $bank, $cash->id, ['amount' => '80', 'note' => 'Nota privada']);
        $service->close($user, $bank, $cash->id, ['amount' => '80', 'note' => 'Nota privada']);
        Event::assertDispatchedTimes(CashStatusChanged::class, 2); // Apertura y un solo cierre.
        Event::assertDispatched(CashStatusChanged::class, function (CashStatusChanged $event) use ($cash, $bank) {
            $data = $event->broadcastWith();
            return $data === ['office_id' => $bank->office_id, 'branch_id' => $bank->id, 'session_id' => $cash->id, 'state' => 'closed']
                && $event->broadcastOn()[0]->name === "private-lottery.cash.{$bank->office_id}.{$bank->id}"
                && $event->broadcastAs() === 'cash.status.changed';
        });
    }

    public function test_transport_failure_does_not_undo_a_cash_action(): void
    {
        [$user, $bank] = $this->bank();
        Broadcast::shouldReceive('queue')->once()->andThrow(new \RuntimeException('Transporte no disponible'));
        $cash = app(CashService::class)->open($user, $bank, ['amount' => '10', 'request_key' => (string) Str::uuid()]);
        $this->assertSame('open', $cash->fresh()->status);
        $this->assertSame(1000, $cash->fresh()->balance_minor);
    }
}
