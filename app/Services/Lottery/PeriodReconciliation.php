<?php

namespace App\Services\Lottery;

use App\Models\{LotteryAudit, Ticket, TicketLine, User};
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

final class PeriodReconciliation
{
    public function build(int $officeId, Collection $banks, CarbonImmutable $start, CarbonImmutable $end, string $view = 'summary', string $search = '', string $operation = 'all'): array
    {
        $base = Ticket::where('office_id', $officeId)->whereIn('branch_office_id', $banks->pluck('id'));
        $sales = (clone $base)->where('created_at', '>=', $start)->where('created_at', '<', $end)->get();
        $refunds = (clone $base)->where('status', 'cancelled')->where('cancelled_at', '>=', $start)->where('cancelled_at', '<', $end)->get();
        $paid = TicketLine::with('ticket')->whereHas('ticket', fn ($query) => $query->where('office_id', $officeId)->whereIn('branch_office_id', $banks->pluck('id')))
            ->where('prize_minor', '>', 0)->where('paid_at', '>=', $start)->where('paid_at', '<', $end)->get();
        $cancellations = $refunds->isEmpty() ? collect() : LotteryAudit::where('office_id', $officeId)->where('action', 'ticket.cancelled')
            ->where('created_at', '>=', $start)->where('created_at', '<', $end)->orderBy('id')->get()
            ->filter(fn ($audit) => $refunds->contains('code', $audit->payload['ticket'] ?? ''))->keyBy('payload.ticket');
        $users = User::whereIn('id', $sales->pluck('user_id')->merge($paid->pluck('paid_by'))->merge($cancellations->pluck('user_id'))->unique())->pluck('name', 'id');
        $bankNames = $banks->mapWithKeys(fn ($bank) => [$bank->id => $bank->code.($bank->name ? ' · '.$bank->name : '')]);
        $event = fn ($ticket, $date, $type, $operator, $amount, $commission = 0) => [
            'date'=>$date, 'bank_id'=>$ticket->branch_office_id, 'bank'=>$bankNames[$ticket->branch_office_id], 'ticket'=>$ticket->reference,
            'type'=>$type, 'user'=>$users[$operator] ?? 'No disponible', 'amount'=>$amount, 'commission'=>$commission,
            'payment_method'=>$type === 'Premio pagado' ? Configuration::PAYMENT_METHODS['cash'] : $ticket->payment_method_label,
        ];
        $events = collect();
        foreach ($sales as $ticket) $events->push($event($ticket, $ticket->created_at, 'Venta', $ticket->user_id, $ticket->net_minor, $ticket->commission_minor));
        foreach ($refunds as $ticket) $events->push($event($ticket, $ticket->cancelled_at, 'Anulación', $cancellations->get($ticket->code)?->user_id, -$ticket->net_minor, -$ticket->commission_minor));
        foreach ($paid->groupBy(fn ($line) => $line->ticket_id.'|'.$line->paid_at->format('Y-m-d H:i:s').'|'.$line->paid_by) as $group) {
            $line = $group->first();
            $events->push($event($line->ticket, $line->paid_at, 'Premio pagado', $line->paid_by, -$group->sum('prize_minor')));
        }
        $labels = ['sale'=>'Venta','refund'=>'Anulación','prize'=>'Premio pagado'];
        if ($operation !== 'all') $events = $events->where('type', $labels[$operation]);
        if ($search !== '') $events = $events->filter(fn ($row) => mb_stripos(implode(' ', [$row['bank'], $row['ticket'], $row['type'], $row['user']]), $search) !== false);
        $summary = $banks->map(function ($bank) use ($events, $bankNames) {
            $items = $events->where('bank_id', $bank->id);
            return ['bank'=>$bankNames[$bank->id], 'tickets'=>$items->where('type', 'Venta')->count(), 'sales'=>$items->where('type', 'Venta')->sum('amount'),
                'refunds'=>-$items->where('type', 'Anulación')->sum('amount'), 'paid'=>-$items->where('type', 'Premio pagado')->sum('amount'),
                'balance'=>$items->sum('amount'), 'commission'=>$items->sum('commission')];
        })->filter(fn ($row) => $search === '' || $events->contains('bank', $row['bank']))->values();
        return ['rows'=>$view === 'detail' ? $events->sortBy(fn ($row) => $row['date']->format('Y-m-d H:i:s'))->values() : $summary,
            'totals'=>['Ventas cobradas'=>$events->where('type','Venta')->sum('amount'), 'Anulaciones'=>-$events->where('type','Anulación')->sum('amount'),
                'Premios pagados'=>-$events->where('type','Premio pagado')->sum('amount'), 'Neto de operaciones'=>$events->sum('amount'), 'Comisiones netas'=>$events->sum('commission')]];
    }
}
