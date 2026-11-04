<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BetLimit extends Model
{
    use \App\Models\Concerns\HasOfficeNumber;

    protected $guarded = [];

    protected $casts = ['active' => 'boolean', 'draw_ids' => 'array', 'pairs' => 'array'];
}
