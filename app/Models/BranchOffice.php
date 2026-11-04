<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class BranchOffice extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [

        'lottery_settings',

        'id_hash',

        'office_id',

        'name',

        'code',

        'phone',

        'mobile_phone',

        'email',

        'address',

        'is_main',

        'is_active',

    ];

    protected $casts = [

        'lottery_settings' => 'array',

        'is_main' => 'boolean',

        'is_active' => 'boolean',

    ];

    protected static function booted(): void
    {

        static::creating(function (BranchOffice $branchOffice) {

            if ($branchOffice->id_hash) {

                return;

            }

            do {

                $hash = Str::random(24);

            } while (self::withTrashed()->where('id_hash', $hash)->exists());

            $branchOffice->id_hash = $hash;

        });

    }

    public function getRouteKeyName(): string
    {

        return 'id_hash';

    }

    public function office(): BelongsTo
    {

        return $this->belongsTo(Office::class);

    }

    public function users(): BelongsToMany
    {

        return $this->belongsToMany(User::class)

            ->withPivot('is_default')

            ->withTimestamps();

    }
}
