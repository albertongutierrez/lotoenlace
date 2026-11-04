<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Office extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [

        'lottery_settings',

        'currency',

        'id_hash',

        'name',

        'slogan',

        'legal_name',

        'tax_id',

        'phone',

        'email',

        'address',

        'logo_path',

        'compact_logo_path',

        'show_print_company_details',

        'is_active',

    ];

    protected $casts = [

        'lottery_settings' => 'array',

        'show_print_company_details' => 'boolean',

        'is_active' => 'boolean',

    ];

    protected static function booted(): void
    {

        static::created(fn (Office $office) => app(\App\Services\ConsortiumRoles::class)->initialize($office));

        static::creating(function (Office $office) {

            if ($office->id_hash) {

                return;

            }

            do {

                $hash = Str::random(24);

            } while (self::withTrashed()->where('id_hash', $hash)->exists());

            $office->id_hash = $hash;

        });

    }

    public function getRouteKeyName(): string
    {

        return 'id_hash';

    }

    public function branchOffices(): HasMany
    {

        return $this->hasMany(BranchOffice::class);

    }
}
