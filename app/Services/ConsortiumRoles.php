<?php

namespace App\Services;

use App\Models\{Office, Role};
use Illuminate\Support\Facades\DB;

class ConsortiumRoles
{
    public function initialize(Office $office): void
    {
        DB::transaction(function () use ($office) {
            Office::withTrashed()->whereKey($office->id)->lockForUpdate()->firstOrFail();
            foreach (Role::whereNull('office_id')->where('is_system', true)->where('slug', '!=', 'super_admin')->with('permissions')->get() as $template) {
                $role = Role::firstOrCreate(['office_id' => $office->id, 'slug' => $template->slug], [
                    'name' => $template->name, 'description' => $template->description,
                    'is_system' => false, 'is_active' => $template->is_active,
                ]);
                if ($role->wasRecentlyCreated) {
                    $role->permissions()->sync($template->permissions->modelKeys());
                }
                foreach (DB::table('role_user')->where('role_id', $template->id)->where('office_id', $office->id)->get() as $assignment) {
                    DB::table('role_user')->updateOrInsert([
                        'role_id' => $role->id, 'user_id' => $assignment->user_id, 'office_id' => $office->id,
                    ], ['created_at' => $assignment->created_at, 'updated_at' => now()]);
                }
                DB::table('role_user')->where('role_id', $template->id)->where('office_id', $office->id)->delete();
            }
        });
    }
}
