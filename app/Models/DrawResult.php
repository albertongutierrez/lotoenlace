<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DrawResult extends Model
{
    protected $guarded = [];

    protected $casts = ['numbers' => 'array'];
}
