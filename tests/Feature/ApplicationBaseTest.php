<?php

namespace Tests\Feature;

use App\Models\BranchOffice;
use App\Models\Office;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Notifications\ResetPasswordNotification;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\URL;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ApplicationBaseTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        $this->seed(DatabaseSeeder::class);
    }

    private function branch(string $name = 'Empresa A'): BranchOffice
    {
        $office = Office::create(['name' => $name, 'is_active' => true]);

        return BranchOffice::create(['office_id' => $office->id, 'name' => 'Principal', 'code' => 'PRI', 'is_active' => true]);
    }

    private function user(string $role = 'usuario', ?BranchOffice $branch = null): User
    {
        $user = User::factory()->create(['active_branch_office_id' => $branch?->id]);
        $user->roles()->attach(Role::where('slug', $role)->whereNull('office_id')->firstOrFail(), ['office_id' => $role === 'super_admin' ? null : $branch?->office_id]);
        if ($branch) {
            $user->branchOffices()->attach($branch, ['is_default' => true]);
        }

        return $user;
    }

    public function test_install_is_empty_and_seed_is_idempotent(): void
    {
        $count = Permission::count();
        $this->seed(DatabaseSeeder::class);
        $this->assertSame($count, Permission::count());
        $this->assertSame(3, Role::count());
        $this->assertSame(0, User::count());
        $this->assertSame(0, Office::count());
        $this->assertFalse(Schema::hasTable('sales'));
        $this->assertFalse(Schema::hasTable('products'));
    }

    public function test_login_logout_and_throttle(): void
    {
        $user = $this->user();
        $this->get('/login')->assertOk();
        $this->get('/dashboard')->assertRedirect('/login');
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])->assertRedirect('/dashboard');
        $this->assertAuthenticatedAs($user);
        $this->post('/logout')->assertRedirect('/');
        $this->assertGuest();
        for ($i = 0; $i < 6; $i++) {
            $this->post('/login', ['email' => $user->email, 'password' => 'incorrect'])->assertSessionHasErrors('email');
        }
        $this->assertGuest();
    }

    public function test_password_recovery_resets_password_and_rejects_reused_token(): void
    {
        Notification::fake();
        $user = $this->user();
        $this->get('/forgot-password')->assertOk();
        $this->post('/forgot-password', ['email' => $user->email])->assertSessionHasNoErrors();
        $token = null;
        Notification::assertSentTo($user, ResetPasswordNotification::class, function ($notice) use (&$token) {
            $token = $notice->token;

            return true;
        });
        $this->get('/reset-password/'.$token.'?email='.urlencode($user->email))->assertOk();
        $data = ['token' => $token, 'email' => $user->email, 'password' => 'ClaveNueva123', 'password_confirmation' => 'ClaveNueva123'];
        $this->post('/reset-password', $data)->assertSessionHasNoErrors()->assertRedirect('/login');
        $this->assertTrue(Hash::check('ClaveNueva123', $user->fresh()->password));
        $this->post('/reset-password', $data)->assertSessionHasErrors('email');
    }

    public function test_email_verification_is_enforced_and_signed(): void
    {
        $user = $this->user();
        $user->forceFill(['email_verified_at' => null])->save();
        $this->actingAs($user)->get('/dashboard')->assertRedirect('/verify-email');
        $this->get('/verify-email')->assertOk();
        $this->get('/verify-email/'.$user->id.'/invalid')->assertForbidden();
        $url = URL::temporarySignedRoute('verification.verify', now()->addMinutes(10), ['id' => $user->id, 'hash' => sha1($user->email)]);
        $this->get($url)->assertRedirect();
        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    public function test_public_registration_closed_by_default(): void
    {
        $this->get('/register')->assertNotFound();
        $this->post('/register', ['name' => 'Otro'])->assertNotFound();
    }

    public function test_super_admin_can_bootstrap_company_and_branch(): void
    {
        $user = $this->user('super_admin');
        $this->actingAs($user);
        $this->get('/dashboard')->assertOk();
        foreach (['offices', 'branch-offices', 'users', 'roles'] as $resource) {
            $this->get('/settings/'.$resource)->assertOk();
            $this->get('/settings/'.$resource.'/create')->assertOk();
        }
        $this->post('/settings/offices', ['name' => 'Nueva', 'show_print_company_details' => true])->assertSessionHasNoErrors();
        $office = Office::firstOrFail();
        $this->post('/settings/branch-offices', ['office_id' => $office->id, 'name' => 'Centro', 'code' => 'CEN', 'is_main' => true, 'is_active' => true])->assertSessionHasNoErrors();
        $branch = BranchOffice::firstOrFail();
        $this->patch('/settings/active-branch-office', ['branch_office' => $branch->id_hash])->assertRedirect('/dashboard');
        $this->assertSame($branch->id, $user->fresh()->active_branch_office_id);
        $this->get('/dashboard')->assertInertia(fn (Assert $page) => $page->where('auth.activeBranchOffice.office_name', 'Nueva'));
    }

    public function test_user_cannot_access_management_or_other_branch(): void
    {
        $branch = $this->branch();
        $other = $this->branch('Empresa B');
        $user = $this->user('usuario', $branch);
        $this->actingAs($user);
        foreach (['offices', 'branch-offices', 'users', 'roles'] as $resource) {
            $this->get('/settings/'.$resource)->assertForbidden();
        }
        $this->patch('/settings/active-branch-office', ['branch_office' => $other->id_hash])->assertForbidden();
        $this->assertSame($branch->id, $user->fresh()->active_branch_office_id);
        $this->get('/dashboard')->assertInertia(fn (Assert $page) => $page->has('auth.availableBranchOffices', 1));
    }

    public function test_disabled_branch_and_revoked_assignment_are_not_kept_active(): void
    {
        $branch = $this->branch();
        $user = $this->user('usuario', $branch);
        $branch->update(['is_active' => false]);
        $this->actingAs($user)->get('/dashboard')->assertOk();
        $this->assertNull($user->fresh()->active_branch_office_id);
        $this->patch('/settings/active-branch-office', ['branch_office' => $branch->id_hash])->assertForbidden();
        $branch->update(['is_active' => true]);
        $user->branchOffices()->detach();
        $user->forceFill(['active_branch_office_id' => $branch->id])->save();
        $this->get('/dashboard')->assertOk();
        $this->assertNull($user->fresh()->active_branch_office_id);
    }

    public function test_permissions_are_scoped_by_company_and_inactive_roles_are_ignored(): void
    {
        $a = $this->branch();
        $b = $this->branch('Empresa B');
        $user = $this->user('admin', $a);
        $user->branchOffices()->attach($b);
        $this->assertTrue($user->canDo('users.create'));
        $this->actingAs($user)->patch('/settings/active-branch-office', ['branch_office' => $b->id_hash])->assertRedirect();
        $this->assertFalse($user->fresh()->canDo('users.create'));
        Role::where('slug', 'admin')->update(['is_active' => false]);
        $user->forceFill(['active_branch_office_id' => $a->id])->save();
        $this->assertFalse($user->fresh()->canDo('users.create'));
    }

    public function test_admin_cannot_manage_other_company_or_escalate_permissions(): void
    {
        $a = $this->branch();
        $b = $this->branch('Empresa B');
        $admin = $this->user('admin', $a);
        $outside = $this->user('usuario', $b);
        $this->actingAs($admin)->get('/settings/branch-offices')->assertInertia(fn (Assert $page) => $page->has('branchOffices.data', 1));
        $this->get(route('settings.branch-offices.edit', $b))->assertForbidden();
        $this->get(route('settings.users.edit', $outside))->assertForbidden();
        $this->post('/settings/branch-offices', ['office_id' => $b->office_id, 'name' => 'Otra', 'code' => 'OTR'])->assertForbidden();
        $this->post('/settings/roles', ['name' => 'Elevado', 'slug' => 'elevado', 'permission_ids' => [Permission::where('slug', 'settings.offices.create')->value('id')]])->assertForbidden();
        $shared = $this->user('usuario', $a);
        $shared->branchOffices()->attach($b);
        $this->get(route('settings.users.edit', $shared))->assertForbidden();
    }

    public function test_admin_can_create_limited_role_and_user_and_edit_profile(): void
    {
        $branch = $this->branch();
        $admin = $this->user('admin', $branch);
        $this->actingAs($admin);
        $this->post('/settings/roles', ['name' => 'Consulta', 'slug' => 'consulta', 'is_active' => true, 'permission_ids' => [Permission::where('slug', 'dashboard.view')->value('id')]])->assertSessionHasNoErrors();
        $role = Role::where('slug', 'consulta')->firstOrFail();
        $this->post('/settings/users', ['name' => 'Usuario nuevo', 'email' => 'nuevo@example.test', 'password' => 'ClaveNueva123', 'role_ids' => [$role->id], 'branch_office_ids' => [$branch->id], 'default_branch_office_id' => $branch->id])->assertSessionHasNoErrors();
        $user = User::where('email', 'nuevo@example.test')->firstOrFail();
        $this->assertTrue($user->canDo('dashboard.view'));
        $this->assertFalse($user->canDo('users.create'));
        $this->get(route('settings.users.edit', $user))->assertOk();
        $this->get(route('settings.roles.edit', $role))->assertOk();
        $this->get('/profile')->assertOk();
        $this->patch('/profile', ['name' => 'Mi nombre', 'email' => $admin->email])->assertSessionHasNoErrors();
        $this->assertSame('Mi nombre', $admin->fresh()->name);
    }

    public function test_create_admin_command_asks_for_password_and_cannot_run_twice(): void
    {
        $this->artisan('base:create-admin', ['--name' => 'Administrador', '--email' => 'admin@example.test'])
            ->expectsQuestion('Contrasena (10 caracteres, mayuscula, minuscula y numero)', 'ClaveNueva123')
            ->expectsQuestion('Repite la contrasena', 'ClaveNueva123')->assertSuccessful();
        $this->assertTrue(User::first()->isSuperAdmin());
        $this->artisan('base:create-admin')->assertFailed();
    }

    public function test_super_admin_crud_updates_and_deletes_are_available(): void
    {
        $branch = $this->branch();
        $admin = $this->user('super_admin', $branch);
        $this->actingAs($admin);
        $this->put(route('settings.offices.update', $branch->office), ['name' => 'Nombre actualizado', 'show_print_company_details' => false])->assertSessionHasNoErrors();
        $this->assertSame('Nombre actualizado', $branch->office->fresh()->name);
        $this->put(route('settings.branch-offices.update', $branch), ['office_id' => $branch->office_id, 'name' => 'Norte', 'code' => 'NOR', 'is_active' => true])->assertSessionHasNoErrors();
        $this->assertSame('Norte', $branch->fresh()->name);
        $role = Role::create(['office_id' => $branch->office_id, 'name' => 'Temporal', 'slug' => 'temporal', 'is_active' => true]);
        $this->put(route('settings.roles.update', $role), ['name' => 'Consulta', 'slug' => 'consulta', 'is_active' => true, 'permission_ids' => [Permission::where('slug', 'dashboard.view')->value('id')]])->assertSessionHasNoErrors();
        $this->assertSame('consulta', $role->fresh()->slug);
        $user = $this->user('usuario', $branch);
        $this->put(route('settings.users.update', $user), ['name' => 'Actualizado', 'email' => $user->email, 'role_ids' => [$role->id], 'branch_office_ids' => [$branch->id], 'default_branch_office_id' => $branch->id])->assertSessionHasNoErrors();
        $this->assertSame('Actualizado', $user->fresh()->name);
        $this->delete(route('settings.users.destroy', $user))->assertSessionHasNoErrors();
        $this->delete(route('settings.roles.destroy', $role))->assertSessionHasNoErrors();
        $empty = $this->branch('Eliminar');
        $this->delete(route('settings.branch-offices.destroy', $empty))->assertSessionHasNoErrors();
        $this->delete(route('settings.offices.destroy', $empty->office))->assertSessionHasNoErrors();
        $this->assertSoftDeleted('offices', ['id' => $empty->office_id]);
    }

    public function test_password_change_and_protected_admin_account(): void
    {
        $user = $this->user('super_admin');
        $this->actingAs($user);
        $this->put('/password', ['current_password' => 'password', 'password' => 'OtraClave123', 'password_confirmation' => 'OtraClave123'])->assertSessionHasNoErrors();
        $this->assertTrue(Hash::check('OtraClave123', $user->fresh()->password));
        $this->delete('/profile', ['password' => 'OtraClave123'])->assertSessionHasErrors();
        $this->assertNotNull($user->fresh());
    }

    public function test_reserved_roles_and_unmapped_routes_cannot_bypass_permissions(): void
    {
        $branch = $this->branch();
        $user = $this->user('admin', $branch);
        $this->actingAs($user);
        foreach (['ADMIN', 'super_admin', 'Super-Admin'] as $slug) {
            $this->post('/settings/roles', ['name' => $slug, 'slug' => $slug, 'permission_ids' => [Permission::where('slug', 'dashboard.view')->value('id')]])->assertForbidden();
        }
        Route::middleware(['web', 'auth', 'permission.route'])->get('/unmapped', fn () => 'secret')->name('unmapped');
        $this->get('/unmapped')->assertForbidden();
    }
}
