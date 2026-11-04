<?php
namespace App\Http\Controllers;

use App\Models\{Ticket, Draw, DrawResult, CashSession, LotteryAudit, User};
use App\Services\Lottery\Configuration;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Inertia\Inertia;

class ReportController extends Controller
{
 public function index(Request $r) {
  $available=collect(config('reports'))->filter(fn($label,$key)=>$r->user()->canDo('reports.'.$key));
  abort_if($available->isEmpty(),403);
  $active=$r->user()->accessibleBranches()->whereKey($r->user()->active_branch_office_id)->firstOrFail();
  abort_if($r->filled('office_id') && (int)$r->office_id!==$active->office_id,409,'Cambió el consorcio activo. Recarga la página.');
  $banks=$r->user()->accessibleBranches()->where('office_id',$active->office_id)->orderBy('code')->get();
  $reportBanks=$banks->filter(fn($bank)=>app(Configuration::class)->reconciliationMode($bank)==='report');
  $menu=$available->except('cash');
  if($reportBanks->isEmpty()) $menu=$menu->except('reconciliation');
  $kind=$r->input('report',$menu->keys()->first()??'cash');
  abort_unless($available->has($kind),403,'No tienes permiso para este reporte.');
  if($kind==='reconciliation') abort_if($reportBanks->isEmpty(),422,'No hay bancas autorizadas configuradas para cuadre por reporte.');
  if($kind==='cash'&&!$r->filled('format')&&!$r->wantsJson()) return redirect()->route('lottery.cash');
  $r->validate(['period'=>'nullable|in:today,yesterday,month,last_month,custom','from'=>'required_if:period,custom|nullable|date_format:Y-m-d','to'=>'required_if:period,custom|nullable|date_format:Y-m-d|after_or_equal:from',
   'cash_session_id'=>'nullable|integer|min:1','format'=>'nullable|in:pdf,print','branch_id'=>'nullable|integer','draw_id'=>'nullable|integer','lottery_id'=>'nullable|integer','mode'=>'nullable|in:quiniela,pale,tripleta,super_pale',
   'state'=>'nullable|in:all,pending,lost,cancelled,winners','payment'=>'nullable|in:all,paid,partial,unpaid','view'=>'nullable|in:summary,detail','operation'=>'nullable|in:all,sale,refund,prize','search'=>'nullable|string|max:100','risk'=>'nullable|boolean','page'=>'nullable|integer|min:1']);
  $bankIds=$banks->pluck('id');
  if ($r->filled('branch_id')) { abort_unless($bankIds->contains((int)$r->branch_id),403); $bankIds=collect([(int)$r->branch_id]); }
  if($kind==='reconciliation') {
   if($r->filled('branch_id')) abort_unless($reportBanks->contains('id',(int)$r->branch_id),422,'Esta banca utiliza cuadre por cajas. Consulta su historial de cajas.');
   $bankIds=$bankIds->intersect($reportBanks->pluck('id'))->values();
  }
  $today=CarbonImmutable::now('America/Santo_Domingo')->startOfDay();
  [$from,$to]=match($r->input('period','today')) {
   'yesterday'=>[$today->subDay(),$today->subDay()], 'month'=>[$today->startOfMonth(),$today->endOfMonth()],
   'last_month'=>[$today->subMonthNoOverflow()->startOfMonth(),$today->subMonthNoOverflow()->endOfMonth()],
   'custom'=>[CarbonImmutable::parse($r->from,'America/Santo_Domingo'),CarbonImmutable::parse($r->to,'America/Santo_Domingo')], default=>[$today,$today],
  };
  $start=$from->startOfDay()->utc(); $end=$to->addDay()->startOfDay()->utc();
  $base=Ticket::where('office_id',$active->office_id)->whereIn('branch_office_id',$bankIds);
  $draws=Draw::with('lottery:id,name')->get()->keyBy('id');
  $name=fn($id)=>$draws->get($id)?->name??'Sorteo no disponible';
  $bankNames=$banks->pluck('code','id');
  $match=function($line) use($r,$draws) {
   $ids=array_filter([$line->draw_id,$line->second_draw_id]);
   return (!$r->filled('mode')||$line->modality===$r->mode)
    && (!$r->filled('draw_id')||in_array((int)$r->draw_id,$ids))
    && (!$r->filled('lottery_id')||collect($ids)->contains(fn($id)=>(int)$draws->get($id)?->lottery_id===(int)$r->lottery_id));
  };
  $rows=collect(); $columns=[]; $totals=[]; $note='';
  $col=function(array $items) { return collect($items)->map(fn($v,$k)=>['key'=>$k,'label'=>is_array($v)?$v[0]:$v,'type'=>is_array($v)?$v[1]:'text'])->values()->all(); };
  if ($kind==='reconciliation') {
   $period=app(\App\Services\Lottery\PeriodReconciliation::class)->build($active->office_id,$banks->whereIn('id',$bankIds),$start,$end,(string)($r->input('view')?:'summary'),trim((string)$r->input('search','')),(string)($r->input('operation')?:'all'));
   $rows=$period['rows']; $totals=$period['totals'];
   $columns=$r->input('view','summary')==='detail'
    ? $col(['date'=>['Fecha RD','date'],'bank'=>'Banca','ticket'=>'Ticket','type'=>'Operación','payment_method'=>'Medio','user'=>'Usuario','amount'=>['Monto neto','money'],'commission'=>['Comisión','money']])
    : $col(['bank'=>'Banca','tickets'=>'Tickets vendidos','sales'=>['Ventas cobradas','money'],'refunds'=>['Anulaciones','money'],'paid'=>['Premios pagados','money'],'balance'=>['Neto de operaciones','money'],'commission'=>['Comisiones netas','money']]);
   $note='Cuadre por fecha real de cada venta, anulación y pago de premio, en hora RD. Incluye operaciones sin caja y el historial de operaciones de estas bancas. Neto de operaciones = ventas cobradas − anulaciones − premios pagados. Las comisiones se muestran aparte y no se descuentan automáticamente. No representa efectivo contado ni saldo de una caja; no incluye fondos iniciales ni entradas o salidas manuales de cajas.';
  } elseif ($kind==='cash') {
   $sessionQuery=CashSession::with(['opener:id,name','closer:id,name'])->where('office_id',$active->office_id)->whereIn('branch_office_id',$bankIds);
   if($r->filled('cash_session_id')) {
    $session=(clone $sessionQuery)->whereKey((int)$r->cash_session_id)->firstOrFail();
    $sessions=collect([$session]);
    $from=$session->created_at->toImmutable()->setTimezone('America/Santo_Domingo')->startOfDay();
    $to=($session->closed_at??$session->created_at)->toImmutable()->setTimezone('America/Santo_Domingo')->startOfDay();
   } else $sessions=$sessionQuery->where('created_at','>=',$start)->where('created_at','<',$end)->latest('id')->get();
   $rows=$sessions->map(function($s) use($r,$bankNames) {
    $visible=$s->status==='closed'||$r->user()->canDo('lottery.cash.view_open');
    return ['id'=>$s->id,'bank'=>$bankNames[$s->branch_office_id],'opened'=>$s->created_at,'closed'=>$s->closed_at,'user'=>$s->opener?->name,'closer'=>$s->closer?->name,
     'state'=>$s->status==='closed'?'Cerrada':'Abierta','opening'=>$visible?$s->opening_minor:null,'expected'=>$visible?$s->balance_minor:null,'counted'=>$visible?$s->counted_minor:null,'difference'=>$visible?$s->difference_minor:null,'note'=>$s->closing_note];
   });
   $columns=$col(['id'=>'Caja','bank'=>'Banca','opened'=>['Apertura RD','date'],'closed'=>['Cierre RD','date'],'user'=>'Abrió','closer'=>'Cerró','state'=>'Estado','opening'=>['Fondo inicial','money'],'expected'=>['Esperado','money'],'counted'=>['Contado','money'],'difference'=>['Diferencia','money'],'note'=>'Observación']);
   $note='Filtrado por fecha de apertura. Los saldos de cajas abiertas están ocultos sin el permiso correspondiente.';
  } elseif ($kind==='results') {
   $enabled=$banks->whereIn('id',$bankIds)->flatMap(fn($b)=>app(Configuration::class)->effective($b)['draw_ids'])->unique();
   $results=DrawResult::whereIn('draw_id',$enabled)->whereBetween('business_date',[$from->toDateString(),$to->toDateString()])->orderByDesc('business_date')->get();
   $rows=$results->filter(fn($x)=>(!$r->filled('draw_id')||$x->draw_id==(int)$r->draw_id)&&(!$r->filled('lottery_id')||$draws->get($x->draw_id)?->lottery_id==(int)$r->lottery_id))->map(fn($x)=>['draw'=>$name($x->draw_id),'date'=>$x->business_date,'numbers'=>implode(' · ',$x->numbers),'state'=>$x->status==='confirmed'?'Confirmado':'Pendiente de revisión']);
   $columns=$col(['date'=>'Fecha RD','draw'=>'Sorteo','numbers'=>'Números ganadores','state'=>'Estado']);
   $note='Resultados de los sorteos habilitados en las bancas seleccionadas.';
  } elseif ($kind==='printing') {
   $events=LotteryAudit::where('office_id',$active->office_id)->whereIn('action',['ticket.print_requested','ticket.print_denied'])->where('created_at','>=',$start)->where('created_at','<',$end)->latest('id')->get();
   $tickets=(clone $base)->with('lines')->whereIn('code',$events->pluck('payload.ticket')->filter()->unique())->get()->keyBy('code');
   $users=User::whereIn('id',$events->pluck('user_id'))->pluck('name','id');
   $rows=$events->filter(fn($e)=>$tickets->has($e->payload['ticket']??''))->map(function($e) use($tickets,$users,$bankNames) {
    $p=$e->payload; $t=$tickets[$p['ticket']]; $paid=$t->lines->whereNotNull('paid_at')->where('prize_minor','>',0); $reprint=($p['kind']??'')==='reprint'&&$e->action==='ticket.print_requested';
    $paidBefore=$paid->contains(fn($l)=>$l->paid_at->lte($e->created_at)); $payout=($p['document_type']??'')==='payout'; $risk=!$payout&&$reprint&&$paid->isNotEmpty();
    return ['id'=>$e->office_number??$e->id,'date'=>$e->created_at,'ticket'=>$t->code,'reference'=>$t->reference,'bank'=>$bankNames[$t->branch_office_id],'user'=>$users[$e->user_id]??'No disponible',
     'document'=>$payout?'Comprobante de pago':(($p['document_type']??'')==='continuation'?'Ticket de continuación':'Ticket de venta'),'state'=>$e->action==='ticket.print_denied'?'Rechazada':($reprint?'Reimpresión':'Primera registrada'),'copy'=>$p['sequence']??null,'paid'=>$payout?($p['net_minor']??0):$paid->sum('prize_minor'),
     'printer'=>$p['printer']??'Navegador','delivery'=>['submitted'=>'En cola de Windows','failed'=>'No enviado','unknown'=>'Por verificar'][$p['delivery']['status']??'']??'Sin confirmación',
     'risk'=>$risk,'review'=>$risk?($paidBefore?'Reimpresión después de pago':'Reimpresión antes de pago'):'—','ip'=>$p['ip']??'','reason'=>$p['reason']??''];
   })->filter(fn($x)=>!$r->boolean('risk')||$x['risk']);
   $columns=$col(['id'=>'Control','date'=>['Fecha RD','date'],'ticket'=>'Ticket','bank'=>'Banca','user'=>'Usuario','document'=>'Documento','state'=>'Solicitud','copy'=>'Copia','printer'=>'Destino','delivery'=>'Envío','paid'=>['Premios pagados','money'],'review'=>'Revisión','ip'=>'IP','reason'=>'Motivo']);
   $note='Fechas de solicitudes de impresión. Se destacan reimpresiones con premios pagados; no implican fraude. El navegador no confirma la salida física del papel. Solo existe historial desde la activación de la auditoría.';
  } else {
   $tickets=(clone $base)->with('lines')->whereBetween('business_date',[$from->toDateString(),$to->toDateString()])->latest('id')->get();
   $ticketRows=collect(); $lines=collect();
   foreach($tickets as $ticket) {
    $selected=$ticket->lines->filter($match); if($selected->isEmpty()) continue;
    $wins=$ticket->lines->where('prize_minor','>',0); $paid=$wins->whereNotNull('paid_at')->sum('prize_minor'); $prize=$wins->sum('prize_minor');
    $state=$ticket->status==='cancelled'?'cancelled':($prize>0?'winners':($ticket->lines->contains(fn($l)=>$l->prize_minor===null)?'pending':'lost'));
    $payment=$paid===0?'unpaid':($paid<$prize?'partial':'paid');
    if($r->input('state','all')!=='all'&&$r->state!==$state) continue;
    if($r->input('payment','all')!=='all'&&$r->payment!==$payment) continue;
    if($kind==='winners'&&$state!=='winners') continue;
    $ticketRows->push(['date'=>$ticket->business_date,'ticket'=>$ticket->code,'reference'=>$ticket->reference,'bank'=>$bankNames[$ticket->branch_office_id],
     'state'=>['cancelled'=>'Anulado','winners'=>'Ganador','pending'=>'Pendiente','lost'=>'Perdido'][$state], 'payment'=>['paid'=>'Pagado','partial'=>'Pago parcial','unpaid'=>'Sin pagar'][$payment],
     'gross'=>$selected->sum('amount_minor'),'discount'=>$selected->sum('amount_minor')-$selected->sum('net_minor'),'net'=>$selected->sum('net_minor'),
     'prize'=>$prize,'paid'=>$paid,'pending'=>$prize-$paid]);
    if($ticket->status!=='sold') continue;
    foreach($selected as $line) $lines->push(['date'=>$ticket->business_date,'ticket'=>$ticket->code,'reference'=>$ticket->reference,'bank'=>$bankNames[$ticket->branch_office_id],
     'draw'=>implode(' + ',array_map($name,array_filter([$line->draw_id,$line->second_draw_id]))), 'draw_key'=>$line->draw_id.'-'.($line->second_draw_id??0),
     'mode'=>$line->modality,'numbers'=>$line->numbers,'gross'=>$line->amount_minor,'discount'=>$line->amount_minor-$line->net_minor,'net'=>$line->net_minor,'commission'=>$line->commission_minor,
     'prize'=>$line->prize_minor??0,'paid'=>$line->paid_at?$line->prize_minor:0]);
   }
   if(in_array($kind,['tickets','winners'])) {
    $rows=$ticketRows; $columns=$col(['date'=>'Fecha RD','ticket'=>'Ticket','bank'=>'Banca','state'=>'Estado','payment'=>'Pago','gross'=>['Apostado filtrado','money'],'discount'=>['Descuento','money'],'net'=>['Neto filtrado','money'],'prize'=>['Premio total ticket','money'],'paid'=>['Pagado','money'],'pending'=>['Por pagar','money']]);
    $note='Fecha de venta del ticket. Los filtros de modalidad y sorteo seleccionan jugadas; premios y estado corresponden al ticket completo.';
   } elseif($kind==='numbers') {
    $items=collect(); foreach($lines as $line) foreach(array_unique(explode('-',$line['numbers'])) as $n) $items->push(['number'=>$n,'gross'=>$line['gross']]);
    $rows=$items->groupBy('number')->map(fn($group,$n)=>['number'=>str_pad((string)$n,2,'0',STR_PAD_LEFT),'count'=>$group->count(),'gross'=>$group->sum('gross')])->sortBy('number')->values();
    $columns=$col(['number'=>'Número','count'=>'Jugadas que lo contienen','gross'=>['Monto asociado','money']]);
    $note='Cada número cuenta una vez por jugada, independientemente de su combinación. Los montos asociados NO se suman como venta total: una misma jugada aparece en varios números. Anulados excluidos.';
   } else {
    if($kind==='sales'&&$r->input('view','summary')==='detail') { $rows=$lines; $columns=$col(['date'=>'Fecha RD','ticket'=>'Ticket','bank'=>'Banca','draw'=>'Sorteo / pareja','mode'=>'Modalidad','numbers'=>'Jugada','gross'=>['Apostado','money'],'discount'=>['Descuento','money'],'net'=>['Venta neta','money'],'commission'=>['Comisión','money']]); }
    else {
     $groupKey=match($kind){'draws'=>'draw_key','commissions'=>'bank',default=>'date'};
     $rows=$lines->groupBy($groupKey)->map(fn($g,$key)=>['group'=>$kind==='draws'?$g->first()['draw']:$key,'tickets'=>$g->pluck('ticket')->unique()->count(),'plays'=>$g->count(),'gross'=>$g->sum('gross'),'discount'=>$g->sum('discount'),'net'=>$g->sum('net'),'commission'=>$g->sum('commission'),'prize'=>$g->sum('prize'),'paid'=>$g->sum('paid')])->values();
     $columns=$col(['group'=>match($kind){'draws'=>'Sorteo / pareja','commissions'=>'Banca',default=>'Fecha RD'},'tickets'=>'Tickets','plays'=>'Jugadas','gross'=>['Apostado','money'],'discount'=>['Descuento','money'],'net'=>['Venta neta','money'],'commission'=>['Comisión','money'],'prize'=>['Premios','money'],'paid'=>['Premios pagados','money']]);
    }
    $note='Fecha de venta. Anulados excluidos. Súper palé contabilizado una sola vez por pareja. Comisiones según la tarifa guardada al vender, calculadas sobre el neto. Premios reflejan el estado actual, no la fecha del pago.';
   }
   if(!in_array($kind,['tickets','winners','numbers'])) $totals=['Apostado'=>$lines->sum('gross'),'Descuentos'=>$lines->sum('discount'),'Venta neta'=>$lines->sum('net'),'Comisiones'=>$lines->sum('commission')];
  }
  if($kind!=='reconciliation'&&$r->filled('search')) $rows=$rows->filter(fn($row)=>mb_stripos(implode(' ',array_filter($row,fn($v)=>is_scalar($v))),$r->search)!==false);
  $rows=$rows->values(); $page=(int)$r->input('page',1);
  $result=['available'=>$menu->map(fn($label,$key)=>['key'=>$key,'label'=>$label])->values(),'report'=>$kind,'banks'=>$banks->map(fn($bank)=>[...$bank->only(['id','code','name']),'reconciliation_mode'=>app(Configuration::class)->reconciliationMode($bank)]),
   'office'=>['id'=>$active->office_id,'name'=>$active->office->name],'currency'=>$active->office->currency,'draws'=>$draws->values()->map->only(['id','name','lottery_id','lottery']),
   'from'=>$from->toDateString(),'to'=>$to->toDateString(),'columns'=>$columns,'totals'=>$totals,'note'=>$note,
   'rows'=>new LengthAwarePaginator($rows->forPage($page,25)->values(),$rows->count(),25,$page,['path'=>$r->url(),'query'=>$r->query()])];
  if ($r->filled('format')) {
   $result['rows']=$rows;
   $result['title']=$available[$kind];
   $result['print']=$r->format==='print';
   $result['generated']=CarbonImmutable::now('America/Santo_Domingo')->format('d/m/Y H:i');
   $result['filterLabels']=['Banca'=>$r->filled('branch_id')?($bankNames[(int)$r->branch_id]??''):($kind==='reconciliation'?'Todas las autorizadas con cuadre por reporte':'Todas las autorizadas')];
   if($kind==='cash'&&$r->filled('cash_session_id')) $result['filterLabels']['Turno']=$session->created_at->copy()->setTimezone('America/Santo_Domingo')->format('d/m/Y H:i').' — '.($session->closed_at?$session->closed_at->copy()->setTimezone('America/Santo_Domingo')->format('d/m/Y H:i'):'Abierto');
   foreach (['lottery_id'=>'Lotería','draw_id'=>'Sorteo','mode'=>'Modalidad','state'=>'Estado','payment'=>'Pago','operation'=>'Operación','view'=>'Vista','search'=>'Búsqueda','risk'=>'Solo reimpresos con premios pagados'] as $key=>$label) {
    if (!$r->filled($key)) continue;
    $value=$r->input($key);
    if($key==='draw_id') $value=$name((int)$value);
    elseif($key==='lottery_id') $value=$draws->firstWhere('lottery_id',(int)$value)?->lottery?->name??'No disponible';
    elseif($key!=='search') $value=['all'=>'Todos','sale'=>'Venta','refund'=>'Anulación','prize'=>'Premio pagado','pending'=>'Pendientes','lost'=>'Perdidos','cancelled'=>'Anulados','winners'=>'Ganadores','paid'=>'Pagados','partial'=>'Pago parcial','unpaid'=>'Sin pagar','summary'=>'Resumen','detail'=>'Detalle','quiniela'=>'Quiniela','pale'=>'Palé','tripleta'=>'Tripleta','super_pale'=>'Súper palé','1'=>'Sí','0'=>'No'][$value]??$value;
    $result['filterLabels'][$label]=$value;
   }
   $result['printedBy']=$r->user()->name;
   $result['company']=$active->office->show_print_company_details ? $active->office->only(['name','legal_name','tax_id','address','phone','email','slogan']) : null;
   if($kind==='cash') $result['cashDetails']=app(\App\Services\Lottery\CashReport::class)->build($sessions->whereIn('id',$rows->pluck('id')),$banks,$r->user());
   $html=view('reports.document',$result)->render();
   if($result['print']) return response($html)->header('Cache-Control','private, no-store');
   $pdf=new \Dompdf\Dompdf(['isRemoteEnabled'=>false,'isPhpEnabled'=>false,'defaultFont'=>'DejaVu Sans']);
   $pdf->loadHtml($html); $pdf->setPaper('A4','portrait'); $pdf->render();
   $pdf->getCanvas()->page_text(30,819,$available[$kind].' | LotoEnlace',null,8,[.4,.4,.4]);
   $pdf->getCanvas()->page_text(485,819,'{PAGE_NUM} / {PAGE_COUNT}',null,8,[.4,.4,.4]);
   return response($pdf->output())->header('Content-Type','application/pdf')->header('Content-Disposition','inline; filename="'.$kind.'-'.$result['from'].'.pdf"')->header('Cache-Control','private, no-store');
  }
  return $r->wantsJson()?response()->json($result):Inertia::render('Lottery/Reports',$result);
 }
}
