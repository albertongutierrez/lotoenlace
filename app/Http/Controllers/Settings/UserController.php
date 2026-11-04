<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\StoreUserRequest;
use App\Http\Requests\Settings\UpdateUserRequest;
use App\Models\BranchOffice;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;
use Inertia\Response;

class UserController extends Controller
{
    public function index(Request $request): Response
    {

        $search = $request->string('search')->toString();

        $roleId = $request->integer('role_id');

        $branchOfficeId = $request->integer('branch_office_id');

        $users = User::query()

            ->with(['roles:id,name,slug', 'activeBranchOffice:id,name,code', 'branchOffices:id,name,code'])

            ->when(! $request->user()?->isSuperAdmin(), function ($query) use ($request) {

                $query->whereDoesntHave('roles', fn ($roleQuery) => $roleQuery->where('slug', 'super_admin'));

                if ($request->user()?->hasRole('admin')) {

                    $query->whereHas('branchOffices', fn ($branchQuery) => $branchQuery->whereIn('branch_offices.office_id', $this->managedOfficeIds($request->user())));

                    return;

                }

                $query->whereKey($request->user()?->id);

            })

            ->when($roleId > 0, fn ($query) => $query->whereHas('roles', fn ($roleQuery) => $roleQuery->whereKey($roleId)))

            ->when($branchOfficeId > 0, fn ($query) => $query->whereHas('branchOffices', fn ($branchQuery) => $branchQuery->whereKey($branchOfficeId)))

            ->when($search !== '', function ($query) use ($search) {

                $query->where(function ($query) use ($search) {

                    $query->where('name', 'like', "%{$search}%")

                        ->orWhere('email', 'like', "%{$search}%")

                        ->orWhereHas('roles', fn ($roleQuery) => $roleQuery->where('name', 'like', "%{$search}%"))

                        ->orWhereHas('branchOffices', fn ($branchQuery) => $branchQuery->where('name', 'like', "%{$search}%"));

                });

            })

            ->latest()

            ->paginate(10)

            ->through(fn (User $user) => $this->serializeUser($user))

            ->withQueryString();

        return Inertia::render('Settings/Users/Index', [

            'users' => $users,

            'options' => $this->formOptions(),

            'filters' => [

                'search' => $search,

                'role_id' => $roleId ?: '',

                'branch_office_id' => $branchOfficeId ?: '',

            ],

        ]);

    }

    public function create(): Response
    {

        return Inertia::render('Settings/Users/Create', [

            'options' => $this->formOptions(),

        ]);

    }

    public function store(StoreUserRequest $request): RedirectResponse
    {

        $data = $request->validated();

        $this->ensureManageableSelection($request, $data);

        DB::transaction(function () use ($data): void {

            $user = User::create([

                'name' => $data['name'],

                'email' => mb_strtolower($data['email']),

                'password' => Hash::make($data['password']),

                'active_branch_office_id' => $data['default_branch_office_id'],

            ]);

            $this->syncBranchOffices($user, $data['branch_office_ids'], (int) $data['default_branch_office_id']);

            $this->syncRolesForOffices($user, $data['role_ids'], $data['branch_office_ids']);

        });

        return to_route('settings.users.index')->with('success', 'Usuario creado correctamente.');

    }

    public function edit(User $user): Response
    {

        $this->ensureCanManageUser(request(), $user);

        $user->load(['roles:id,name,slug', 'activeBranchOffice:id,name,code', 'branchOffices:id,name,code']);

        return Inertia::render('Settings/Users/Edit', [

            'managedUser' => $this->serializeUser($user),

            'options' => $this->formOptions(),

        ]);

    }

    public function update(UpdateUserRequest $request, User $user): RedirectResponse
    {

        $data = $request->validated();

        $this->ensureCanManageUser($request, $user);

        $this->ensureManageableSelection($request, $data);

        if ($user->isSuperAdmin() && User::whereHas('roles', fn ($q) => $q->where('slug', 'super_admin'))->count() === 1) {

            abort_unless(Role::whereIn('id', $data['role_ids'])->where('slug', 'super_admin')->exists(), 422, 'No puedes quitar el ultimo super administrador.');

        }

        DB::transaction(function () use ($data, $user): void {

            $payload = [

                'name' => $data['name'],

                'email' => mb_strtolower($data['email']),

                'active_branch_office_id' => $data['default_branch_office_id'],

            ];

            if (! empty($data['password'])) {

                $payload['password'] = Hash::make($data['password']);

            }

            $user->update($payload);

            $this->syncBranchOffices($user, $data['branch_office_ids'], (int) $data['default_branch_office_id']);

            $this->syncRolesForOffices($user, $data['role_ids'], $data['branch_office_ids']);

        });

        return to_route('settings.users.index')->with('success', 'Usuario actualizado correctamente.');

    }

