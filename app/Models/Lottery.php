<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Lottery extends Model
{
    protected $guarded = [];

    protected $attributes = ['timezone' => 'America/Santo_Domingo'];

    protected $casts = ['active' => 'boolean'];

    public function draws()
    {
        return $this->hasMany(Draw::class);
    }
}
