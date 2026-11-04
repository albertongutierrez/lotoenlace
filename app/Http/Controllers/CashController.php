<?php
namespace App\Http\Controllers;

use App\Models\{CashSession, User};
use Carbon\CarbonImmutable;
use App\Services\Lottery\CashService;
use Illuminate\Http\Request;
use Inertia\Inertia;

class CashController extends Controller
{
    private function visible(Request $r, ?CashSession $session): ?CashSession
    {
        if ($session && $session->status === 'open' && !$r->user()->canDo('lottery.cash.view_open')) {
            $session->makeHidden(['balance_minor', 'counted_minor', 'difference_minor']);
        }
        return $session;
    }
    private function bank(Request $r)
    {
        abort_if($r->has('branch_id') && (int) $r->input('branch_id') !== (int) $r->user()->active_branch_office_id,409,'Cambió la banca activa. Recarga la página.');
        return $r->user()->accessibleBranches()->whereKey($r->user()->active_branch_office_id)->firstOrFail();
    }
    public function status(Request $r)
    {
        $bank=$this->bank($r);
        return ['reconciliation_mode'=>app(\App\Services\Lottery\Configuration::class)->reconciliationMode($bank),
            'current'=>CashSession::where('active_branch_id',$bank->id)->first(['id','opened_by','created_at'])];
    }
    public function index(Request $r)
    {
        $bank = $this->bank($r);
        $r->validate(['from'=>'nullable|date_format:Y-m-d','to'=>'nullable|date_format:Y-m-d|after_or_equal:from',
            'period'=>'nullable|in:all,today,yesterday,month,last_month,custom','date_field'=>'nullable|in:opened,closed',
            'state'=>'nullable|in:all,open,closed','session_id'=>'nullable|integer|min:1','user_id'=>'nullable|integer|min:1']);
        $query = CashSession::where('office_id',$bank->office_id)->where('branch_office_id',$bank->id);
        $users=(clone $query)->get(['opened_by','closed_by'])->flatMap(fn($s)=>[$s->opened_by,$s->closed_by])->filter()->unique();
        $dateColumn=$r->input('date_field','opened')==='closed'?'closed_at':'created_at';
        $period=$r->input('period',$r->filled('from')||$r->filled('to')?'custom':'all');
        $today=CarbonImmutable::now('America/Santo_Domingo')->startOfDay();
        [$from,$to]=match($period) {
            'today'=>[$today,$today], 'yesterday'=>[$today->subDay(),$today->subDay()],
            'month'=>[$today->startOfMonth(),$today->endOfMonth()],
            'last_month'=>[$today->subMonthNoOverflow()->startOfMonth(),$today->subMonthNoOverflow()->endOfMonth()],
            'custom'=>[$r->filled('from')?CarbonImmutable::parse($r->from,'America/Santo_Domingo'):null,$r->filled('to')?CarbonImmutable::parse($r->to,'America/Santo_Domingo'):null],
            default=>[null,null],
        };
        if($from) $query->where($dateColumn,'>=',$from->utc());
        if($to) $query->where($dateColumn,'<',$to->addDay()->startOfDay()->utc());
        if($r->input('state','all')!=='all') $query->where('status',$r->state);
        if($r->filled('session_id')) $query->whereKey((int)$r->session_id);
        if($r->filled('user_id')) $query->where(fn($q)=>$q->where('opened_by',(int)$r->user_id)->orWhere('closed_by',(int)$r->user_id));
        $data = ['bank'=>$bank->only('id','code','name'), 'currency'=>$bank->office->currency,
            'current'=>CashSession::with('opener:id,name')->where('active_branch_id',$bank->id)->first(),
            'sessions'=>$query->with(['opener:id,name','closer:id,name'])->latest('id')->paginate(20)->withQueryString()];
        $data['filters']=['period'=>$period,'from'=>$r->input('from',''),'to'=>$r->input('to',''),'date_field'=>$r->input('date_field','opened'),'state'=>$r->input('state','all'),'session_id'=>$r->input('session_id',''),'user_id'=>$r->input('user_id','')];
        $data['operators']=User::whereIn('id',$users)->orderBy('name')->get(['id','name']);
        $data['can_print_report']=$r->user()->canDo('reports.cash');
        $data['office_id']=$bank->office_id;
        $data['reconciliation_mode']=app(\App\Services\Lottery\Configuration::class)->reconciliationMode($bank);
        $data['can_reconcile_report']=$r->user()->canDo('reports.reconciliation');
        $data['can_view_open'] = $r->user()->canDo('lottery.cash.view_open');
        $data['current'] = $this->visible($r, $data['current']);
        $data['sessions']->through(fn ($session) => $this->visible($r, $session));
        return $r->wantsJson() ? response()->json($data) : Inertia::render('Lottery/Cash', $data);
    }
    public function show(Request $r, int $id, CashService $service)
    {
        $session=$service->scoped($this->bank($r),$id)->load(['opener:id,name','closer:id,name']);
        abort_if($session->status === 'open' && !$r->user()->canDo('lottery.cash.view_open'), 403, 'Los movimientos y el saldo se pueden consultar después del cierre.');
        $r->validate(['movement_type'=>'nullable|in:all,opening,sale,refund,prize,deposit,withdrawal']);
        $movements=$session->movements();
        if($r->input('movement_type','all')!=='all') $movements->where('type',$r->movement_type);
        return ['session'=>$session,'totals'=>$session->movements()->selectRaw('type, payment_method, payment_method_label, SUM(amount_minor) as total_minor')->groupBy('type','payment_method','payment_method_label')->get(),
            'movements'=>$movements->with(['user:id,name','ticket:id,code,office_number'])->orderBy('created_at')->orderBy('id')->paginate(25)->withQueryString()];
    }
    public function open(Request $r, CashService $service)
    {
        $data=$r->validate(['request_key'=>'required|uuid','amount'=>'required|string','note'=>'nullable|string|max:1000']);
        return $this->visible($r, $service->open($r->user(),$this->bank($r),$data));
    }
    public function movement(Request $r, int $id, CashService $service)
    {
        $data=$r->validate(['request_key'=>'required|uuid','type'=>'required|in:deposit,withdrawal','amount'=>'required|string','note'=>'required|string|max:1000']);
        abort_if(trim($data['note'])==='',422,'Indica el motivo del movimiento.');
        $service->movement($r->user(),$this->bank($r),$id,$data);
        return ['message'=>'Movimiento registrado.'];
    }
    public function close(Request $r, int $id, CashService $service)
    {
        $data=$r->validate(['amount'=>'required|string','note'=>'nullable|string|max:1000']);
        abort_if(!$r->user()->canDo('lottery.cash.view_open') && trim($data['note'] ?? '') === '',422,'Indica una observación de cierre.');
        return $service->close($r->user(),$this->bank($r),$id,$data);
    }
}
