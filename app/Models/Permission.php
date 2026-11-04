<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Str;

class Permission extends Model
{
    use HasFactory;

    protected $fillable = [

        'id_hash',

        'name',

        'slug',

        'module',

        'description',

    ];

    protected static function booted(): void
    {

        static::creating(function (Permission $permission): void {

            if ($permission->id_hash) {

                return;

            }

            do {

                $permission->id_hash = Str::random(24);

            } while (static::where('id_hash', $permission->id_hash)->exists());

        });

    }

    public function roles(): BelongsToMany
    {

        return $this->belongsToMany(Role::class)->withTimestamps();

    }
}
