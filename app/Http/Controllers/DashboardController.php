<?php

namespace App\Http\Controllers;

use App\Models\{CashSession, Ticket, TicketLine};
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Inertia\Inertia;

class DashboardController extends Controller
{
    public function __invoke(Request $request)
    {
        $request->validate(['period' => 'nullable|in:today,yesterday,week,month']);
        $user = $request->user();
        $bank = $user->accessibleBranches()->with('office')->whereKey($user->active_branch_office_id)->first();
        $today = CarbonImmutable::now('America/Santo_Domingo')->startOfDay();
        $period = $request->input('period', 'today');
        [$from, $to] = match ($period) {
            'yesterday' => [$today->subDay(), $today->subDay()],
            'week' => [$today->subDays(6), $today],
            'month' => [$today->startOfMonth(), $today],
            default => [$today, $today],
        };
        $data = ['period' => $period, 'from' => $from->toDateString(), 'to' => $to->toDateString(),
            'updated_at' => now()->toIso8601String(), 'currency' => $bank?->office->currency ?? 'DOP',
            'sales' => null, 'tickets' => null, 'prizes' => null, 'cash' => null, 'recent' => null];
        if ($bank) {
            abort_if($request->filled('office_id') && (int) $request->office_id !== $bank->office_id, 409);
            abort_if($request->filled('branch_id') && (int) $request->branch_id !== $bank->id, 409);
            $base = Ticket::where('office_id', $bank->office_id)->where('branch_office_id', $bank->id)
                ->whereBetween('business_date', [$from->toDateString(), $to->toDateString()]);
            if ($user->canDo('reports.sales')) {
                $sold = (clone $base)->where('status', 'sold');
                $totals = (clone $sold)->selectRaw('COUNT(*) as tickets, COALESCE(SUM(net_minor),0) as net, COALESCE(SUM(discount_minor),0) as discounts')->first();
                $days = (clone $sold)->selectRaw('business_date, SUM(net_minor) as total')->groupBy('business_date')->pluck('total', 'business_date');
                $previousTo = $from->subDay();
                $previousFrom = $previousTo->subDays((int) $from->diffInDays($to));
                $previous = Ticket::where('office_id', $bank->office_id)->where('branch_office_id', $bank->id)->where('status', 'sold')
                    ->whereBetween('business_date', [$previousFrom->toDateString(), $previousTo->toDateString()])->sum('net_minor');
                $series = [];
                for ($date = $from; $date->lte($to); $date = $date->addDay()) {
                    $series[] = ['date' => $date->toDateString(), 'net_minor' => (int) ($days[$date->toDateString()] ?? 0)];
                }
                $modes = TicketLine::whereHas('ticket', fn ($q) => $q->where('office_id', $bank->office_id)->where('branch_office_id', $bank->id)
                    ->where('status', 'sold')->whereBetween('business_date', [$from->toDateString(), $to->toDateString()]))
                    ->selectRaw('modality, COUNT(*) as plays, SUM(net_minor) as net')->groupBy('modality')->get();
                $weekFrom = $to->subDays(6);
                $weekTo = $to;
                $weekDays = Ticket::where('office_id', $bank->office_id)->where('branch_office_id', $bank->id)->where('status', 'sold')
                    ->whereBetween('business_date', [$weekFrom->toDateString(), $weekTo->toDateString()])
                    ->selectRaw('business_date, COUNT(*) as tickets, SUM(net_minor) as net')->groupBy('business_date')->get()->keyBy('business_date');
                $weeklySeries = [];
                for ($date = $weekFrom; $date->lte($weekTo); $date = $date->addDay()) {
                    $day = $weekDays->get($date->toDateString());
                    $weeklySeries[] = ['date' => $date->toDateString(), 'net_minor' => (int) ($day?->net ?? 0), 'tickets' => (int) ($day?->tickets ?? 0)];
                }
                $data['sales'] = ['net_minor' => (int) $totals->net, 'tickets' => (int) $totals->tickets,
                    'discount_minor' => (int) $totals->discounts, 'previous_minor' => (int) $previous,
                    'weekly' => ['from' => $weekFrom->toDateString(), 'to' => $weekTo->toDateString(), 'today' => $today->toDateString(),
                        'net_minor' => array_sum(array_column($weeklySeries, 'net_minor')), 'tickets' => array_sum(array_column($weeklySeries, 'tickets')), 'series' => $weeklySeries],
                    'series' => $series, 'modalities' => $modes->map(fn ($mode) => ['modality' => $mode->modality, 'plays' => (int) $mode->plays, 'net_minor' => (int) $mode->net])->all()];
            }
            if ($user->canDo('reports.tickets')) {
                $classified = (clone $base)->selectRaw("COUNT(*) as total,
                    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
                    SUM(CASE WHEN status = 'sold' AND EXISTS (SELECT 1 FROM ticket_lines WHERE ticket_lines.ticket_id = tickets.id AND prize_minor > 0) THEN 1 ELSE 0 END) as winners,
                    SUM(CASE WHEN status = 'sold' AND NOT EXISTS (SELECT 1 FROM ticket_lines WHERE ticket_lines.ticket_id = tickets.id AND prize_minor > 0) AND EXISTS (SELECT 1 FROM ticket_lines WHERE ticket_lines.ticket_id = tickets.id AND prize_minor IS NULL) THEN 1 ELSE 0 END) as pending")->first();
                $data['tickets'] = ['total' => (int) $classified->total, 'cancelled' => (int) $classified->cancelled,
                    'winners' => (int) $classified->winners, 'pending' => (int) $classified->pending,
                    'lost' => (int) $classified->total - (int) $classified->cancelled - (int) $classified->winners - (int) $classified->pending];
            }
            if ($user->canDo('reports.winners')) {
                $prizes = TicketLine::whereHas('ticket', fn ($q) => $q->where('office_id', $bank->office_id)->where('branch_office_id', $bank->id)
                    ->where('status', 'sold')->whereBetween('business_date', [$from->toDateString(), $to->toDateString()]))
                    ->where('prize_minor', '>', 0)->selectRaw('COALESCE(SUM(CASE WHEN paid_at IS NULL THEN prize_minor ELSE 0 END),0) as pending, COALESCE(SUM(CASE WHEN paid_at IS NOT NULL THEN prize_minor ELSE 0 END),0) as paid')->first();
                $data['prizes'] = ['pending_minor' => (int) $prizes->pending, 'paid_minor' => (int) $prizes->paid];
            }
            if ($user->canDo('lottery.cash') || $user->canDo('lottery.sell')) {
                $cash = CashSession::with('opener:id,name')->where('office_id', $bank->office_id)->where('branch_office_id', $bank->id)->where('status', 'open')->first();
                $data['cash'] = ['reconciliation_mode'=>app(\App\Services\Lottery\Configuration::class)->reconciliationMode($bank), 'open' => (bool) $cash, 'opened_at' => $cash?->created_at?->toIso8601String(), 'opened_by' => $cash?->opener?->name,
                    'balance_minor' => $cash && $user->canDo('lottery.cash.view_open') ? $cash->balance_minor : null];
            }
            if ($user->canDo('lottery.tickets')) {
                $data['recent'] = (clone $base)->with(['lines:id,ticket_id,prize_minor,paid_at'])->latest('id')->limit(6)->get()
                    ->map(function ($ticket) {
                        $winners = $ticket->lines->where('prize_minor', '>', 0);
                        $state = $ticket->status === 'cancelled' ? 'cancelled' : ($winners->isNotEmpty() ? 'winners' : ($ticket->lines->contains(fn ($line) => $line->prize_minor === null) ? 'pending' : 'lost'));
                        return ['reference' => $ticket->reference, 'created_at' => $ticket->created_at->toIso8601String(),
                            'net_minor' => $ticket->net_minor, 'state' => $state];
                    })->all();
            }
        }
        return $request->wantsJson() ? response()->json(['overview' => $data])->header('Cache-Control', 'private, no-store') : Inertia::render('Dashboard', ['overview' => $data]);
    }
}