    public function destroy(Request $request, User $user): RedirectResponse
    {

        $this->ensureCanManageUser($request, $user);

        if ($request->user()?->is($user)) {

            return back()->withErrors(['user' => 'No puedes eliminar tu propio usuario.']);

        }

        abort_if($user->isSuperAdmin() && User::whereHas('roles', fn ($q) => $q->where('slug', 'super_admin'))->count() === 1, 422, 'No puedes eliminar el ultimo super administrador.');

        $user->delete();

        return to_route('settings.users.index')->with('success', 'Usuario eliminado correctamente.');

    }

    private function syncBranchOffices(User $user, array $branchOfficeIds, int $defaultBranchOfficeId): void
    {

        $syncPayload = collect($branchOfficeIds)

            ->unique()

            ->mapWithKeys(fn ($branchOfficeId) => [

                (int) $branchOfficeId => ['is_default' => (int) $branchOfficeId === $defaultBranchOfficeId],

            ])

            ->all();

        $user->branchOffices()->sync($syncPayload);

    }

    private function syncRolesForOffices(User $user, array $roleIds, array $branchOfficeIds): void
    {

        $roles = Role::query()

            ->whereIn('id', $roleIds)

            ->get(['id', 'office_id', 'slug', 'is_system']);

        $officeIds = BranchOffice::query()

            ->whereIn('id', $branchOfficeIds)

            ->pluck('office_id')

            ->filter()

            ->unique()

            ->values();

        DB::table('role_user')->where('user_id', $user->id)->delete();

        $now = now();

        $rows = [];

        foreach ($roles as $role) {

            if ($role->slug === 'super_admin') {

                $assignedRoleId = $role->is_system
                    ? Role::where('office_id', $officeId)->where('slug', $role->slug)->firstOrFail()->id
                    : $role->id;

                $rows[] = [

                    'role_id' => $assignedRoleId,

                    'user_id' => $user->id,

                    'office_id' => null,

                    'created_at' => $now,

                    'updated_at' => $now,

                ];

                continue;

            }

            foreach ($officeIds as $officeId) {

                if (! $role->is_system && (int) $role->office_id !== (int) $officeId) {

                    continue;

                }

                $assignedRoleId = $role->is_system
                    ? Role::where('office_id', $officeId)->where('slug', $role->slug)->firstOrFail()->id
                    : $role->id;

                $rows[] = [

                    'role_id' => $assignedRoleId,

                    'user_id' => $user->id,

                    'office_id' => (int) $officeId,

                    'created_at' => $now,

                    'updated_at' => $now,

                ];

            }

        }

        if ($rows !== []) {

            DB::table('role_user')->insert($rows);

        }

    }

    private function formOptions(): array
    {

        $authUser = request()->user();

        $branchOfficeIds = $this->manageableBranchOfficeIds($authUser);

        return [

            'roles' => Role::query()

                ->where('is_active', true)
                ->where(fn ($q) => $q->whereNotNull('office_id')->orWhere('slug', 'super_admin'))

                ->when($authUser?->isSuperAdmin(), fn ($query) => $query, function ($query) use ($authUser) {

                    $query->where('slug', '!=', 'super_admin')

                        ->where(function ($query) use ($authUser) {

                            $query->where('is_system', true)

                                ->orWhereIn('office_id', $this->managedOfficeIds($authUser));

                        });

                })

                ->orderBy('name')

                ->get(['id', 'office_id', 'name', 'slug', 'description', 'is_system'])

                ->map(fn (Role $role) => [

                    'id' => $role->id,

                    'office_id' => $role->office_id,

                    'name' => $role->name,

                    'slug' => $role->slug,

                    'description' => $role->description,

                ])

                ->all(),

            'branchOffices' => BranchOffice::query()

                ->with('office:id,name')

                ->where('is_active', true)

                ->when(! $authUser?->isSuperAdmin(), fn ($query) => $query->whereIn('id', $branchOfficeIds))

                ->orderBy('name')

                ->get(['id', 'id_hash', 'office_id', 'name', 'code'])

                ->map(fn (BranchOffice $branchOffice) => [

                    'id' => $branchOffice->id,

                    'id_hash' => $branchOffice->id_hash,

                    'name' => $branchOffice->name,

                    'code' => $branchOffice->code,

                    'office_name' => $branchOffice->office?->name,

                ])

                ->all(),

        ];

    }

