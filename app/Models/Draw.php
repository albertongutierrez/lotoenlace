<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Draw extends Model
{
    protected $guarded = [];

    protected $attributes = ['timezone' => null];

    protected $appends = ['timezone_override'];

    // Keep the public timezone effective for sales, result imports and existing clients.
    public function getTimezoneAttribute(?string $value): string
    {
        return $value ?? $this->lottery?->timezone ?? 'America/Santo_Domingo';
    }

    public function getTimezoneOverrideAttribute(): ?string
    {
        return $this->attributes['timezone'] ?? null;
    }

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
