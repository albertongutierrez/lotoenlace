<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class EnsureActiveBranch
{
    public function handle(Request $request, Closure $next)
    {

        $user = $request->user();

        $branches = $user->accessibleBranches();

        if (! $user->active_branch_office_id || ! (clone $branches)->whereKey($user->active_branch_office_id)->exists()) {

            $user->forceFill(['active_branch_office_id' => $branches->orderBy('id')->value('id')])->save();

            $user->unsetRelation('activeBranchOffice');

        }

        return $next($request);

    }
}