    private function serializeUser(User $user): array
    {

        return [

            'id' => $user->id,

            'id_hash' => $user->id_hash,

            'name' => $user->name,

            'email' => $user->email,

            'active_branch_office_id' => $user->active_branch_office_id,

            'active_branch_office_name' => $user->activeBranchOffice?->name,

            'roles' => $user->roles

                ->unique('id')

                ->map(fn (Role $role) => [

                    'id' => $role->id,

                    'name' => $role->name,

                    'slug' => $role->slug,

                ])

                ->values()

                ->all(),

            'branch_offices' => $user->branchOffices

                ->map(fn (BranchOffice $branchOffice) => [

                    'id' => $branchOffice->id,

                    'name' => $branchOffice->name,

                    'code' => $branchOffice->code,

                ])

                ->values()

                ->all(),

            'created_at' => $user->created_at?->toISOString(),

        ];

    }

    private function ensureManageableSelection(Request $request, array $data): void
    {

        $authUser = $request->user();

        if (! $authUser?->isSuperAdmin()) {

            abort_if(Role::whereIn('id', $data['role_ids'])->whereHas('permissions', fn ($q) => $q->whereNotIn('slug', $authUser->permissionSlugsForActiveOffice()))->exists(), 403, 'No puedes asignar permisos que no tienes.');

            $selectedSuperAdminRole = Role::query()

                ->whereIn('id', $data['role_ids'])

                ->where('slug', 'super_admin')

                ->exists();

            abort_if($selectedSuperAdminRole, 403, 'No puedes asignar el rol super administrador.');

            $invalidRoleSelected = Role::query()

                ->whereIn('id', $data['role_ids'])

                ->where('is_system', false)

                ->whereNotIn('office_id', $this->managedOfficeIds($authUser))

                ->exists();

            abort_if($invalidRoleSelected, 403, 'No puedes asignar roles fuera de tu consorcio.');

        }

        $allowedBranchIds = collect($this->manageableBranchOfficeIds($authUser));

        $selectedBranchIds = collect($data['branch_office_ids'])->map(fn ($id) => (int) $id);

        if (! $authUser?->isSuperAdmin()) {

            abort_if(

                $allowedBranchIds->isEmpty() || $selectedBranchIds->diff($allowedBranchIds)->isNotEmpty(),

                403,

                'No puedes asignar bancas fuera de tu consorcio.'

            );

        }

    }

    private function ensureCanManageUser(Request $request, User $user): void
    {

        $authUser = $request->user();

        if ($authUser?->isSuperAdmin()) {

            return;

        }

        abort_if($user->isSuperAdmin(), 403, 'No puedes administrar un usuario super administrador.');

        abort_if($user->branchOffices()->whereNotIn('branch_offices.office_id', $this->managedOfficeIds($authUser))->exists(), 403, 'Este usuario tiene acceso a otras consorcios. Debe administrarlo el super administrador.');

        if ($authUser?->hasRole('admin')) {

            $managedOfficeIds = collect($this->managedOfficeIds($authUser));

            $belongsToManagedOffice = $user->branchOffices()

                ->whereIn('branch_offices.office_id', $managedOfficeIds)

                ->exists();

            abort_unless($belongsToManagedOffice, 403, 'No puedes administrar usuarios fuera de tu consorcio.');

            return;

        }

        abort_unless($authUser?->is($user), 403, 'No puedes administrar este usuario.');

    }

    private function manageableBranchOfficeIds(?User $user): array
    {

        if (! $user) {

            return [];

        }

        if ($user->isSuperAdmin()) {

            return BranchOffice::query()

                ->where('is_active', true)

                ->pluck('id')

                ->all();

        }

        if ($user->hasRole('admin')) {

            return BranchOffice::query()

                ->where('is_active', true)

                ->whereIn('office_id', $this->managedOfficeIds($user))

                ->pluck('id')

                ->all();

        }

        return $user->branchOffices()

            ->where('is_active', true)

            ->pluck('branch_offices.id')

            ->all();

    }

    private function managedOfficeIds(?User $user): array
    {

        if (! $user) {

            return [];

        }

        $officeIds = collect($user->officeIdsForRole('admin'));

        if ($officeIds->isEmpty() && $user->activeBranchOffice?->office_id) {

            $officeIds->push($user->activeBranchOffice->office_id);

        }

        return $officeIds

            ->filter()

            ->unique()

            ->values()

            ->all();

    }
}
