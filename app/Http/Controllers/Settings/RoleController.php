<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\StoreRoleRequest;
use App\Http\Requests\Settings\UpdateRoleRequest;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class RoleController extends Controller
{
    public function index(Request $request): Response
    {

        $search = $request->string('search')->toString();

        $status = $request->string('status')->toString();

        $roles = Role::query()

            ->with('office:id,name')

            ->withCount(['permissions'])

            ->withCount(['users' => fn ($query) => $this->scopeRoleUsersCount($query)])

            ->when($request->user()?->isSuperAdmin(), fn ($query) => $query, fn ($query) => $this->scopeManageableRoles($query, $request->user()))

            ->when($search !== '', function ($query) use ($search) {

                $query->where(function ($query) use ($search) {

                    $query->where('name', 'like', "%{$search}%")

                        ->orWhere('slug', 'like', "%{$search}%")

                        ->orWhere('description', 'like', "%{$search}%");

                });

            })

            ->when($status === 'active', fn ($query) => $query->where('is_active', true))

            ->when($status === 'inactive', fn ($query) => $query->where('is_active', false))

            ->orderByDesc('is_system')

            ->orderBy('name')

            ->paginate(10)

            ->through(fn (Role $role) => $this->serializeRole($role))

            ->withQueryString();

        return Inertia::render('Settings/Roles/Index', [

            'roles' => $roles,

            'filters' => [

                'search' => $search,

                'status' => $status,

            ],

        ]);

    }

    public function create(): Response
    {

        return Inertia::render('Settings/Roles/Create', [

            'permissions' => $this->permissionOptions(),

        ]);

    }

    public function store(StoreRoleRequest $request): RedirectResponse
    {

        $data = $request->validated();

        $this->ensurePermissions($data['permission_ids']);

        $activeBranch = $request->user()?->activeBranchOffice;
        $contextOffice = $request->attributes->get('consortium_office');

        abort_unless($contextOffice || $activeBranch?->office_id, 403, 'Selecciona una consorcio activa para crear el rol.');

        abort_if(

            in_array(Str::slug($data['slug']), ['super-admin', 'admin', 'usuario'], true),

            403,

            'No puedes crear el rol super administrador.'

        );

        $role = Role::create([

            'office_id' => $contextOffice?->id ?? $activeBranch->office_id,

            'name' => $data['name'],

            'slug' => Str::slug($data['slug']),

            'description' => $data['description'] ?? null,

            'is_system' => false,

            'is_active' => $request->boolean('is_active', true),

        ]);

        $role->permissions()->sync($data['permission_ids']);

        return to_route('settings.roles.index')->with('success', 'Rol creado correctamente.');

    }

    public function edit(Role $role): Response
    {

        $this->ensureCanManageRole(request(), $role);

        $role->load('permissions:id,name,slug,module');

        return Inertia::render('Settings/Roles/Edit', [

            'role' => [

                ...$this->serializeRole($role),

                'permission_ids' => $role->permissions->pluck('id')->values()->all(),

            ],

            'permissions' => $this->permissionOptions(),

        ]);

    }

    public function update(UpdateRoleRequest $request, Role $role): RedirectResponse
    {

        $data = $request->validated();

        $this->ensureCanManageRole($request, $role);

        $this->ensurePermissions($data['permission_ids']);

        abort_if(! $role->is_system && $data['slug'] !== $role->slug && in_array(Str::slug($data['slug']), ['super-admin', 'admin', 'usuario'], true), 403);

        $role->update([

            'name' => $data['name'],

            'slug' => $role->is_system ? $role->slug : Str::slug($data['slug']),

            'description' => $data['description'] ?? null,

            'is_active' => $role->is_system ? true : $request->boolean('is_active'),

        ]);

        $role->permissions()->sync($data['permission_ids']);

        return to_route('settings.roles.index')->with('success', 'Rol actualizado correctamente.');

    }

    public function destroy(Role $role): RedirectResponse
    {

        $this->ensureCanManageRole(request(), $role);

        if ($role->is_system) {

            return back()->withErrors(['role' => 'No puedes eliminar un rol del sistema.']);

        }

        if ($role->users()->exists()) {

            return back()->withErrors(['role' => 'No puedes eliminar un rol que tiene usuarios asignados.']);

        }

        $role->delete();

        return to_route('settings.roles.index')->with('success', 'Rol eliminado correctamente.');

    }

    private function permissionOptions(): array
    {

        return Permission::query()

            ->when(! request()->user()->isSuperAdmin(), fn ($query) => $query->whereIn('slug', request()->user()->permissionSlugsForActiveOffice()))

            ->orderBy('module')

            ->orderBy('name')

            ->get(['id', 'id_hash', 'module', 'name', 'slug', 'description'])

            ->groupBy(fn (Permission $permission) => $this->permissionGroupModule($permission->module))

            ->map(fn ($permissions, string $module) => [

                'module' => $module,

                'label' => $this->moduleLabel($module),

                'permissions' => $permissions

                    ->map(fn (Permission $permission) => [

                        'id' => $permission->id,

                        'id_hash' => $permission->id_hash,

                        'name' => $permission->name,

                        'slug' => $permission->slug,

                        'description' => $permission->description,

                    ])

                    ->values()

                    ->all(),

            ])

            ->values()

            ->all();

    }

    private function permissionGroupModule(string $module): string
    {

        if (str_starts_with($module, 'reports.')) {

            return 'reports';

        }

        return $module;

    }

    private function serializeRole(Role $role): array
    {

        return [

            'id' => $role->id,

            'id_hash' => $role->id_hash,

            'office_id' => $role->office_id,

            'office_name' => $role->office?->name,

            'name' => $role->name,

            'slug' => $role->slug,

            'description' => $role->description,

            'is_system' => $role->is_system,

            'is_active' => $role->is_active,

            'users_count' => $role->users_count ?? $role->users()->count(),

            'permissions_count' => $role->permissions_count ?? $role->permissions()->count(),

            'can_manage' => $role->slug !== 'super_admin',

        ];

    }

    private function moduleLabel(string $module): string
    {

        if ($module === 'reports') {

            return 'Reportes';

        }

        return Str::of($module)

            ->replace(['.', '-'], ' ')

            ->title()

            ->toString();

    }

    private function ensureCanManageRole(Request $request, Role $role): void
    {

        abort_if(

            $role->slug === 'super_admin',

            403,

            'El rol super administrador es fijo y no se puede editar.'

        );

        if ($request->user()?->isSuperAdmin()) {

            return;

        }

        abort_if($role->is_system || ! $role->office_id, 403, 'No puedes modificar roles globales del sistema.');

        abort_unless(

            in_array((int) $role->office_id, $this->managedOfficeIds($request->user()), true),

            403,

            'No puedes administrar roles fuera de tu consorcio.'

        );

    }

    private function scopeManageableRoles($query, ?User $user): void
    {

        $query->where(function ($query) use ($user) {

            $query->where('slug', '!=', 'super_admin')

                ->where(function ($query) use ($user) {

                    $query->where('is_system', true)

                        ->orWhereIn('office_id', $this->managedOfficeIds($user));

                });

        });

    }

    private function scopeRoleUsersCount($query): void
    {

        $user = request()->user();

        if ($user?->isSuperAdmin()) {

            return;

        }

        $query->wherePivotIn('office_id', $this->managedOfficeIds($user));

    }

    private function ensurePermissions(array $ids): void
    {

        $user = request()->user();

        if ($user->isSuperAdmin()) {

            return;

        }

        abort_if(Permission::whereIn('id', $ids)->whereNotIn('slug', $user->permissionSlugsForActiveOffice())->exists(), 403, 'No puedes delegar permisos que no tienes.');

    }

    private function managedOfficeIds(?User $user): array
    {

        if (! $user) {

            return [];

        }

        if ($user->isSuperAdmin()) {

            return [];

        }

        $officeIds = collect($user->officeIdsForRole('admin'));

        if ($officeIds->isEmpty() && $user->activeBranchOffice?->office_id) {

            $officeIds->push($user->activeBranchOffice->office_id);

        }

        return $officeIds

            ->filter()

            ->map(fn ($officeId) => (int) $officeId)

            ->unique()

            ->values()

            ->all();

    }
}
