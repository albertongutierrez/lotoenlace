<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Lottery extends Model
{
    protected $guarded = [];

    protected $casts = ['active' => 'boolean'];

    public function draws()
    {
        return $this->hasMany(Draw::class);
    }
}
