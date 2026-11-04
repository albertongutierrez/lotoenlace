<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class ActiveBranchOfficeController extends Controller
{
    public function update(Request $request)
    {

        $data = $request->validate(['branch_office' => ['required', 'string']]);

        $branch = $request->user()->accessibleBranches()->where('id_hash', $data['branch_office'])->first();

        abort_unless($branch, 403, 'No tienes acceso a esta banca.');

        $request->user()->forceFill(['active_branch_office_id' => $branch->id])->save();

        return to_route('dashboard')->with('success', "Banca activa: {$branch->name}.");

    }
}
