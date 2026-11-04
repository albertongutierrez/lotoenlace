<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        foreach (config('permissions.definitions') as $permission) {
            Permission::updateOrCreate(['slug' => $permission['slug']], $permission);
        }
        foreach (['super_admin' => 'Super administrador', 'admin' => 'Administrador', 'usuario' => 'Usuario'] as $slug => $name) {
            $role = Role::firstOrCreate(['slug' => $slug, 'office_id' => null], ['name' => $name, 'is_system' => true, 'is_active' => true]);
            $permissions = Permission::query();
            if ($slug === 'admin') {
                $permissions->where('slug', 'not like', 'settings.offices.%');
            }
            if ($slug === 'usuario') {
                $permissions->where('slug', 'dashboard.view');
            }
            $role->permissions()->syncWithoutDetaching($permissions->pluck('id')->all());
        }
        \App\Models\Office::withTrashed()->each(fn ($office) => app(\App\Services\ConsortiumRoles::class)->initialize($office));
    }
}
