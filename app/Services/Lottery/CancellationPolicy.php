<?php

namespace App\Services\Lottery;

use App\Models\{DrawResult, Ticket};
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Collection;

class CancellationPolicy
{
    private function published(Collection $tickets): array
    {
        $ids = $tickets->flatMap(fn ($ticket) => $ticket->lines->flatMap(fn ($line) => [$line->draw_id, $line->second_draw_id]))->filter()->unique();
        if ($ids->isEmpty()) return [];
        return DrawResult::whereIn('draw_id', $ids)->whereIn('business_date', $tickets->pluck('business_date')->unique())
            ->get(['draw_id', 'business_date'])->mapWithKeys(fn ($result) => [$result->business_date.':'.$result->draw_id => true])->all();
    }

    public function annotate(Collection $tickets): void
    {
        $tickets->loadMissing('lines');
        $published = $this->published($tickets);
        $now = now();
        foreach ($tickets as $ticket) $ticket->setAttribute('cancellation', $this->state($ticket, $published, $now));
    }

    public function state(Ticket $ticket, ?array $published = null, ?CarbonInterface $now = null): array
    {
        $ticket->loadMissing('lines');
        $now ??= now();
        $published ??= $this->published(new Collection([$ticket]));
        $expires = $ticket->created_at->copy()->addMinutes((int) ($ticket->settings_snapshot['cancel_minutes'] ?? Configuration::DEFAULTS['cancel_minutes']));
        foreach ($ticket->lines as $line) if ($line->closes_at && $line->closes_at->lt($expires)) $expires = $line->closes_at->copy();
        $reason = null;
        if ($ticket->status !== 'sold') $reason = 'El ticket ya fue anulado.';
        elseif ($ticket->lines->contains(fn ($line) => $line->paid_at !== null)) $reason = 'El ticket tiene premios pagados.';
        elseif ($ticket->lines->contains(fn ($line) => $line->prize_minor !== null
            || isset($published[$ticket->business_date.':'.$line->draw_id])
            || ($line->second_draw_id && isset($published[$ticket->business_date.':'.$line->second_draw_id])))) $reason = 'Ya se publicó un resultado de este ticket.';
        elseif ($ticket->lines->contains(fn ($line) => $line->closes_at && $line->closes_at->lte($now))) $reason = 'Un sorteo del ticket ya cerró.';
        elseif ($now->gte($expires)) $reason = 'Venció el plazo de cancelación.';
        return ['allowed' => $reason === null, 'reason' => $reason, 'expires_at' => $expires->toIso8601String(), 'checked_at' => $now->toIso8601String()];
    }
}
