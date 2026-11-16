<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Draw extends Model
{
    protected $guarded = [];

    protected $attributes = ['timezone' => 'America/Santo_Domingo'];

    public function displayName(bool $abbreviated = false): string
    {
        return $abbreviated && trim($this->abbreviation ?? '') !== '' ? $this->abbreviation : $this->name;
    }

    protected $casts = ['active' => 'boolean', 'result_count' => 'integer', 'weekdays' => 'array', 'modalities' => 'array', 'exceptions' => 'array'];

    public function lottery()
    {
        return $this->belongsTo(Lottery::class);
    }
}
