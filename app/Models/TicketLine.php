<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TicketLine extends Model
{
    protected $guarded = [];

    protected $casts = ['rules' => 'array', 'closes_at' => 'datetime', 'paid_at' => 'datetime'];

    public function scopeForDrawDate($query, int $drawId, string $date)
    {
        return $query->where(function ($query) use ($drawId, $date) {
            foreach (['draw_id' => 'draw_date', 'second_draw_id' => 'second_draw_date'] as $idColumn => $dateColumn) {
                $query->orWhere(fn ($side) => $side->where($idColumn, $drawId)->where(fn ($day) => $day->where($dateColumn, $date)
                    ->orWhere(fn ($legacy) => $legacy->whereNull($dateColumn)->whereHas('ticket', fn ($ticket) => $ticket->where('business_date', $date)))));
            }
        });
    }

    public function draw()
    {
        return $this->belongsTo(Draw::class);
    }

    public function secondDraw()
    {
        return $this->belongsTo(Draw::class, 'second_draw_id');
    }

    public function ticket()
    {
        return $this->belongsTo(Ticket::class);
    }
}
