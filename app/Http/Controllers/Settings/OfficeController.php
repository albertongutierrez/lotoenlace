<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\StoreOfficeRequest;
use App\Http\Requests\Settings\UpdateOfficeRequest;
use App\Models\Office;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class OfficeController extends Controller
{
    public function __construct()
    {

        $this->middleware(function ($request, $next) {

            $office = $request->route('office');
            $ownDetails = $request->routeIs('lottery.settings.details')
                && $office instanceof Office
                && $request->user()->activeBranchOffice
                && (int) $request->user()->activeBranchOffice->office_id === (int) $office->id;
            abort_unless($request->user()?->isSuperAdmin() || $ownDetails, 403);

            return $next($request);

        });

    }

    public function index(Request $request): Response
    {

        $search = $request->string('search')->toString();

        $offices = Office::query()

            ->withCount('branchOffices')

            ->when($search !== '', function ($query) use ($search) {

                $query->where(function ($query) use ($search) {

                    $query->where('name', 'like', "%{$search}%")

                        ->orWhere('slogan', 'like', "%{$search}%")

                        ->orWhere('tax_id', 'like', "%{$search}%");

                });

            })

            ->latest()

            ->paginate(10)

            ->through(fn (Office $office) => $this->serializeOffice($office))

            ->withQueryString();

        return Inertia::render('Settings/Offices/Index', [

            'offices' => $offices,

            'filters' => [

                'search' => $search,

            ],

        ]);

    }

    public function create(): Response
    {

        return Inertia::render('Settings/Offices/Create');

    }

    public function store(StoreOfficeRequest $request): RedirectResponse
    {

        $data = $request->validated();

        if ($request->hasFile('logo')) {

            $data['logo_path'] = $request->file('logo')->store('logos/offices', 'public');

        }

        if ($request->hasFile('compact_logo')) {

            $data['compact_logo_path'] = $request->file('compact_logo')->store('logos/offices/compact', 'public');

        }

        $office = Office::create([

            'name' => $data['name'],

            'currency' => $data['currency'] ?? 'DOP',

            'slogan' => $data['slogan'] ?? null,

            'tax_id' => $data['tax_id'] ?? null,

            'logo_path' => $data['logo_path'] ?? null,

            'compact_logo_path' => $data['compact_logo_path'] ?? null,

            'show_print_company_details' => $data['show_print_company_details'],

            'is_active' => true,

        ]);

        return to_route('lottery.settings.consortium', $office)->with('success', 'Consorcio creado correctamente.');

    }

    public function edit(Office $office): RedirectResponse
    {

        return to_route('lottery.settings.consortium', $office);

    }

    public function update(UpdateOfficeRequest $request, Office $office): RedirectResponse
    {

        $data = $request->validated();

        $logoPath = $office->logo_path;

        $compactLogoPath = $office->compact_logo_path;

        if ($request->boolean('remove_logo') && $logoPath) {

            Storage::disk('public')->delete($logoPath);

            $logoPath = null;

        }

        if ($request->hasFile('logo')) {

            if ($logoPath) {

                Storage::disk('public')->delete($logoPath);

            }

            $logoPath = $request->file('logo')->store('logos/offices', 'public');

        }

        if ($request->boolean('remove_compact_logo') && $compactLogoPath) {

            Storage::disk('public')->delete($compactLogoPath);

            $compactLogoPath = null;

        }

        if ($request->hasFile('compact_logo')) {

            if ($compactLogoPath) {

                Storage::disk('public')->delete($compactLogoPath);

            }

            $compactLogoPath = $request->file('compact_logo')->store('logos/offices/compact', 'public');

        }

        $office->update([

            'name' => $data['name'],

            'slogan' => $data['slogan'] ?? null,

            'tax_id' => $data['tax_id'] ?? null,

            'logo_path' => $logoPath,

            'compact_logo_path' => $compactLogoPath,

            'show_print_company_details' => $data['show_print_company_details'],

            'is_active' => true,

        ]);

        return to_route('lottery.settings.consortium', $office)->with('success', 'Datos del consorcio actualizados correctamente.');

    }

    public function destroy(Office $office): RedirectResponse
    {

        if ($office->branchOffices()->exists()) {

            return back()->withErrors(['office' => 'Elimina primero las bancas de esta consorcio.']);

        }

        $office->delete();

        return to_route('settings.offices.index')->with('success', 'Consorcio eliminada correctamente.');

    }

    private function serializeOffice(Office $office): array
    {

        $effectiveCompactLogoPath = $office->compact_logo_path ?: $office->logo_path;

        return [

            'id' => $office->id,

            'id_hash' => $office->id_hash,

            'name' => $office->name,

            'currency' => $office->currency,

            'slogan' => $office->slogan,

            'tax_id' => $office->tax_id,

            'show_print_company_details' => $office->show_print_company_details,

            'logo_url' => $office->logo_path ? Storage::url($office->logo_path) : null,

            'compact_logo_url' => $office->compact_logo_path ? Storage::url($office->compact_logo_path) : null,

            'effective_compact_logo_url' => $effectiveCompactLogoPath ? Storage::url($effectiveCompactLogoPath) : null,

            'branch_offices_count' => $office->branch_offices_count ?? null,

            'created_at' => $office->created_at?->toISOString(),

        ];

    }
}
