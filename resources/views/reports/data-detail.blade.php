@if(in_array($report,['tickets','winners']))
 @forelse($rows as $row)
 <div class="keep"><div class="ticket-head"><div class="ticket-code">{{ $row['reference']??$row['ticket'] }}</div><div class="ticket-info">{{ $day($row['date']) }} · Banca {{ $row['bank'] }} · {{ $row['state'] }} · {{ $row['payment'] }}</div></div>
 <table><thead><tr><th class="right">Apostado</th><th class="right">Descuento</th><th class="right">Cobrado</th><th class="right">Premio</th><th class="right">Pagado</th><th class="right">Por pagar</th></tr></thead><tbody><tr>@foreach(['gross','discount','net','prize','paid','pending'] as $k)<td class="amount">{{ $amount($row[$k]) }}</td>@endforeach</tr></tbody></table></div>
 @empty<div class="empty">No hay registros para los filtros seleccionados.</div>@endforelse
@elseif($report==='sales' && request('view')==='detail')
 @forelse($rows->groupBy('ticket') as $code=>$items)
 <div class="ticket-head"><div class="ticket-code">{{ $items->first()['reference']??$code }}</div><div class="ticket-info">{{ $day($items->first()['date']) }} · Banca {{ $items->first()['bank'] }}</div></div>
 <table class="ticket-lines"><thead><tr><th style="width:24%">Sorteo</th><th style="width:13%">Modalidad</th><th style="width:12%">Jugada</th><th class="right">Apostado</th><th class="right">Descuento</th><th class="right">Cobrado</th><th class="right">Comisión</th></tr></thead><tbody>
 @foreach($items as $row)<tr><td>{{ $row['draw'] }}</td><td>{{ $modes[$row['mode']]??$row['mode'] }}</td><td class="bold">{{ $row['numbers'] }}</td>@foreach(['gross','discount','net','commission'] as $k)<td class="amount">{{ $amount($row[$k]) }}</td>@endforeach</tr>@endforeach
 <tr class="total"><td colspan="3">{{ $items->count() }} jugadas</td>@foreach(['gross','discount','net','commission'] as $k)<td class="amount">{{ $amount($items->sum($k)) }}</td>@endforeach</tr>
 </tbody></table>
 @empty<div class="empty">No hay registros para los filtros seleccionados.</div>@endforelse
@elseif(in_array($report,['sales','draws','commissions']))
 <table><thead><tr><th style="width:24%">{{ $columns[0]['label'] }}</th><th>Tickets / jugadas</th><th class="right">Apostado</th><th class="right">Descuento</th><th class="right">Cobrado</th><th class="right">Comisión</th><th class="right">Premios / pagados</th></tr></thead><tbody>
 @forelse($rows as $row)<tr><td class="bold">{{ $row['group'] }}</td><td>{{ $row['tickets'] }} / {{ $row['plays'] }}</td>@foreach(['gross','discount','net','commission'] as $k)<td class="amount">{{ $amount($row[$k]) }}</td>@endforeach<td class="amount">{{ $amount($row['prize']) }}<br><span class="muted">{{ $amount($row['paid']) }}</span></td></tr>
 @empty<tr><td colspan="7">No hay registros para los filtros seleccionados.</td></tr>@endforelse
 @if($rows->isNotEmpty())<tr class="total"><td colspan="2">Total del listado</td>@foreach(['gross','discount','net','commission'] as $k)<td class="amount">{{ $amount($rows->sum($k)) }}</td>@endforeach<td class="amount">{{ $amount($rows->sum('prize')) }}<br>{{ $amount($rows->sum('paid')) }}</td></tr>@endif
 </tbody></table>
@elseif($report==='printing')
 @forelse($rows as $row)<div class="keep"><div class="ticket-head"><div class="ticket-code">{{ $row['reference']??$row['ticket'] }}</div><div class="ticket-info">{{ $date($row['date']) }} · Banca {{ $row['bank'] }} · {{ $row['user'] }}</div></div>
 <table><thead><tr><th>Solicitud</th><th>Copia</th><th class="right">Premios pagados</th><th style="width:35%">Revisión</th></tr></thead><tbody><tr class="{{ $row['risk']?'risk':'' }}"><td>{{ $row['state'] }}</td><td>{{ $row['copy']??'—' }}</td><td class="amount">{{ $amount($row['paid']) }}</td><td>{{ $row['review'] }}</td></tr></tbody></table>
 <p class="small muted">Control {{ $row['id'] }} · IP {{ $row['ip']?:'—' }} @if($row['reason']) · {{ $row['reason'] }} @endif</p></div>
 @empty<div class="empty">No hay registros para los filtros seleccionados.</div>@endforelse
@elseif($report==='reconciliation')
 @php($widths=request('view')==='detail'?[16,16,10,13,11,14,10,10]:[23,8,14,12,13,16,14])
 <table class="reconciliation-table"><colgroup>@foreach($widths as $width)<col style="width:{{ $width }}%">@endforeach</colgroup><thead><tr>@foreach($columns as $column)<th class="{{ $column['type']==='money'?'right':'' }}">{{ $column['label'] }}</th>@endforeach</tr></thead><tbody>
 @forelse($rows as $row)<tr>@foreach($columns as $column)<td class="{{ $column['type']==='money'?'amount':'' }}">{{ $formatCell($row[$column['key']]??null,$column) }}</td>@endforeach</tr>
 @empty<tr><td colspan="{{ count($columns) }}">No hay registros para los filtros seleccionados.</td></tr>@endforelse
 </tbody></table>
@else
 <table><thead><tr>@foreach($columns as $column)<th class="{{ $column['type']==='money'?'right':'' }}">{{ $column['label'] }}</th>@endforeach</tr></thead><tbody>
 @forelse($rows as $row)<tr>@foreach($columns as $column)<td class="{{ $column['type']==='money'?'amount':'' }} {{ $column['key']==='numbers'?'bold':'' }}">{{ $formatCell($row[$column['key']]??null,$column) }}</td>@endforeach</tr>
 @empty<tr><td colspan="{{ count($columns) }}">No hay registros para los filtros seleccionados.</td></tr>@endforelse
 </tbody></table>
@endif
