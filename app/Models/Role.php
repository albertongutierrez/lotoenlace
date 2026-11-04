<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Str;

class Role extends Model
{
    use HasFactory;

    protected $fillable = [

        'id_hash',

        'office_id',

        'name',

        'slug',

        'description',

        'is_system',

        'is_active',

    ];

    protected $casts = [

        'is_system' => 'boolean',

        'is_active' => 'boolean',

    ];

    protected static function booted(): void
    {

        static::creating(function (Role $role): void {

            if ($role->id_hash) {

                return;

            }

            do {

                $role->id_hash = Str::random(24);

            } while (static::where('id_hash', $role->id_hash)->exists());

        });

    }

    public function getRouteKeyName(): string
    {

        return 'id_hash';

    }

    public function permissions(): BelongsToMany
    {

        return $this->belongsToMany(Permission::class)->withTimestamps();

    }

    public function office(): BelongsTo
    {

        return $this->belongsTo(Office::class);

    }

    public function users(): BelongsToMany
    {

        return $this->belongsToMany(User::class)->withPivot('office_id')->withTimestamps();

    }
}
