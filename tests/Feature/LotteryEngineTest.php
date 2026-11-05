<?php

namespace Tests\Feature;

use App\Models\BetLimit;
use App\Models\BranchOffice;
use App\Models\Draw;
use App\Models\DrawResult;
use App\Models\Lottery;
use App\Models\Office;
use App\Models\Role;
use App\Models\Ticket;
use App\Models\User;
use App\Services\Lottery\BoletoganadorImporter;
use App\Services\Lottery\Configuration;
use App\Services\Lottery\LimitEngine;
use App\Services\Lottery\ResultService;
use App\Services\Lottery\SaleService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class LotteryEngineTest extends TestCase
{
    use RefreshDatabase;

    private Office $office;

    private BranchOffice $branch;

    private User $seller;

    private Draw $a;

    private Draw $b;

    protected function setUp(): void
    {
        parent::setUp();
        config(['printing.test_reprint_office_ids' => []]);
        $this->travelTo(CarbonImmutable::parse('2026-10-20 10:00:00', 'America/Santo_Domingo'));
        $this->seed();
        // These tests use their own catalog and result source fixtures.
        Draw::query()->delete();
        Lottery::query()->delete();
        $this->office = Office::create(['name' => 'Consorcio A', 'currency' => 'DOP', 'is_active' => true]);
        $this->branch = BranchOffice::create(['office_id' => $this->office->id, 'name' => 'Banca A', 'code' => '001', 'is_active' => true]);
        $this->seller = User::factory()->create(['active_branch_office_id' => $this->branch->id]);
        $this->seller->roles()->attach(Role::where('slug', 'admin')->first()->id, ['office_id' => $this->office->id]);
        $lottery = Lottery::create(['name' => 'Lotería prueba', 'active' => true]);
        $fields = ['lottery_id' => $lottery->id, 'opens_at' => '06:00:00', 'closes_at' => '12:00:00', 'draws_at' => '12:05:00', 'weekdays' => [0, 1, 2, 3, 4, 5, 6], 'modalities' => ['quiniela', 'pale', 'tripleta', 'super_pale'], 'active' => true];
        $this->a = Draw::create([...$fields, 'name' => 'A']);
        $this->b = Draw::create([...$fields, 'name' => 'B']);
        $this->office->update(['lottery_settings' => ['draw_ids' => [$this->a->id, $this->b->id],
            'discount_enabled' => true, 'discount_every_minor' => 1000, 'discount_amount_minor' => 100,
            'rules' => [$this->a->id.':quiniela' => ['payouts' => ['1' => 60, '2' => 10, '3' => 5], 'commission_bps' => 1000], $this->b->id.':quiniela' => ['payouts' => ['1' => 60]]],
            'pairs' => [$this->pair() => ['enabled' => true, 'ordered' => false, 'payouts' => ['1-1' => 3000, '1-2' => 300, '1-3' => 100]]]]]);
        $this->branch->load('office');
        app(\App\Services\Lottery\CashService::class)->open($this->seller, $this->branch, ['amount'=>'999999999', 'request_key'=>(string) Str::uuid()]);
    }

    public function test_report_documents_include_all_filtered_rows_and_enforce_permissions(): void
    {
        $tickets=[];
        for($i=0;$i<26;$i++) $tickets[]=$this->sell();
        $this->actingAs($this->seller);
        $this->get('/lottery/reports?report=tickets&format=print&page=2')->assertOk()->assertSee($tickets[0]->reference)->assertSee($tickets[25]->reference)->assertSee('26 registros');
        $this->get('/lottery/reports?report=tickets&format=print&search='.$tickets[0]->code)->assertOk()->assertSee($tickets[0]->reference)->assertDontSee($tickets[1]->reference);
        $this->get('/lottery/reports?report=tickets&format=print&period=custom&from=2026-10-19&to=2026-10-19')->assertOk()->assertDontSee($tickets[0]->reference);
        foreach(array_keys(config('reports')) as $kind) {
            if ($kind === 'reconciliation') { $this->get('/lottery/reports?report=reconciliation&format=pdf')->assertUnprocessable(); continue; }
            $pdf=$this->get('/lottery/reports?report='.$kind.'&format=pdf')->assertOk()->assertHeader('Content-Type','application/pdf');
            $this->assertStringStartsWith('%PDF-', $pdf->getContent());
        }
        $permission=\App\Models\Permission::where('slug','lottery.cash.view_open')->firstOrFail();
        $ticketPermission=\App\Models\Permission::where('slug','reports.tickets')->firstOrFail();
        foreach(Role::all() as $role) $role->permissions()->detach([$permission->id,$ticketPermission->id]);
        $this->seller->unsetRelation('roles');
        $this->get('/lottery/reports?report=cash&format=print')->assertOk()->assertDontSee('999,999,999.00');
        foreach(['pdf','print'] as $format) {
            $this->get('/lottery/reports?report=tickets&format='.$format)->assertForbidden();
            $this->get('/lottery/reports?report=cash&format='.$format.'&office_id=999999')->assertStatus(409);
            $this->get('/lottery/reports?report=cash&format='.$format.'&branch_id=999999')->assertForbidden();
        }
    }

    public function test_dashboard_scopes_metrics_to_the_active_bank_and_selected_business_dates(): void
    {
        $winner = $this->sell([$this->line('10'), [...$this->line('1'), 'draw_id' => $this->b->id, 'numbers' => '20']]);
        $lines = $winner->lines()->orderBy('id')->get();
        $lines[0]->update(['prize_minor' => 60000, 'paid_at' => now(), 'paid_by' => $this->seller->id]);
        $lines[1]->update(['prize_minor' => 3000]);
        $pending = $this->sell([$this->line('4')]);
        $lost = $this->sell([$this->line('3')]);
        $lost->lines()->update(['prize_minor' => 0]);
        $cancelled = $this->sell([$this->line('2')]);
        app(SaleService::class)->cancel($this->seller, $cancelled, $cancelled->payment_pin);
        $yesterday = $this->sell([$this->line('5')]);
        $yesterday->update(['business_date' => '2026-10-19']);
        $other = BranchOffice::create(['office_id' => $this->office->id, 'code' => 'OTHER', 'name' => 'Otra banca', 'is_active' => true]);
        $foreign = $winner->replicate(['code', 'request_key', 'request_hash']);
        $foreign->forceFill(['code' => (string) Str::uuid(), 'request_key' => (string) Str::uuid(), 'request_hash' => 'dashboard-foreign', 'branch_office_id' => $other->id, 'net_minor' => 90000])->save();
        $this->actingAs($this->seller);
        $response = $this->getJson('/dashboard')->assertOk()->assertJsonPath('overview.from', '2026-10-20')
            ->assertJsonPath('overview.sales.net_minor', 1800)->assertJsonPath('overview.sales.tickets', 3)
            ->assertJsonPath('overview.tickets', ['total' => 4, 'cancelled' => 1, 'winners' => 1, 'pending' => 1, 'lost' => 1])
            ->assertJsonPath('overview.prizes.pending_minor', 3000)->assertJsonPath('overview.prizes.paid_minor', 60000)
            ->assertJsonPath('overview.sales.weekly.from', '2026-10-14')->assertJsonPath('overview.sales.weekly.to', '2026-10-20')
            ->assertJsonPath('overview.sales.weekly.net_minor', 2300)->assertJsonPath('overview.sales.weekly.tickets', 4)
            ->assertJsonCount(7, 'overview.sales.weekly.series')->assertJsonPath('overview.sales.weekly.series.0.net_minor', 0)
            ->assertJsonPath('overview.sales.weekly.series.5.net_minor', 500)->assertJsonPath('overview.sales.weekly.series.5.tickets', 1)
            ->assertJsonPath('overview.sales.weekly.series.6.net_minor', 1800)->assertJsonPath('overview.sales.weekly.series.6.tickets', 3)
            ->assertJsonPath('overview.cash.open', true)->assertJsonCount(4, 'overview.recent');
        $this->assertNotContains($foreign->reference, array_column($response->json('overview.recent'), 'reference'));
        $this->assertNotContains($yesterday->reference, array_column($response->json('overview.recent'), 'reference'));
        $this->assertStringNotContainsString('payment_pin', $response->getContent());
        $this->getJson('/dashboard?period=week')->assertOk()->assertJsonPath('overview.sales.net_minor', 2300)->assertJsonCount(7, 'overview.sales.series');
        $this->getJson('/dashboard?period=yesterday')->assertOk()->assertJsonPath('overview.sales.net_minor', 500)->assertJsonPath('overview.sales.tickets', 1);
        $this->getJson('/dashboard?period=month')->assertOk()->assertJsonPath('overview.sales.net_minor', 2300)->assertJsonCount(20, 'overview.sales.series');
        $this->getJson('/dashboard?branch_id='.$other->id)->assertStatus(409);
        $this->getJson('/dashboard?office_id=999999')->assertStatus(409);
        $this->getJson('/dashboard?period=invalid')->assertUnprocessable();
        $this->travelTo(CarbonImmutable::parse('2026-10-21 00:15:00', 'America/Santo_Domingo'));
        $this->getJson('/dashboard')->assertOk()->assertJsonPath('overview.from', '2026-10-21')->assertJsonPath('overview.sales.net_minor', 0)->assertJsonCount(0, 'overview.recent');
    }

    public function test_dashboard_hides_unauthorized_reports_and_open_cash_amounts_on_the_server(): void
    {
        $this->sell();
        $permissions = \App\Models\Permission::where('slug', 'like', 'reports.%')->orWhereIn('slug', ['lottery.tickets', 'lottery.cash.view_open'])->pluck('id');
        foreach (Role::all() as $role) $role->permissions()->detach($permissions);
        $this->seller->unsetRelation('roles');
        $this->actingAs($this->seller)->getJson('/dashboard')->assertOk()
            ->assertJsonPath('overview.sales', null)->assertJsonPath('overview.tickets', null)
            ->assertJsonPath('overview.prizes', null)->assertJsonPath('overview.recent', null)
            ->assertJsonPath('overview.cash.open', true)->assertJsonPath('overview.cash.balance_minor', null);
        $otherOffice = Office::create(['name' => 'Otro consorcio', 'currency' => 'USD', 'is_active' => true]);
        $otherBank = BranchOffice::create(['office_id' => $otherOffice->id, 'code' => '001', 'name' => 'Otra banca', 'is_active' => true]);
        $this->seller->branchOffices()->attach($otherBank->id);
        $this->seller->update(['active_branch_office_id' => $otherBank->id]);
        $this->getJson('/dashboard')->assertOk()->assertJsonPath('overview.currency', 'USD')->assertJsonPath('overview.sales', null)->assertJsonPath('overview.cash', null);
    }

    public function test_cash_closure_does_not_reveal_a_difference_before_confirmation(): void
    {
        $session=app(\App\Services\Lottery\CashService::class)->current($this->branch);
        $this->actingAs($this->seller);
        foreach(['999999999','5000'] as $amount) {
            $this->postJson('/lottery/cash/'.$session->id.'/close',['amount'=>$amount])
                ->assertUnprocessable()->assertJsonPath('message','Indica una observación de cierre.');
            $this->assertSame('open',$session->fresh()->status);
        }
    }

    public function test_cash_report_document_contains_full_ledger_and_hides_open_details(): void
    {
        $service=app(\App\Services\Lottery\CashService::class);
        $session=$service->current($this->branch);
        $session->update(['opening_minor'=>100000,'balance_minor'=>100000]);
        $session->movements()->where('type','opening')->update(['amount_minor'=>100000,'balance_minor'=>100000]);
        $ticket=$this->sell([$this->line('10')],true);
        $service->movement($this->seller,$this->branch,$session->id,['type'=>'deposit','amount'=>'50','request_key'=>(string) Str::uuid(),'note'=>'Fondo adicional verificable']);
        $service->movement($this->seller,$this->branch,$session->id,['type'=>'withdrawal','amount'=>'20','request_key'=>(string) Str::uuid(),'note'=>'Retiro registrado']);
        app(SaleService::class)->cancel($this->seller, $ticket, $ticket->payment_pin);
        $this->actingAs($this->seller);
        $html=$this->get('/lottery/reports?report=cash&format=print')->assertOk()->assertSee('Resumen del cuadre')->assertSee('Fondo adicional verificable')->assertSee($ticket->reference)->assertSee('Movimientos del cuadre')->assertSee('1,000.00')->assertSee('1,030.00');
        $permission=\App\Models\Permission::where('slug','lottery.cash.view_open')->firstOrFail();
        foreach(Role::all() as $role) $role->permissions()->detach($permission->id);
        $this->seller->unsetRelation('roles');
        $this->get('/lottery/reports?report=cash&format=print')->assertOk()->assertDontSee('Fondo adicional verificable')->assertDontSee($ticket->reference)->assertDontSee('1,030.00');
        $service->close($this->seller,$this->branch,$session->id,['amount'=>'1032','note'=>'Conteo completado']);
        $this->get('/lottery/reports?report=cash&format=print')->assertOk()->assertSee('Sobrante de efectivo.')->assertSee('DOP 2.00')->assertSee('Conteo completado')->assertSee('Fondo adicional verificable');
        $pdf=$this->get('/lottery/reports?report=cash&format=pdf')->assertOk();
        $this->assertStringStartsWith('%PDF-',$pdf->getContent());
    }

    public function test_cash_pdf_details_each_sale_and_does_not_mix_other_sessions(): void
    {
        $service=app(\App\Services\Lottery\CashService::class);
        $old=$service->current($this->branch);
        $prior=$this->sell([$this->line('10')]);
        $service->close($this->seller,$this->branch,$old->id,['amount'=>'999999999','note'=>'Turno anterior']);
        $session=$service->open($this->seller,$this->branch,['amount'=>'1000','request_key'=>(string) Str::uuid()]);
        $ticket=$this->sell([$this->line('10'),$this->line('5',true)],true);
        // A refund belongs to the cash session that actually returns the money.
        app(SaleService::class)->cancel($this->seller, $prior, $prior->payment_pin);
        $html=$this->actingAs($this->seller)->get('/lottery/reports?report=cash&format=print&search='.$session->id)->assertOk();
        $html->assertSee($ticket->reference)->assertSee($prior->reference)->assertSee('Movimientos del cuadre')->assertSee('Anulación / devolución')->assertDontSee('Total del ticket')->assertDontSee('Súper palé')->assertDontSee('Ventas por sorteo');
        $details=app(\App\Services\Lottery\CashReport::class)->build(collect([$session]),collect([$this->branch]),$this->seller)->first();
        $this->assertCount(1,$details['sales']);
        $this->assertSame($ticket->id,$details['sales']->first()->ticket_id);
        $this->assertSame($prior->id,$details['refunds']->first()->ticket_id);
        $this->assertFalse($details['sales']->first()->ticket->relationLoaded('lines'));
        $this->assertCount(2,$details['movements']);
        $this->assertSame(1400,$details['summary']['sale']['amount']);
        $this->assertSame(100400,$details['expected']);
        \Illuminate\Support\Facades\DB::transaction(fn()=> $service->record($session,$this->seller,'prize',-300,'prize:test-partial','Pago parcial registrado',$ticket->id));
        $details=app(\App\Services\Lottery\CashReport::class)->build(collect([$session]),collect([$this->branch]),$this->seller)->first();
        $this->assertCount(1,$details['prizes']);
        $this->assertSame(-300,$details['summary']['prize']['amount']);
        $this->assertSame(100100,$details['expected']);
        $this->get('/lottery/reports?report=cash&format=print')->assertOk()->assertSee('Premios pagados')->assertSee('Pago de premio');

    }

    public function test_cash_can_filter_closure_dates_and_print_one_exact_session(): void
    {
        $service=app(\App\Services\Lottery\CashService::class);
        $old=$service->current($this->branch);
        $first=$this->sell([$this->line('10')]);
        $this->travelTo(CarbonImmutable::parse('2026-10-21 01:00:00','America/Santo_Domingo'));
        $service->close($this->seller,$this->branch,$old->id,['amount'=>'999999999','note'=>'Cierre del turno anterior']);
        $new=$service->open($this->seller,$this->branch,['amount'=>'1000','request_key'=>(string)Str::uuid()]);
        $this->travelTo(CarbonImmutable::parse('2026-10-21 10:00:00','America/Santo_Domingo'));
        $second=$this->sell([$this->line('7')]);
        $this->actingAs($this->seller);
        $this->getJson('/lottery/cash?period=today&date_field=closed&state=closed')->assertOk()->assertJsonPath('sessions.total',1)->assertJsonPath('sessions.data.0.id',$old->id);
        $this->getJson('/lottery/cash?period=today&date_field=opened')->assertOk()->assertJsonPath('sessions.total',1)->assertJsonPath('sessions.data.0.id',$new->id);
        $this->getJson('/lottery/cash?session_id='.$old->id.'&user_id='.$this->seller->id)->assertOk()->assertJsonPath('sessions.total',1)->assertJsonPath('sessions.data.0.id',$old->id);
        $this->getJson('/lottery/cash?session_id='.$old->id.'&state=open')->assertOk()->assertJsonPath('sessions.total',0);
        $this->get('/lottery/reports?report=cash&cash_session_id='.$old->id.'&format=print')->assertOk()->assertSee($first->reference)->assertDontSee($second->reference)->assertSee('Cierre del turno anterior');
        $pdf=$this->get('/lottery/reports?report=cash&cash_session_id='.$old->id.'&format=pdf')->assertOk();
        $this->assertStringStartsWith('%PDF-',$pdf->getContent());
        $this->getJson('/lottery/cash/'.$old->id.'?movement_type=sale')->assertOk()->assertJsonPath('movements.total',1)->assertJsonPath('movements.data.0.type','sale');
        $other=Office::create(['name'=>'Otro','currency'=>'DOP','is_active'=>true]);
        $bank=BranchOffice::create(['office_id'=>$other->id,'code'=>'OTRA','name'=>'Otra banca','is_active'=>true]);
        $foreign=$old->fresh()->replicate();$foreign->office_id=$other->id;$foreign->branch_office_id=$bank->id;$foreign->request_key=(string)Str::uuid();$foreign->save();
        $this->get('/lottery/reports?report=cash&cash_session_id='.$foreign->id.'&format=pdf')->assertNotFound();
        $permission=\App\Models\Permission::where('slug','reports.cash')->firstOrFail();
        foreach(Role::all() as $role)$role->permissions()->detach($permission->id);
        $this->seller->unsetRelation('roles');
        $this->getJson('/lottery/cash')->assertOk()->assertJsonPath('can_print_report',false);
        $this->get('/lottery/reports?report=cash&cash_session_id='.$old->id.'&format=pdf')->assertForbidden();
    }

    public function test_business_numbers_are_independent_per_consortium_and_references_are_scoped(): void
    {
        $data=['request_key'=>(string)Str::uuid(),'lines'=>[$this->line()],'discount'=>false];
        $sale=app(SaleService::class)->sell($this->seller,$this->branch,$data);
        $replay=app(SaleService::class)->sell($this->seller,$this->branch,$data);
        $this->assertSame('T-000001',$sale->reference);
        $this->assertSame($sale->id,$replay->id);
        $office=Office::create(['name'=>'Segundo consorcio','currency'=>'DOP','is_active'=>true,'lottery_settings'=>$this->office->lottery_settings]);
        $bank=BranchOffice::create(['office_id'=>$office->id,'code'=>'001','name'=>'Otra banca','is_active'=>true]);
        $user=User::factory()->create(['active_branch_office_id'=>$bank->id]);
        $user->roles()->attach(Role::where('slug','admin')->first()->id,['office_id'=>$office->id]);
        $cash=app(\App\Services\Lottery\CashService::class)->open($user,$bank,['amount'=>'100','request_key'=>(string)Str::uuid()]);
        $other=app(SaleService::class)->sell($user,$bank,['request_key'=>(string)Str::uuid(),'lines'=>[$this->line()]]);
        $this->assertSame(1,$cash->office_number);
        $this->assertSame('T-000001',$other->reference);
        $this->assertNotSame($sale->code,$other->code);
        $this->assertNotSame($sale->id,$other->id);
        $this->assertSame(2,$this->sell()->office_number);
        $this->actingAs($this->seller)->getJson('/lottery/tickets/T-000001')->assertOk()->assertJsonPath('code',$sale->code);
        $this->getJson('/lottery/tickets?search=T-000001')->assertOk()->assertJsonPath('tickets.total',1)->assertJsonPath('tickets.data.0.code',$sale->code);
        $this->actingAs($user)->getJson('/lottery/tickets/T-000001')->assertOk()->assertJsonPath('code',$other->code);
        $this->getJson('/lottery/tickets/T-000002')->assertNotFound();
        $this->getJson('/lottery/tickets/'.$sale->code)->assertNotFound();
        $this->assertSame([1,2],\App\Models\CashMovement::where('office_id',$office->id)->orderBy('id')->pluck('office_number')->all());
        try { \Illuminate\Support\Facades\DB::transaction(function(){app(\App\Services\OfficeSequence::class)->next($this->office->id,'tickets');throw new \RuntimeException('rollback');}); }catch(\RuntimeException){}
        $this->assertSame(3,$this->sell()->office_number);
    }

    public function test_result_update_time_is_real_and_independent_of_date_filters(): void
    {
        $this->seller->roles()->attach(Role::where('slug','super_admin')->first()->id,['office_id'=>null]);
        $this->actingAs($this->seller)->getJson('/lottery/results')->assertOk()->assertJsonPath('last_results_updated_at',null);
        \App\Models\DrawResult::create(['draw_id'=>$this->a->id,'business_date'=>'2026-10-20','numbers'=>['01','02','03'],'status'=>'confirmed']);
        $this->travelTo(CarbonImmutable::parse('2026-10-20 10:30:00','America/Santo_Domingo'));
        \App\Models\DrawResult::create(['draw_id'=>$this->b->id,'business_date'=>'2026-10-20','numbers'=>['04','05','06'],'status'=>'confirmed']);
        $this->getJson('/lottery/results?from=2026-10-19&to=2026-10-19')->assertOk()->assertJsonCount(0,'results')->assertJsonPath('last_results_updated_at','2026-10-20T14:30:00+00:00');
    }

    public function test_reports_totals_pairs_numbers_and_paid_reprints(): void
    {
        $this->sell([$this->line('10')],true);
        $super=$this->sell([$this->line('5',true)]);
        $this->actingAs($this->seller);
        foreach (array_keys(config('reports')) as $report) {
            if ($report === 'reconciliation') { $this->getJson('/lottery/reports?report=reconciliation')->assertUnprocessable(); continue; }
            $this->getJson('/lottery/reports?report='.$report)->assertOk();
        }
        $this->getJson('/lottery/reports')->assertOk()->assertJsonPath('report','sales')->assertJsonMissing(['key'=>'cash','label'=>'Cuadre de caja']);
        $this->getJson('/lottery/reports?report=sales')->assertOk()->assertJsonPath('totals.Apostado',1500)->assertJsonPath('totals.Venta neta',1400);
        $draws=$this->getJson('/lottery/reports?report=draws')->assertOk()->json('rows.data');
        $this->assertCount(2,$draws);
        $this->assertSame(1500,array_sum(array_column($draws,'gross')));
        $numbers=$this->getJson('/lottery/reports?report=numbers')->assertOk()->json('rows.data');
        $this->assertSame(['10','20'],array_column($numbers,'number'));
        $this->assertSame(2000,array_sum(array_column($numbers,'gross')));
        $this->postJson('/lottery/tickets/'.$super->code.'/print',['attempt_key'=>(string) Str::uuid(),'trigger'=>'automatic'])->assertOk();
        $this->postJson('/lottery/tickets/'.$super->code.'/print',['attempt_key'=>(string) Str::uuid(),'trigger'=>'manual'])->assertOk();
        $super->lines()->update(['prize_minor'=>1000,'paid_at'=>now(),'paid_by'=>$this->seller->id]);
        $this->getJson('/lottery/reports?report=printing&risk=1')->assertOk()->assertJsonPath('rows.total',1)->assertJsonPath('rows.data.0.risk',true);
    }

    public function test_reports_exclude_cancelled_sales_and_filter_partial_prizes(): void
    {
        $cancelled=$this->sell([$this->line('10')]);
        app(SaleService::class)->cancel($this->seller, $cancelled, $cancelled->payment_pin);
        $winner=$this->sell([$this->line('10'),$this->line('20')]);
        $lines=$winner->lines()->get();
        $lines[0]->update(['prize_minor'=>1000,'paid_at'=>now(),'paid_by'=>$this->seller->id]);
        $lines[1]->update(['prize_minor'=>2000]);
        $this->actingAs($this->seller)->getJson('/lottery/reports?report=sales')->assertOk()->assertJsonPath('totals.Apostado',3000)->assertJsonPath('totals.Comisiones',300);
        $this->getJson('/lottery/reports?report=winners&payment=partial')->assertOk()->assertJsonPath('rows.total',1)->assertJsonPath('rows.data.0.pending',2000);
        $this->getJson('/lottery/reports?report=winners&payment=paid')->assertOk()->assertJsonPath('rows.total',0);
        $this->getJson('/lottery/reports?report=tickets&state=cancelled')->assertOk()->assertJsonPath('rows.total',1)->assertJsonPath('rows.data.0.ticket',$cancelled->code);
    }

    public function test_reports_are_scoped_and_cannot_bypass_cash_visibility_or_permissions(): void
    {
        $ticket=$this->sell();
        $office=Office::create(['name'=>'Consorcio ajeno','currency'=>'DOP','is_active'=>true]);
        $bank=BranchOffice::create(['office_id'=>$office->id,'code'=>'foreign','name'=>'Ajena','is_active'=>true]);
        $foreign=$ticket->replicate(); $foreign->office_id=$office->id; $foreign->branch_office_id=$bank->id; $foreign->code=(string) Str::uuid(); $foreign->request_key=(string) Str::uuid(); $foreign->save();
        $line=$ticket->lines()->first()->replicate(); $line->ticket_id=$foreign->id; $line->save();
        $this->actingAs($this->seller)->getJson('/lottery/reports?report=tickets')->assertOk()->assertJsonPath('rows.total',1)->assertJsonPath('rows.data.0.ticket',$ticket->code);
        $this->getJson('/lottery/reports?report=tickets&branch_id='.$bank->id)->assertForbidden();
        $this->getJson('/lottery/reports?report=tickets&office_id='.$office->id)->assertStatus(409);
        $permission=\App\Models\Permission::where('slug','lottery.cash.view_open')->firstOrFail();
        $salesPermission=\App\Models\Permission::where('slug','reports.sales')->firstOrFail();
        foreach(Role::all() as $role) $role->permissions()->detach([$permission->id,$salesPermission->id]);
        $this->seller->unsetRelation('roles');
        $this->getJson('/lottery/reports?report=cash')->assertOk()->assertJsonPath('rows.data.0.expected',null);
        $this->getJson('/lottery/reports?report=sales')->assertForbidden();
        $this->getJson('/lottery/reports?report=tickets&period=custom&from=2026-10-19&to=2026-10-19')->assertOk()->assertJsonPath('rows.total',0);
    }

    public function test_cash_open_balance_and_movements_require_permission_until_closed(): void
    {
        $permission = \App\Models\Permission::where('slug','lottery.cash.view_open')->firstOrFail();
        foreach (Role::all() as $role) $role->permissions()->detach($permission->id);
        $this->seller->unsetRelation('roles');
        $session = app(\App\Services\Lottery\CashService::class)->current($this->branch);
        $response = $this->actingAs($this->seller)->getJson('/lottery/cash')->assertOk()->assertJsonPath('can_view_open',false);
        $this->assertArrayNotHasKey('balance_minor',$response->json('current'));
        $this->assertArrayNotHasKey('balance_minor',$response->json('sessions.data.0'));
        $this->getJson('/lottery/cash/'.$session->id)->assertForbidden();
        $this->postJson('/lottery/cash/'.$session->id.'/close',['amount'=>'999999999'])->assertUnprocessable();
        $this->assertSame('open',$session->fresh()->status);
        $this->postJson('/lottery/cash/'.$session->id.'/close',['amount'=>'999999999','note'=>'Conteo de efectivo realizado'])->assertOk();
        $this->getJson('/lottery/cash/'.$session->id)->assertOk()->assertJsonPath('session.balance_minor',99999999900);
    }

    public function test_cash_lifecycle_blocks_sales_and_preserves_closed_balance(): void
    {
        $cash=app(\App\Services\Lottery\CashService::class);
        $old=$cash->current($this->branch);
        $cash->close($this->seller,$this->branch,$old->id,['amount'=>'999999999','note'=>'Conteo realizado']);
        try { $this->sell(); $this->fail('Sale without cash accepted.'); } catch (HttpException $e) { $this->assertSame(422,$e->getStatusCode()); }
        $this->assertSame(0,Ticket::count());
        $data=['amount'=>'100','request_key'=>(string) Str::uuid()];
        $session=$cash->open($this->seller,$this->branch,$data);
        $this->assertSame($session->id,$cash->open($this->seller,$this->branch,$data)->id);
        $ticket=$this->sell([$this->line('10')],true);
        $this->assertSame($session->id,$ticket->cash_session_id);
        $this->assertSame(10900,$session->fresh()->balance_minor);
        app(SaleService::class)->cancel($this->seller, $ticket, $ticket->payment_pin);
        $this->assertSame(10000,$session->fresh()->balance_minor);
        $deposit=['amount'=>'20','request_key'=>(string) Str::uuid(),'note'=>'Fondo adicional','type'=>'deposit'];
        $cash->movement($this->seller,$this->branch,$session->id,$deposit);
        $cash->movement($this->seller,$this->branch,$session->id,$deposit);
        $this->assertSame(12000,$session->fresh()->balance_minor);
        $this->assertSame(4,$session->movements()->count());
        $cash->close($this->seller,$this->branch,$session->id,['amount'=>'119','note'=>'Falta un peso']);
        $this->assertSame(-100,$session->fresh()->difference_minor);
        $cash->close($this->seller,$this->branch,$session->id,['amount'=>'119','note'=>'Falta un peso']);
        $this->assertSame(2,\App\Models\LotteryAudit::where('action','cash.closed')->count());
        try { $cash->movement($this->seller,$this->branch,$session->id,[...$deposit,'request_key'=>(string) Str::uuid()]); $this->fail('Closed box mutated.'); } catch (HttpException $e) { $this->assertSame(422,$e->getStatusCode()); }
        $this->assertSame(12000,$session->fresh()->balance_minor);
    }

    public function test_cash_insufficient_funds_rolls_back_prize_payment_and_rejects_foreign_session(): void
    {
        $cash=app(\App\Services\Lottery\CashService::class);
        $session=$cash->current($this->branch);
        $cash->close($this->seller,$this->branch,$session->id,['amount'=>'999999999','note'=>'Conteo realizado']);
        $session=$cash->open($this->seller,$this->branch,['amount'=>'0','request_key'=>(string) Str::uuid()]);
        $ticket=$this->sell([$this->line('1')]);
        $ticket->lines()->update(['prize_minor'=>6000]);
        try { app(ResultService::class)->pay($this->seller, $ticket, $ticket->payment_pin); $this->fail('Payment without funds accepted.'); } catch (HttpException $e) { $this->assertSame(422,$e->getStatusCode()); }
        $this->assertNull($ticket->lines()->first()->paid_at);
        $this->assertSame(100,$session->fresh()->balance_minor);
        $cash->movement($this->seller,$this->branch,$session->id,['type'=>'deposit','amount'=>'60','note'=>'Fondos para premios','request_key'=>(string) Str::uuid()]);
        app(ResultService::class)->pay($this->seller, $ticket, $ticket->payment_pin);
        $this->assertSame(100,$session->fresh()->balance_minor);
        $this->assertSame(1,$session->movements()->where('type','prize')->count());
        $other=BranchOffice::create(['office_id'=>$this->office->id,'code'=>'other','name'=>'Otra','is_active'=>true]);
        $foreign=$cash->open($this->seller,$other,['amount'=>'0','request_key'=>(string) Str::uuid()]);
        $this->actingAs($this->seller)->getJson('/lottery/cash/'.$foreign->id)->assertNotFound();
        $this->postJson('/lottery/cash/'.$foreign->id.'/close',['amount'=>'0'])->assertNotFound();
        $this->getJson('/lottery/cash')->assertOk()->assertJsonPath('current.id',$session->id);
    }

    public function test_print_audit_is_idempotent_tracks_copies_and_rejects_expired_tickets(): void
    {
        $ticket = $this->sell();
        $url = '/lottery/tickets/'.$ticket->code.'/print';
        $data = ['attempt_key' => (string) Str::uuid(), 'trigger' => 'automatic'];
        $first = $this->actingAs($this->seller)->postJson($url, $data)->assertOk()->assertJsonPath('sequence', 1)->assertJsonPath('kind', 'original');
        $this->postJson($url, $data)->assertOk()->assertJsonPath('audit_id', $first->json('audit_id'));
        $this->postJson($url, ['attempt_key' => (string) Str::uuid(), 'trigger' => 'manual'])->assertOk()->assertJsonPath('sequence', 2)->assertJsonPath('kind', 'reprint');
        $this->getJson('/lottery/tickets/'.$ticket->code.'/print-history')->assertOk()->assertJsonCount(2);
        $this->assertSame(2, \App\Models\LotteryAudit::where('action', 'ticket.print_requested')->count());
        $this->travel(16)->minutes();
        $this->postJson($url, ['attempt_key' => (string) Str::uuid(), 'trigger' => 'manual'])->assertUnprocessable()->assertJsonPath('status', 'denied');
        $this->postJson($url, $data)->assertUnprocessable();
        $this->assertSame(1, \App\Models\LotteryAudit::where('action', 'ticket.print_denied')->count());
        $this->assertSame(1, Ticket::count());
    }

    public function test_print_audit_cannot_access_another_bank_ticket(): void
    {
        $ticket = $this->sell();
        $foreign = BranchOffice::create(['office_id' => $this->office->id, 'name' => 'Otra', 'code' => '002', 'is_active' => true]);
        $ticket->update(['branch_office_id' => $foreign->id]);
        $this->actingAs($this->seller)->postJson('/lottery/tickets/'.$ticket->code.'/print', ['attempt_key' => (string) Str::uuid(), 'trigger' => 'manual'])->assertNotFound();
        $this->getJson('/lottery/tickets/'.$ticket->code.'/print-history')->assertNotFound();
    }

    public function test_cash_change_uses_discounted_total_and_retries_do_not_duplicate_ticket(): void
    {
        $service = app(SaleService::class);
        $data = ['lines' => [$this->line('10')], 'discount' => true, 'received' => '20', 'request_key' => (string) Str::uuid()];
        $ticket = $service->sell($this->seller, $this->branch, $data);
        $this->assertEquals(900, $ticket->net_minor);
        $this->assertEquals(2000, $ticket->received_minor);
        $this->assertEquals(1100, $ticket->change_minor);
        $this->assertSame($ticket->id, $service->sell($this->seller, $this->branch, $data)->id);
        $this->assertSame(1, Ticket::count());
        $this->assertSame(1, \App\Models\LotteryAudit::where('action', 'ticket.sold')->count());
        $this->expectException(HttpException::class);
        $service->sell($this->seller, $this->branch, [...$data, 'received' => '30']);
    }

    public function test_insufficient_cash_does_not_create_ticket_or_audit(): void
    {
        try {
            app(SaleService::class)->sell($this->seller, $this->branch, ['lines' => [$this->line('10')], 'discount' => false, 'received' => '9.99', 'request_key' => (string) Str::uuid()]);
            $this->fail('Expected insufficient payment rejection.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('received', $e->errors());
        }
        $this->assertSame(0, Ticket::count());
        $this->assertSame(0, \App\Models\LotteryAudit::where('action', 'ticket.sold')->count());
    }

    public function test_removing_result_resets_unpaid_prize_and_records_audit(): void
    {
        $ticket = $this->sell();
        $this->travelTo(CarbonImmutable::parse('2026-10-20 13:00', 'America/Santo_Domingo'));
        $service = app(ResultService::class);
        $service->record(['draw_id' => $this->a->id, 'business_date' => '2026-10-20', 'numbers' => ['10', '20', '30'], 'confirmed' => true], $this->seller);
        $this->assertSame(60000, $ticket->lines()->first()->prize_minor);
        $result = \App\Models\DrawResult::where('draw_id', $this->a->id)->firstOrFail();
        $service->remove($result, $this->seller);
        $this->assertNull($ticket->lines()->first()->prize_minor);
        $this->assertDatabaseMissing('draw_results', ['id' => $result->id]);
        $this->assertSame(1, \App\Models\LotteryAudit::where('action', 'result.deleted')->count());
    }

    public function test_removing_either_paid_super_pale_result_is_blocked(): void
    {
        $ticket = $this->sell([$this->line('10', true)]);
        $this->travelTo(CarbonImmutable::parse('2026-10-20 13:00', 'America/Santo_Domingo'));
        $service = app(ResultService::class);
        foreach ([$this->a, $this->b] as $draw) {
            $service->record(['draw_id' => $draw->id, 'business_date' => '2026-10-20', 'numbers' => [$draw->id === $this->a->id ? '10' : '20', '40', '50'], 'confirmed' => true], $this->seller);
        }
        $service->pay($this->seller, $ticket, $ticket->payment_pin);
        $before = $ticket->lines()->first()->toArray();
        foreach (\App\Models\DrawResult::all() as $result) {
            try {
                $service->remove($result, $this->seller);
                $this->fail('Paid results must not be removed.');
            } catch (HttpException $e) {
                $this->assertSame(422, $e->getStatusCode());
            }
            $this->assertDatabaseHas('draw_results', ['id' => $result->id]);
        }
        $this->assertSame($before, $ticket->lines()->first()->toArray());
        $this->assertSame(0, \App\Models\LotteryAudit::where('action', 'result.deleted')->count());
    }

    public function test_results_crud_json_and_authorization(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-20 13:00', 'America/Santo_Domingo'));
        $admin = User::factory()->create(['active_branch_office_id' => $this->branch->id]);
        $admin->roles()->attach(Role::where('slug', 'super_admin')->firstOrFail()->id);
        $data = ['draw_id' => $this->a->id, 'business_date' => '2026-10-20', 'numbers' => ['10', '20', '30'], 'confirmed' => true];
        $this->actingAs($admin)->postJson('/lottery/results', $data)->assertOk();
        $result = \App\Models\DrawResult::where('draw_id', $this->a->id)->firstOrFail();
        $this->getJson('/lottery/results')->assertOk()->assertJsonCount(1, 'results');
        $this->postJson('/lottery/results', [...$data, 'confirmed' => false])->assertOk();
        $this->assertSame('pending', $result->fresh()->status);
        $this->actingAs($this->seller)->deleteJson('/lottery/results/'.$result->id)->assertForbidden();
        $this->actingAs($admin)->deleteJson('/lottery/results/'.$result->id)->assertOk();
        $this->assertDatabaseMissing('draw_results', ['id' => $result->id]);
    }

    public function test_automatic_sync_tracks_queries_errors_and_evaluates_ticket_prizes(): void
    {
        $winner=$this->sell();
        $line=$this->line();$line['numbers']='99';$loser=$this->sell([$line]);
        $super=$this->sell([$this->line(super:true)]);
        $this->a->update(['source_key'=>'resultados-a']);
        $a='<article class="inicio-tarjeta-hoy"><a href="/loteria/resultados-a">A</a><span class="tile-date">Mar, 20 oct</span><div class="tile-ball">10</div><div class="tile-ball">20</div><div class="tile-ball">30</div></article>';
        $b='<article class="inicio-tarjeta-hoy"><a href="/loteria/resultados-b">B</a><span class="tile-date">Mar, 20 oct</span><div class="tile-ball">20</div><div class="tile-ball">40</div><div class="tile-ball">50</div></article>';
        \Illuminate\Support\Facades\Http::fake(['elboletoganador.com/*'=>\Illuminate\Support\Facades\Http::sequence()->push($a)->push($a.$b)->push($a.$b)->push($a.$b)->push(str_replace('>10<','>99<',$a).$b)->push('',503)->push($a.$b)]);
        $this->travelTo(CarbonImmutable::parse('2026-10-20 13:00','America/Santo_Domingo'));
        $this->artisan('lottery:import-results',['--automatic'=>true])->assertSuccessful();
        $run=\App\Models\ResultSyncRun::latest('id')->first();
        $this->assertSame('automatic',$run->mode);$this->assertSame('success',$run->status);
        $this->assertSame(3,$run->stats['tickets_checked']);$this->assertSame(1,$run->stats['winning_tickets']);$this->assertSame(1,$run->stats['losing_tickets']);$this->assertSame(1,$run->stats['pending_tickets']);
        $this->assertSame(60000,$winner->lines()->first()->prize_minor);$this->assertSame(0,$loser->lines()->first()->prize_minor);$this->assertNull($super->lines()->first()->prize_minor);
        $this->assertNull($winner->lines()->first()->paid_at);
        $this->b->update(['source_key'=>'resultados-b']);$this->travel(1)->minutes();
        $this->artisan('lottery:import-results',['--automatic'=>true])->assertSuccessful();
        $this->assertSame(3000000,$super->lines()->first()->prize_minor);
        $lastResultUpdate=\App\Models\DrawResult::max('updated_at');$this->travel(1)->minutes();
        $this->artisan('lottery:import-results',['--automatic'=>true])->assertSuccessful();
        $run=\App\Models\ResultSyncRun::latest('id')->first();
        $this->assertSame(0,$run->stats['published_results']);$this->assertSame('success',$run->status);
        $this->assertSame($lastResultUpdate,\App\Models\DrawResult::max('updated_at'));
        $this->assertTrue($run->finished_at->gt(CarbonImmutable::parse($lastResultUpdate,'UTC')));
        $loser->lines()->update(['prize_minor'=>null]);$this->travel(1)->minutes();
        $this->artisan('lottery:import-results',['--automatic'=>true])->assertSuccessful();
        $this->assertSame(0,$loser->lines()->first()->prize_minor);
        $this->assertSame(1,\App\Models\ResultSyncRun::latest('id')->first()->stats['repaired_lines']);
        app(ResultService::class)->pay($this->seller, $winner, $winner->payment_pin);$paid=$winner->lines()->first()->toArray();
        $this->artisan('lottery:import-results',['--automatic'=>true])->assertSuccessful();
        $this->assertSame('partial',\App\Models\ResultSyncRun::latest('id')->first()->status);
        $this->assertSame($paid,$winner->lines()->first()->toArray());
        $this->artisan('lottery:import-results',['--automatic'=>true])->assertFailed();
        $failed=\App\Models\ResultSyncRun::latest('id')->first();$this->assertSame('failed',$failed->status);$this->assertNotNull($failed->finished_at);
        $this->artisan('lottery:import-results')->assertSuccessful();
        $this->seller->roles()->attach(Role::where('slug','super_admin')->first()->id,['office_id'=>null]);
        $this->actingAs($this->seller)->getJson('/lottery/results')->assertOk()->assertJsonPath('last_automatic_sync.status','failed')->assertJsonPath('last_automatic_sync.stats.errors',1);
        $this->assertSame(7,\App\Models\ResultSyncRun::count());
    }

    public function test_import_automatically_confirms_calculates_prizes_and_is_idempotent(): void
    {
        $ticket = $this->sell();
        $this->a->update(['source_key' => 'resultados-a']);
        $this->travelTo(CarbonImmutable::parse('2026-10-20 13:00', 'America/Santo_Domingo'));
        $html = '<article class="inicio-tarjeta-hoy"><a href="/loteria/resultados-a">A</a><span class="tile-date">Mar, 20 oct</span><div class="tile-ball">10</div><div class="tile-ball">20</div><div class="tile-ball">30</div></article>';
        \Illuminate\Support\Facades\Http::fake(['elboletoganador.com/*' => \Illuminate\Support\Facades\Http::sequence()->push($html)->push($html)->push(str_replace('>10<', '>99<', $html))]);
        $this->artisan('lottery:import-results')->assertSuccessful();
        $this->assertDatabaseHas('draw_results', ['draw_id' => $this->a->id, 'status' => 'confirmed']);
        $this->assertSame(60000, $ticket->lines()->first()->prize_minor);
        $this->artisan('lottery:import-results')->assertSuccessful();
        $this->assertSame(1, \App\Models\LotteryAudit::where('action', 'result.updated')->count());
        app(ResultService::class)->pay($this->seller, $ticket, $ticket->payment_pin);
        $this->artisan('lottery:import-results')->assertSuccessful();
        $this->assertSame(['10', '20', '30'], \App\Models\DrawResult::first()->numbers);
        $this->assertSame(60000, $ticket->lines()->first()->prize_minor);
        $this->assertNotNull($ticket->lines()->first()->paid_at);
        $this->assertSame(1, \App\Models\LotteryAudit::where('action', 'result.source_conflict')->count());
    }

    public function test_import_confirms_existing_pending_result_only_when_source_matches(): void
    {
        $this->a->update(['source_key' => 'resultados-a']);
        $this->travelTo(CarbonImmutable::parse('2026-10-20 13:00', 'America/Santo_Domingo'));
        app(ResultService::class)->record(['draw_id' => $this->a->id, 'business_date' => '2026-10-20', 'numbers' => ['10', '20', '30'], 'confirmed' => false]);
        $html = '<article class="inicio-tarjeta-hoy"><a href="/loteria/resultados-a">A</a><span class="tile-date">Mar, 20 oct</span><div class="tile-ball">99</div><div class="tile-ball">20</div><div class="tile-ball">30</div></article>';
        \Illuminate\Support\Facades\Http::fake(['elboletoganador.com/*' => \Illuminate\Support\Facades\Http::sequence()->push($html)->push(str_replace('>99<', '>10<', $html))]);
        $this->artisan('lottery:import-results')->assertSuccessful();
        $this->assertDatabaseHas('draw_results', ['draw_id' => $this->a->id, 'status' => 'pending']);
        $this->artisan('lottery:import-results')->assertSuccessful();
        $this->assertDatabaseHas('draw_results', ['draw_id' => $this->a->id, 'status' => 'confirmed']);
    }

    public function test_reprint_checks_bank_status_and_time(): void
    {
        $ticket = $this->sell();
        $url = '/lottery/tickets/'.$ticket->code.'?reprint=1';
        $this->actingAs($this->seller)->getJson($url)->assertOk()->assertJsonPath('code', $ticket->code);
        $this->getJson('/lottery/tickets?reprint=1')->assertOk()->assertJsonCount(1, 'tickets');
        $ticket->update(['status' => 'cancelled']);
        $this->getJson($url)->assertStatus(422);
        $ticket->update(['status' => 'sold']);
        $this->travel(16)->minutes();
        $this->getJson($url)->assertStatus(422);
        $this->getJson('/lottery/tickets/'.$ticket->code)->assertOk();
        $this->getJson('/lottery/tickets?reprint=1')->assertOk()->assertJsonCount(1, 'tickets');
    }

    public function test_former_test_reprinting_cannot_bypass_dates_cancellation_or_audit_scope(): void
    {
        config(['printing.test_reprint_office_ids' => [$this->office->id]]);
        $today = $this->sell();
        $yesterday = $this->sell(key: (string) Str::uuid());
        $yesterday->update(['created_at' => now()->subDay(), 'business_date' => now()->subDay()->toDateString(), 'status' => 'cancelled']);
        $old = $this->sell(key: (string) Str::uuid());
        $old->update(['created_at' => now()->subDays(3), 'business_date' => now()->subDays(3)->toDateString()]);
        $this->actingAs($this->seller);
        $this->getJson('/lottery/tickets?reprint=1')->assertOk()->assertJsonPath('test_reprint', false)->assertJsonCount(1, 'tickets')->assertJsonPath('tickets.0.code', $today->code);
        foreach (['today','yesterday','all'] as $period) $this->getJson('/lottery/tickets?reprint=1&reprint_period='.$period)->assertOk()->assertJsonCount(1, 'tickets')->assertJsonPath('tickets.0.code', $today->code);
        $this->getJson('/lottery/tickets/'.$yesterday->code.'?reprint=1')->assertUnprocessable();
        $request = ['attempt_key' => (string) Str::uuid(), 'trigger' => 'manual'];
        $url = '/lottery/tickets/'.$yesterday->code.'/print';
        $this->postJson($url, $request)->assertUnprocessable();
        $this->postJson($url, [...$request, 'attempt_key' => (string) Str::uuid()])->assertUnprocessable();
        $this->assertSame('cancelled', $yesterday->fresh()->status);
        $foreign = BranchOffice::create(['office_id' => $this->office->id, 'name' => 'Otra', 'code' => '002', 'is_active' => true]);
        $old->update(['branch_office_id' => $foreign->id]);
        $this->getJson('/lottery/tickets/'.$old->code.'?reprint=1')->assertNotFound();
        $this->postJson('/lottery/tickets/'.$old->code.'/print', $request)->assertNotFound();
        config(['printing.test_reprint_office_ids' => []]);
        $this->getJson('/lottery/tickets?reprint=1&reprint_period=all')->assertOk()->assertJsonPath('test_reprint', false)->assertJsonCount(1, 'tickets');
        $this->getJson('/lottery/tickets/'.$yesterday->code.'?reprint=1&test_reprint=1')->assertUnprocessable();
        $this->postJson($url, [...$request, 'attempt_key' => (string) Str::uuid(), 'test_reprint' => true])->assertUnprocessable();
    }

    public function test_payment_methods_inherit_allow_independent_banks_and_require_configuration_permission(): void
    {
        $this->actingAs($this->seller);
        $officeSettings=[...$this->office->lottery_settings,'payment_methods'=>['cash','transfer']];
        $payload=['office_id'=>$this->office->id,'currency'=>'DOP','scope'=>'office','settings'=>$officeSettings];
        $this->postJson('/lottery/settings',$payload)->assertRedirect();
        $this->assertSame(['cash','transfer'],app(Configuration::class)->effective($this->branch->fresh('office'))['payment_methods']);
        $branchPayload=[...$payload,'scope'=>'branch','branch_id'=>$this->branch->id,'settings'=>['payment_methods'=>['card']]];
        $this->postJson('/lottery/settings',$branchPayload)->assertRedirect();
        $this->postJson('/lottery/settings',[...$payload,'settings'=>[...$officeSettings,'payment_methods'=>['deposit']]])->assertRedirect();
        $this->assertSame(['card'],app(Configuration::class)->effective($this->branch->fresh('office'))['payment_methods']);
        $this->postJson('/lottery/settings',[...$branchPayload,'settings'=>['payment_methods'=>null]])->assertRedirect();
        $this->assertSame(['deposit'],app(Configuration::class)->effective($this->branch->fresh('office'))['payment_methods']);
        foreach ([[],['card','card'],['invalid']] as $methods) $this->postJson('/lottery/settings',[...$branchPayload,'settings'=>['payment_methods'=>$methods]])->assertUnprocessable();
        $permission=\App\Models\Permission::where('slug','lottery.payments.configure')->firstOrFail();
        foreach(Role::all() as $role) $role->permissions()->detach($permission->id);
        $this->seller->unsetRelation('roles');
        $this->postJson('/lottery/settings',$branchPayload)->assertForbidden();
        $this->assertDatabaseHas('lottery_audits',['action'=>'payment_methods.changed','office_id'=>$this->office->id]);
    }

    public function test_payment_reference_configuration_inherits_or_remains_independent_and_requires_permission(): void
    {
        $paypal='custom_0123456789ab';
        $this->actingAs($this->seller);
        $settings=[...$this->office->lottery_settings,'payment_methods'=>['cash','transfer',$paypal],
            'payment_method_labels'=>[$paypal=>'PayPal'],'payment_reference_required'=>['transfer'=>true,$paypal=>true]];
        $payload=['office_id'=>$this->office->id,'scope'=>'office','currency'=>'DOP','settings'=>$settings];
        $this->postJson('/lottery/settings',$payload)->assertRedirect();
        $this->assertTrue(app(Configuration::class)->effective($this->branch->fresh('office'))['payment_reference_required'][$paypal]);
        $branchPayload=[...$payload,'scope'=>'branch','branch_id'=>$this->branch->id,'settings'=>['payment_methods'=>['cash',$paypal]]];
        $this->postJson('/lottery/settings',$branchPayload)->assertRedirect();
        $this->postJson('/lottery/settings',[...$payload,'settings'=>[...$settings,'payment_reference_required'=>[]]])->assertRedirect();
        $this->assertTrue(app(Configuration::class)->effective($this->branch->fresh('office'))['payment_reference_required'][$paypal]);
        $this->postJson('/lottery/settings',[...$branchPayload,'settings'=>['payment_methods'=>['cash',$paypal],'payment_reference_required'=>[$paypal=>false]]])->assertRedirect();
        $this->assertFalse(app(Configuration::class)->effective($this->branch->fresh('office'))['payment_reference_required'][$paypal]);
        foreach ([['unknown'=>true],['custom_abcdef012345'=>true],['transfer'=>'required']] as $requirements) {
            $this->postJson('/lottery/settings',[...$payload,'settings'=>[...$settings,'payment_reference_required'=>$requirements]])->assertUnprocessable();
        }
        $this->postJson('/lottery/settings',[...$branchPayload,'settings'=>[]])->assertRedirect();
        $this->assertSame([],app(Configuration::class)->effective($this->branch->fresh('office'))['payment_reference_required']);
        $this->assertArrayNotHasKey('payment_reference_required',$this->branch->fresh()->lottery_settings);
        $permission=\App\Models\Permission::where('slug','lottery.payments.configure')->firstOrFail();
        foreach(Role::all() as $role) $role->permissions()->detach($permission->id);
        $this->seller->unsetRelation('roles');
        $this->postJson('/lottery/settings',$payload)->assertForbidden();
        $this->assertSame([],$this->office->fresh()->lottery_settings['payment_reference_required']);
        $audit=\App\Models\LotteryAudit::where('action','payment_methods.changed')->where('payload->scope','office')->latest('id')->firstOrFail();
        $this->assertSame(['transfer'=>true,$paypal=>true],$audit->payload['references_before']);
        $this->assertSame([],$audit->payload['references_after']);
    }

    public function test_required_payment_references_block_incomplete_sales_without_tickets_or_cash_movements(): void
    {
        $paypal='custom_0123456789ab'; $cashapp='custom_abcdef012345';
        $methods=['cash','transfer',$paypal,$cashapp];
        $this->office->update(['lottery_settings'=>[...$this->office->lottery_settings,'payment_methods'=>$methods,
            'payment_method_labels'=>[$paypal=>'PayPal',$cashapp=>'Cash App'],'payment_reference_required'=>array_fill_keys($methods,true)]]);
        $this->actingAs($this->seller);
        foreach ($methods as $method) {
            $sale=['lines'=>[$this->line('10')],'discount'=>false,'request_key'=>(string) Str::uuid(),'payment_method'=>$method];
            $count=Ticket::count(); $movements=\App\Models\CashMovement::count();
            foreach ([null,'','   '] as $reference) {
                $this->postJson('/lottery/sales',[...$sale,'payment_reference'=>$reference])->assertUnprocessable()->assertJsonValidationErrors('payment_reference');
            }
            $this->assertSame($count,Ticket::count()); $this->assertSame($movements,\App\Models\CashMovement::count());
            $reference=$method === 'cash' ? '0' : 'REF-'.$method;
            $response=$this->postJson('/lottery/sales',[...$sale,'payment_reference'=>' '.$reference.' '])->assertOk()->assertJsonPath('payment_reference',$reference)
                ->assertJsonPath('settings_snapshot.payment_reference_required.'.$method,true);
            $this->postJson('/lottery/sales',[...$sale,'payment_reference'=>$reference])->assertOk()->assertJsonPath('code',$response->json('code'));
            $this->postJson('/lottery/sales',$sale)->assertStatus(409);
            $this->assertSame($count+1,Ticket::count());
        }
    }

    public function test_reference_requirements_revalidate_stale_sales_but_preserve_existing_retries_in_report_mode(): void
    {
        $this->useReportMode();
        $this->office->update(['lottery_settings'=>[...$this->office->lottery_settings,'payment_methods'=>['transfer']]]);
        $this->actingAs($this->seller);
        $sale=['lines'=>[$this->line('10')],'discount'=>false,'request_key'=>(string) Str::uuid(),'payment_method'=>'transfer'];
        $response=$this->postJson('/lottery/sales',$sale)->assertOk()->assertJsonPath('payment_reference',null);
        $this->office->update(['lottery_settings'=>[...$this->office->lottery_settings,'payment_reference_required'=>['transfer'=>true]]]);
        $this->postJson('/lottery/sales',$sale)->assertOk()->assertJsonPath('code',$response->json('code'));
        $next=[...$sale,'request_key'=>(string) Str::uuid()];
        $this->postJson('/lottery/sales',$next)->assertUnprocessable()->assertJsonValidationErrors('payment_reference');
        $this->postJson('/lottery/sales',[...$next,'payment_reference'=>'TR-001'])->assertOk()->assertJsonPath('cash_session_id',null);
        $this->assertSame(2,Ticket::count());
        $this->assertSame(0,\App\Models\CashMovement::where('type','sale')->count());
    }

    public function test_custom_payment_catalog_supports_inheritance_independence_and_validation(): void
    {
        $paypal='custom_0123456789ab'; $cashapp='custom_abcdef012345'; $zelle='custom_112233445566';
        $this->actingAs($this->seller);
        $settings=[...$this->office->lottery_settings,'payment_methods'=>['cash','transfer','card','deposit',$paypal,$cashapp],
            'payment_method_labels'=>[$paypal=>' PayPal ', $cashapp=>'Cash App']];
        $payload=['office_id'=>$this->office->id,'currency'=>'DOP','scope'=>'office','settings'=>$settings];
        $this->postJson('/lottery/settings',$payload)->assertRedirect();
        $effective=app(Configuration::class)->effective($this->branch->fresh('office'));
        $this->assertCount(6,$effective['payment_methods']);
        $this->assertSame('PayPal',$effective['payment_method_labels'][$paypal]);
        $branchPayload=[...$payload,'scope'=>'branch','branch_id'=>$this->branch->id,'settings'=>['payment_methods'=>[$paypal,$zelle],'payment_method_labels'=>[$zelle=>'Zelle']]];
        $this->postJson('/lottery/settings',$branchPayload)->assertRedirect();
        $this->postJson('/lottery/settings',[...$payload,'settings'=>[...$settings,'payment_method_labels'=>[$paypal=>'PayPal Empresa',$cashapp=>'Cash App']]])->assertRedirect();
        $effective=app(Configuration::class)->effective($this->branch->fresh('office'));
        $this->assertSame([$paypal,$zelle],$effective['payment_methods']);
        $this->assertSame('PayPal',$effective['payment_method_labels'][$paypal]);
        $this->assertSame('Zelle',$effective['payment_method_labels'][$zelle]);
        foreach ([[$paypal=>'  '],[$paypal=>'Tarjeta'],[$paypal=>'Cash App'],['cash'=>'Otro efectivo'],['paypal'=>'PayPal'],[$paypal=>"Pay\nPal"]] as $labels) {
            $this->postJson('/lottery/settings',[...$payload,'settings'=>[...$settings,'payment_method_labels'=>$labels]])->assertUnprocessable();
        }
        $this->postJson('/lottery/settings',[...$payload,'settings'=>[...$settings,'payment_methods'=>[$zelle]]])->assertUnprocessable()->assertJsonValidationErrors('settings.payment_methods');
        $this->postJson('/lottery/settings',[...$branchPayload,'settings'=>['payment_methods'=>null]])->assertRedirect();
        $this->assertSame('PayPal Empresa',app(Configuration::class)->effective($this->branch->fresh('office'))['payment_method_labels'][$paypal]);
        $this->assertArrayNotHasKey('payment_method_labels',$this->branch->fresh()->lottery_settings);
    }

    public function test_custom_payment_sales_keep_original_labels_in_refunds_printing_and_reports(): void
    {
        $paypal='custom_0123456789ab';
        $this->actingAs($this->seller);
        $settings=[...$this->office->lottery_settings,'payment_methods'=>['cash',$paypal],'payment_method_labels'=>[$paypal=>'PayPal']];
        $payload=['office_id'=>$this->office->id,'currency'=>'DOP','scope'=>'office','settings'=>$settings];
        $this->postJson('/lottery/settings',$payload)->assertRedirect();
        $cash=app(\App\Services\Lottery\CashService::class)->current($this->branch); $start=$cash->balance_minor;
        $sale=['lines'=>[$this->line('10')],'discount'=>false,'request_key'=>(string) Str::uuid(),'payment_method'=>$paypal,'payment_reference'=>'PAYPAL-123'];
        $this->postJson('/lottery/sales',[...$sale,'received'=>'20'])->assertUnprocessable()->assertJsonValidationErrors('received');
        $response=$this->postJson('/lottery/sales',$sale)->assertOk()->assertJsonPath('payment_method_label','PayPal')->assertJsonPath('change_minor',0);
        $ticket=Ticket::where('code',$response->json('code'))->firstOrFail();
        $this->assertSame($start,$cash->fresh()->balance_minor);
        $this->postJson('/lottery/settings',[...$payload,'settings'=>[...$settings,'payment_methods'=>['cash'],'payment_method_labels'=>[$paypal=>'PayPal Empresa']]])->assertRedirect();
        $this->postJson('/lottery/sales',$sale)->assertOk()->assertJsonPath('code',$ticket->code)->assertJsonPath('payment_method_label','PayPal');
        $this->postJson('/lottery/sales',[...$sale,'request_key'=>(string) Str::uuid()])->assertUnprocessable();
        $this->postJson('/lottery/tickets/'.$ticket->reference.'/cancel',['pin'=>$ticket->payment_pin])->assertOk();
        $this->assertSame($start,$cash->fresh()->balance_minor);
        $this->assertDatabaseHas('cash_movements',['ticket_id'=>$ticket->id,'type'=>'refund','payment_method'=>$paypal,'payment_method_label'=>'PayPal']);
        $this->getJson('/lottery/cash/'.$cash->id)->assertOk()->assertJsonPath('totals.1.payment_method_label','PayPal');
        $detail=app(\App\Services\Lottery\CashReport::class)->build(collect([$cash]),collect([$this->branch]),$this->seller)->first();
        $total=$detail['payment_totals']->firstWhere('name','PayPal');
        $this->assertSame($ticket->net_minor,$total['sales']); $this->assertSame($ticket->net_minor,$total['refunds']);
        $this->get('/lottery/reports?report=cash&format=print')->assertOk()->assertSee('PayPal')->assertDontSee($paypal)->assertDontSee('PayPal Empresa');
        $report=app(\App\Services\Lottery\PeriodReconciliation::class)->build($this->office->id,collect([$this->branch]),now()->toImmutable()->startOfDay(),now()->toImmutable()->addDay(),'detail');
        $this->assertSame(['PayPal','PayPal'],$report['rows']->pluck('payment_method')->all());
    }

    public function test_custom_payment_names_require_permission_and_cannot_leak_across_consortia(): void
    {
        $paypal='custom_0123456789ab';
        $this->office->update(['lottery_settings'=>[...$this->office->lottery_settings,'payment_methods'=>[$paypal],'payment_method_labels'=>[$paypal=>'PayPal']]]);
        $this->actingAs($this->seller);
        $payload=['office_id'=>$this->office->id,'currency'=>'DOP','scope'=>'office','settings'=>[...$this->office->lottery_settings,'payment_method_labels'=>[$paypal=>'PayPal nuevo']]];
        $permission=\App\Models\Permission::where('slug','lottery.payments.configure')->firstOrFail();
        foreach(Role::all() as $role) $role->permissions()->detach($permission->id);
        $this->seller->unsetRelation('roles');
        $this->postJson('/lottery/settings',$payload)->assertForbidden();
        $this->assertSame('PayPal',$this->office->fresh()->lottery_settings['payment_method_labels'][$paypal]);
        $other=Office::create(['name'=>'Otra empresa','currency'=>'DOP','is_active'=>true]);
        $otherBranch=BranchOffice::create(['office_id'=>$other->id,'code'=>'999','name'=>'Otra banca','is_active'=>true,'lottery_settings'=>['payment_methods'=>['cash']]]);
        $this->assertArrayNotHasKey($paypal,app(Configuration::class)->effective($otherBranch->load('office'))['payment_method_labels']);
        $this->postJson('/lottery/settings',[...$payload,'office_id'=>$other->id])->assertForbidden();
    }

    public function test_non_cash_sales_refunds_and_retries_preserve_cash_and_produce_a_method_breakdown(): void
    {
        $this->office->update(['lottery_settings'=>[...$this->office->lottery_settings,'payment_methods'=>array_keys(Configuration::PAYMENT_METHODS)]]);
        $cash=app(\App\Services\Lottery\CashService::class)->current($this->branch);
        $start=$cash->balance_minor;
        $this->actingAs($this->seller);
        foreach(['transfer','card','deposit'] as $method) {
            $payload=['lines'=>[$this->line('10')],'discount'=>false,'request_key'=>(string)Str::uuid(),'payment_method'=>$method,'payment_reference'=>'REF-'.$method];
            $response=$this->postJson('/lottery/sales',$payload)->assertOk()->assertJsonPath('payment_method',$method)->assertJsonPath('change_minor',0);
            $ticket=Ticket::where('code',$response->json('code'))->firstOrFail();
            $this->assertSame($start,$cash->fresh()->balance_minor);
            $this->postJson('/lottery/sales',$payload)->assertOk()->assertJsonPath('code',$ticket->code);
            $this->postJson('/lottery/sales',[...$payload,'payment_method'=>'cash'])->assertStatus(409);
            $this->postJson('/lottery/tickets/'.$ticket->reference.'/cancel',['pin'=>$ticket->payment_pin])->assertOk();
            $this->assertSame($start,$cash->fresh()->balance_minor);
            $this->assertDatabaseHas('cash_movements',['ticket_id'=>$ticket->id,'type'=>'refund','payment_method'=>$method,'amount_minor'=>-$ticket->net_minor]);
        }
        $ticket=$this->sell();
        $this->assertSame($start+$ticket->net_minor,$cash->fresh()->balance_minor);
        $detail=app(\App\Services\Lottery\CashReport::class)->build(collect([$cash]),collect([$this->branch]),$this->seller)->first();
        $this->assertSame($cash->fresh()->balance_minor,$detail['expected']);
        $this->assertSame($ticket->net_minor,$detail['cash_summary']['sale']['amount']);
        $this->assertGreaterThan(0,$detail['payment_totals']['transfer']['sales']);
        $this->get('/lottery/reports?report=cash&format=print')->assertOk()->assertSee('Cobros por medio de pago')->assertSee('Transferencia');
    }

    public function test_disabled_payment_methods_and_non_cash_change_are_rejected_and_report_mode_retains_the_method(): void
    {
        $this->actingAs($this->seller);
        $payload=['lines'=>[$this->line('10')],'discount'=>false,'request_key'=>(string)Str::uuid(),'payment_method'=>'transfer'];
        $this->postJson('/lottery/sales',$payload)->assertUnprocessable()->assertJsonValidationErrors('payment_method');
        $this->assertSame(0,Ticket::count());
        $this->office->update(['lottery_settings'=>[...$this->office->lottery_settings,'payment_methods'=>['transfer']]]);
        $this->postJson('/lottery/sales',[...$payload,'received'=>'20'])->assertUnprocessable()->assertJsonValidationErrors('received');
        $this->useReportMode();
        $this->postJson('/lottery/sales',$payload)->assertOk()->assertJsonPath('cash_session_id',null)->assertJsonPath('payment_method','transfer');
        $this->assertSame(0,\App\Models\CashMovement::where('type','sale')->count());
    }

    public function test_published_results_are_today_confirmed_ordered_and_limited_to_enabled_draws_and_permission(): void
    {
        $today='2026-10-20';
        $first=DrawResult::create(['draw_id'=>$this->a->id,'business_date'=>$today,'numbers'=>['10','20','30'],'status'=>'confirmed']);
        $first->update(['updated_at'=>now()->subMinutes(10)]);
        $second=DrawResult::create(['draw_id'=>$this->b->id,'business_date'=>$today,'numbers'=>['01','02','03'],'status'=>'confirmed']);
        DrawResult::create(['draw_id'=>$this->a->id,'business_date'=>'2026-10-19','numbers'=>['90','91','92'],'status'=>'confirmed']);
        $this->actingAs($this->seller)->getJson('/lottery/published-results')->assertOk()->assertJsonPath('date',$today)->assertJsonCount(2,'results')->assertJsonPath('results.0.id',$second->id)->assertJsonPath('results.1.id',$first->id)->assertJsonMissingPath('results.0.evidence');
        $this->getJson('/lottery/published-results?branch_id=999')->assertNotFound();
        $second->update(['status'=>'pending']);
        $this->getJson('/lottery/published-results')->assertOk()->assertJsonCount(1,'results');
        $this->branch->update(['lottery_settings'=>['draw_ids'=>[$this->b->id]]]);
        $this->getJson('/lottery/published-results')->assertOk()->assertJsonCount(0,'results');
        $permission=\App\Models\Permission::where('slug','lottery.results.view')->firstOrFail();
        foreach(Role::all() as $role) $role->permissions()->detach($permission->id);
        $this->seller->unsetRelation('roles');
        $this->getJson('/lottery/published-results')->assertForbidden();
    }

    public function test_ticket_payment_by_company_number_still_requires_pin_without_qr(): void
    {
        $ticket=$this->sell();
        $ticket->lines()->update(['prize_minor'=>100]);
        $this->actingAs($this->seller)->getJson('/lottery/tickets/'.$ticket->reference)->assertOk()->assertJsonPath('code',$ticket->code)->assertJsonPath('print_settings.show_qr',false);
        $url='/lottery/sales/tickets/'.$ticket->reference.'/pay';
        $this->postJson($url,['pin'=>'wrong'])->assertUnprocessable();
        $this->postJson($url,['pin'=>$ticket->payment_pin])->assertOk()->assertJsonPath('message','Premios pendientes pagados.');
        $this->assertNotNull($ticket->lines()->first()->paid_at);
    }

    private function pair(): string
    {
        return $this->a->id.'-'.$this->b->id;
    }

    private function useReportMode(): void
    {
        $cash = app(\App\Services\Lottery\CashService::class);
        $session = $cash->current($this->branch);
        $cash->close($this->seller, $this->branch, $session->id, ['amount'=>'999999999','note'=>'Conteo realizado']);
        $this->office->update(['lottery_settings'=>[...$this->office->lottery_settings,'reconciliation_mode'=>'report']]);
        $this->branch->setRelation('office', $this->office->fresh());
    }

    public function test_reconciliation_inheritance_and_bank_overrides_are_independent(): void
    {
        $config = app(Configuration::class);
        $this->assertSame('cash', $config->reconciliationMode($this->branch));
        $this->useReportMode();
        $other = BranchOffice::create(['office_id'=>$this->office->id,'name'=>'Excepción','code'=>'CAJA','is_active'=>true,'lottery_settings'=>['reconciliation_mode'=>'cash']]);
        $this->assertSame('report', $config->effective($this->branch)['reconciliation_mode']);
        $this->assertSame('cash', $config->reconciliationMode($other));
        $this->actingAs($this->seller)->getJson('/lottery/cash-status?branch_id='.$this->branch->id)->assertOk()->assertJsonPath('reconciliation_mode','report')->assertJsonPath('current',null);
        $this->postJson('/lottery/cash/open',['amount'=>'0','request_key'=>(string)Str::uuid()])->assertUnprocessable();
        $this->expectException(HttpException::class);
        app(SaleService::class)->sell($this->seller, $other, ['lines'=>[$this->line()],'request_key'=>(string)Str::uuid()]);
    }

    public function test_mode_changes_require_permission_and_closed_cash_and_leave_an_audit(): void
    {
        $payload = ['office_id'=>$this->office->id,'branch_id'=>$this->branch->id,'scope'=>'branch','currency'=>'DOP','settings'=>['reconciliation_mode'=>'report']];
        $this->actingAs($this->seller)->postJson('/lottery/settings',$payload)->assertUnprocessable()->assertJsonValidationErrors('settings.reconciliation_mode');
        $this->assertNull($this->branch->fresh()->lottery_settings['reconciliation_mode'] ?? null);
        $this->assertDatabaseMissing('lottery_audits',['action'=>'reconciliation.mode_changed']);
        $session=app(\App\Services\Lottery\CashService::class)->current($this->branch);
        app(\App\Services\Lottery\CashService::class)->close($this->seller,$this->branch,$session->id,['amount'=>'999999999','note'=>'Conteo realizado']);
        $this->postJson('/lottery/settings',$payload)->assertRedirect();
        $this->assertSame('report',app(Configuration::class)->reconciliationMode($this->branch->fresh('office')));
        $this->assertDatabaseHas('lottery_audits',['action'=>'reconciliation.mode_changed','office_id'=>$this->office->id,'user_id'=>$this->seller->id]);
        $this->postJson('/lottery/settings',[...$payload,'settings'=>['reconciliation_mode'=>null]])->assertRedirect();
        $this->assertSame('cash',app(Configuration::class)->reconciliationMode($this->branch->fresh('office')));
        $permission=\App\Models\Permission::where('slug','lottery.reconciliation.configure')->firstOrFail();
        foreach(Role::all() as $role) $role->permissions()->detach($permission->id);
        $this->seller->unsetRelation('roles');
        $this->postJson('/lottery/settings',$payload)->assertForbidden();
        $this->postJson('/lottery/settings',[...$payload,'settings'=>['footer'=>'Autorizado']])->assertRedirect();
        $this->assertSame('Autorizado',$this->branch->fresh()->lottery_settings['footer']);
    }

    public function test_office_mode_changes_preserve_explicit_cash_exceptions_with_open_sessions(): void
    {
        $this->branch->update(['lottery_settings'=>['reconciliation_mode'=>'cash']]);
        $other=BranchOffice::create(['office_id'=>$this->office->id,'name'=>'Heredada','code'=>'REPORTE','is_active'=>true]);
        $settings=[...$this->office->lottery_settings,'reconciliation_mode'=>'report'];
        $this->actingAs($this->seller)->postJson('/lottery/settings',['office_id'=>$this->office->id,'scope'=>'office','currency'=>'DOP','settings'=>$settings])->assertRedirect();
        $this->assertSame('cash',app(Configuration::class)->reconciliationMode($this->branch->fresh('office')));
        $this->assertSame('report',app(Configuration::class)->reconciliationMode($other->fresh('office')));
        $this->assertNotNull(app(\App\Services\Lottery\CashService::class)->current($this->branch));
        $this->postJson('/lottery/settings',['office_id'=>$this->office->id,'scope'=>'branch','branch_id'=>$this->branch->id,'currency'=>'DOP','settings'=>[]])->assertUnprocessable();
    }

    public function test_report_mode_sells_cancels_and_pays_without_cash_and_accounts_every_operation_once(): void
    {
        $this->useReportMode();
        $key=(string)Str::uuid();
        $sale=$this->sell(discount:true,key:$key);
        $this->assertSame($sale->id,$this->sell(discount:true,key:$key)->id);
        $refund=$this->sell([$this->line('5')]);
        $winner=$this->sell([$this->line('1')]);
        $winner->lines()->update(['prize_minor'=>6000]);
        $this->actingAs($this->seller)->postJson('/lottery/tickets/'.$refund->code.'/cancel',['branch_id'=>$this->branch->id,'pin'=>$refund->payment_pin])->assertOk();
        $this->postJson('/lottery/sales/tickets/'.$winner->code.'/pay',['branch_id'=>$this->branch->id,'pin'=>$winner->payment_pin])->assertOk()->assertJsonPath('payment_receipt.net_minor',6000);
        $this->assertNull($sale->cash_session_id);
        $this->assertDatabaseCount('cash_sessions',1);
        $this->assertSame(0,\App\Models\CashMovement::whereIn('type',['sale','refund','prize'])->count());
        $url='/lottery/reports?report=reconciliation';
        $this->getJson($url)->assertOk()->assertJsonPath('rows.data.0.tickets',3)->assertJsonPath('totals.Ventas cobradas',1500)
            ->assertJsonPath('totals.Anulaciones',500)->assertJsonPath('totals.Premios pagados',6000)->assertJsonPath('totals.Neto de operaciones',-5000)->assertJsonPath('totals.Comisiones netas',100);
        $this->getJson($url.'&view=detail')->assertOk()->assertJsonPath('rows.total',5);
        $this->getJson($url.'&view=detail&operation=refund')->assertOk()->assertJsonPath('rows.total',1)->assertJsonPath('rows.data.0.ticket',$refund->reference);
        $this->getJson($url.'&view=detail&search='.$sale->reference)->assertOk()->assertJsonPath('rows.total',1)->assertJsonPath('totals.Ventas cobradas',900);
        $this->get($url.'&view=detail&format=print&search='.$sale->reference)->assertOk()->assertSee($sale->reference)->assertDontSee($winner->reference)->assertDontSee('Efectivo contado');
        $this->get($url.'&format=pdf')->assertOk()->assertHeader('Content-Type','application/pdf');
    }

    public function test_reconciliation_uses_operation_dates_and_enforces_scope_and_report_permission(): void
    {
        $this->useReportMode();
        $this->travelTo(CarbonImmutable::parse('2026-10-19 10:00:00','America/Santo_Domingo'));
        $ticket=$this->sell(); $ticket->lines()->update(['prize_minor'=>60000]);
        $this->travelTo(CarbonImmutable::parse('2026-10-20 10:00:00','America/Santo_Domingo'));
        app(ResultService::class)->pay($this->seller,$ticket,$ticket->payment_pin);
        $url='/lottery/reports?report=reconciliation';
        $this->actingAs($this->seller)->getJson($url)->assertOk()->assertJsonPath('totals.Ventas cobradas',0)->assertJsonPath('totals.Premios pagados',60000);
        $this->getJson($url.'&period=yesterday')->assertOk()->assertJsonPath('totals.Ventas cobradas',1000)->assertJsonPath('totals.Premios pagados',0);
        $this->getJson($url.'&office_id=999999')->assertStatus(409);
        $this->getJson($url.'&branch_id=999999')->assertForbidden();
        $cashBank=BranchOffice::create(['office_id'=>$this->office->id,'name'=>'Caja','code'=>'EXCEPCION','is_active'=>true,'lottery_settings'=>['reconciliation_mode'=>'cash']]);
        $this->getJson($url.'&branch_id='.$cashBank->id)->assertUnprocessable();
        $permission=\App\Models\Permission::where('slug','reports.reconciliation')->firstOrFail();
        foreach(Role::all() as $role) $role->permissions()->detach($permission->id);
        $this->seller->unsetRelation('roles');
        foreach(['','&format=pdf','&format=print'] as $format) $this->getJson($url.$format)->assertForbidden();
    }

    private function line(string $amount = '10', bool $super = false): array
    {
        return ['draw_id' => $this->a->id, 'second_draw_id' => $super ? $this->b->id : null, 'modality' => $super ? 'super_pale' : 'quiniela', 'numbers' => $super ? '10-20' : '10', 'amount' => $amount];
    }

    private function sell(array $lines = [], bool $discount = false, ?string $key = null): Ticket
    {
        return app(SaleService::class)->sell($this->seller, $this->branch, ['lines' => $lines ?: [$this->line()], 'discount' => $discount, 'request_key' => $key ?? (string) Str::uuid()]);
    }

    private function limit(array $fields = []): BetLimit
    {
        return BetLimit::create(array_replace(['office_id' => $this->office->id, 'name' => 'Límite', 'modality' => 'all', 'category' => 'all', 'match_type' => 'all', 'amount_minor' => 10000, 'aggregation' => 'shared', 'active' => true], $fields));
    }

    public function test_general_super_pale_is_inherited_and_bank_overrides_are_isolated(): void
    {
        $settings = $this->office->lottery_settings;
        $settings['pairs'] = [];
        $settings['super_pale'] = ['enabled' => true, 'payouts' => ['1-1' => 2500, '1-2' => 200], 'commission_bps' => 500];
        $this->office->update(['lottery_settings' => $settings]);
        $other = BranchOffice::create(['office_id' => $this->office->id, 'name' => 'Otra', 'code' => '002', 'is_active' => true]);
        $this->branch->update(['lottery_settings' => ['super_pale' => ['payouts' => ['1-1' => 1800], 'commission_bps' => 0]]]);
        $config = app(Configuration::class);
        $this->assertSame(1800, $config->effective($this->branch->fresh())['pairs'][$this->pair()]['payouts']['1-1']);
        $this->assertSame(2500, $config->effective($other->fresh())['pairs'][$this->pair()]['payouts']['1-1']);
        $this->branch = $this->branch->fresh();
        $ticket = $this->sell([$this->line('10', true)]);
        $this->assertSame(1800, $ticket->lines->first()->rules['payouts']['1-1']);
        $this->assertEquals(0, $ticket->commission_minor);
        $this->branch->update(['lottery_settings' => ['super_pale' => ['payouts' => ['1-1' => 1800]], 'pairs' => [$this->pair() => ['payouts' => ['1-1' => 1500]]]]]);
        $this->assertSame(1500, $config->effective($this->branch->fresh())['pairs'][$this->pair()]['payouts']['1-1']);
        $settings['pairs'][$this->pair()] = ['enabled' => false];
        $this->office->update(['lottery_settings' => $settings]);
        $this->assertFalse($config->effective($this->branch->fresh())['pairs'][$this->pair()]['enabled']);
        $settings['pairs'] = [];
        $this->office->update(['lottery_settings' => $settings]);
        $this->branch->update(['lottery_settings' => []]);
        $this->assertSame(2500, $config->effective($this->branch->fresh())['pairs'][$this->pair()]['payouts']['1-1']);
    }

    public function test_general_super_pale_settings_validate_and_save(): void
    {
        $this->actingAs($this->seller)->postJson('/lottery/settings', ['scope' => 'office', 'currency' => 'DOP', 'settings' => ['super_pale' => ['enabled' => true, 'payouts' => ['1-1' => 2200], 'commission_bps' => 750]]])->assertRedirect();
        $this->assertSame(2200, $this->office->fresh()->lottery_settings['super_pale']['payouts']['1-1']);
        $this->postJson('/lottery/settings', ['scope' => 'office', 'currency' => 'DOP', 'settings' => ['super_pale' => ['payouts' => ['2-2' => 999]]]])->assertUnprocessable();
        $this->postJson('/lottery/settings', ['scope' => 'office', 'currency' => 'DOP', 'settings' => ['super_pale' => ['commission_bps' => 10001]]])->assertUnprocessable();
    }

    public function test_general_tariffs_respect_draw_exceptions_and_independent_bank_values(): void
    {
        $settings = $this->office->lottery_settings;
        $settings['general_rules'] = ['quiniela' => ['payouts' => ['1' => 60, '2' => 10, '3' => 5], 'commission_bps' => 1000]];
        $settings['rules'] = [$this->b->id.':quiniela' => ['payouts' => ['1' => 50], 'commission_bps' => 500]];
        $this->office->update(['lottery_settings' => $settings]);
        $other = BranchOffice::create(['office_id' => $this->office->id, 'name' => 'Otra', 'code' => '002', 'is_active' => true]);
        $this->branch->update(['lottery_settings' => [
            'general_rules' => ['quiniela' => ['payouts' => ['1' => 70], 'commission_bps' => 0]],
            'rules' => [$this->a->id.':quiniela' => ['payouts' => ['1' => 80], 'commission_bps' => null]],
        ]]);

        $config = app(Configuration::class);
        $bankRules = $config->effective($this->branch->fresh())['rules'];
        $this->assertSame(['1' => 80], $bankRules[$this->a->id.':quiniela']['payouts']);
        $this->assertSame(0, $bankRules[$this->a->id.':quiniela']['commission_bps']);
        $this->assertSame(['1' => 70], $bankRules[$this->b->id.':quiniela']['payouts']);
        $otherRules = $config->effective($other->fresh())['rules'];
        $this->assertSame(['1' => 60, '2' => 10, '3' => 5], $otherRules[$this->a->id.':quiniela']['payouts']);
        $this->assertSame(['1' => 50], $otherRules[$this->b->id.':quiniela']['payouts']);
        $this->branch->update(['lottery_settings' => []]);
        $this->assertSame($otherRules, $config->effective($this->branch->fresh())['rules']);
    }

    public function test_sales_and_winning_prizes_use_the_general_tariff_snapshot_for_each_modality(): void
    {
        $settings = $this->office->lottery_settings;
        $settings['rules'] = [];
        $settings['general_rules'] = [
            'quiniela' => ['payouts' => ['1' => 60, '2' => 10, '3' => 5], 'commission_bps' => 1000],
            'pale' => ['payouts' => ['1-2' => 1000, '1-3' => 1000, '2-3' => 100], 'commission_bps' => 500],
            'tripleta' => ['payouts' => ['3' => 2000, '2' => 100], 'commission_bps' => 0],
        ];
        $this->office->update(['lottery_settings' => $settings]);
        $lines = [
            $this->line(),
            [...$this->line(), 'modality' => 'pale', 'numbers' => '10-20'],
            [...$this->line(), 'modality' => 'tripleta', 'numbers' => '10-20-30'],
        ];
        $ticket = $this->sell($lines);
        $this->assertSame(150, $ticket->commission_minor);
        $this->assertSame([100, 50, 0], $ticket->lines->pluck('commission_minor')->all());

        foreach ($settings['general_rules'] as &$rule) $rule = ['payouts' => array_fill_keys(array_keys($rule['payouts']), 1), 'commission_bps' => 0];
        unset($rule);
        $this->office->update(['lottery_settings' => $settings]);
        $newTicket = $this->sell($lines);
        $this->assertSame(0, $newTicket->commission_minor);
        $this->travelTo(CarbonImmutable::parse('2026-10-20 12:06:00', 'America/Santo_Domingo'));
        app(ResultService::class)->record(['draw_id' => $this->a->id, 'business_date' => '2026-10-20', 'numbers' => ['10', '20', '30'], 'confirmed' => true], $this->seller);
        $this->assertSame([60000, 1000000, 2000000], $ticket->lines()->orderBy('id')->pluck('prize_minor')->all());
        $this->assertSame([1000, 1000, 1000], $newTicket->lines()->orderBy('id')->pluck('prize_minor')->all());
    }

    public function test_general_tariffs_validate_categories_commissions_and_scope(): void
    {
        $tariffs = [
            'quiniela' => ['payouts' => ['1' => 75, '2' => 10, '3' => 5], 'commission_bps' => 1250],
            'pale' => ['payouts' => ['1-2' => 1200], 'commission_bps' => 500],
            'tripleta' => ['payouts' => ['3' => 2500, '2' => 150], 'commission_bps' => 0],
        ];
        $data = ['scope' => 'office', 'currency' => 'DOP', 'settings' => ['general_rules' => $tariffs]];
        $this->actingAs($this->seller)->postJson('/lottery/settings', $data)->assertRedirect();
        $this->assertSame($tariffs, $this->office->fresh()->lottery_settings['general_rules']);
        foreach ([
            ['quiniela' => ['payouts' => ['1-2' => 60]]],
            ['pale' => ['payouts' => ['1' => 60]]],
            ['tripleta' => ['payouts' => ['1' => 60]]],
            ['quiniela' => ['commission_bps' => 10001]],
            ['quiniela' => ['payouts' => ['1' => -1]]],
            ['quiniela' => ['payouts' => ['1' => 1000001]]],
            ['super_pale' => ['payouts' => ['1-1' => 1000]]],
        ] as $invalid) {
            $this->postJson('/lottery/settings', [...$data, 'settings' => ['general_rules' => $invalid]])->assertUnprocessable();
        }
        $branchData = [...$data, 'scope' => 'branch', 'branch_id' => $this->branch->id];
        $this->postJson('/lottery/settings', $branchData)->assertRedirect();
        $this->assertSame($tariffs, $this->branch->fresh()->lottery_settings['general_rules']);
        $foreign = Office::create(['name' => 'Ajeno', 'currency' => 'DOP', 'is_active' => true]);
        $this->postJson('/lottery/settings', [...$data, 'office_id' => $foreign->id])->assertForbidden();
        $this->seller->roles()->detach();
        $this->seller->unsetRelation('roles');
        $this->postJson('/lottery/settings', $data)->assertForbidden();
    }

    public function test_saving_inherited_tariffs_removes_stored_global_draw_and_pair_customizations(): void
    {
        $parent = $this->office->lottery_settings;
        unset($parent['rules'][$this->a->id.':quiniela']);
        $parent['general_rules'] = ['quiniela' => ['payouts' => ['1' => 60], 'commission_bps' => 1000]];
        $parent['super_pale'] = ['enabled' => true, 'payouts' => ['1-1' => 2500]];
        $parent['pairs'] = [];
        $this->office->update(['lottery_settings' => $parent]);
        $own = [
            'footer' => 'Mi banca',
            'general_rules' => ['quiniela' => ['payouts' => ['1' => 75]]],
            'rules' => [$this->a->id.':quiniela' => ['payouts' => ['1' => 80]]],
            'super_pale' => ['payouts' => ['1-1' => 2000]],
            'pairs' => [$this->pair() => ['payouts' => ['1-1' => 1800]]],
        ];
        $data = ['scope' => 'branch', 'branch_id' => $this->branch->id, 'currency' => 'DOP'];
        $this->actingAs($this->seller)->postJson('/lottery/settings', [...$data, 'settings' => $own])->assertRedirect();
        $config = app(Configuration::class);
        $this->assertSame(80, $config->effective($this->branch->fresh())['rules'][$this->a->id.':quiniela']['payouts']['1']);

        unset($own['rules'], $own['pairs']);
        $this->postJson('/lottery/settings', [...$data, 'settings' => $own])->assertRedirect();
        $this->assertSame(75, $config->effective($this->branch->fresh())['rules'][$this->a->id.':quiniela']['payouts']['1']);
        $this->assertSame(2000, $config->effective($this->branch->fresh())['pairs'][$this->pair()]['payouts']['1-1']);

        unset($own['general_rules'], $own['super_pale']);
        $this->postJson('/lottery/settings', [...$data, 'settings' => $own])->assertRedirect();
        $this->assertSame(['footer' => 'Mi banca'], $this->branch->fresh()->lottery_settings);
        $effective = $config->effective($this->branch->fresh());
        $this->assertSame(60, $effective['rules'][$this->a->id.':quiniela']['payouts']['1']);
        $this->assertSame(2500, $effective['pairs'][$this->pair()]['payouts']['1-1']);

        unset($parent['general_rules'], $parent['super_pale']);
        $this->postJson('/lottery/settings', ['scope' => 'office', 'currency' => 'DOP', 'settings' => $parent])->assertRedirect();
        $this->assertArrayNotHasKey('general_rules', $this->office->fresh()->lottery_settings);
        $this->assertArrayNotHasKey('super_pale', $this->office->fresh()->lottery_settings);
        $this->assertSame($parent['rules'], $this->office->fresh()->lottery_settings['rules']);
    }

    public function test_inheriting_all_branch_settings_preserves_payment_and_reconciliation_permission_checks(): void
    {
        $own = ['payment_methods' => ['transfer'], 'payment_reference_required' => ['transfer' => true], 'reconciliation_mode' => 'cash', 'footer' => 'Banca'];
        $this->branch->update(['lottery_settings' => $own]);
        $role = $this->seller->roles()->firstOrFail();
        $payments = \App\Models\Permission::where('slug', 'lottery.payments.configure')->firstOrFail();
        $reconciliation = \App\Models\Permission::where('slug', 'lottery.reconciliation.configure')->firstOrFail();
        $data = ['scope' => 'branch', 'branch_id' => $this->branch->id, 'currency' => 'DOP', 'settings' => []];
        $this->actingAs($this->seller);
        $role->permissions()->detach($payments->id);
        $this->seller->unsetRelation('roles');
        $this->postJson('/lottery/settings', $data)->assertForbidden();
        $this->assertSame($own, $this->branch->fresh()->lottery_settings);
        $role->permissions()->attach($payments->id);
        $role->permissions()->detach($reconciliation->id);
        $this->seller->unsetRelation('roles');
        $this->postJson('/lottery/settings', $data)->assertForbidden();
        $this->assertSame($own, $this->branch->fresh()->lottery_settings);
        $role->permissions()->attach($reconciliation->id);
        $this->seller->unsetRelation('roles');
        $this->postJson('/lottery/settings', $data)->assertRedirect();
        $this->assertEmpty($this->branch->fresh()->lottery_settings);
        $effective = app(Configuration::class)->effective($this->branch->fresh());
        $this->assertSame(['cash'], $effective['payment_methods']);
        $this->assertSame('cash', $effective['reconciliation_mode']);
    }

    public function test_limits_crud_is_scoped_and_audited(): void
    {
        $this->actingAs($this->seller);
        $data = ['name' => 'Prueba CRUD', 'modality' => 'quiniela', 'category' => 'all', 'match_type' => 'exact', 'numbers' => '10', 'aggregation' => 'shared', 'amount_minor' => 10000, 'active' => true];
        $this->postJson('/lottery/limits', $data)->assertOk();
        $limit = BetLimit::where('name', 'Prueba CRUD')->firstOrFail();
        $this->getJson('/lottery/limits')->assertOk()->assertJsonCount(1, 'limits');
        $this->postJson('/lottery/limits', [...$data, 'id' => $limit->id, 'active' => false])->assertOk();
        $this->assertFalse($limit->fresh()->active);
        $other = Office::create(['name' => 'Ajeno CRUD', 'currency' => 'DOP']);
        $foreign = BetLimit::create([...$data, 'office_id' => $other->id]);
        $this->deleteJson('/lottery/limits/'.$foreign->id)->assertNotFound();
        $this->postJson('/lottery/limits', [...$data, 'id' => $foreign->id])->assertNotFound();
        $this->deleteJson('/lottery/limits/'.$limit->id)->assertOk();
        $this->assertDatabaseMissing('bet_limits', ['id' => $limit->id]);
        $this->assertDatabaseHas('bet_limits', ['id' => $foreign->id]);
        $this->assertSame(1, \App\Models\LotteryAudit::where('action', 'limit.deleted')->count());
        $this->deleteJson('/lottery/limits/'.$limit->id)->assertNotFound();
        $this->assertSame(1, \App\Models\LotteryAudit::where('action', 'limit.deleted')->count());
    }

    public function test_consortium_tabs_and_branch_configuration_do_not_switch_active_bank(): void
    {
        $second = BranchOffice::create(['office_id' => $this->office->id, 'name' => 'Segunda', 'code' => '002', 'is_active' => true]);
        $other = Office::create(['name' => 'Otro consorcio tabs', 'currency' => 'DOP']);
        $foreign = BranchOffice::create(['office_id' => $other->id, 'name' => 'Ajena', 'code' => '003', 'is_active' => true]);
        $this->actingAs($this->seller);
        $this->post('/lottery/settings', ['scope' => 'branch', 'branch_id' => $second->id, 'office_id' => $this->office->id, 'currency' => 'DOP', 'settings' => ['footer' => 'Solo segunda']])->assertSessionHasNoErrors();
        $this->assertSame('Solo segunda', $second->fresh()->lottery_settings['footer']);
        $this->assertSame($this->branch->id, $this->seller->fresh()->active_branch_office_id);
        $this->assertEmpty($this->branch->fresh()->lottery_settings);
        $this->post('/lottery/settings', ['scope' => 'branch', 'branch_id' => $foreign->id, 'office_id' => $this->office->id, 'currency' => 'DOP', 'settings' => []])->assertNotFound();
        $suffix = '?consortium='.$this->office->id_hash;
        $permission = \App\Models\Permission::where('slug', 'lottery.sell')->firstOrFail();
        $roleData = ['name' => 'Vendedor tabs', 'slug' => 'vendedor-tabs', 'is_active' => true, 'permission_ids' => [$permission->id]];
        $this->post('/settings/roles'.$suffix, $roleData)->assertSessionHasNoErrors()->assertRedirect(route('lottery.settings.consortium', $this->office).'?tab=roles');
        $role = Role::where('slug', 'vendedor-tabs')->firstOrFail();
        $this->assertSame($this->office->id, $role->office_id);
        $this->post('/settings/users'.$suffix, ['name' => 'Usuario tabs', 'email' => 'tabs@example.test', 'password' => 'SecurePassword123!', 'role_ids' => [$role->id], 'branch_office_ids' => [$second->id], 'default_branch_office_id' => $second->id])->assertSessionHasNoErrors()->assertRedirect(route('lottery.settings.consortium', $this->office).'?tab=users');
        $this->get(route('lottery.settings.consortium', $this->office))->assertOk()->assertInertia(fn ($page) => $page->has('management.members', 2)->has('branches', 2));
        $this->post('/settings/roles?consortium='.$other->id_hash, $roleData)->assertForbidden();
        $this->post('/settings/branch-offices'.$suffix, ['office_id' => $other->id, 'code' => '004'])->assertForbidden();
        $this->assertSame($this->branch->id, $this->seller->fresh()->active_branch_office_id);
    }

    public function test_global_admin_creates_roles_in_viewed_consortium_not_active_one(): void
    {
        $this->seller->roles()->attach(Role::where('slug', 'super_admin')->first()->id, ['office_id' => null]);
        $office = Office::create(['name' => 'Consorcio sin banca', 'currency' => 'DOP']);
        $permission = \App\Models\Permission::where('slug', 'lottery.sell')->firstOrFail();
        $this->actingAs($this->seller)->post('/settings/roles?consortium='.$office->id_hash, ['name' => 'Rol contextual', 'slug' => 'rol-contextual', 'is_active' => true, 'permission_ids' => [$permission->id]])->assertSessionHasNoErrors();
        $this->assertSame($office->id, Role::where('slug', 'rol-contextual')->firstOrFail()->office_id);
        $this->assertSame($this->branch->id, $this->seller->fresh()->active_branch_office_id);
    }

    public function test_template_roles_are_editable_only_as_isolated_consortium_copies(): void
    {
        $template = Role::whereNull('office_id')->where('slug', 'usuario')->firstOrFail();
        $original = $template->permissions()->pluck('permissions.id')->all();
        $other = Office::create(['name' => 'Other', 'currency' => 'DOP']);
        $role = Role::where('office_id', $this->office->id)->where('slug', 'usuario')->firstOrFail();
        $otherRole = Role::where('office_id', $other->id)->where('slug', 'usuario')->firstOrFail();
        $this->assertEquals($original, $role->permissions()->pluck('permissions.id')->all());
        $this->seller->roles()->attach(Role::where('office_id', $this->office->id)->where('slug', 'admin')->firstOrFail()->id, ['office_id' => $this->office->id]);
        $this->seller->unsetRelation('roles');
        $data = ['name' => 'Vendedor local', 'slug' => 'usuario', 'is_active' => true, 'permission_ids' => [\App\Models\Permission::where('slug', 'lottery.sell')->firstOrFail()->id]];
        $this->actingAs($this->seller)->put(route('settings.roles.update', $role).'?consortium='.$this->office->id_hash, $data)->assertSessionHasNoErrors()->assertRedirect();
        $this->assertEquals($data['permission_ids'], $role->permissions()->pluck('permissions.id')->all());
        $this->assertEquals($original, $template->permissions()->pluck('permissions.id')->all());
        $this->assertEquals($original, $otherRole->permissions()->pluck('permissions.id')->all());
        $this->put(route('settings.roles.update', $otherRole).'?consortium='.$this->office->id_hash, $data)->assertForbidden();
        $this->seller->roles()->attach($template->id, ['office_id' => $this->office->id]);
        app(\App\Services\ConsortiumRoles::class)->initialize($this->office);
        app(\App\Services\ConsortiumRoles::class)->initialize($this->office);
        $this->assertDatabaseMissing('role_user', ['role_id' => $template->id, 'office_id' => $this->office->id]);
        $this->assertDatabaseHas('role_user', ['role_id' => $role->id, 'user_id' => $this->seller->id, 'office_id' => $this->office->id]);
        $this->assertEquals($data['permission_ids'], $role->permissions()->pluck('permissions.id')->all());
        $this->seller->roles()->attach(Role::where('slug', 'super_admin')->first()->id, ['office_id' => null]);
        $this->seller->unsetRelation('roles');
        $this->put(route('settings.roles.update', $template).'?consortium='.$this->office->id_hash, $data)->assertForbidden();
    }

    public function test_discount_and_commission_use_different_bases(): void
    {
        $ticket = $this->sell([$this->line('25')], true);
        $this->assertEquals(2500, $ticket->gross_minor);
        $this->assertEquals(200, $ticket->discount_minor);
        $this->assertEquals(2300, $ticket->net_minor);
        $this->assertEquals(230, $ticket->commission_minor);
    }

    public function test_query_client_can_list_and_cancel_tickets_using_json(): void
    {
        $ticket = $this->sell();
        $this->actingAs($this->seller)->getJson('/lottery/tickets?search='.$ticket->code)
            ->assertOk()->assertJsonPath('tickets.data.0.code', $ticket->code)->assertJsonPath('currency', 'DOP');
        $this->postJson('/lottery/tickets/'.$ticket->code.'/cancel', ['pin' => $ticket->payment_pin])
            ->assertOk()->assertJsonPath('message', 'Ticket anulado.');
        $this->postJson('/lottery/tickets/'.$ticket->code.'/cancel', ['pin' => $ticket->payment_pin])->assertStatus(422);
        $this->getJson('/lottery/tickets?search='.$ticket->code)
            ->assertOk()->assertJsonPath('tickets.data.0.status', 'cancelled');
    }

    public function test_cancellation_requires_the_ticket_pin_even_in_test_mode_and_never_refunds_on_a_bad_pin(): void
    {
        config(['printing.test_reprint_office_ids' => [$this->office->id]]);
        $ticket = $this->sell();
        $ticket->update(['payment_pin' => '000042']);
        $cash = app(\App\Services\Lottery\CashService::class)->current($this->branch);
        $balance = $cash->balance_minor;
        $url = '/lottery/tickets/'.$ticket->code.'/cancel';
        $attemptKey = 'ticket-cancellation:'.$this->seller->id.':'.$ticket->id;
        \Illuminate\Support\Facades\RateLimiter::clear($attemptKey);
        $this->actingAs($this->seller);
        try {
            foreach ([[], ['pin' => '123'], ['pin' => 42], ['pin' => '00004s'], ['pin' => '111111']] as $data) {
                $this->postJson($url, $data)->assertUnprocessable()->assertJsonValidationErrors('pin');
            }
            try {
                app(SaleService::class)->cancel($this->seller, $ticket, '111111');
                $this->fail('Cancellation without a matching PIN was accepted.');
            } catch (ValidationException $e) { $this->assertArrayHasKey('pin', $e->errors()); }
            $this->assertSame('sold', $ticket->fresh()->status);
            $this->assertSame($balance, $cash->fresh()->balance_minor);
            $this->assertSame(0, $cash->movements()->where('type', 'refund')->count());
            $this->assertSame(0, \App\Models\LotteryAudit::where('action', 'ticket.cancelled')->count());
            $foreign = BranchOffice::create(['office_id' => $this->office->id, 'code' => 'OTHER', 'name' => 'Otra', 'is_active' => true]);
            $otherTicket = $this->sell(key: (string) Str::uuid());
            $otherTicket->update(['branch_office_id' => $foreign->id]);
            $this->postJson('/lottery/tickets/'.$otherTicket->code.'/cancel', ['pin' => $otherTicket->payment_pin])->assertNotFound();
            $this->postJson($url, ['pin' => '000042'])->assertOk();
            $this->assertSame('cancelled', $ticket->fresh()->status);
            $this->assertSame(1, $cash->movements()->where('type', 'refund')->count());
            $this->assertStringNotContainsString('000042', \App\Models\LotteryAudit::all()->toJson());
            $this->postJson($url, ['pin' => '000042'])->assertUnprocessable();
            $this->assertSame(1, $cash->movements()->where('type', 'refund')->count());
        } finally { \Illuminate\Support\Facades\RateLimiter::clear($attemptKey); }
    }

    public function test_cancellation_limits_pin_attempts_and_does_not_flash_the_pin(): void
    {
        $ticket = $this->sell();
        $ticket->update(['payment_pin' => '000042']);
        $url = '/lottery/tickets/'.$ticket->code.'/cancel';
        $attemptKey = 'ticket-cancellation:'.$this->seller->id.':'.$ticket->id;
        \Illuminate\Support\Facades\RateLimiter::clear($attemptKey);
        $this->actingAs($this->seller);
        try {
            $this->from('/lottery/sales')->post($url, ['pin' => '111111'])->assertRedirect('/lottery/sales')->assertSessionHasErrors('pin')->assertSessionMissing('_old_input.pin');
            for ($i = 0; $i < 4; $i++) $this->postJson($url, ['pin' => '111111'])->assertUnprocessable()->assertDontSee('000042')->assertDontSee('111111');
            $this->postJson($url, ['pin' => '000042'])->assertStatus(429);
            $this->assertSame('sold', $ticket->fresh()->status);
            $this->travel(61)->seconds();
            $this->postJson($url, ['pin' => '000042'])->assertOk();
        } finally { \Illuminate\Support\Facades\RateLimiter::clear($attemptKey); }
    }

    public function test_cancellation_is_hidden_and_rejected_when_either_super_pale_draw_has_results(): void
    {
        $normal = $this->sell();
        $pair = $this->sell([$this->line(super: true)], key: (string) Str::uuid());
        $this->actingAs($this->seller);
        $this->getJson('/lottery/tickets/'.$pair->code)->assertOk()->assertJsonPath('cancellation.allowed', true);
        // Yesterday's result must not block today's tickets.
        DrawResult::create(['draw_id' => $this->b->id, 'business_date' => now()->subDay()->toDateString(), 'numbers' => ['10','20','30'], 'status' => 'confirmed']);
        $this->getJson('/lottery/tickets/'.$pair->code)->assertOk()->assertJsonPath('cancellation.allowed', true);
        foreach ([$this->b, $this->a] as $draw) {
            $result = DrawResult::create(['draw_id' => $draw->id, 'business_date' => $pair->business_date, 'numbers' => ['10','20','30'], 'status' => 'pending']);
            $this->getJson('/lottery/tickets/'.$pair->code)->assertOk()->assertJsonPath('cancellation.allowed', false);
            $this->postJson('/lottery/tickets/'.$pair->code.'/cancel', ['pin' => $pair->payment_pin])->assertUnprocessable();
            $rows = collect($this->getJson('/lottery/tickets')->assertOk()->json('tickets.data'))->keyBy('code');
            $this->assertFalse($rows[$pair->code]['cancellation']['allowed']);
            $this->assertSame($draw->id !== $this->a->id, $rows[$normal->code]['cancellation']['allowed']);
            $this->assertNull($pair->lines()->first()->prize_minor);
            $result->delete();
        }
        $this->assertSame('sold', $pair->fresh()->status);
        $this->assertSame(0, \App\Models\CashMovement::where('type', 'refund')->count());
    }

    public function test_cancellation_rejects_paid_or_classified_tickets_even_when_other_results_are_pending(): void
    {
        $ticket = $this->sell([$this->line(), [...$this->line(), 'draw_id' => $this->b->id, 'numbers' => '20']]);
        $this->actingAs($this->seller);
        $line = $ticket->lines()->first();
        $line->update(['prize_minor' => 1000, 'paid_at' => now(), 'paid_by' => $this->seller->id]);
        $this->getJson('/lottery/tickets/'.$ticket->code)->assertOk()->assertJsonPath('cancellation.allowed', false)->assertJsonPath('cancellation.reason', 'El ticket tiene premios pagados.');
        $this->postJson('/lottery/tickets/'.$ticket->code.'/cancel', ['pin' => $ticket->payment_pin])->assertUnprocessable();
        $line->update(['prize_minor' => 0, 'paid_at' => null, 'paid_by' => null]);
        $this->getJson('/lottery/tickets/'.$ticket->code)->assertOk()->assertJsonPath('cancellation.allowed', false)->assertJsonPath('cancellation.reason', 'Ya se publicó un resultado de este ticket.');
        $this->postJson('/lottery/tickets/'.$ticket->code.'/cancel', ['pin' => $ticket->payment_pin])->assertUnprocessable();
        $this->assertSame('sold', $ticket->fresh()->status);
        $this->assertSame(0, \App\Models\CashMovement::where('type', 'refund')->count());
    }

    public function test_cancellation_metadata_expires_at_the_time_limit_or_earliest_draw_close(): void
    {
        $ticket = $this->sell();
        $this->actingAs($this->seller);
        $expires = $ticket->created_at->copy()->addMinutes(5)->toIso8601String();
        $this->getJson('/lottery/tickets/'.$ticket->code)->assertOk()->assertJsonPath('cancellation.allowed', true)->assertJsonPath('cancellation.expires_at', $expires);
        $this->travel(5)->minutes();
        $this->getJson('/lottery/tickets/'.$ticket->code)->assertOk()->assertJsonPath('cancellation.allowed', false)->assertJsonPath('cancellation.reason', 'Venció el plazo de cancelación.');
        $this->postJson('/lottery/tickets/'.$ticket->code.'/cancel', ['pin' => $ticket->payment_pin])->assertUnprocessable();
        $other = $this->sell(key: (string) Str::uuid());
        $close = now()->addMinute();
        $other->lines()->update(['closes_at' => $close]);
        $this->getJson('/lottery/tickets/'.$other->code)->assertOk()->assertJsonPath('cancellation.expires_at', $close->toIso8601String());
        $this->travel(1)->minutes();
        $this->getJson('/lottery/tickets/'.$other->code)->assertOk()->assertJsonPath('cancellation.allowed', false)->assertJsonPath('cancellation.reason', 'Un sorteo del ticket ya cerró.');
        $this->postJson('/lottery/tickets/'.$other->code.'/cancel', ['pin' => $other->payment_pin])->assertUnprocessable();
    }

    public function test_lottery_catalog_detail_and_json_editing_are_scoped_and_protected(): void
    {
        $this->actingAs($this->seller)->getJson('/lottery/catalog/lotteries/'.$this->a->lottery_id)->assertForbidden();
        $admin = User::factory()->create();
        $admin->roles()->attach(Role::where('slug', 'super_admin')->first()->id, ['office_id' => null]);
        $other = Lottery::create(['name' => 'Otra lotería', 'active' => true]);
        $this->actingAs($admin)->getJson('/lottery/catalog')->assertOk()->assertJsonCount(2, 'lotteries');
        $this->getJson('/lottery/catalog/lotteries/'.$this->a->lottery_id)->assertOk()
            ->assertJsonCount(2, 'draws')->assertJsonPath('lottery.id', $this->a->lottery_id);
        $this->getJson('/lottery/catalog/lotteries/'.$other->id)->assertOk()->assertJsonCount(0, 'draws');
        $this->get('/lottery/catalog/lotteries/'.$other->id)->assertOk();
        $this->postJson('/lottery/catalog/lotteries', ['id' => $other->id, 'name' => 'Nombre editado', 'active' => false])
            ->assertOk()->assertJsonPath('lottery.name', 'Nombre editado')->assertJsonPath('lottery.active', false);
        $this->postJson('/lottery/catalog/draws', ['lottery_id' => $other->id, 'name' => 'Nuevo sorteo',
            'opens_at' => '06:00', 'closes_at' => '14:00', 'draws_at' => '14:05', 'weekdays' => [1, 2],
            'modalities' => ['quiniela', 'super_pale'], 'active' => true, 'result_count' => 3,
            'source_url' => 'https://elboletoganador.com/loteria/prueba', 'exceptions' => ['2026-12-25' => ['closed' => true]]])
            ->assertOk()->assertJsonPath('message', 'Sorteo guardado.');
        $this->getJson('/lottery/catalog/lotteries/'.$other->id)->assertOk()->assertJsonCount(1, 'draws')
            ->assertJsonPath('draws.0.source_key', 'prueba')->assertJsonPath('draws.0.exceptions.2026-12-25.closed', true);
        $this->postJson('/lottery/catalog/lotteries', ['name' => '', 'active' => true])->assertUnprocessable()->assertJsonValidationErrors('name');
    }

    public function test_query_client_payment_returns_json_and_rejects_duplicates(): void
    {
        $ticket = $this->sell();
        $this->travelTo(CarbonImmutable::parse('2026-10-20 12:06:00', 'America/Santo_Domingo'));
        app(ResultService::class)->record(['draw_id' => $this->a->id, 'business_date' => '2026-10-20',
            'numbers' => ['10', '20', '30'], 'confirmed' => true], $this->seller);
        $this->actingAs($this->seller)->postJson('/lottery/sales/tickets/'.$ticket->code.'/pay', ['pin'=>$ticket->payment_pin])
            ->assertOk()->assertJsonPath('message', 'Premios pendientes pagados.');
        $this->postJson('/lottery/sales/tickets/'.$ticket->code.'/pay', ['pin'=>$ticket->payment_pin])->assertStatus(422);
        $this->assertNotNull($ticket->lines()->first()->paid_at);
    }

    public function test_payout_receipts_print_exact_payments_without_pins_or_duplicate_cash_movements(): void
    {
        $directory = storage_path('framework/testing/payout-agent-'.Str::uuid());
        config(['printing.private_key_path' => $directory.'/private.pem']);
        $this->artisan('lottery:print-agent-key')->assertExitCode(0);
        try {
            $ticket = $this->sell([$this->line(), [...$this->line(), 'draw_id' => $this->b->id, 'numbers' => '20']]);
            $ticket->update(['payment_pin' => '000042', 'created_at' => now()->subDays(2), 'business_date' => now()->subDays(2)->toDateString()]);
            $lines = $ticket->lines()->orderBy('id')->get();
            $lines[0]->update(['prize_minor' => 7500]);
            $this->actingAs($this->seller);
            $payUrl = '/lottery/sales/tickets/'.$ticket->code.'/pay';
            $first = $this->postJson($payUrl, ['pin' => '000042'])->assertOk()->assertJsonPath('payment_receipt.document_type', 'payout')
                ->assertJsonPath('payment_receipt.net_minor', 7500)->assertJsonCount(1, 'payment_receipt.lines')->assertJsonMissingPath('payment_receipt.pin');
            $paymentId = $first->json('payment_receipt.payment_id');
            $this->assertSame($this->seller->name, $first->json('payment_receipt.paid_by'));
            $lines[1]->update(['prize_minor' => 15000]);
            $this->postJson($payUrl, ['pin' => '000042'])->assertUnprocessable();
            $second = $this->postJson($payUrl, ['pin' => $ticket->fresh()->payment_pin])->assertOk()->assertJsonPath('payment_receipt.net_minor', 15000);
            $this->assertNotSame($paymentId, $second->json('payment_receipt.payment_id'));
            $request = ['attempt_key' => (string) Str::uuid(), 'trigger' => 'automatic', 'transport' => 'local',
                'device_id' => (string) Str::uuid(), 'printer' => 'Térmica USB', 'profile' => 'epson', 'paper_width' => 80, 'cut' => true,
                'document_type' => 'payout', 'payment_id' => $paymentId];
            $printUrl = '/lottery/tickets/'.$ticket->code.'/print';
            $printed = $this->postJson($printUrl, $request)->assertOk()->assertJsonPath('sequence', 1)->assertJsonPath('net_minor', 7500)->assertJsonMissingPath('ticket_pin');
            $data = json_decode(base64_decode($printed->json('authorization.payload')), true);
            $this->assertSame('payout', $data['receipt']['document_type']);
            $this->assertSame(7500, $data['receipt']['net_minor']);
            $this->assertCount(1, $data['receipt']['lines']);
            $this->assertSame('10', $data['receipt']['lines'][0]['numbers']);
            $this->assertArrayNotHasKey('pin', $data['receipt']);
            $this->assertSame(now()->addMinutes(2)->timestamp, $data['expires_at']);
            $publicKey = $this->getJson('/printing-agent/public-key')->assertOk()->json('public_key');
            $this->assertSame(1, openssl_verify(base64_decode($printed->json('authorization.payload')), base64_decode($printed->json('authorization.signature')), $publicKey, OPENSSL_ALGO_SHA256));
            $this->postJson($printUrl, $request)->assertOk()->assertJsonPath('audit_id', $printed->json('audit_id'))->assertJsonPath('sequence', 1);
            $this->postJson($printUrl, [...$request, 'attempt_key' => (string) Str::uuid()])->assertOk()->assertJsonPath('sequence', 2);
            $this->postJson($printUrl, [...$request, 'payment_id' => $second->json('payment_receipt.payment_id')])->assertStatus(409);
            $this->postJson('/lottery/tickets/'.$ticket->code.'/print-status', ['attempt_key' => $request['attempt_key'], 'status' => 'submitted', 'spool_job_id' => 7])->assertOk();
            $this->getJson('/lottery/reports?report=printing&risk=1')->assertOk()->assertJsonPath('rows.total', 0);
            $this->getJson('/lottery/tickets/'.$ticket->code.'/print-history')->assertOk()->assertJsonPath('0.document_type', 'payout');
            $this->postJson($payUrl, ['pin' => '000042'])->assertUnprocessable();
            $cash = app(\App\Services\Lottery\CashService::class)->current($this->branch);
            $this->assertSame(2, $cash->movements()->where('type', 'prize')->count());
            $this->assertSame(-22500, $cash->movements()->where('type', 'prize')->sum('amount_minor'));
            $other = $this->sell(key: (string) Str::uuid());
            $this->postJson('/lottery/tickets/'.$other->code.'/print', [...$request, 'attempt_key' => (string) Str::uuid()])->assertNotFound();
            $saleRequest = $request; unset($saleRequest['document_type'], $saleRequest['payment_id']);
            $this->postJson($printUrl, $saleRequest)->assertUnprocessable();
            $this->postJson($printUrl, [...$saleRequest, 'attempt_key' => (string) Str::uuid()])->assertUnprocessable();
            $permission = \App\Models\Permission::where('slug', 'lottery.pay')->firstOrFail();
            foreach (Role::all() as $role) $role->permissions()->detach($permission->id);
            $this->seller->unsetRelation('roles');
            $this->postJson($printUrl, [...$request, 'attempt_key' => (string) Str::uuid()])->assertForbidden();
        } finally { \Illuminate\Support\Facades\File::deleteDirectory($directory); }
    }

    public function test_partial_payments_rotate_the_pin_and_only_reissue_unresolved_wagers(): void
    {
        $directory = storage_path('framework/testing/continuation-agent-'.Str::uuid());
        config(['printing.private_key_path' => $directory.'/private.pem']);
        $this->artisan('lottery:print-agent-key')->assertExitCode(0);
        try {
            $ticket = $this->sell([$this->line('10'), [...$this->line('5'), 'numbers' => '11'], [...$this->line('4'), 'draw_id' => $this->b->id, 'numbers' => '20'], $this->line('3', true)]);
            $ticket->update(['payment_pin' => '000042', 'created_at' => now()->subDays(2), 'business_date' => now()->subDays(2)->toDateString()]);
            $lines = $ticket->lines()->orderBy('id')->get();
            $lines[0]->update(['prize_minor' => 7500]); $lines[1]->update(['prize_minor' => 0]);
            $this->actingAs($this->seller);
            $payUrl = '/lottery/sales/tickets/'.$ticket->code.'/pay';
            $first = $this->postJson($payUrl, ['pin' => '000042'])->assertOk()
                ->assertJsonPath('continuation_ticket.document_type', 'continuation')->assertJsonPath('continuation_ticket.net_minor', 700)
                ->assertJsonPath('continuation_ticket.paid_minor', 7500)->assertJsonCount(2, 'continuation_ticket.lines')
                ->assertJsonMissingPath('continuation_ticket.pin')->assertJsonMissingPath('payment_receipt.pin');
            $firstPin = $ticket->fresh()->payment_pin;
            $this->assertNotSame('000042', $firstPin); $this->assertMatchesRegularExpression('/^[0-9]{6}$/D', $firstPin);
            $paymentId = $first->json('continuation_ticket.payment_id');
            $request = ['attempt_key' => (string) Str::uuid(), 'trigger' => 'automatic', 'transport' => 'local',
                'device_id' => (string) Str::uuid(), 'printer' => 'Térmica USB', 'profile' => 'epson', 'paper_width' => 80, 'cut' => true,
                'document_type' => 'continuation', 'payment_id' => $paymentId];
            $printUrl = '/lottery/tickets/'.$ticket->code.'/print';
            $printed = $this->postJson($printUrl, $request)->assertOk()->assertJsonPath('ticket_pin', $firstPin);
            $receipt = json_decode(base64_decode($printed->json('authorization.payload')), true)['receipt'];
            $this->assertSame($firstPin, $receipt['pin']); $this->assertSame('continuation', $receipt['document_type']);
            $this->assertSame(['20', '10-20'], array_column($receipt['lines'], 'numbers'));
            $this->assertSame(['quiniela', 'super_pale'], array_column($receipt['lines'], 'modality'));
            $this->postJson($printUrl, $request)->assertOk()->assertJsonPath('audit_id', $printed->json('audit_id'));
            $this->assertSame($firstPin, $ticket->fresh()->payment_pin);
            $this->getJson('/lottery/tickets/'.$ticket->code.'?reprint=1')->assertOk()->assertJsonPath('document_type', 'continuation')->assertJsonCount(2, 'lines')->assertJsonMissingPath('pin');
            $normalPrint = $request; unset($normalPrint['document_type'], $normalPrint['payment_id']);
            $this->postJson($printUrl, [...$normalPrint, 'attempt_key' => (string) Str::uuid()])->assertOk()->assertJsonPath('document_type', 'continuation');
            $this->postJson($payUrl, ['pin' => '000042'])->assertUnprocessable()->assertJsonValidationErrors('pin');
            $lines[2]->update(['prize_minor' => 15000]);
            $second = $this->postJson($payUrl, ['pin' => $firstPin])->assertOk()->assertJsonCount(1, 'continuation_ticket.lines')->assertJsonPath('continuation_ticket.net_minor', 300);
            $secondPin = $ticket->fresh()->payment_pin; $this->assertNotSame($firstPin, $secondPin);
            $this->postJson($printUrl, $request)->assertStatus(409);
            $this->postJson($printUrl, [...$request, 'attempt_key' => (string) Str::uuid()])->assertStatus(409);
            $this->postJson($printUrl, [...$request, 'attempt_key' => (string) Str::uuid(), 'payment_id' => $second->json('continuation_ticket.payment_id')])->assertOk()->assertJsonPath('ticket_pin', $secondPin);
            $lines[3]->update(['prize_minor' => 30000]);
            $this->postJson($payUrl, ['pin' => $firstPin])->assertUnprocessable();
            $this->postJson($payUrl, ['pin' => $secondPin])->assertOk()->assertJsonPath('continuation_ticket', null);
            $this->assertSame($secondPin, $ticket->fresh()->payment_pin);
            $this->postJson($printUrl, [...$request, 'attempt_key' => (string) Str::uuid(), 'payment_id' => $second->json('continuation_ticket.payment_id')])->assertStatus(409);
            $this->assertSame(1, Ticket::count()); $this->assertSame(4, $ticket->lines()->count());
            $this->assertSame(2200, $ticket->fresh()->gross_minor);
            $this->assertSame(1, \App\Models\CashMovement::where('type', 'sale')->count());
            $this->assertSame(3, \App\Models\CashMovement::where('type', 'prize')->count());
            $audits = \App\Models\LotteryAudit::all()->toJson();
            foreach (['000042', $firstPin, $secondPin] as $secret) $this->assertStringNotContainsString('"'.$secret.'"', $audits);
        } finally { \Illuminate\Support\Facades\File::deleteDirectory($directory); }
    }

    public function test_winner_and_pending_draw_payment_reaches_the_agent_with_only_pending_wagers_and_a_new_pin(): void
    {
        $directory = storage_path('framework/testing/continuation-integration-'.Str::uuid());
        config(['printing.private_key_path' => $directory.'/private.pem']);
        $this->artisan('lottery:print-agent-key')->assertExitCode(0);
        try {
            $this->a->update(['name' => 'Ganador integrado']);
            $this->b->update(['name' => 'Pendiente integrado']);
            $ticket = $this->sell([$this->line('10'), [...$this->line('4'), 'draw_id' => $this->b->id, 'numbers' => '20']]);
            $oldPin = '000042';
            $ticket->update(['payment_pin' => $oldPin]);
            $this->travelTo(CarbonImmutable::parse('2026-10-20 12:06:00', 'America/Santo_Domingo'));
            $results = app(ResultService::class);
            $results->record(['draw_id' => $this->a->id, 'business_date' => '2026-10-20', 'numbers' => ['10', '33', '44'], 'confirmed' => true], $this->seller);
            $lines = $ticket->lines()->orderBy('id')->get();
            $this->assertSame(60000, $lines[0]->prize_minor);
            $this->assertNull($lines[1]->prize_minor);
            $cash = app(\App\Services\Lottery\CashService::class)->current($this->branch);
            $balance = $cash->balance_minor;
            $this->actingAs($this->seller);
            $payUrl = '/lottery/sales/tickets/'.$ticket->code.'/pay';
            $payment = $this->postJson($payUrl, ['pin' => $oldPin])->assertOk()
                ->assertJsonPath('payment_receipt.net_minor', 60000)->assertJsonCount(1, 'continuation_ticket.lines')
                ->assertJsonPath('continuation_ticket.lines.0.numbers', '20')->assertJsonPath('continuation_ticket.net_minor', 400);
            $newPin = $ticket->fresh()->payment_pin;
            $this->assertNotSame($oldPin, $newPin);
            $this->assertSame($balance - 60000, $cash->fresh()->balance_minor);
            $this->assertNotNull($lines[0]->fresh()->paid_at);
            $this->assertNull($lines[1]->fresh()->paid_at);
            $request = ['attempt_key' => (string) Str::uuid(), 'trigger' => 'automatic', 'transport' => 'local',
                'device_id' => (string) Str::uuid(), 'printer' => 'Termica de prueba', 'profile' => 'epson', 'paper_width' => 80, 'cut' => true,
                'document_type' => 'continuation', 'payment_id' => $payment->json('continuation_ticket.payment_id')];
            $printUrl = '/lottery/tickets/'.$ticket->code.'/print';
            $printed = $this->postJson($printUrl, $request)->assertOk();
            $this->postJson($printUrl, $request)->assertOk()->assertJsonPath('audit_id', $printed->json('audit_id'));

            // Run the real Node queue and thermal renderer using Laravel's signed payload.
            // Capture only the spool boundary, so this test never sends paper or uses live cash.
            $process = new \Symfony\Component\Process\Process(['node', base_path('printing-agent/test/continuation-integration.mjs')]);
            $process->setInput(json_encode([
                'authorization' => $printed->json('authorization'),
                'publicKey' => app(\App\Services\Lottery\PrintAuthorization::class)->publicKey(),
                'expected' => ['issuer' => rtrim(config('app.url'), '/'), 'deviceId' => $request['device_id'],
                    'code' => $ticket->code, 'oldPin' => $oldPin, 'newPin' => $newPin,
                    'paidDraw' => $this->a->name, 'pendingDraw' => $this->b->name],
            ], JSON_THROW_ON_ERROR));
            $process->setTimeout(30)->mustRun();
            $this->assertSame(['status' => 'submitted', 'sends' => 1, 'pending_lines' => 1, 'retries_deduplicated' => true], json_decode($process->getOutput(), true));
            $this->postJson('/lottery/tickets/'.$ticket->code.'/print-status', ['attempt_key' => $request['attempt_key'], 'status' => 'submitted', 'spool_job_id' => 17])->assertOk();

            // A real prize now exists: rejection must be due to the retired PIN, not a lack of prizes.
            $results->record(['draw_id' => $this->b->id, 'business_date' => '2026-10-20', 'numbers' => ['20', '55', '66'], 'confirmed' => true], $this->seller);
            $this->assertSame(24000, $lines[1]->fresh()->prize_minor);
            $this->postJson($payUrl, ['pin' => $oldPin])->assertUnprocessable()->assertJsonValidationErrors('pin');
            $this->assertNull($lines[1]->fresh()->paid_at);
            $this->assertSame($balance - 60000, $cash->fresh()->balance_minor);
            $this->assertSame(1, $cash->movements()->where('type', 'prize')->count());
            $this->postJson($payUrl, ['pin' => $newPin])->assertOk()->assertJsonPath('payment_receipt.net_minor', 24000)->assertJsonPath('continuation_ticket', null);
            $this->assertNotNull($lines[1]->fresh()->paid_at);
            $this->postJson($payUrl, ['pin' => $newPin])->assertUnprocessable();
            $this->assertSame(2, $cash->movements()->where('type', 'prize')->count());
            $this->assertSame($balance - 84000, $cash->fresh()->balance_minor);
            $this->assertSame(1, Ticket::count());
            $this->assertSame(2, $ticket->lines()->count());
            $this->assertSame(1, $cash->movements()->where('type', 'sale')->count());
        } finally { \Illuminate\Support\Facades\File::deleteDirectory($directory); }
    }

    public function test_payment_pin_is_encrypted_hidden_and_only_returned_for_authorized_prints(): void
    {
        $key = (string) Str::uuid();
        $ticket = $this->sell(key: $key);
        $this->assertMatchesRegularExpression('/^[0-9]{6}$/D', $ticket->payment_pin);
        $this->assertSame($ticket->payment_pin, $this->sell(key: $key)->payment_pin);
        $ticket->update(['payment_pin' => '000042']);
        $stored = \Illuminate\Support\Facades\DB::table('tickets')->where('id', $ticket->id)->value('payment_pin');
        $this->assertNotSame('000042', $stored);
        $this->assertSame('000042', \Illuminate\Support\Facades\Crypt::decryptString($stored));
        $this->assertArrayNotHasKey('payment_pin', $ticket->toArray());
        $this->actingAs($this->seller);
        $this->getJson('/lottery/tickets/'.$ticket->code)->assertOk()->assertJsonMissingPath('payment_pin');
        $this->getJson('/lottery/tickets')->assertOk()->assertJsonMissingPath('tickets.data.0.payment_pin');
        $this->get('/lottery/reports?report=tickets&format=print')->assertOk()->assertDontSee('000042');
        $attempt = ['attempt_key' => (string) Str::uuid(), 'trigger' => 'automatic'];
        $url = '/lottery/tickets/'.$ticket->code.'/print';
        $first = $this->postJson($url, $attempt)->assertOk()->assertJsonPath('ticket_pin', '000042')->assertJsonPath('sequence', 1);
        $this->assertStringContainsString('no-store', $first->headers->get('Cache-Control'));
        $this->postJson($url, $attempt)->assertOk()->assertJsonPath('ticket_pin', '000042')->assertJsonPath('sequence', 1);
        $this->postJson($url, ['attempt_key' => (string) Str::uuid(), 'trigger' => 'manual'])->assertOk()->assertJsonPath('ticket_pin', '000042')->assertJsonPath('sequence', 2);
        $this->getJson('/lottery/tickets/'.$ticket->code.'/print-history')->assertOk()->assertDontSee('000042');
        $this->assertStringNotContainsString('000042', \App\Models\LotteryAudit::all()->toJson());
        $this->travel(20)->minutes();
        $this->postJson($url, ['attempt_key' => (string) Str::uuid(), 'trigger' => 'manual'])->assertUnprocessable()->assertJsonMissingPath('ticket_pin');
    }

    public function test_sales_payment_requires_the_matching_pin_and_does_not_move_cash_when_rejected(): void
    {
        $ticket = $this->sell();
        $ticket->update(['payment_pin' => '000042']);
        $ticket->lines()->update(['prize_minor' => 60000]);
        $cash = app(\App\Services\Lottery\CashService::class)->current($this->branch);
        $balance = $cash->balance_minor;
        $url = '/lottery/sales/tickets/'.$ticket->reference.'/pay';
        $this->actingAs($this->seller);
        foreach ([[], ['pin' => ''], ['pin' => '123'], ['pin' => '1234567'], ['pin' => '00004s'], ['pin' => 42], ['pin' => '111111']] as $data) {
            $this->postJson($url, $data)->assertUnprocessable()->assertJsonValidationErrors('pin');
        }
        $this->assertNull($ticket->lines()->first()->paid_at);
        $this->assertSame($balance, $cash->fresh()->balance_minor);
        $this->assertSame(0, $cash->movements()->where('type', 'prize')->count());
        $this->postJson($url, ['pin' => '000042'])->assertOk();
        $this->assertSame($balance - 60000, $cash->fresh()->balance_minor);
        $this->assertSame($this->seller->id, $ticket->lines()->first()->paid_by);
        $this->postJson($url, ['pin' => '000042'])->assertUnprocessable();
        $this->assertSame(1, $cash->movements()->where('type', 'prize')->count());
        $this->assertSame(1, \App\Models\LotteryAudit::where('action', 'ticket.paid')->count());
    }

    public function test_payment_is_scoped_to_the_active_bank_and_needs_sales_and_payment_permissions(): void
    {
        $ticket = $this->sell();
        $ticket->lines()->update(['prize_minor' => 60000]);
        $url = '/lottery/sales/tickets/'.$ticket->code.'/pay';
        $this->actingAs($this->seller);
        $this->postJson('/lottery/tickets/'.$ticket->code.'/pay', ['pin' => $ticket->payment_pin])->assertNotFound();
        $otherBank = BranchOffice::create(['office_id' => $this->office->id, 'code' => 'OTHER', 'name' => 'Otra banca', 'is_active' => true]);
        $foreign = $ticket->replicate(['code', 'request_key', 'request_hash']);
        $foreign->forceFill(['code' => (string) Str::uuid(), 'request_key' => (string) Str::uuid(), 'request_hash' => 'foreign', 'branch_office_id' => $otherBank->id])->save();
        $this->postJson('/lottery/sales/tickets/'.$foreign->code.'/pay', ['pin' => $foreign->payment_pin])->assertNotFound();
        $this->postJson($url, ['pin' => $ticket->payment_pin, 'branch_id' => $otherBank->id])->assertStatus(409);
        foreach (['lottery.pay', 'lottery.sell'] as $slug) {
            $permission = \App\Models\Permission::where('slug', $slug)->firstOrFail();
            $roles = Role::whereHas('permissions', fn ($q) => $q->whereKey($permission->id))->get();
            foreach ($roles as $role) $role->permissions()->detach($permission->id);
            $this->seller->unsetRelation('roles');
            $this->postJson($url, ['pin' => $ticket->payment_pin])->assertForbidden();
            foreach ($roles as $role) $role->permissions()->attach($permission->id);
        }
        $this->assertNull($ticket->lines()->first()->paid_at);
    }

    public function test_incorrect_payment_pins_are_limited_and_expire_without_exposing_the_pin(): void
    {
        $ticket = $this->sell();
        $ticket->update(['payment_pin' => '000042']);
        $ticket->lines()->update(['prize_minor' => 60000]);
        $attemptKey = 'ticket-payment:'.$this->seller->id.':'.$ticket->id;
        \Illuminate\Support\Facades\RateLimiter::clear($attemptKey);
        $url = '/lottery/sales/tickets/'.$ticket->code.'/pay';
        $this->actingAs($this->seller);
        try {
            for ($i = 0; $i < 5; $i++) $this->postJson($url, ['pin' => '111111'])->assertUnprocessable()->assertDontSee('000042')->assertDontSee('111111');
            $this->postJson($url, ['pin' => '000042'])->assertStatus(429);
            $this->assertNull($ticket->lines()->first()->paid_at);
            $this->travel(61)->seconds();
            $this->postJson($url, ['pin' => '000042'])->assertOk();
        } finally {
            \Illuminate\Support\Facades\RateLimiter::clear($attemptKey);
        }
    }

    public function test_payment_pin_is_not_flashed_into_form_history(): void
    {
        $ticket = $this->sell();
        $ticket->update(['payment_pin' => '000042']);
        $this->actingAs($this->seller)->from('/lottery/sales')->post('/lottery/sales/tickets/'.$ticket->code.'/pay', ['pin' => '111111'])
            ->assertRedirect('/lottery/sales')->assertSessionHasErrors('pin')->assertSessionMissing('_old_input.pin');
        \Illuminate\Support\Facades\RateLimiter::clear('ticket-payment:'.$this->seller->id.':'.$ticket->id);
    }

    public function test_domain_payment_also_requires_the_pin_and_legacy_tickets_receive_one(): void
    {
        $ticket = $this->sell();
        $ticket->lines()->update(['prize_minor' => 60000]);
        try {
            app(ResultService::class)->pay($this->seller, $ticket, 'invalid');
            $this->fail('The service paid without a matching PIN.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('pin', $e->errors());
        } finally {
            \Illuminate\Support\Facades\RateLimiter::clear('ticket-payment:'.$this->seller->id.':'.$ticket->id);
        }
        $migration = require database_path('migrations/2026_10_22_000000_add_ticket_payment_pin.php');
        $migration->down();
        $migration->up();
        $ticket->refresh();
        $this->assertMatchesRegularExpression('/^[0-9]{6}$/D', $ticket->payment_pin);
        $this->assertArrayNotHasKey('payment_pin', $ticket->toArray());
        $this->assertNull($ticket->lines()->first()->paid_at);
    }

    public function test_local_print_authorizations_are_signed_scoped_and_keep_receipt_secrets_out_of_audits(): void
    {
        $directory = storage_path('framework/testing/print-agent-'.Str::uuid());
        config(['printing.private_key_path' => $directory.'/private.pem']);
        $this->artisan('lottery:print-agent-key')->assertExitCode(0);
        try {
            $ticket = $this->sell();
            $ticket->update(['payment_pin' => '000042']);
            $request = ['attempt_key' => (string) Str::uuid(), 'trigger' => 'automatic', 'transport' => 'local',
                'device_id' => (string) Str::uuid(), 'printer' => 'Térmica USB', 'profile' => 'epson', 'paper_width' => 80, 'cut' => true, 'feed_lines' => 0];
            $url = '/lottery/tickets/'.$ticket->code.'/print';
            $this->actingAs($this->seller);
            $response = $this->postJson($url, $request)->assertOk();
            $envelope = $response->json('authorization');
            $payload = base64_decode($envelope['payload']);
            $publicKey = $this->getJson('/printing-agent/public-key')->assertOk()->json('public_key');
            $this->assertSame(1, openssl_verify($payload, base64_decode($envelope['signature']), $publicKey, OPENSSL_ALGO_SHA256));
            $data = json_decode($payload, true);
            $this->assertSame('000042', $data['receipt']['pin']);
            $this->assertSame($this->office->name, $data['receipt']['company_name']);
            $this->assertSame($this->branch->name, $data['receipt']['branch_name']);
            $this->assertSame($request['device_id'], $data['target']['device_id']);
            $this->assertSame(0, $data['target']['feed_lines']);
            $this->assertSame($ticket->lines()->first()->draw_id, $data['receipt']['lines'][0]['draw_id']);
            $this->assertSame('A', $data['receipt']['lines'][0]['draw']);
            $this->assertLessThanOrEqual(120, $data['expires_at'] - $data['issued_at']);
            $this->assertStringNotContainsString('000042', \App\Models\LotteryAudit::all()->toJson());
            $this->postJson($url, $request)->assertOk()->assertJsonPath('sequence', 1);
            $this->postJson($url, [...$request, 'printer' => 'Otra impresora'])->assertStatus(409);
            $this->postJson($url, [...$request, 'feed_lines' => 3])->assertStatus(409);
            foreach ([-1, 16, 1.5] as $invalidFeed) $this->postJson($url, [...$request, 'feed_lines' => $invalidFeed])->assertUnprocessable()->assertJsonValidationErrors('feed_lines');
            $this->postJson('/lottery/tickets/'.$ticket->code.'/print-status', ['attempt_key' => $request['attempt_key'], 'status' => 'submitted', 'spool_job_id' => 42])->assertOk();
            $this->postJson('/lottery/tickets/'.$ticket->code.'/print-status', ['attempt_key' => $request['attempt_key'], 'status' => 'failed'])->assertOk();
            $this->getJson('/lottery/tickets/'.$ticket->code.'/print-history')->assertOk()->assertJsonPath('0.delivery.status', 'submitted')->assertJsonPath('0.delivery.spool_job_id', 42)->assertJsonMissingPath('0.ticket_pin');
            $this->postJson($url, ['attempt_key' => (string) Str::uuid(), 'trigger' => 'manual', 'transport' => 'local'])->assertUnprocessable();
            $this->postJson('/lottery/tickets/'.$ticket->code.'/print-status', ['attempt_key' => (string) Str::uuid(), 'status' => 'submitted'])->assertNotFound();
            $this->travel(20)->minutes();
            $this->postJson($url, [...$request, 'attempt_key' => (string) Str::uuid()])->assertUnprocessable()->assertJsonMissingPath('authorization');
            config(['printing.test_reprint_office_ids' => [$this->office->id]]);
            $ticket->update(['status' => 'cancelled', 'created_at' => now()->subDays(2), 'business_date' => now()->subDays(2)->toDateString()]);
            $this->postJson($url, [...$request, 'attempt_key' => (string) Str::uuid()])->assertUnprocessable()->assertJsonMissingPath('authorization');
        } finally {
            \Illuminate\Support\Facades\File::deleteDirectory($directory);
        }
    }

    public function test_print_agent_download_contains_only_distributable_sources_and_public_keys_have_no_private_material(): void
    {
        $directory = storage_path('framework/testing/print-agent-'.Str::uuid());
        config(['printing.private_key_path' => $directory.'/private.pem']);
        $this->artisan('lottery:print-agent-key')->assertExitCode(0);
        try {
            $this->getJson('/printing-agent/public-key')->assertOk()->assertDontSee('PRIVATE KEY')->assertSee('PUBLIC KEY');
            $this->actingAs($this->seller);
            $response = $this->get('/lottery/print-agent/download')->assertOk()->assertDownload('LotoEnlace-PrintAgent-Windows.zip');
            $path = $response->baseResponse->getFile()->getPathname();
            $zip = new \ZipArchive();
            $this->assertTrue($zip->open($path));
            $this->assertNotFalse($zip->getFromName('src/receipt.mjs'));
            $this->assertStringContainsString('@echo off', $zip->getFromName('Instalar.bat'));
            $this->assertFalse($zip->getFromName('Instalar.ps1'));
            $this->assertNotFalse($zip->getFromName('Iniciar.bat'));
            $this->assertNotFalse($zip->getFromName('Iniciar.vbs'));
            $this->assertNotFalse($zip->getFromName('scripts/install.ps1'));
            $this->assertNotFalse($zip->getFromName('scripts/runtime.ps1'));
            $this->assertNotFalse($zip->getFromName('scripts/start.ps1'));
            $this->assertNotFalse($zip->getFromName('scripts/tray.ps1'));
            $this->assertNotFalse($zip->getFromName('package-lock.json'));
            $this->assertFalse($zip->getFromName('config.json'));
            $this->assertFalse($zip->getFromName('private.pem'));
            $zip->close();
            @unlink($path);
            $permission = \App\Models\Permission::where('slug', 'lottery.sell')->firstOrFail();
            $ticketPermission = \App\Models\Permission::where('slug', 'lottery.tickets')->firstOrFail();
            foreach (Role::all() as $role) $role->permissions()->detach([$permission->id, $ticketPermission->id]);
            $this->seller->unsetRelation('roles');
            $this->get('/lottery/print-agent/download')->assertForbidden();
        } finally {
            \Illuminate\Support\Facades\File::deleteDirectory($directory);
        }
    }

    public function test_retries_do_not_duplicate_a_ticket(): void
    {
        $key = (string) Str::uuid();
        $first = $this->sell(key: $key);
        $second = $this->sell(key: $key);
        $this->assertSame($first->id, $second->id);
        $this->assertSame(1, Ticket::count());
    }

    public function test_shared_limit_counts_other_banks_and_pending_lines(): void
    {
        $this->limit(['amount_minor' => 1500]);
        $this->sell();
        $other = BranchOffice::create(['office_id' => $this->office->id, 'code' => '002', 'name' => 'Otra', 'is_active' => true]);
        $line = app(Configuration::class)->prepare($other, $this->line('1'));
        $this->assertSame(500, app(LimitEngine::class)->available($other, $line));
        app(\App\Services\Lottery\CashService::class)->open($this->seller, $other, ['amount'=>'0','request_key'=>(string) Str::uuid()]);
        $this->expectException(ValidationException::class);
        app(SaleService::class)->sell($this->seller, $other, ['lines' => [$this->line('3'), $this->line('3')], 'discount' => false, 'request_key' => (string) Str::uuid()]);
    }

    public function test_daily_limits_apply_together_and_use_gross(): void
    {
        $s = $this->office->lottery_settings;
        $s['daily_limit_minor'] = 2000;
        $s['consortium_limit_minor'] = 1500;
        $this->office->update(['lottery_settings' => $s]);
        $this->sell(discount: true);
        $this->branch->refresh()->load('office');
        $line = app(Configuration::class)->prepare($this->branch, $this->line());
        $this->assertSame(500, app(LimitEngine::class)->available($this->branch, $line));
    }

    public function test_unordered_super_pale_reversal_cannot_bypass_limit(): void
    {
        $this->limit(['modality' => 'super_pale', 'match_type' => 'exact', 'numbers' => '10-20', 'amount_minor' => 1000]);
        $this->sell([$this->line(super: true)]);
        $line = $this->line('1', true);
        $line['numbers'] = '20-10';
        $prepared = app(Configuration::class)->prepare($this->branch, $line);
        $this->assertSame(0, app(LimitEngine::class)->available($this->branch, $prepared));
    }

    public function test_category_block_prevents_whole_wager(): void
    {
        $this->limit(['category' => '1-2', 'modality' => 'super_pale', 'amount_minor' => 0]);
        $this->expectException(ValidationException::class);
        $this->sell([$this->line(super: true)]);
    }

    public function test_scoped_pair_block_does_not_block_quiniela(): void
    {
        $this->limit(['pairs' => [$this->pair()], 'amount_minor' => 0]);
        $this->assertEquals(1000, $this->sell()->gross_minor);
    }

    public function test_consorcio_block_cannot_be_overridden_by_bank_limit(): void
    {
        $this->limit(['amount_minor' => 0]);
        $this->limit(['branch_office_id' => $this->branch->id, 'amount_minor' => 100000]);
        $this->expectException(ValidationException::class);
        $this->sell();
    }

    public function test_inheritance_preserves_false_and_zero_and_reacts_to_parent(): void
    {
        $this->branch->update(['lottery_settings' => ['discount_enabled' => false, 'daily_limit_minor' => 0]]);
        $settings = app(Configuration::class)->effective($this->branch);
        $this->assertFalse($settings['discount_enabled']);
        $this->assertSame(0, $settings['daily_limit_minor']);
        $s = $this->office->lottery_settings;
        $s['footer'] = 'Nuevo pie';
        $this->office->update(['lottery_settings' => $s]);
        $this->branch->refresh()->load('office');
        $this->assertSame('Nuevo pie', app(Configuration::class)->effective($this->branch)['footer']);
    }

    public function test_closed_draw_cannot_be_sold(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-20 12:00:00', 'America/Santo_Domingo'));
        $this->expectException(ValidationException::class);
        $this->sell();
    }

    public function test_cancellation_releases_limits(): void
    {
        $this->limit(['amount_minor' => 1000]);
        $ticket = $this->sell();
        app(SaleService::class)->cancel($this->seller, $ticket, $ticket->payment_pin);
        $this->assertEquals(1000, $this->sell()->gross_minor);
    }

    public function test_cancellation_after_draw_closes_is_forbidden(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-20 11:59:00', 'America/Santo_Domingo'));
        $ticket = $this->sell();
        $this->travelTo(CarbonImmutable::parse('2026-10-20 12:00:00', 'America/Santo_Domingo'));
        $this->expectException(HttpException::class);
        app(SaleService::class)->cancel($this->seller, $ticket, $ticket->payment_pin);
    }

    public function test_super_pale_waits_for_both_results_and_uses_snapshot_tariff(): void
    {
        $ticket = $this->sell([$this->line(super: true)]);
        $this->travelTo(CarbonImmutable::parse('2026-10-20 12:06:00', 'America/Santo_Domingo'));
        $service = app(ResultService::class);
        $service->record(['draw_id' => $this->a->id, 'business_date' => '2026-10-20', 'numbers' => ['10', '33', '44'], 'confirmed' => true], $this->seller);
        $this->assertNull($ticket->lines()->first()->prize_minor);
        $service->record(['draw_id' => $this->b->id, 'business_date' => '2026-10-20', 'numbers' => ['55', '20', '66'], 'confirmed' => true], $this->seller);
        $this->assertEquals(300000, $ticket->lines()->first()->prize_minor);
        $service->pay($this->seller, $ticket, $ticket->payment_pin);
        $this->assertNotNull($ticket->lines()->first()->paid_at);
        $this->expectException(HttpException::class);
        $service->pay($this->seller, $ticket, $ticket->payment_pin);
    }

    public function test_currency_cannot_change_after_sales(): void
    {
        $this->sell();
        $this->actingAs($this->seller)->postJson('/lottery/settings', ['scope' => 'office', 'currency' => 'USD', 'settings' => ['footer' => 'x']])->assertStatus(422);
        $this->assertSame('DOP', $this->office->fresh()->currency);
    }

    public function test_cross_consortium_and_stale_bank_requests_are_denied(): void
    {
        $office = Office::create(['name' => 'Otro', 'is_active' => true]);
        $other = BranchOffice::create(['office_id' => $office->id, 'code' => '001', 'name' => 'Otra', 'is_active' => true]);
        $this->actingAs($this->seller)->postJson('/lottery/sales', ['branch_id' => $other->id, 'request_key' => (string) Str::uuid(), 'discount' => false, 'lines' => [$this->line()]])->assertNotFound();
        $own = BranchOffice::create(['office_id' => $this->office->id, 'code' => '002', 'name' => 'Otra propia', 'is_active' => true]);
        $this->actingAs($this->seller)->postJson('/lottery/sales', ['branch_id' => $own->id, 'request_key' => (string) Str::uuid(), 'discount' => false, 'lines' => [$this->line()]])->assertStatus(409);
    }

    public function test_importer_only_accepts_today_and_exact_draw(): void
    {
        $html = '<article class="inicio-tarjeta-hoy"><a href="/loteria/resultados-a">A</a><span class="tile-date">Mar, 20 oct</span><div class="tile-ball">01</div><div class="tile-ball">02</div><div class="tile-ball">03</div></article>';
        $parser = new BoletoganadorImporter;
        $date = CarbonImmutable::parse('2026-10-20');
        $this->assertSame(['01', '02', '03'], $parser->parse($html, 'resultados-a', $date));
        $this->assertNull($parser->parse($html, 'resultados-b', $date));
        $this->assertNull($parser->parse(str_replace('inicio-tarjeta-hoy', 'old', $html), 'resultados-a', $date));
        $this->expectException(\RuntimeException::class);
        $parser->parse($html, 'resultados-a', $date->addDay());
    }

    public function test_management_and_sales_pages_render(): void
    {
        $this->seller->roles()->attach(Role::where('slug', 'super_admin')->first()->id, ['office_id' => null]);
        foreach (['sales', 'limits', 'tickets', 'catalog', 'results', 'consortium/'.$this->office->id_hash] as $path) {
            $this->actingAs($this->seller)->get('/lottery/'.$path)->assertOk();
        }
    }

    public function test_owner_manages_only_own_consortium_in_unified_page(): void
    {
        $other = Office::create(['name' => 'Consorcio ajeno', 'currency' => 'DOP', 'is_active' => true]);
        $this->actingAs($this->seller);
        $this->get('/lottery/settings')->assertRedirect(route('lottery.settings.consortium', $this->office));
        $this->get(route('lottery.settings.consortium', $this->office))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Lottery/Settings')->where('office.id', $this->office->id)->where('office.name', 'Consorcio A')->has('branches', 1));
        $this->get('/settings/offices')->assertForbidden();
        $this->get('/settings/offices/create')->assertForbidden();
        $this->post('/settings/offices', ['name' => 'No permitido', 'show_print_company_details' => true])->assertForbidden();
        $this->get(route('lottery.settings.consortium', $other))->assertForbidden();
        $data = ['name' => 'Mi consorcio actualizado', 'slogan' => 'Prueba', 'show_print_company_details' => true];
        $this->put(route('lottery.settings.details', $this->office), $data)->assertSessionHasNoErrors()->assertRedirect(route('lottery.settings.consortium', $this->office));
        $this->assertSame('Mi consorcio actualizado', $this->office->fresh()->name);
        $this->put(route('lottery.settings.details', $other), $data)->assertForbidden();
        $this->post('/lottery/settings', ['office_id' => $other->id, 'scope' => 'office', 'currency' => 'DOP', 'settings' => ['footer' => 'No permitido']])->assertForbidden();
        $this->delete(route('settings.offices.destroy', $this->office))->assertForbidden();
        $this->assertSame('Consorcio ajeno', $other->fresh()->name);
        $this->post('/lottery/settings', ['office_id' => $this->office->id, 'scope' => 'office', 'currency' => 'DOP', 'settings' => ['footer' => 'Mi pie']])->assertSessionHasNoErrors();
        $this->assertSame('Mi pie', $this->office->fresh()->lottery_settings['footer']);
    }

    public function test_consorcio_can_be_configured_before_first_bank(): void
    {
        $this->seller->roles()->attach(Role::where('slug', 'super_admin')->first()->id, ['office_id' => null]);
        $office = Office::create(['name' => 'Nuevo', 'currency' => 'DOP']);
        $this->actingAs($this->seller)->get('/lottery/consortium/'.$office->id_hash)->assertOk();
        $this->actingAs($this->seller)->post('/lottery/settings', ['office_id' => $office->id, 'scope' => 'office', 'currency' => 'USD', 'settings' => ['cancel_minutes' => 7]])->assertRedirect();
        $this->assertSame('USD', $office->fresh()->currency);
    }

    public function test_independent_limits_have_a_separate_bucket_per_draw(): void
    {
        $this->limit(['aggregation' => 'separate', 'amount_minor' => 1000]);
        $this->sell();
        $line = $this->line();
        $line['draw_id'] = $this->b->id;
        $this->assertEquals(1000, $this->sell([$line])->gross_minor);
    }

    public function test_secondary_prize_can_use_the_second_draw_as_its_base(): void
    {
        $s = $this->office->lottery_settings;
        $s['pairs'][$this->pair()]['primary_draw_id'] = $this->b->id;
        $this->office->update(['lottery_settings' => $s]);
        $ticket = $this->sell([$this->line(super: true)]);
        $this->travelTo(CarbonImmutable::parse('2026-10-20 12:06:00', 'America/Santo_Domingo'));
        $service = app(ResultService::class);
        $service->record(['draw_id' => $this->a->id, 'business_date' => '2026-10-20', 'numbers' => ['55', '20', '66'], 'confirmed' => true], $this->seller);
        $service->record(['draw_id' => $this->b->id, 'business_date' => '2026-10-20', 'numbers' => ['10', '33', '44'], 'confirmed' => true], $this->seller);
        $this->assertEquals(300000, $ticket->lines()->first()->prize_minor);
    }

    public function test_disabled_lottery_cannot_sell_even_with_active_draw(): void
    {
        $this->a->lottery->update(['active' => false]);
        $this->expectException(ValidationException::class);
        $this->sell();
    }

    public function test_large_ticket_discount_allocation_stays_exact(): void
    {
        $ticket = $this->sell([$this->line('999999999.99'), $this->line('999999999.99')], true);
        $this->assertEquals(199999999998, $ticket->gross_minor);
        $this->assertEquals($ticket->net_minor, $ticket->lines->sum('net_minor'));
        $this->assertEquals(19999999900, $ticket->discount_minor);
    }

    public function test_single_position_draw_can_supply_the_super_pale_base(): void
    {
        $this->a->update(['result_count' => 1]);
        $ticket = $this->sell([$this->line(super: true)]);
        $this->travelTo(CarbonImmutable::parse('2026-10-20 12:06:00', 'America/Santo_Domingo'));
        $service = app(ResultService::class);
        $service->record(['draw_id' => $this->a->id, 'business_date' => '2026-10-20', 'numbers' => ['10'], 'confirmed' => true], $this->seller);
        $service->record(['draw_id' => $this->b->id, 'business_date' => '2026-10-20', 'numbers' => ['55', '20', '66'], 'confirmed' => true], $this->seller);
        $this->assertEquals(300000, $ticket->lines()->first()->prize_minor);
    }
}
