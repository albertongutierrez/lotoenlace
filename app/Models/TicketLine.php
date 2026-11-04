<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TicketLine extends Model
{
    protected $guarded = [];

    protected $casts = ['rules' => 'array', 'closes_at' => 'datetime', 'paid_at' => 'datetime'];

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
