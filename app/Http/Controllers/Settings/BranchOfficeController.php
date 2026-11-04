<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\StoreBranchOfficeRequest;
use App\Http\Requests\Settings\UpdateBranchOfficeRequest;
use App\Models\BranchOffice;
use App\Models\Office;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class BranchOfficeController extends Controller
{
    public function index(Request $request): Response
    {

        $search = $request->string('search')->toString();

        $status = $request->string('status')->toString();

        $officeId = $request->integer('office_id');

        $branchOffices = BranchOffice::query()

            ->when(! $request->user()->isSuperAdmin(), fn ($q) => $q->where('office_id', $request->user()->activeBranchOffice?->office_id))

            ->with('office:id,name')

            ->when($officeId > 0, fn ($query) => $query->where('office_id', $officeId))

            ->when($search !== '', function ($query) use ($search) {

                $query->where(function ($query) use ($search) {

                    $query->where('name', 'like', "%{$search}%")

                        ->orWhere('code', 'like', "%{$search}%")

                        ->orWhere('phone', 'like', "%{$search}%")

                        ->orWhere('mobile_phone', 'like', "%{$search}%")

                        ->orWhere('email', 'like', "%{$search}%")

                        ->orWhereHas('office', fn ($officeQuery) => $officeQuery->where('name', 'like', "%{$search}%"));

                });

            })

            ->when($status === 'active', fn ($query) => $query->where('is_active', true))

            ->when($status === 'inactive', fn ($query) => $query->where('is_active', false))

            ->latest()

            ->paginate(10)

            ->through(fn (BranchOffice $branchOffice) => $this->serializeBranchOffice($branchOffice))

            ->withQueryString();

        return Inertia::render('Settings/BranchOffices/Index', [

            'branchOffices' => $branchOffices,

            'offices' => $this->officeOptions(),

            'filters' => [

                'search' => $search,

                'status' => $status,

                'office_id' => $officeId ?: '',

            ],

        ]);

    }

    public function create(): Response
    {

        return Inertia::render('Settings/BranchOffices/Create', [

            'offices' => $this->officeOptions(),

        ]);

    }

    public function store(StoreBranchOfficeRequest $request): RedirectResponse
    {

        $data = $request->validated();

        $this->ensureOffice((int) $data['office_id']);

        $branchOffice = DB::transaction(function () use ($data, $request) {

            if ($request->boolean('is_main')) {

                BranchOffice::where('office_id', $data['office_id'])->update(['is_main' => false]);

            }

            return BranchOffice::create([

                'office_id' => $data['office_id'],

                'name' => $data['name'] ?? strtoupper($data['code']),

                'code' => strtoupper($data['code']),

                'phone' => $data['phone'] ?? null,

                'mobile_phone' => $data['mobile_phone'] ?? null,

                'email' => $data['email'] ?? null,

                'address' => $data['address'] ?? null,

                'is_main' => $request->boolean('is_main'),

                'is_active' => $request->boolean('is_active', true),

            ]);

        });

        $request->user()?->branchOffices()->syncWithoutDetaching([

            $branchOffice->id => ['is_default' => false],

        ]);

        return to_route('settings.branch-offices.index')->with('success', 'Banca creada correctamente.');

    }

    public function edit(BranchOffice $branchOffice): Response
    {

        $this->ensureOffice($branchOffice->office_id);

        $branchOffice->load('office:id,name');

        return Inertia::render('Settings/BranchOffices/Edit', [

            'branchOffice' => $this->serializeBranchOffice($branchOffice),

            'offices' => $this->officeOptions(),

        ]);

    }

    public function update(UpdateBranchOfficeRequest $request, BranchOffice $branchOffice): RedirectResponse
    {

        $this->ensureOffice($branchOffice->office_id);

        $data = $request->validated();

        abort_unless((int) $data['office_id'] === (int) $branchOffice->office_id, 422, 'No puedes mover una banca entre consorcios.');

        DB::transaction(function () use ($branchOffice, $data, $request) {

            if ($request->boolean('is_main')) {

                BranchOffice::where('office_id', $data['office_id'])

                    ->whereKeyNot($branchOffice->id)

                    ->update(['is_main' => false]);

            }

            $branchOffice->update([

                'office_id' => $data['office_id'],

                'name' => $data['name'] ?? strtoupper($data['code']),

                'code' => strtoupper($data['code']),

                'phone' => $data['phone'] ?? null,

                'mobile_phone' => $data['mobile_phone'] ?? null,

                'email' => $data['email'] ?? null,

                'address' => $data['address'] ?? null,

                'is_main' => $request->boolean('is_main'),

                'is_active' => $request->boolean('is_active'),

            ]);

        });

        return to_route('settings.branch-offices.index')->with('success', 'Banca actualizada correctamente.');

    }

    public function destroy(BranchOffice $branchOffice): RedirectResponse
    {

        $this->ensureOffice($branchOffice->office_id);

        if ($branchOffice->users()->exists()) {

            return back()->withErrors(['branch' => 'Quita las asignaciones de usuarios antes de eliminar la banca.']);

        }

        $branchOffice->delete();

        return to_route('settings.branch-offices.index')->with('success', 'Banca eliminada correctamente.');

    }

    private function officeOptions(): array
    {

        return Office::query()

            ->when(! request()->user()->isSuperAdmin(), fn ($q) => $q->whereKey(request()->user()->activeBranchOffice?->office_id))

            ->where('is_active', true)

            ->orderBy('name')

            ->get(['id', 'name'])

            ->map(fn (Office $office) => [

                'id' => $office->id,

                'name' => $office->name,

            ])

            ->all();

    }

    private function serializeBranchOffice(BranchOffice $branchOffice): array
    {

        return [

            'id' => $branchOffice->id,

            'id_hash' => $branchOffice->id_hash,

            'office_id' => $branchOffice->office_id,

            'office_name' => $branchOffice->office?->name,

            'name' => $branchOffice->name,

            'code' => $branchOffice->code,

            'phone' => $branchOffice->phone,

            'mobile_phone' => $branchOffice->mobile_phone,

            'email' => $branchOffice->email,

            'address' => $branchOffice->address,

            'is_main' => $branchOffice->is_main,

            'is_active' => $branchOffice->is_active,

            'created_at' => $branchOffice->created_at?->toISOString(),

        ];

    }

    private function ensureOffice(int $officeId): void
    {

        abort_unless(request()->user()->isSuperAdmin() || (int) request()->user()->activeBranchOffice?->office_id === $officeId, 403);

    }
}
