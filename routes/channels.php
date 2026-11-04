<?php

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('lottery.cash.{officeId}.{branchId}', function (User $user, string $officeId, string $branchId): bool {
    return ctype_digit($officeId) && ctype_digit($branchId)
        && (int) $user->active_branch_office_id === (int) $branchId
        && $user->canDo('lottery.sell')
        && $user->accessibleBranches()->whereKey((int) $branchId)->where('office_id', (int) $officeId)->exists();
});
