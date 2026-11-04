<?php
namespace App\Services\Lottery;

use App\Models\User;
use Illuminate\Support\Collection;

final class CashReport
{
    public function build(Collection $sessions, Collection $banks, User $user): Collection
    {
        return $sessions->map(function ($session) use ($banks, $user) {
            $visible = $session->status === 'closed' || $user->canDo('lottery.cash.view_open');
            $detail = ['session' => $session, 'bank' => $banks->firstWhere('id', $session->branch_office_id), 'visible' => $visible];
            if (! $visible) return $detail;
            $movements = $session->movements()->with(['user:id,name', 'ticket:id,code,office_number,gross_minor,discount_minor,net_minor'])->orderBy('id')->get();
            $sales = $movements->where('type', 'sale')->values();
            $cash = $movements->where('payment_method', 'cash');
            $summary = collect(['opening', 'sale', 'refund', 'prize', 'deposit', 'withdrawal'])->mapWithKeys(fn ($type) => [$type => ['count' => $movements->where('type', $type)->count(), 'amount' => $movements->where('type', $type)->sum('amount_minor')]]);
            return [...$detail, 'sales' => $sales, 'refunds' => $movements->where('type', 'refund')->values(),
                'prizes' => $movements->where('type', 'prize')->values(),
                'adjustments' => $movements->whereIn('type', ['deposit', 'withdrawal'])->values(),
                'summary' => $summary, 'gross' => $sales->sum(fn ($m) => $m->ticket?->gross_minor ?? 0),
                'discount' => $sales->sum(fn ($m) => $m->ticket?->discount_minor ?? 0),
                'cash_summary'=>collect(['opening','sale','refund','prize','deposit','withdrawal'])->mapWithKeys(fn ($type)=>[$type=>['count'=>$cash->where('type',$type)->count(),'amount'=>$cash->where('type',$type)->sum('amount_minor')]]),
                'payment_totals'=>$movements->whereIn('type', ['sale','refund'])->groupBy(fn ($m) => in_array($m->payment_method, array_keys(Configuration::PAYMENT_METHODS), true) ? $m->payment_method : $m->payment_method.'|'.$m->payment_method_label)
                    ->map(fn ($items) => ['name'=>$items->first()->payment_method_label,'sales'=>$items->where('type','sale')->sum('amount_minor'),'refunds'=>-$items->where('type','refund')->sum('amount_minor')]),
                'expected' => $cash->sum('amount_minor'),
                'movements' => $movements->where('type', '!=', 'opening')->sortBy(fn ($m) => $m->created_at->format('Y-m-d H:i:s').sprintf('%012d',$m->id))->values(),
                'outflows' => -$cash->where('amount_minor','<',0)->sum('amount_minor')];
        });
    }
}
