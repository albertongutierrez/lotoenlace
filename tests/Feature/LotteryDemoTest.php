<?php

namespace Tests\Feature;

use App\Models\{BetLimit, BranchOffice, Draw, Lottery, Office, Ticket, User};
use App\Services\Lottery\{Configuration, LimitEngine, SaleService};
use Carbon\CarbonImmutable;
use Database\Seeders\LotteryCatalogSeeder;
use Database\Seeders\LotteryDemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class LotteryDemoTest extends TestCase
{
    use RefreshDatabase;

    public function test_production_seed_loads_only_the_catalog_and_preserves_existing_draws(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        $this->artisan('db:seed', ['--force' => true])->assertSuccessful();

        $quemaito = Draw::firstWhere('source_key', 'resultados-el-quemaito-mayor');
        $this->assertSame('LoteDom', $quemaito->lottery->name);
        $this->assertSame(1, $quemaito->result_count);
        $this->assertSame(['quiniela', 'super_pale'], $quemaito->modalities);

        $leidsa = Draw::firstWhere('source_key', 'resultados-quiniela-leidsa');
        $leidsa->update(['source_key' => null, 'source_url' => null, 'closes_at' => '20:00:00', 'active' => false]);
        $quemaito->update(['name' => 'Quemaito Mayor', 'closes_at' => '11:45:00']);
        $this->artisan('db:seed', ['--class' => LotteryCatalogSeeder::class, '--force' => true])->assertSuccessful();

        $this->assertDatabaseCount('lotteries', 12);
        $this->assertDatabaseCount('draws', 38);
        $this->assertDatabaseCount('offices', 0);
        $this->assertDatabaseCount('branch_offices', 0);
        $this->assertDatabaseCount('bet_limits', 0);
        $this->assertDatabaseCount('tickets', 0);
        $this->assertDatabaseHas('draws', ['id' => $leidsa->id, 'closes_at' => '20:00:00', 'active' => false]);
        $this->assertDatabaseHas('draws', ['id' => $quemaito->id, 'name' => 'Quemaito Mayor', 'closes_at' => '11:45:00']);
    }

    public function test_catalog_and_demo_are_repeatable_without_overwriting_configuration(): void
    {
        $admin = User::factory()->create(['email' => 'admin@lotoenlace.test']);
        $this->seed(LotteryDemoSeeder::class);
        $office = Office::firstOrFail();
        $bank = BranchOffice::firstOrFail();
        $bank->update(['lottery_settings' => ['cancel_minutes' => 2]]);
        $draw = Draw::firstOrFail();
        $draw->update(['closes_at' => '07:00:00']);
        $this->seed(LotteryDemoSeeder::class);
        $this->assertSame(12, Lottery::count());
        $this->assertSame(37, Draw::count());
        $this->assertSame(1, Office::count());
        $this->assertSame(1, BranchOffice::count());
        $this->assertSame(9, BetLimit::count());
        $this->assertSame(0, Ticket::count());
        $this->assertSame(666, count($office->lottery_settings['pairs']));
        $this->assertSame('07:00:00', $draw->fresh()->closes_at);
        $settings = app(Configuration::class)->effective($bank->fresh());
        $this->assertSame(2, $settings['cancel_minutes']);
        $this->assertSame(1000000, $settings['daily_limit_minor']);
        $this->assertSame($bank->id, $admin->fresh()->active_branch_office_id);
    }

    public function test_demo_limits_consume_gross_sales_and_pair_restrictions_are_specific(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-20 10:00:00', 'America/Santo_Domingo'));
        $this->seed(LotteryDemoSeeder::class);
        $bank = BranchOffice::firstOrFail();
        $user = User::factory()->create(['active_branch_office_id' => $bank->id]);
        app(\App\Services\Lottery\CashService::class)->open($user, $bank, ['amount' => '0', 'request_key' => (string) Str::uuid()]);
        $a = Draw::where('source_key', 'resultados-loteria-nacional-noche')->firstOrFail();
        $b = Draw::where('source_key', 'resultados-quiniela-leidsa')->firstOrFail();
        $c = Draw::where('source_key', 'resultados-new-york-noche')->firstOrFail();
        $configuration = app(Configuration::class);
        $limits = app(LimitEngine::class);
        $input = ['draw_id' => $a->id, 'modality' => 'quiniela', 'numbers' => '10', 'amount' => '40'];
        $prepare = fn ($changes) => $configuration->prepare($bank, array_replace($input, $changes));
        $this->assertSame(0, $limits->available($bank, $prepare(['numbers' => '00'])));
        $this->assertSame(0, $limits->available($bank, $prepare(['numbers' => '99'])));
        $this->assertSame(1000000, $limits->available($bank, $prepare(['numbers' => '99', 'draw_id' => $b->id])));
        $this->assertSame(5000, $limits->available($bank, $prepare(['numbers' => '20'])));
        $super = ['modality' => 'super_pale', 'numbers' => '10-20', 'second_draw_id' => $b->id];
        $this->assertSame(2500, $limits->available($bank, $prepare($super)));
        $this->assertSame(10000, $limits->available($bank, $prepare([...$super, 'second_draw_id' => $c->id])));
        $ticket = app(SaleService::class)->sell($user, $bank, ['lines' => [$input], 'discount' => true, 'request_key' => (string) Str::uuid()]);
        $this->assertEquals(4000, $ticket->gross_minor);
        $this->assertEquals(3600, $ticket->net_minor);
        $this->assertEquals(360, $ticket->commission_minor);
        $this->assertSame(6000, $limits->available($bank, $prepare([])));
        $this->expectException(ValidationException::class);
        app(SaleService::class)->sell($user, $bank, ['lines' => [[...$input, 'amount' => '61']], 'discount' => false, 'request_key' => (string) Str::uuid()]);
    }
}
