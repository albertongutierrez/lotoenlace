<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>{{ $title }} · LotoEnlace</title>
<style>
@page { size:A4 portrait; margin:28px 30px 36px; }
* { box-sizing:border-box; }
body { margin:0; font-family:'DejaVu Sans',sans-serif; color:#182b3a; font-size:9px; line-height:1.4; }
table { width:100%; border-collapse:collapse; table-layout:fixed; }
thead { display:table-header-group; } tr { page-break-inside:avoid; }
th { padding:7px 6px; background:#edf3f5; color:#3d5360; font-size:8px; text-align:left; font-weight:bold; border-bottom:1px solid #b9cbd2; }
td { padding:6px; border-bottom:1px solid #e1e8eb; vertical-align:top; overflow-wrap:anywhere; word-wrap:break-word; }
h1 { margin:4px 0 3px; font-size:20px; line-height:1.2; color:#162f40; } h2 { margin:0; font-size:14px; } h3 { margin:16px 0 7px; font-size:10px; color:#1d5660; letter-spacing:.5px; text-transform:uppercase; page-break-after:avoid; }
p { margin:5px 0; }.muted { color:#647783; }.small { font-size:8px; }.tiny { font-size:7.5px; }.right,.amount { text-align:right; }.amount { white-space:nowrap; font-variant-numeric:tabular-nums; }.bold { font-weight:bold; }
.header { border-bottom:2px solid #1b6567; margin-bottom:12px; }.header td { border:0; padding:0 0 12px; }.brand { color:#1b6567; font-size:9px; font-weight:bold; letter-spacing:1.2px; }.company { font-size:11px; font-weight:bold; }.header-meta { text-align:right; font-size:8px; color:#526977; }
.context { padding:8px 10px; background:#f3f6f7; margin:10px 0 14px; font-size:8px; color:#526977; }.context strong { color:#233f4d; }.context span { margin-right:12px; }
.metrics { margin:10px 0 14px; }.metrics td { background:#f3f7f7; border:1px solid #dbe5e8; padding:10px; }.metrics .value { margin-top:4px; font-size:14px; font-weight:bold; color:#183e49; }.metrics .caption { font-size:8px; color:#566d78; }
.section-banner { margin:14px 0 8px; padding:9px 10px; background:#163b49; color:#fff; }.section-banner .muted { color:#d5e4e8; }.section-banner h2 { font-size:13px; }.section-banner .badge { float:right; font-size:8px; }
.meta-grid td { padding:4px 6px; border:0; }.meta-grid .label { display:block; color:#70828c; font-size:7.5px; }.meta-grid { margin:8px 0; }
.ticket-head { margin-top:11px; padding:7px 8px; border:1px solid #c9d8dd; background:#f2f6f7; page-break-after:avoid; }.ticket-code { font-size:8px; font-weight:bold; }.ticket-info { margin-top:3px; font-size:8px; color:#5d727e; }.ticket-total td { background:#f7f9fa; font-weight:bold; }.ticket-lines th,.ticket-lines td { font-size:8px; padding:5px; }
.note { font-size:8px; color:#657984; margin:9px 0; }.empty { padding:16px 10px; color:#6c808b; border:1px solid #dbe5e8; }.total td { border-top:1px solid #819da8; background:#edf4f5; font-weight:bold; }.risk td { background:#fff5df; }.page-break { page-break-before:always; }.keep { page-break-inside:avoid; }.observation { white-space:pre-wrap; }
.print-toolbar { margin:12px 0; } .print-toolbar button { padding:8px 14px; } @media print { .print-toolbar { display:none; } }
@if($report==='reconciliation')
@page { margin-bottom:64px; }
.reconciliation-table th { font-size:7.5px; }
.reconciliation-table td { padding:4px 5px; font-size:8.5px; }
@endif
</style></head><body>
@php
 $amount=fn($v)=>$v===null?'—':number_format($v/100,2,'.',',');
 $cash=fn($v)=>$currency.' '.$amount($v);
 $date=fn($v)=>$v?\Carbon\CarbonImmutable::parse($v)->setTimezone('America/Santo_Domingo')->format('d/m/Y H:i'):'—';
 $day=fn($v)=>\Carbon\CarbonImmutable::parse($v)->format('d/m/Y');
 $modes=['quiniela'=>'Quiniela','pale'=>'Palé','tripleta'=>'Tripleta','super_pale'=>'Súper palé'];
 $formatCell=function($value,$column) use($amount,$date,$modes) {
  if($value===null)return '—';
  if($column['type']==='money')return $amount($value);
  if($column['type']==='date')return $date($value);
  if($column['key']==='mode')return $modes[$value]??$value;
  return (string)$value;
 };
@endphp
@if($print)<div class="print-toolbar"><button onclick="window.print()">Imprimir documento</button></div>@endif
<table class="header"><tr><td style="width:64%">
<div class="brand">LOTOENLACE / REPORTES</div>
<h1>{{ $title }}</h1>
@if($company)<div class="company">{{ $company['legal_name'] ?: $company['name'] }}</div>
<div class="small muted">{{ implode(' · ',array_filter([$company['tax_id']?'RNC '.$company['tax_id']:null,$company['phone'],$company['email']])) }}</div>
@if($company['address'])<div class="small muted">{{ $company['address'] }}</div>@endif
@else<div class="small muted">{{ $office['name'] }}</div>@endif
</td><td class="header-meta"><strong>{{ $day($from) }} — {{ $day($to) }}</strong><br>Emitido {{ $generated }}<br>{{ $printedBy }}<br>Moneda {{ $currency }} · Hora RD</td></tr></table>
<div class="context">@foreach($filterLabels as $label=>$value)<span><strong>{{ $label }}:</strong> {{ $value }}</span>@endforeach<span>{{ $rows->count() }} registros</span></div>
@if($report==='cash')
 @include('reports.cash-detail')
@else
 @if(count($totals))<table class="metrics"><tr>@foreach($totals as $label=>$value)<td><div class="caption">{{ $label }} · período</div><div class="value">{{ $amount($value) }}</div></td>@endforeach</tr></table>@endif
 @include('reports.data-detail')
 <p class="note">{{ $note }}</p>
@endif
@if($print)<script>window.addEventListener('load',()=>{window.focus();window.print();});</script>@endif
</body></html>
