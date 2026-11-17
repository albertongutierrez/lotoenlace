<?php

namespace App\Services\Lottery;

use App\Models\BetLimit;
use App\Models\BranchOffice;
use App\Models\Ticket;
use App\Models\TicketLine;
use Illuminate\Validation\ValidationException;

class LimitEngine
{
    public function __construct(private Configuration $configuration) {}

    public function available(BranchOffice $branch, array $line, array $pending = []): ?int
    {
        $settings = $this->configuration->effective($branch);
        $date = $this->configuration->clock()->toDateString();
        $tickets = Ticket::where('office_id', $branch->office_id)->where('business_date', $date)->where('status', 'sold');
        $remaining = [];
        if ($settings['consortium_limit_minor'] !== null) {
            $remaining[] = $settings['consortium_limit_minor'] - (clone $tickets)->sum('gross_minor') - array_sum(array_column($pending, 'amount_minor'));
        }
        if ($settings['daily_limit_minor'] !== null) {
            $remaining[] = $settings['daily_limit_minor'] - (clone $tickets)->where('branch_office_id', $branch->id)->sum('gross_minor') - array_sum(array_column($pending, 'amount_minor'));
        }
        $rules = BetLimit::where('office_id', $branch->office_id)->where('active', true)
            ->where(fn ($q) => $q->whereNull('branch_office_id')->orWhere('branch_office_id', $branch->id))
            ->where(fn ($q) => $q->whereNull('starts_on')->orWhere('starts_on', '<=', $date))
            ->where(fn ($q) => $q->whereNull('ends_on')->orWhere('ends_on', '>=', $date))->get();
        foreach ($rules as $rule) {
            if (! $this->matches($rule, $line)) {
                continue;
            }
            $previous = TicketLine::whereHas('ticket', function ($q) use ($branch, $date, $rule) {
                $q->where('office_id', $branch->office_id)->where('business_date', $date)->where('status', 'sold');
                if ($rule->branch_office_id) {
                    $q->where('branch_office_id', $rule->branch_office_id);
                }
            })->get();
            $consumed = 0;
            foreach ([...$previous->toArray(), ...$pending] as $other) {
                if ($this->matches($rule, $other) && ($rule->aggregation === 'shared' || $this->key($other) === $this->key($line))) {
                    $consumed += $other['amount_minor'];
                }
            }
            $remaining[] = $rule->amount_minor - $consumed;
        }

        return $remaining ? max(0, min($remaining)) : null;
    }

    public function batch(BranchOffice $branch, array $lines, array $pending = []): array
    {
        if (! $lines) return [];
        $settings = $this->configuration->effective($branch);
        $date = $this->configuration->clock()->toDateString();
        $tickets = Ticket::where('office_id', $branch->office_id)->where('business_date', $date)->where('status', 'sold');
        $consortiumSold = $settings['consortium_limit_minor'] !== null ? (clone $tickets)->sum('gross_minor') : 0;
        $branchSold = $settings['daily_limit_minor'] !== null ? (clone $tickets)->where('branch_office_id', $branch->id)->sum('gross_minor') : 0;
        $rules = BetLimit::where('office_id', $branch->office_id)->where('active', true)
            ->where(fn ($q) => $q->whereNull('branch_office_id')->orWhere('branch_office_id', $branch->id))
            ->where(fn ($q) => $q->whereNull('starts_on')->orWhere('starts_on', '<=', $date))
            ->where(fn ($q) => $q->whereNull('ends_on')->orWhere('ends_on', '>=', $date))->get();
        $consumed = [];
        foreach ($rules as $rule) {
            $previous = TicketLine::whereHas('ticket', function ($q) use ($branch, $date, $rule) {
                $q->where('office_id', $branch->office_id)->where('business_date', $date)->where('status', 'sold');
                if ($rule->branch_office_id) $q->where('branch_office_id', $rule->branch_office_id);
            })->get()->toArray();
            $consumed[$rule->id] = ['total' => 0, 'draws' => []];
            foreach ([...$previous, ...$pending] as $other) {
                if (! $this->matches($rule, $other)) continue;
                $key = $this->key($other);
                $consumed[$rule->id]['total'] += $other['amount_minor'];
                $consumed[$rule->id]['draws'][$key] = ($consumed[$rule->id]['draws'][$key] ?? 0) + $other['amount_minor'];
            }
        }
        $pendingTotal = array_sum(array_column($pending, 'amount_minor'));
        $results = [];
        foreach ($lines as $line) {
            $remaining = [];
            if ($settings['consortium_limit_minor'] !== null) $remaining[] = $settings['consortium_limit_minor'] - $consortiumSold - $pendingTotal;
            if ($settings['daily_limit_minor'] !== null) $remaining[] = $settings['daily_limit_minor'] - $branchSold - $pendingTotal;
            $matching = $rules->filter(fn ($rule) => $this->matches($rule, $line));
            foreach ($matching as $rule) {
                $used = $rule->aggregation === 'shared' ? $consumed[$rule->id]['total'] : ($consumed[$rule->id]['draws'][$this->key($line)] ?? 0);
                $remaining[] = $rule->amount_minor - $used;
            }
            $available = $remaining ? max(0, min($remaining)) : null;
            $accepted = $available === null || $line['amount_minor'] <= $available;
            $results[] = ['available_minor' => $available, 'accepted' => $accepted, 'error' => $accepted ? null : 'Cupo insuficiente'];
            if (! $accepted) continue;
            $pendingTotal += $line['amount_minor'];
            foreach ($matching as $rule) {
                $key = $this->key($line);
                $consumed[$rule->id]['total'] += $line['amount_minor'];
                $consumed[$rule->id]['draws'][$key] = ($consumed[$rule->id]['draws'][$key] ?? 0) + $line['amount_minor'];
            }
        }
        return $results;
    }

    public function check(BranchOffice $branch, array $lines): void
    {
        $pending = [];
        foreach ($lines as $line) {
            $remaining = $this->available($branch, $line, $pending);
            if ($remaining !== null && $line['amount_minor'] > $remaining) {
                throw ValidationException::withMessages(['sale' => "La jugada {$line['numbers']} supera el disponible: ".number_format($remaining / 100, 2).'.']);
            }
            $pending[] = $line;
        }
    }

    private function key(array $line): string
    {
        return $line['draw_id'].'-'.($line['second_draw_id'] ?? 0);
    }

    private function matches(BetLimit $rule, array $line): bool
    {
        if ($rule->modality !== 'all' && $rule->modality !== $line['modality']) {
            return false;
        }
        if ($rule->category !== 'all' && ! array_key_exists($rule->category, $line['rules']['payouts'] ?? [])) {
            return false;
        }
        if ($rule->draw_ids && ! array_intersect($rule->draw_ids, array_filter([$line['draw_id'], $line['second_draw_id'] ?? null]))) {
            return false;
        }
        if ($rule->pairs && ! in_array($this->key($line), $rule->pairs, true)) {
            return false;
        }
        $numbers = explode('-', $line['numbers']);
        if ($rule->match_type === 'contains') {
            return in_array($rule->numbers, $numbers, true);
        }
        if ($rule->match_type === 'all') {
            return true;
        }
        $target = explode('-', $rule->numbers ?? '');
        // Restrictions on unordered wagers cannot be bypassed by reversing input.
        if (! ($line['rules']['ordered'] ?? false)) {
            sort($numbers);
            sort($target);
        }

        return $numbers === $target;
    }
}
