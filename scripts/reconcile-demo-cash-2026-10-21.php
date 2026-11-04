<?php
// One-time reconciliation explicitly requested for the demo bank's 21 October sales.
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Models\{Office,CashSession,CashMovement,Ticket,LotteryAudit};
use Illuminate\Support\Facades\DB;
$result=DB::transaction(function(){
    Office::whereKey(1)->lockForUpdate()->firstOrFail();
    if(CashSession::count()!==1) throw new RuntimeException('Expected exactly one cash session; reconciliation stopped.');
    $session=CashSession::whereKey(1)->lockForUpdate()->firstOrFail();
    if($session->office_id!==1||$session->branch_office_id!==1||$session->status!=='closed') throw new RuntimeException('Unexpected session.');
    $tickets=Ticket::where('office_id',1)->where('branch_office_id',1)->where('business_date','2026-10-21')->whereNull('cash_session_id')->orderBy('id')->lockForUpdate()->get();
    if($tickets->isEmpty()) return ['moved'=>0,'message'=>'Already reconciled.'];
    if($tickets->pluck('id')->all()!==[4,5,6,7,8,9]||(int)$tickets->sum('net_minor')!==11600||$tickets->contains(fn($t)=>$t->status!=='sold')) throw new RuntimeException('Ticket set changed; reconciliation stopped.');
    if($tickets->flatMap(fn($t)=>$t->lines()->whereNotNull('paid_at')->get())->isNotEmpty()) throw new RuntimeException('Paid prizes require separate reconciliation.');
    $before=$session->only(['balance_minor','counted_minor','difference_minor','closed_at','closed_by']);
    foreach($tickets as $ticket){
        if(CashMovement::where('ticket_id',$ticket->id)->exists()) throw new RuntimeException('Ticket already has cash movements.');
        $ticket->update(['cash_session_id'=>$session->id]);
        CashMovement::create(['cash_session_id'=>$session->id,'office_id'=>1,'user_id'=>$ticket->user_id,'ticket_id'=>$ticket->id,'event_key'=>'sale:'.$ticket->id,'type'=>'sale','amount_minor'=>$ticket->net_minor,'balance_minor'=>0,'note'=>'Venta incorporada al cuadre por conciliación solicitada','created_at'=>$ticket->created_at,'updated_at'=>now()]);
    }
    $balance=0;
    foreach($session->movements()->orderBy('id')->lockForUpdate()->get() as $movement){$balance+=$movement->amount_minor;$movement->update(['balance_minor'=>$balance]);}
    $session->update(['balance_minor'=>$balance,'difference_minor'=>$session->counted_minor-$balance]);
    LotteryAudit::create(['office_id'=>1,'user_id'=>$session->closed_by,'action'=>'cash.tickets_reconciled','payload'=>['cash_session_id'=>1,'business_date'=>'2026-10-21','ticket_ids'=>$tickets->pluck('id')->all(),'amount_minor'=>11600,'reason'=>'Solicitud explícita: incorporar los tickets de ventas de hoy al único cuadre existente.','before'=>$before,'after'=>$session->only(['balance_minor','counted_minor','difference_minor','closed_at','closed_by'])]]);
    return ['moved'=>$tickets->count(),'amount_minor'=>11600,'expected_minor'=>$balance,'counted_minor'=>$session->counted_minor,'difference_minor'=>$session->difference_minor];
},3);
echo json_encode($result,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE).PHP_EOL;
