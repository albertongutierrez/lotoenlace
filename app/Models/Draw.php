<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Draw extends Model
{
    protected $guarded = [];

    protected $casts = ['active' => 'boolean', 'result_count' => 'integer', 'weekdays' => 'array', 'modalities' => 'array', 'exceptions' => 'array'];

    public function lottery()
    {
        return $this->belongsTo(Lottery::class);
    }
}
