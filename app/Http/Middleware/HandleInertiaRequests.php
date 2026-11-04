<?php

namespace App\Http\Middleware;

use App\Models\BranchOffice;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    protected $rootView = 'app';

    public function share(Request $request): array
    {

        $user = $request->user();

        $branches = $user?->accessibleBranches()->with('office')->orderBy('name')->get() ?? collect();

        $active = $branches->firstWhere('id', $user?->active_branch_office_id);

        return [

            ...parent::share($request),

            'appName' => config('app.name'),

            'auth' => [

                'user' => $user ? [

                    'id' => $user->id, 'name' => $user->name, 'email' => $user->email,

                    'email_verified_at' => $user->email_verified_at,

                    'permissions' => $active || $user->isSuperAdmin() ? $user->permissionSlugsForActiveOffice() : [],

                    'is_admin' => $user->isAdmin(), 'is_super_admin' => $user->isSuperAdmin(),

                ] : null,

                'activeBranchOffice' => $active ? $this->branch($active) : null,

                'availableBranchOffices' => $branches->map(fn ($branch) => $this->branch($branch))->all(),

            ],

            'flash' => ['success' => fn () => $request->session()->get('success')],

        ];

    }

    private function branch(BranchOffice $branch): array
    {

        $office = $branch->office;

        return [

            'id' => $branch->id, 'id_hash' => $branch->id_hash, 'name' => $branch->name, 'code' => $branch->code,
            'reconciliation_mode' => app(\App\Services\Lottery\Configuration::class)->reconciliationMode($branch),

            'office_id_hash' => $office->id_hash, 'office_name' => $office->name, 'office_slogan' => $office->slogan,

            'office_logo_url' => $office->logo_path ? Storage::url($office->logo_path) : null,

            'office_compact_logo_url' => ($path = $office->compact_logo_path ?: $office->logo_path) ? Storage::url($path) : null,

        ];

    }
}
