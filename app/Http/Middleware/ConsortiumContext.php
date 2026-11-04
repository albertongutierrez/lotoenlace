<?php

namespace App\Http\Middleware;

use App\Models\{Office, BranchOffice, Role, User};
use Closure;
use Illuminate\Http\Request;

class ConsortiumContext
{
    public function handle(Request $request, Closure $next)
    {
        if (! $request->query('consortium')) {
            return $next($request);
        }
        $office = Office::where('id_hash', $request->query('consortium'))->firstOrFail();
        abort_unless($request->user()->isSuperAdmin() || (int) $request->user()->activeBranchOffice?->office_id === (int) $office->id, 403);
        $resource = explode('.', $request->route()->getName())[1] ?? '';
        abort_unless(in_array($resource, ['branch-offices', 'users', 'roles']), 403);
        foreach ($request->route()->parameters() as $target) {
            if ($target instanceof BranchOffice || $target instanceof Role) {
                abort_unless((int) $target->office_id === (int) $office->id, 403);
            }
            if ($target instanceof User) {
                abort_if($target->isSuperAdmin() || $target->branchOffices()->where('office_id', '!=', $office->id)->exists(), 403, 'Este usuario se administra desde el panel global.');
                abort_unless($target->branchOffices()->where('office_id', $office->id)->exists() || $target->roles()->wherePivot('office_id', $office->id)->exists(), 403);
            }
        }
        if ($resource === 'branch-offices' && $request->has('office_id')) {
            abort_unless((int) $request->input('office_id') === (int) $office->id, 403);
        }
        if ($resource === 'users' && ! $request->isMethod('get') && ! $request->isMethod('delete')) {
            $branchIds = $request->input('branch_office_ids', []);
            $roleIds = $request->input('role_ids', []);
            abort_unless(is_array($branchIds) && is_array($roleIds), 422);
            abort_if(BranchOffice::whereIn('id', $branchIds)->where('office_id', '!=', $office->id)->exists(), 403);
            abort_if(Role::whereIn('id', $roleIds)->where(fn ($q) => $q->whereNull('office_id')->orWhere('office_id', '!=', $office->id))->exists(), 403);
        }
        $request->attributes->set('consortium_office', $office);
        $response = $next($request);
        if ($response instanceof \Illuminate\Http\RedirectResponse && ! $request->session()->has('errors')) {
            $tab = ['branch-offices' => 'branches', 'users' => 'users', 'roles' => 'roles'][$resource];
            $response->setTargetUrl(route('lottery.settings.consortium', $office).'?tab='.$tab);
        }
        return $response;
    }
}
