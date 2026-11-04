<?php

namespace App\Models;

use App\Notifications\ResetPasswordNotification;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements MustVerifyEmail
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [

        'id_hash',

        'name',

        'email',

        'password',

        'active_branch_office_id',

    ];

    protected $hidden = [

        'password',

        'remember_token',

    ];

    protected $casts = [

        'email_verified_at' => 'datetime',

        'password' => 'hashed',

    ];

    protected static function booted(): void
    {

        static::creating(function (User $user): void {

            if ($user->id_hash) {

                return;

            }

            do {

                $user->id_hash = Str::random(24);

            } while (static::where('id_hash', $user->id_hash)->exists());

        });

    }

    public function getRouteKeyName(): string
    {

        return 'id_hash';

    }

    public function sendPasswordResetNotification($token): void
    {

        $this->notify(new ResetPasswordNotification($token));

    }

    public function activeBranchOffice(): BelongsTo
    {

        return $this->belongsTo(BranchOffice::class, 'active_branch_office_id');

    }

    public function branchOffices(): BelongsToMany
    {

        return $this->belongsToMany(BranchOffice::class)

            ->withPivot('is_default')

            ->withTimestamps();

    }

    public function roles(): BelongsToMany
    {

        return $this->belongsToMany(Role::class)

            ->withPivot('office_id')

            ->withTimestamps();

    }

    public function hasRole(string $slug): bool
    {

        $query = $this->roles()->where('slug', $slug)->where('is_active', true);

        if ($slug !== 'super_admin') {

            $officeId = $this->activeOfficeId();

            if (! $officeId) {

                return false;

            }

            $query->wherePivot('office_id', $officeId);

        }

        return $query->exists();

    }

    public function isSuperAdmin(): bool
    {

        return $this->hasRole('super_admin');

    }

    public function isAdmin(): bool
    {

        return $this->hasRole('admin') || $this->isSuperAdmin();

    }

    public function canViewCompanyData(): bool
    {

        return $this->canDo('company.data.view_all');

    }

    public function canDo(string $permissionSlug): bool
    {

        if ($this->isSuperAdmin()) {

            return true;

        }

        $officeId = $this->activeOfficeId();

        if (! $officeId) {

            return false;

        }

        return $this->roles()

            ->where('is_active', true)

            ->wherePivot('office_id', $officeId)

            ->whereHas('permissions', fn ($query) => $query->where('slug', $permissionSlug))

            ->exists();

    }

    public function permissionSlugsForActiveOffice(): array
    {

        if ($this->isSuperAdmin()) {

            return Permission::query()->pluck('slug')->all();

        }

        $officeId = $this->activeOfficeId();

        if (! $officeId) {

            return [];

        }

        return $this->roles()

            ->where('is_active', true)

            ->wherePivot('office_id', $officeId)

            ->with('permissions:id,slug')

            ->get()

            ->flatMap(fn (Role $role) => $role->permissions->pluck('slug'))

            ->unique()

            ->values()

            ->all();

    }

    public function officeIdsForRole(string $slug): array
    {

        if ($slug === 'super_admin' && $this->isSuperAdmin()) {

            return [];

        }

        return $this->roles()

            ->where('slug', $slug)

            ->where('is_active', true)

            ->pluck('role_user.office_id')

            ->filter()

            ->unique()

            ->values()

            ->map(fn ($officeId) => (int) $officeId)

            ->all();

    }

    public function accessibleBranches(): Builder
    {

        $query = BranchOffice::query()->where('is_active', true)->whereHas('office', fn ($q) => $q->where('is_active', true));

        if ($this->isSuperAdmin()) {

            return $query;

        }

        $adminOffices = $this->officeIdsForRole('admin');

        return $query->where(function ($q) use ($adminOffices) {

            $q->whereIn('id', $this->branchOffices()->select('branch_offices.id'))->orWhereIn('office_id', $adminOffices);

        });

    }

    private function activeOfficeId(): ?int
    {

        $activeBranch = $this->relationLoaded('activeBranchOffice')

            ? $this->activeBranchOffice

            : $this->activeBranchOffice()->first(['id', 'office_id']);

        return $activeBranch?->office_id ? (int) $activeBranch->office_id : null;

    }
}
