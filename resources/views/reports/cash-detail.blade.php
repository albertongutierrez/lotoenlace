<style>
.cash-page h3 { color:#263b45; border-bottom:1px solid #9aabb2; padding-bottom:5px; margin-top:14px; }
.cash-page .section-banner { color:#182b3a; background:transparent; padding:5px 0 9px; border-bottom:1px solid #9aabb2; margin-top:4px; }
.cash-page .section-banner .muted { color:#647783; }
.cash-page .metrics td { background:#fff; border:1px solid #a9b9bf; }
.cash-page .quick td { border:0; padding:3px 6px; font-size:8px; }
.cash-page .quick .amount { font-weight:bold; }
.cash-page .movement-list td,.cash-page .movement-list th { padding:6px 4px; font-size:8px; }
</style>
@php $movementTypes=['sale'=>'Venta de ticket','refund'=>'Anulación / devolución','prize'=>'Pago de premio','deposit'=>'Entrada de efectivo','withdrawal'=>'Retiro de efectivo']; @endphp
@forelse($cashDetails as $detail)
@php $session=$detail['session']; $bank=$detail['bank']; @endphp
<section class="cash-page {{ $loop->first?'':'page-break' }}">
 <div class="section-banner"><span class="badge">{{ $session->status==='closed'?'CERRADA':'ABIERTA · PROVISIONAL' }}</span><h2>Banca {{ $bank->code }}{{ $bank->name ? ' · '.$bank->name : '' }}</h2></div>
 <table class="meta-grid"><tr><td><span class="label">APERTURA</span>{{ $date($session->created_at) }}</td><td><span class="label">ABRIÓ</span>{{ $session->opener?->name??'—' }}</td></tr><tr><td><span class="label">CIERRE</span>{{ $date($session->closed_at) }}</td><td><span class="label">CERRÓ</span>{{ $session->closer?->name??'—' }}</td></tr></table>
 @if(!$detail['visible'])<div class="empty">El detalle de esta caja abierta está restringido por permisos.</div>
 @else
 <h3>Resumen del cuadre</h3>
 <table class="metrics"><tr><td><div class="caption">ESPERADO</div><div class="value">{{ $cash($detail['expected']) }}</div></td><td><div class="caption">CONTADO</div><div class="value">{{ $session->counted_minor===null?'Por contar':$cash($session->counted_minor) }}</div></td><td><div class="caption">DIFERENCIA</div><div class="value">{{ $session->difference_minor===null?'Pendiente':$cash($session->difference_minor) }}</div></td></tr></table>
 <table class="quick"><tr><td>COBRADO EN VENTAS</td><td class="amount">{{ $cash($detail['summary']['sale']['amount']) }}</td><td>INICIO DE CAJA</td><td class="amount">{{ $cash($detail['summary']['opening']['amount']) }}</td><td>SALIDAS DE EFECTIVO</td><td class="amount">{{ $cash($detail['outflows']) }}</td></tr></table>
 @if($session->status==='closed' && $session->difference_minor!==0)<p class="small muted">{{ $session->difference_minor>0?'Sobrante de efectivo.':'Faltante de efectivo.' }}</p>@endif
 <h3>Desglose de efectivo</h3>
 <table><thead><tr><th style="width:60%">Concepto</th><th class="right">Operaciones</th><th class="right">Importe {{ $currency }}</th></tr></thead><tbody>
 <tr><td>Inicio de caja</td><td></td><td class="amount">{{ $amount($detail['summary']['opening']['amount']) }}</td></tr>
 <tr><td>Ventas en efectivo</td><td class="amount">{{ $detail['cash_summary']['sale']['count'] }}</td><td class="amount">{{ $amount($detail['cash_summary']['sale']['amount']) }}</td></tr>
 @foreach(['deposit'=>'Entradas de efectivo','refund'=>'Devoluciones por anulación','prize'=>'Premios pagados','withdrawal'=>'Retiros de efectivo'] as $type=>$label)
 @if($detail['cash_summary'][$type]['count'])<tr><td>{{ $label }}</td><td class="amount">{{ $detail['cash_summary'][$type]['count'] }}</td><td class="amount">{{ $amount($detail['cash_summary'][$type]['amount']) }}</td></tr>@endif
 @endforeach
 <tr class="total"><td colspan="2">Efectivo esperado</td><td class="amount">{{ $amount($detail['expected']) }}</td></tr>
 </tbody></table>
 <p class="note">Efectivo esperado = inicio + ventas en efectivo + entradas − devoluciones en efectivo − premios pagados − retiros. Los otros medios no alteran el efectivo.</p>
 <h3>Cobros por medio de pago</h3><table><thead><tr><th>Medio</th><th class="right">Ventas</th><th class="right">Anulaciones</th><th class="right">Neto</th></tr></thead><tbody>@foreach($detail['payment_totals'] as $payment) @if($payment['sales'] || $payment['refunds'])<tr><td>{{ $payment['name'] }}</td><td class="amount">{{ $amount($payment['sales']) }}</td><td class="amount">{{ $amount($payment['refunds']) }}</td><td class="amount">{{ $amount($payment['sales']-$payment['refunds']) }}</td></tr>@endif @endforeach</tbody></table>
 <h3>Movimientos del cuadre · {{ $detail['movements']->count() }} operaciones</h3>
 <table class="movement-list"><thead><tr><th style="width:18%">Fecha / hora RD</th><th style="width:18%">Tipo</th><th style="width:30%">Descripción / referencia</th><th style="width:20%">Usuario</th><th class="right" style="width:14%">Monto {{ $currency }}</th></tr></thead><tbody>
 @forelse($detail['movements'] as $movement)<tr><td>{{ $date($movement->created_at) }}</td><td>{{ $movementTypes[$movement->type]??$movement->type }}<br><span class="muted">{{ $movement->payment_method_label }}</span></td><td>@if($movement->ticket){{ $movement->ticket->reference }}@else{{ $movement->note }}@endif</td><td>{{ $movement->user?->name??'—' }}</td><td class="amount">{{ $amount($movement->amount_minor) }}</td></tr>
 @empty<tr><td colspan="5">No se registraron movimientos durante este turno.</td></tr>@endforelse
 @if($detail['movements']->isNotEmpty())<tr class="total"><td colspan="4">Movimiento neto del turno (sin inicio de caja)</td><td class="amount">{{ $amount($detail['movements']->sum('amount_minor')) }}</td></tr>@endif
 </tbody></table>
 <p class="note">Los montos negativos son devoluciones o pagos según el medio indicado. El neto de operaciones incluye todos los medios; el efectivo se presenta en el resumen.</p>
 @if(preg_match('/[\p{L}\p{N}]/u',($session->opening_note??'').($session->closing_note??'')))
 <div class="keep"><h3>Observaciones</h3>
 @if(preg_match('/[\p{L}\p{N}]/u',$session->opening_note??''))<p class="observation"><strong>Apertura:</strong> {{ $session->opening_note }}</p>@endif
 @if(preg_match('/[\p{L}\p{N}]/u',$session->closing_note??''))<p class="observation"><strong>Cierre:</strong> {{ $session->closing_note }}</p>@endif
 </div>@endif
 @endif
</section>
@empty<div class="empty">No hay cajas para los filtros seleccionados.</div>@endforelse
