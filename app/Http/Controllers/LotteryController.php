<?php



namespace App\Http\Controllers;



use App\Models\BetLimit;

use App\Models\BranchOffice;

use App\Models\Draw;

use App\Models\DrawResult;

use App\Models\Lottery;

use App\Models\LotteryAudit;

use App\Models\Office;

use App\Models\Ticket;

use App\Services\Lottery\Configuration;

use App\Services\Lottery\LimitEngine;

use App\Services\Lottery\ResultService;

use App\Services\Lottery\SaleService;

use Illuminate\Http\Request;

use Illuminate\Support\Facades\DB;

use Illuminate\Validation\Rule;

use Inertia\Inertia;



class LotteryController extends Controller

{

    private function branch(Request $r): BranchOffice

    {

        $id = $r->input('branch_id', $r->user()->active_branch_office_id);

        $branch = $r->user()->accessibleBranches()->whereKey($id)->firstOrFail();

        // A stale screen must never borrow permissions from a newly selected consortium.

        abort_unless((int) $branch->id === (int) $r->user()->active_branch_office_id, 409, 'Cambió la banca activa. Recarga antes de continuar.');



        return $branch->load('office');

    }



    public function catalog(Request $r)

    {

        abort_unless($r->user()->isSuperAdmin(), 403);



        $data = ['lotteries' => Lottery::withCount('draws')->orderBy('name')->get()];



        return $r->wantsJson() ? response()->json($data) : Inertia::render('Lottery/Catalog', $data);

    }



    public function lotteryDetail(Request $r, Lottery $lottery)

    {

        abort_unless($r->user()->isSuperAdmin(), 403);

        $data = ['lottery' => $lottery, 'draws' => $lottery->draws()->orderBy('draws_at')->get()];



        return $r->wantsJson() ? response()->json($data) : Inertia::render('Lottery/LotteryDetail', $data);

    }



    public function saveLottery(Request $r)

    {

        abort_unless($r->user()->isSuperAdmin(), 403);

        $data = $r->validate(['id' => 'nullable|integer|exists:lotteries,id', 'name' => 'required|string|max:120', 'active' => 'required|boolean']);

        $lottery = Lottery::updateOrCreate(['id' => $data['id'] ?? null], $data);



        return $r->wantsJson() ? response()->json(['message' => 'Lotería guardada.', 'lottery' => $lottery]) : back()->with('success', 'Lotería guardada.');

    }



    public function saveDraw(Request $r)

    {

        abort_unless($r->user()->isSuperAdmin(), 403);

        $data = $r->validate(['id' => 'nullable|integer|exists:draws,id', 'lottery_id' => 'required|exists:lotteries,id', 'name' => 'required|string|max:120',

            'opens_at' => 'required|date_format:H:i', 'closes_at' => 'required|date_format:H:i|after:opens_at', 'draws_at' => 'required|date_format:H:i|after_or_equal:closes_at',

            'weekdays' => 'required|array|min:1', 'weekdays.*' => 'integer|between:0,6', 'modalities' => 'required|array|min:1',

            'modalities.*' => Rule::in(['quiniela', 'pale', 'tripleta', 'super_pale']), 'active' => 'required|boolean',

            'source_url' => ['nullable', 'url', 'regex:~^https://elboletoganador\.com/[^\s]*$~'],

            'source_key' => 'nullable|string|max:150', 'result_count' => 'sometimes|integer|between:1,3', 'exceptions' => 'nullable|array',

            'exceptions.*.closed' => 'required|boolean', 'exceptions.*.opens_at' => 'nullable|date_format:H:i', 'exceptions.*.closes_at' => 'nullable|date_format:H:i']);

        if (empty($data['source_key']) && ! empty($data['source_url'])) {

            $path = parse_url($data['source_url'], PHP_URL_PATH);

            if (str_starts_with($path ?? '', '/loteria/')) {

                $data['source_key'] = basename($path);

            }

        }

        Draw::updateOrCreate(['id' => $data['id'] ?? null], $data);



        return $r->wantsJson() ? response()->json(['message' => 'Sorteo guardado.']) : back()->with('success', 'Sorteo guardado.');

    }



    public function settings(Request $r, Configuration $config)

    {

        $branch = $this->branch($r);



        return to_route('lottery.settings.consortium', $branch->office);



    }



    public function consortium(Request $r, Office $office, Configuration $config)

    {

        abort_unless($r->user()->isSuperAdmin() || (int) $r->user()->activeBranchOffice?->office_id === (int) $office->id, 403);

        $branch = $r->user()->accessibleBranches()->where('office_id', $office->id)->whereKey($r->user()->active_branch_office_id)->first();



        $can = fn ($permission) => $r->user()->canDo($permission);
        $roles = \App\Models\Role::where('office_id', $office->id)
            ->with('permissions:id')->withCount(['users' => fn ($q) => $q->where('role_user.office_id', $office->id)])->get();
        $members = $can('users.view') ? \App\Models\User::where(fn ($q) => $q->whereHas('branchOffices', fn ($q) => $q->where('office_id', $office->id))->orWhereHas('roles', fn ($q) => $q->where('role_user.office_id', $office->id)))
            ->whereDoesntHave('roles', fn ($q) => $q->where('slug', 'super_admin'))
            ->with(['branchOffices', 'roles' => fn ($q) => $q->where('role_user.office_id', $office->id)])
            ->get()->map(fn ($u) => ['id' => $u->id, 'id_hash' => $u->id_hash, 'name' => $u->name, 'email' => $u->email,
                'active_branch_office_id' => $u->active_branch_office_id,
                'can_manage' => ! $u->branchOffices->contains(fn ($b) => (int) $b->office_id !== (int) $office->id),
                'roles' => $u->roles->map->only(['id', 'name', 'slug'])->values(),
                'branch_offices' => $u->branchOffices->where('office_id', $office->id)->map->only(['id', 'name', 'code'])->values()]) : [];
        $permissionGroups = $can('roles.manage') ? \App\Models\Permission::when(! $r->user()->isSuperAdmin(), fn ($q) => $q->whereIn('slug', $r->user()->permissionSlugsForActiveOffice()))
            ->get(['id', 'id_hash', 'name', 'slug', 'module', 'description'])->groupBy('module')->map(fn ($items, $module) => ['module' => $module, 'label' => $module, 'permissions' => $items])->values() : [];
        $management = ['members' => $members, 'roles' => $can('roles.view') ? $roles->map(fn ($role) => [...$role->only(['id', 'id_hash', 'name', 'slug', 'description', 'is_system', 'is_active', 'users_count']), 'permission_ids' => $role->permissions->pluck('id'), 'permissions_count' => $role->permissions->count()]) : [],
            'roleOptions' => ($can('users.create') || $can('users.update')) ? $roles->where('is_active', true)->filter(fn ($role) => $r->user()->isSuperAdmin() || ! $role->permissions()->whereNotIn('slug', $r->user()->permissionSlugsForActiveOffice())->exists())->values()->map->only(['id', 'name', 'slug', 'description']) : [], 'permissions' => $permissionGroups];
        return Inertia::render('Lottery/Settings', ['management' => $management, 'office' => [...$office->toArray(), 'logo_url' => $office->logo_path ? \Illuminate\Support\Facades\Storage::url($office->logo_path) : null, 'compact_logo_url' => $office->compact_logo_path ? \Illuminate\Support\Facades\Storage::url($office->compact_logo_path) : null], 'branch' => $branch, 'branches' => BranchOffice::where('office_id', $office->id)->get(),

            'effective' => $branch ? $config->effective($branch) : array_replace(Configuration::DEFAULTS, $office->lottery_settings ?? []),

            'defaults' => Configuration::DEFAULTS, 'draws' => Draw::with('lottery')->get()]);

    }



    public function saveSettings(Request $r)

    {

        $branch = null;

        $officeId = $r->input('office_id', $r->user()->activeBranchOffice?->office_id);

        abort_unless($r->user()->isSuperAdmin() || (int) $r->user()->activeBranchOffice?->office_id === (int) $officeId, 403);

        $officeTarget = Office::findOrFail($officeId);
        if ($r->input('scope') === 'branch') {
            $branch = BranchOffice::where('office_id', $officeTarget->id)->findOrFail($r->input('branch_id'));
        }

        abort_if($branch && (int) $branch->office_id !== (int) $officeTarget->id, 422, 'La banca pertenece a otro consorcio.');

        $data = $r->validate(['scope' => ['required', Rule::in(['office', 'branch'])], 'currency' => ['required', Rule::in(['DOP', 'USD', 'EUR', 'HTG'])],

            'settings' => 'present|array:payment_methods,payment_method_labels,payment_reference_required,reconciliation_mode,daily_limit_minor,consortium_limit_minor,cancel_minutes,reprint_minutes,show_qr,discount_enabled,discount_every_minor,discount_amount_minor,footer,draw_ids,general_rules,rules,pairs,super_pale',

            'settings.payment_methods' => 'nullable|array|list|min:1|max:100',
            'settings.payment_methods.*' => ['required', 'string', 'regex:/^(cash|transfer|card|deposit|custom_[a-f0-9]{12})$/D', 'distinct'],
            'settings.payment_method_labels' => 'nullable|array|max:100',
            'settings.payment_method_labels.*' => ['required', 'string', 'max:80', 'regex:/^[^\x00-\x1F\x7F]+$/uD'],
            'settings.payment_reference_required' => 'nullable|array|max:100',
            'settings.payment_reference_required.*' => 'required|boolean',

            'settings.reconciliation_mode' => 'nullable|in:cash,report',
            'settings.daily_limit_minor' => 'nullable|integer|min:0|max:99999999999', 'settings.consortium_limit_minor' => 'nullable|integer|min:0|max:99999999999',

            'settings.cancel_minutes' => 'nullable|integer|between:0,1440', 'settings.reprint_minutes' => 'nullable|integer|between:0,1440',

            'settings.show_qr' => 'nullable|boolean', 'settings.discount_enabled' => 'nullable|boolean',

            'settings.discount_every_minor' => 'nullable|integer|min:1|max:999999999', 'settings.discount_amount_minor' => 'nullable|integer|min:0|max:999999999',

            'settings.footer' => 'nullable|string|max:500', 'settings.draw_ids' => 'nullable|array', 'settings.draw_ids.*' => 'integer|exists:draws,id',

            'settings.general_rules' => 'nullable|array:quiniela,pale,tripleta',
            'settings.general_rules.*' => 'nullable|array:commission_bps,payouts',
            'settings.general_rules.*.commission_bps' => 'nullable|integer|between:0,10000',
            'settings.general_rules.quiniela.payouts' => 'nullable|array:1,2,3',
            'settings.general_rules.pale.payouts' => 'nullable|array:1-2,1-3,2-3',
            'settings.general_rules.tripleta.payouts' => 'nullable|array:3,2',
            'settings.general_rules.*.payouts.*' => 'integer|between:0,1000000',
            'settings.rules' => 'nullable|array', 'settings.rules.*' => 'array', 'settings.pairs' => 'nullable|array', 'settings.pairs.*' => 'array']);

        $r->validate([

            'settings.super_pale' => 'nullable|array:enabled,ordered,commission_bps,payouts',

            'settings.super_pale.enabled' => 'nullable|boolean',

            'settings.super_pale.ordered' => 'nullable|boolean',

            'settings.super_pale.commission_bps' => 'nullable|integer|between:0,10000',

            'settings.super_pale.payouts' => 'nullable|array:1-1,1-2,1-3',

            'settings.super_pale.payouts.*' => 'integer|between:0,1000000',

        ]);

        foreach (['rules', 'pairs'] as $section) {

            foreach ($data['settings'][$section] ?? [] as $key => $rule) {

                abort_unless(preg_match($section === 'pairs' ? '/^\d+-\d+$/' : '/^\d+:(quiniela|pale|tripleta)$/', $key), 422, 'Identificador de tarifa inválido.');

                validator($rule, ['commission_bps' => 'nullable|integer|between:0,10000', 'enabled' => 'nullable|boolean', 'ordered' => 'nullable|boolean', 'primary_draw_id' => 'nullable|integer', 'payouts' => 'nullable|array', 'payouts.*' => 'integer|between:0,1000000'])->validate();

                $categories = $section === 'pairs' ? ['1-1', '1-2', '1-3'] : (str_ends_with($key, ':quiniela') ? ['1', '2', '3'] : (str_ends_with($key, ':pale') ? ['1-2', '1-3', '2-3'] : ['3', '2']));

                abort_if(array_diff(array_keys($rule['payouts'] ?? []), $categories), 422, 'Categoría de premio inválida.');

                if ($section === 'pairs') {

                    [$a,$b] = array_map('intval', explode('-', $key));

                    abort_unless($a < $b && Draw::whereIn('id', [$a, $b])->count() === 2, 422, 'Pareja inválida.');

                    abort_if(isset($rule['primary_draw_id']) && ! in_array((int) $rule['primary_draw_id'], [$a, $b], true), 422, 'El sorteo base debe pertenecer a la pareja.');

                    foreach (Draw::whereIn('id', [$a, $b])->get() as $draw) {

                        abort_unless(in_array('super_pale', $draw->modalities), 422, 'Ambos sorteos deben aceptar súper palé.');

                    }

                }

            }

        }

        DB::transaction(function () use ($data, $branch, $r, $officeTarget) {

            $office = Office::whereKey($officeTarget->id)->lockForUpdate()->firstOrFail();

            $target = $data['scope'] === 'office' ? $office : $branch->refresh()->setRelation('office', $office);

            if ($data['scope'] === 'office') {

                abort_if($office->currency !== $data['currency'] && (Ticket::where('office_id', $office->id)->exists() || \App\Models\CashSession::where('office_id', $office->id)->exists()), 422, 'La moneda no puede cambiar después de operar.');

                $target->currency = $data['currency'];

            } else {

                unset($data['settings']['consortium_limit_minor']);

            }

            $settings = array_filter($data['settings'], fn ($v) => $v !== null);
            $customLabels = $settings['payment_method_labels'] ?? [];
            foreach ($customLabels as $method => &$name) {
                if (!preg_match('/^custom_[a-f0-9]{12}$/D', $method) || trim($name) === '') {
                    throw \Illuminate\Validation\ValidationException::withMessages(['settings.payment_method_labels'=>'Indica nombres válidos para los medios de cobro personalizados.']);
                }
                $name = trim($name);
            }
            unset($name);
            // Keep disabled definitions and freeze inherited names for independent banks.
            if ($data['scope'] === 'office' || isset($settings['payment_methods'])) {
                $settings['payment_method_labels'] = array_replace($target->lottery_settings['payment_method_labels'] ?? [], $customLabels);
                if ($data['scope'] === 'branch') {
                    foreach ($settings['payment_methods'] as $method) {
                        if (!isset($settings['payment_method_labels'][$method]) && isset($office->lottery_settings['payment_method_labels'][$method])) {
                            $settings['payment_method_labels'][$method] = $office->lottery_settings['payment_method_labels'][$method];
                        }
                    }
                }
            } else {
                unset($settings['payment_method_labels']);
            }
            $catalog = Configuration::paymentMethodLabels($data['scope'] === 'branch' ? ($office->lottery_settings ?? []) : [], $settings);
            $names = array_map(fn ($name) => mb_strtolower(trim($name)), array_values($catalog));
            if (count($names) !== count(array_unique($names))) {
                throw \Illuminate\Validation\ValidationException::withMessages(['settings.payment_method_labels'=>'Ya existe un medio de cobro con ese nombre.']);
            }
            $methods = $settings['payment_methods'] ?? ($data['scope'] === 'branch' ? ($office->lottery_settings['payment_methods'] ?? ['cash']) : ['cash']);
            if (array_diff($methods, array_keys($catalog))) {
                throw \Illuminate\Validation\ValidationException::withMessages(['settings.payment_methods'=>'Crea el medio de cobro antes de habilitarlo.']);
            }
            if ($data['scope'] === 'branch' && !isset($settings['payment_methods'])) {
                unset($settings['payment_reference_required']);
            } else {
                $referenceDefaults = $data['scope'] === 'branch' && !isset($target->lottery_settings['payment_methods'])
                    ? ($office->lottery_settings['payment_reference_required'] ?? [])
                    : ($target->lottery_settings['payment_reference_required'] ?? []);
                $requiredReferences = $settings['payment_reference_required'] ?? $referenceDefaults;
                if (array_diff(array_keys($requiredReferences), array_keys($catalog))) {
                    throw \Illuminate\Validation\ValidationException::withMessages(['settings.payment_reference_required'=>'La referencia debe configurarse para un medio de cobro existente.']);
                }
                $settings['payment_reference_required'] = array_map(fn ($required) => (bool) $required, $requiredReferences);
            }
            if (($target->lottery_settings['payment_methods'] ?? null) !== ($settings['payment_methods'] ?? null)
                || ($target->lottery_settings['payment_method_labels'] ?? []) !== ($settings['payment_method_labels'] ?? [])
                || ($target->lottery_settings['payment_reference_required'] ?? []) !== ($settings['payment_reference_required'] ?? [])) {
                abort_unless($r->user()->canDo('lottery.payments.configure'), 403, 'No tienes permiso para configurar los medios de cobro.');
                LotteryAudit::create(['office_id'=>$office->id,'user_id'=>$r->user()->id,'action'=>'payment_methods.changed',
                    'payload'=>['scope'=>$data['scope'],'branch_id'=>$branch?->id,'before'=>$target->lottery_settings['payment_methods'] ?? null,'after'=>$settings['payment_methods'] ?? null,
                        'labels_before'=>$target->lottery_settings['payment_method_labels'] ?? [],'labels_after'=>$settings['payment_method_labels'] ?? [],
                        'references_before'=>$target->lottery_settings['payment_reference_required'] ?? [],'references_after'=>$settings['payment_reference_required'] ?? []]]);
            }

            $modeChanged = ($target->lottery_settings['reconciliation_mode'] ?? null) !== ($settings['reconciliation_mode'] ?? null);
            $changedBanks = collect();
            if ($modeChanged) {
                abort_unless($r->user()->canDo('lottery.reconciliation.configure'), 403, 'No tienes permiso para cambiar la forma de cuadre.');
                $affected = $data['scope'] === 'office'
                    ? BranchOffice::where('office_id', $office->id)->lockForUpdate()->get()
                    : collect([$target]);
                $before = $affected->mapWithKeys(fn ($bank) => [$bank->id => app(Configuration::class)->reconciliationMode($bank->setRelation('office', $office))]);
                $target->lottery_settings = $settings;
                $changedBanks = $affected->filter(fn ($bank) => $before[$bank->id] !== app(Configuration::class)->reconciliationMode($bank));
                $openBanks = \App\Models\CashSession::whereIn('active_branch_id', $changedBanks->pluck('id'))->pluck('branch_office_id');
                if ($openBanks->isNotEmpty()) throw \Illuminate\Validation\ValidationException::withMessages(['settings.reconciliation_mode'=>'Cierra primero las cajas abiertas de estas bancas antes de cambiar la forma de cuadre: '.$affected->whereIn('id', $openBanks)->pluck('code')->implode(', ').'.']);
            }

            $parent = $data['scope'] === 'office' ? Configuration::DEFAULTS : array_replace(Configuration::DEFAULTS, $office->lottery_settings ?? []);

            $effective = array_replace($parent, $settings);

            abort_if($effective['discount_amount_minor'] > $effective['discount_every_minor'], 422, 'El descuento no puede superar el bloque jugado.');

            $target->lottery_settings = $settings;

            $target->save();

            foreach ($changedBanks as $bank) {
                LotteryAudit::create(['office_id'=>$office->id,'user_id'=>$r->user()->id,'action'=>'reconciliation.mode_changed',
                    'payload'=>['branch_id'=>$bank->id,'before'=>$before[$bank->id],'after'=>app(Configuration::class)->reconciliationMode($bank),'scope'=>$data['scope']]]);
                $officeId = (int) $office->id; $bankId = (int) $bank->id;
                DB::afterCommit(static function () use ($officeId, $bankId) {
                    try { event(new \App\Events\CashModeChanged($officeId, $bankId)); } catch (\Throwable $error) { report($error); }
                });
            }

            LotteryAudit::create(['office_id' => $office->id, 'user_id' => $r->user()->id, 'action' => 'settings.updated', 'payload' => ['scope' => $data['scope'], 'settings' => $settings]]);

        });



        return back()->with('success', 'Configuración guardada.');

    }



    public function limits(Request $r)

    {

        $b = $this->branch($r);



        $data = ['limits' => BetLimit::where('office_id', $b->office_id)->latest()->get(),

            'branches' => BranchOffice::where('office_id', $b->office_id)->get(), 'draws' => Draw::with('lottery')->get(), 'currency' => $b->office->currency];

        return $r->wantsJson() ? response()->json($data) : Inertia::render('Lottery/Limits', $data);

    }



    public function saveLimit(Request $r)

    {

        $b = $this->branch($r);

        $data = $r->validate(['id' => 'nullable|integer', 'name' => 'required|string|max:150', 'branch_office_id' => ['nullable', Rule::exists('branch_offices', 'id')->where('office_id', $b->office_id)],

            'modality' => ['required', Rule::in(['all', 'quiniela', 'pale', 'tripleta', 'super_pale'])], 'category' => ['required', Rule::in(['all', '1', '2', '3', '1-1', '1-2', '1-3', '2-3'])],

            'match_type' => ['required', Rule::in(['all', 'exact', 'contains'])], 'numbers' => 'nullable|regex:/^\d{2}(-\d{2}){0,2}$/',

            'draw_ids' => 'nullable|array', 'draw_ids.*' => 'integer|exists:draws,id', 'pairs' => 'nullable|array', 'pairs.*' => 'regex:/^\d+-\d+$/',

            'aggregation' => ['required', Rule::in(['shared', 'separate'])], 'amount_minor' => 'required|integer|min:0|max:99999999999',

            'starts_on' => 'nullable|date_format:Y-m-d', 'ends_on' => 'nullable|date_format:Y-m-d|after_or_equal:starts_on', 'active' => 'required|boolean']);

        if ($data['match_type'] !== 'all') {

            abort_unless(! empty($data['numbers']), 422, 'Indica la jugada.');

        }

        if ($data['match_type'] === 'contains') {

            abort_unless(strlen($data['numbers']) === 2, 422, 'Indica un número de dos cifras.');

        }

        foreach ($data['pairs'] ?? [] as $pair) {

            [$a,$z] = array_map('intval', explode('-', $pair));

            abort_unless($a < $z && Draw::whereIn('id', [$a, $z])->count() === 2, 422, 'Pareja inválida.');

        }

        DB::transaction(function () use ($b, $data, $r) {

            Office::whereKey($b->office_id)->lockForUpdate()->firstOrFail();

            $limit = isset($data['id']) ? BetLimit::where('office_id', $b->office_id)->findOrFail($data['id']) : new BetLimit;

            $limit->fill($data);

            $limit->office_id = $b->office_id;

            $limit->save();

            LotteryAudit::create(['office_id' => $b->office_id, 'user_id' => $r->user()->id, 'action' => 'limit.saved', 'payload' => $limit->toArray()]);

        });



        return $r->wantsJson() ? response()->json(['message' => 'Restricción guardada.']) : back()->with('success', 'Restricción guardada.');

    }



    public function deleteLimit(Request $r, int $limit)

    {

        $branch = $this->branch($r);

        DB::transaction(function () use ($r, $branch, $limit) {

            Office::whereKey($branch->office_id)->lockForUpdate()->firstOrFail();

            $record = BetLimit::where('office_id', $branch->office_id)->findOrFail($limit);

            LotteryAudit::create(['office_id' => $branch->office_id, 'user_id' => $r->user()->id, 'action' => 'limit.deleted', 'payload' => $record->toArray()]);

            $record->delete();

        });

        return response()->json(['message' => 'Restricción eliminada.']);

    }



    public function sales(Request $r, Configuration $config)

    {

        $b = $this->branch($r);



        return Inertia::render('Lottery/Sales', ['branch' => $b, 'currency' => $b->office->currency, 'settings' => $config->effective($b), 'draws' => Draw::with('lottery')->get(), 'server_now' => $config->clock()->toIso8601String()]);

    }



    public function availability(Request $r, Configuration $config, LimitEngine $limits)

    {

        $b = $this->branch($r);

        $line = $config->prepare($b, $r->all());

        $r->validate(['pending' => 'nullable|array|max:500']);

        $pending = array_map(fn ($v) => $config->prepare($b, $v), $r->input('pending', []));



        return response()->json(['available_minor' => $limits->available($b, $line, $pending), 'server_now' => $config->clock()->toIso8601String()]);

    }



    public function sell(Request $r, SaleService $sales)

    {

        $b = $this->branch($r);

        $data = $r->validate(['payment_method'=>['sometimes', 'string', 'regex:/^(cash|transfer|card|deposit|custom_[a-f0-9]{12})$/D'], 'payment_reference'=>'nullable|string|max:100', 'request_key' => 'required|uuid', 'received' => ['sometimes', 'required', 'regex:/^\d{1,9}(\.\d{1,2})?$/D'], 'discount' => 'required|boolean', 'lines' => 'required|array|min:1|max:500', 'lines.*' => 'array']);



        $ticket = $sales->sell($r->user(), $b, $data);
        $ticket->setAttribute('print_settings', ['show_qr' => (bool) app(Configuration::class)->effective($b)['show_qr'], 'company_name' => $b->office->name, 'branch_name' => $b->name ?: $b->code]);
        return response()->json($ticket);

    }



    public function tickets(Request $r)

    {

        $b = $this->branch($r);

        if ($r->boolean('reprint')) {
            $now = now();
            $testMode = app(\App\Services\Lottery\PrintPolicy::class)->isTestOffice($b->office_id);
            $r->validate(['reprint_period' => 'sometimes|in:recent,today,yesterday,all']);
            $period = $testMode ? $r->input('reprint_period', 'recent') : 'today';
            $today = $now->copy()->timezone('America/Santo_Domingo')->toDateString();
            $yesterday = $now->copy()->timezone('America/Santo_Domingo')->subDay()->toDateString();
            $tickets = Ticket::where('office_id', $b->office_id)->where('branch_office_id', $b->id)
                ->when($period === 'today', fn ($q) => $q->where('business_date', $today))
                ->when($period === 'yesterday', fn ($q) => $q->where('business_date', $yesterday))
                ->when($period === 'recent', fn ($q) => $q->whereIn('business_date', [$today, $yesterday]))
                ->latest()->get()
                ->map(fn ($ticket) => [
                    'code' => $ticket->code, 'reference'=>$ticket->reference, 'created_at' => $ticket->created_at->toIso8601String(), 'business_date' => $ticket->business_date,
                    'net_minor' => $ticket->net_minor, 'currency' => $ticket->currency, 'status' => $ticket->status,
                    'reprint_until' => $ticket->created_at->copy()->addMinutes((int) ($ticket->settings_snapshot['reprint_minutes'] ?? 15))->toIso8601String(),
                ])->values();
            return response()->json(['tickets' => $tickets, 'server_now' => $now->toIso8601String(), 'test_reprint' => $testMode]);
        }

        $query = Ticket::with(['lines.draw:id,name', 'lines.secondDraw:id,name'])->where('office_id', $b->office_id);

        if (! $r->user()->canViewCompanyData()) {

            $query->where('branch_office_id', $b->id);

        }

        if (! $r->wantsJson() && ! $r->has('period')) {
            $r->merge(['period' => 'today']);
        }
        $filters = $r->validate([
            'period' => 'nullable|in:today,yesterday,month,last_month,custom',
            'from' => 'required_if:period,custom|nullable|date_format:Y-m-d',
            'to' => 'required_if:period,custom|nullable|date_format:Y-m-d|after_or_equal:from',
        ]);
        $today = \Carbon\CarbonImmutable::now('America/Santo_Domingo')->startOfDay();
        $range = match ($filters['period'] ?? null) {
            'today' => [$today, $today],
            'yesterday' => [$today->subDay(), $today->subDay()],
            'month' => [$today->startOfMonth(), $today->endOfMonth()],
            'last_month' => [$today->subMonthNoOverflow()->startOfMonth(), $today->subMonthNoOverflow()->endOfMonth()],
            'custom' => [$filters['from'], $filters['to']],
            default => null,
        };
        if ($range) {
            $query->whereBetween('business_date', array_map(fn ($date) => is_string($date) ? $date : $date->toDateString(), $range));
        }

        if ($r->filled('search')) {

            $term=trim((string)$r->string('search'));
            $query->where(function($q)use($term){$q->where('code','like','%'.$term.'%');if(preg_match('/^(?:T-)?(\\d{1,18})$/iD',$term,$m))$q->orWhere('office_number',(int)$m[1]);});

        }

        $r->validate(['outcome' => 'nullable|in:all,winners,lost,pending,cancelled']);
        $outcome = $r->input('outcome', 'all');
        if ($outcome === 'cancelled') {
            $query->where('status', 'cancelled');
        } elseif ($outcome !== 'all') {
            $query->where('status', 'sold');
            if ($outcome === 'winners') {
                $query->whereHas('lines', fn ($q) => $q->where('prize_minor', '>', 0));
            } elseif ($outcome === 'lost') {
                $query->has('lines')->whereDoesntHave('lines', fn ($q) => $q->whereNull('prize_minor')->orWhere('prize_minor', '>', 0));
            } else {
                $query->whereDoesntHave('lines', fn ($q) => $q->where('prize_minor', '>', 0))
                    ->where(fn ($q) => $q->whereHas('lines', fn ($line) => $line->whereNull('prize_minor'))->orDoesntHave('lines'));
            }
        }

        if ($r->boolean('winners')) {

            $query->where('status', 'sold')->whereHas('lines', fn ($q) => $q->where('prize_minor', '>', 0));

        }



        $data = ['tickets' => $query->latest()->paginate(30)->withQueryString(), 'currency' => $b->office->currency];
        app(\App\Services\Lottery\CancellationPolicy::class)->annotate($data['tickets']->getCollection());



        return $r->wantsJson() ? response()->json($data) : Inertia::render('Lottery/Tickets', $data);

    }



    public function ticket(Request $r, string $code)

    {

        $b = $this->branch($r);



        $ticket = Ticket::with(['lines.draw:id,name', 'lines.secondDraw:id,name'])->where('office_id', $b->office_id)->where('branch_office_id', $b->id)->withReference($code)->firstOrFail();
        if ($r->boolean('reprint')) {
            if ($payment = app(\App\Services\Lottery\ContinuationTicket::class)->latestPayment($ticket)) {
                return app(\App\Services\Lottery\ContinuationTicket::class)->make($ticket, $payment);
            }
            $reason = app(\App\Services\Lottery\PrintPolicy::class)->denial($ticket);
            abort_if($reason !== null, 422, $reason ?? '');
        }
        $ticket->setAttribute('print_settings', ['show_qr' => (bool) app(Configuration::class)->effective($b)['show_qr'], 'company_name' => $b->office->name, 'branch_name' => $b->name ?: $b->code, 'test_reprint' => app(\App\Services\Lottery\PrintPolicy::class)->isTestOffice($b->office_id)]);
        $ticket->setAttribute('cancellation', app(\App\Services\Lottery\CancellationPolicy::class)->state($ticket));
        return $ticket;

    }



    public function printHistory(Request $r, string $code)
    {
        $ticket = $this->ticket($r, $code);
        $events = LotteryAudit::where('office_id', $ticket->office_id)
            ->whereIn('action', ['ticket.print_requested', 'ticket.print_denied'])
            ->where('payload->ticket', $ticket->code)->latest('id')->get();
        $users = \App\Models\User::whereIn('id', $events->pluck('user_id'))->pluck('name', 'id');
        return $events->map(fn ($event) => [
            'id' => $event->id, 'office_number'=>$event->office_number, 'created_at' => $event->created_at,
            'user' => $users[$event->user_id] ?? 'Usuario no disponible',
            'action' => $event->action, ...$event->payload,
        ]);
    }

    public function requestPrint(Request $r, string $code)
    {
        $data = $r->validate([
            'attempt_key' => 'required|uuid', 'trigger' => 'required|in:automatic,manual',
            'transport' => 'sometimes|in:browser,local', 'device_id' => 'required_if:transport,local|uuid',
            'printer' => 'required_if:transport,local|string|max:200', 'profile' => 'required_if:transport,local|in:epson,star',
            'paper_width' => 'required_if:transport,local|integer|in:58,80', 'cut' => 'required_if:transport,local|boolean',
            'feed_lines' => 'sometimes|integer|min:0|max:15',
            'document_type' => 'sometimes|in:sale,payout,continuation', 'payment_id' => 'required_if:document_type,payout,continuation|integer|min:1',
        ]);
        $target = ['transport' => $data['transport'] ?? 'browser'];
        if ($target['transport'] === 'local') {
            $target += array_intersect_key($data, array_flip(['device_id', 'printer', 'profile', 'paper_width', 'cut']));
            $target['paper_width'] = (int) $target['paper_width'];
            $target['cut'] = (bool) $target['cut'];
            $target['feed_lines'] = (int) ($data['feed_lines'] ?? 2);
            try { app(\App\Services\Lottery\PrintAuthorization::class)->publicKey(); }
            catch (\RuntimeException $e) { abort(503, $e->getMessage()); }
        }
        $bank = $this->branch($r);
        $payout = ($data['document_type'] ?? 'sale') === 'payout';
        $continuation = ($data['document_type'] ?? 'sale') === 'continuation';
        if ($payout) {
            abort_unless($r->user()->canDo('lottery.pay') && $r->user()->canDo('lottery.sell'), 403);
            $target += ['document_type' => 'payout', 'payment_id' => (int) $data['payment_id']];
        }
        if ($continuation) $target += ['document_type' => 'continuation', 'payment_id' => (int) $data['payment_id']];
        $target['test_reprint'] = app(\App\Services\Lottery\PrintPolicy::class)->isTestOffice($bank->office_id);
        $result = \Illuminate\Support\Facades\DB::transaction(function () use ($r, $code, $data, $bank, $target, $payout, $continuation) {
            Office::whereKey($bank->office_id)->lockForUpdate()->firstOrFail();
            $ticket = Ticket::where('office_id', $bank->office_id)->where('branch_office_id', $bank->id)->withReference($code)->firstOrFail();
            $code=$ticket->code;
            if (! $payout && ! $continuation && ($latestPayment = app(\App\Services\Lottery\ContinuationTicket::class)->latestPayment($ticket))) {
                $continuation = true;
                $target += ['document_type' => 'continuation', 'payment_id' => $latestPayment->id];
            }
            $documentType = $payout ? 'payout' : ($continuation ? 'continuation' : 'sale');
            if ($payout || $continuation) {
                $payment = LotteryAudit::where('office_id', $bank->office_id)->where('action', 'ticket.paid')->where('payload->ticket', $code)->findOrFail($target['payment_id']);
                $documentReceipt = $payout ? app(\App\Services\Lottery\PayoutReceipt::class)->make($ticket, $payment) : app(\App\Services\Lottery\ContinuationTicket::class)->make($ticket, $payment);
            }
            $events = LotteryAudit::where('office_id', $bank->office_id)->whereIn('action', ['ticket.print_requested', 'ticket.print_denied'])->where('payload->ticket', $code);
            $previous = (clone $events)->where('payload->attempt_key', $data['attempt_key'])->first();
            if ($payout || $continuation) $events->where('payload->document_type', $documentType)->where('payload->payment_id', $target['payment_id']);
            else $events->where(fn ($q) => $q->whereNull('payload->document_type')->orWhere('payload->document_type', 'sale'));
            if ($previous) {
                abort_unless($previous->user_id === $r->user()->id, 409);
                abort_unless(($previous->payload['document_type'] ?? 'sale') === $documentType, 409);
                foreach ($target as $key => $value) abort_unless(($previous->payload[$key] ?? match ($key) { 'transport' => 'browser', 'feed_lines' => 2, 'test_reprint' => false, default => null }) === $value, 409, 'Este intento corresponde a otra impresora o configuración.');
                abort_if(! $payout && ! $continuation && app(\App\Services\Lottery\PrintPolicy::class)->denial($ticket) !== null, 422, 'El ticket ya no está habilitado para impresión.');
                return ['audit_id' => $previous->id, 'audit_number'=>$previous->office_number, ...$previous->payload,
                    ...(! $payout && $previous->payload['status'] === 'requested' ? ['ticket_pin' => $ticket->payment_pin] : [])];
            }
            $sequence = (clone $events)->where('action', 'ticket.print_requested')->count() + 1;
            $reason = ($payout || $continuation) ? null : app(\App\Services\Lottery\PrintPolicy::class)->denial($ticket);
            $payload = ['ticket' => $code, 'branch_id' => $bank->id, 'branch_code' => $bank->code,
                'attempt_key' => $data['attempt_key'], 'trigger' => $data['trigger'],
                'sequence' => $reason ? null : $sequence, 'kind' => $sequence === 1 ? 'original' : 'reprint',
                'ip' => $r->ip(), 'user_agent' => substr((string) $r->userAgent(), 0, 500),
                'reason' => $reason, 'status' => $reason ? 'denied' : 'requested', 'ticket_status' => $ticket->status,
                'net_minor' => ($payout || $continuation) ? $documentReceipt['net_minor'] : $ticket->net_minor, 'currency' => $ticket->currency, ...$target];
            $event = LotteryAudit::create(['office_id' => $bank->office_id, 'user_id' => $r->user()->id,
                'action' => $reason ? 'ticket.print_denied' : 'ticket.print_requested', 'payload' => $payload]);
            // Return the PIN only for an authorized receipt, never persist it in the audit.
            return ['audit_id' => $event->id, 'audit_number'=>$event->office_number, ...$payload,
                ...(! $payout && $reason === null ? ['ticket_pin' => $ticket->payment_pin] : [])];
        });
        if ($target['transport'] === 'local' && $result['status'] === 'requested') {
            $ticket = Ticket::where('office_id', $bank->office_id)->where('branch_office_id', $bank->id)->withReference($code)->firstOrFail();
            $result['authorization'] = app(\App\Services\Lottery\PrintAuthorization::class)->issue($ticket, $bank, LotteryAudit::findOrFail($result['audit_id']));
        }
        if (($result['document_type'] ?? '') === 'continuation' && $result['status'] === 'requested') {
            $ticket = Ticket::where('office_id', $bank->office_id)->where('branch_office_id', $bank->id)->withReference($code)->firstOrFail();
            $payment = LotteryAudit::where('office_id', $bank->office_id)->findOrFail($result['payment_id']);
            $result['continuation_ticket'] = app(\App\Services\Lottery\ContinuationTicket::class)->make($ticket, $payment);
        }
        return response()->json($result, $result['status'] === 'denied' ? 422 : 200)->header('Cache-Control', 'no-store, private');
    }

    public function printStatus(Request $r, string $code)
    {
        $data = $r->validate([
            'attempt_key' => 'required|uuid', 'status' => 'required|in:submitted,failed,unknown',
            'spool_job_id' => 'nullable|integer|min:1',
        ]);
        $bank = $this->branch($r);
        return DB::transaction(function () use ($r, $code, $data, $bank) {
            Office::whereKey($bank->office_id)->lockForUpdate()->firstOrFail();
            $ticket = Ticket::where('office_id', $bank->office_id)->where('branch_office_id', $bank->id)->withReference($code)->firstOrFail();
            $event = LotteryAudit::where('office_id', $bank->office_id)->where('user_id', $r->user()->id)->where('action', 'ticket.print_requested')
                ->where('payload->ticket', $ticket->code)->where('payload->attempt_key', $data['attempt_key'])->firstOrFail();
            abort_unless(($event->payload['transport'] ?? '') === 'local', 422);
            $payload = $event->payload;
            if (($payload['delivery']['status'] ?? '') !== 'submitted') {
                // Receipt/PIN are deliberately excluded. This confirms queue acceptance, not paper output.
                $payload['delivery'] = ['status' => $data['status'], 'spool_job_id' => $data['spool_job_id'] ?? null,
                    'reported_at' => now()->toIso8601String()];
                $event->update(['payload' => $payload]);
            }
            return response()->json(['message' => 'Estado de impresión registrado.']);
        });
    }

    public function cancel(Request $r, string $code, SaleService $sales)

    {

        $data = $r->validate(['pin' => ['required', 'string', 'regex:/^[0-9]{6}$/D']], [
            'pin.required' => 'Introduce el PIN impreso en el ticket.',
            'pin.regex' => 'El PIN debe contener 6 dígitos.',
            'pin.string' => 'El PIN debe contener 6 dígitos.',
        ]);
        $sales->cancel($r->user(), $this->ticket($r, $code), $data['pin']);



        return $r->wantsJson() ? response()->json(['message' => 'Ticket anulado.']) : back()->with('success', 'Ticket anulado.');

    }



    public function pay(Request $r, string $code, ResultService $results)

    {

        abort_unless($r->user()->canDo('lottery.sell'), 403, 'Los premios se pagan desde Ventas.');
        $data = $r->validate(['pin' => ['required', 'string', 'regex:/^[0-9]{6}$/D'] ], [
            'pin.required' => 'Introduce el PIN impreso en el ticket.',
            'pin.regex' => 'El PIN debe contener 6 dígitos.',
            'pin.string' => 'El PIN debe contener 6 dígitos.',
        ]);
        $ticket = $this->ticket($r, $code);
        $payment = $results->pay($r->user(), $ticket, $data['pin']);



        return $r->wantsJson() ? response()->json([
            'message' => 'Premios pendientes pagados.', 'payment_receipt' => app(\App\Services\Lottery\PayoutReceipt::class)->make($ticket, $payment),
            'continuation_ticket' => !empty($payment->payload['continuation']) ? app(\App\Services\Lottery\ContinuationTicket::class)->make($ticket, $payment) : null,
        ])->header('Cache-Control', 'no-store, private') : back()->with('success', 'Premios pendientes pagados.');

    }



    public function syncResults(Request $r)
    {
        abort_unless($r->user()->isSuperAdmin(), 403);
        try {
            $exit = \Illuminate\Support\Facades\Artisan::call('lottery:import-results');
            $output = trim(\Illuminate\Support\Facades\Artisan::output());
            return response()->json(['message' => $output ?: 'Consulta completada. No hay resultados nuevos.', 'ok' => $exit === 0]);
        } catch (\Throwable $e) {
            report($e);
            return response()->json(['message' => 'No se pudo sincronizar la fuente. Intenta nuevamente.', 'ok' => false], 502);
        }
    }

    public function results(Request $r)

    {

        abort_unless($r->user()->isSuperAdmin(), 403);



        $r->validate(['from' => 'nullable|date_format:Y-m-d', 'to' => 'nullable|date_format:Y-m-d|after_or_equal:from']);
        $today = now()->timezone('America/Santo_Domingo')->toDateString();
        $from = $r->input('from') ?: $today;
        $to = $r->input('to') ?: $from;
        $lastUpdated=DrawResult::max('updated_at');
        $data = ['draws' => Draw::with('lottery')->get(), 'results' => DrawResult::whereBetween('business_date', [$from, $to])->orderByDesc('business_date')->latest()->get(), 'result_dates' => ['from' => $from, 'to' => $to]];
        $data['last_results_updated_at']=$lastUpdated ? \Carbon\CarbonImmutable::parse($lastUpdated,config('app.timezone'))->toIso8601String() : null;
        $data['last_automatic_sync']=\App\Models\ResultSyncRun::where('mode','automatic')->latest('id')->first()?->only(['status','started_at','finished_at','stats','message']);
        return $r->expectsJson() ? response()->json($data) : Inertia::render('Lottery/Results', $data);

    }

    public function publishedResults(Request $r, Configuration $configuration)
    {
        $bank = $this->branch($r);
        $today = $configuration->clock()->toDateString();
        $draws = Draw::whereIn('id', $configuration->effective($bank)['draw_ids'])->where('active', true)->with('lottery')->get()
            ->filter(fn ($draw) => $draw->lottery?->active)->keyBy('id');
        $results = DrawResult::whereIn('draw_id', $draws->keys())->where('business_date', $today)->where('status', 'confirmed')
            ->orderByDesc('updated_at')->orderByDesc('id')->get()->map(fn ($result) => [
                'id'=>$result->id, 'draw_id'=>$result->draw_id, 'name'=>$draws[$result->draw_id]->name,
                'source_key'=>$draws[$result->draw_id]->source_key, 'numbers'=>$result->numbers,
                'business_date'=>$result->business_date, 'published_at'=>$result->updated_at->toIso8601String(),
            ])->values();
        return response()->json(['date'=>$today, 'results'=>$results, 'consulted_at'=>$configuration->clock()->toIso8601String()])
            ->header('Cache-Control', 'no-store, private');
    }



    public function saveResult(Request $r, ResultService $service)

    {

        abort_unless($r->user()->isSuperAdmin(), 403);

        $data = $r->validate(['draw_id' => 'required|exists:draws,id', 'business_date' => 'required|date_format:Y-m-d|before_or_equal:today',

            'numbers' => 'required|array|min:1|max:3', 'numbers.*' => 'required|regex:/^\d{2}$/', 'confirmed' => 'required|boolean']);

        abort_unless(count($data['numbers']) === Draw::findOrFail($data['draw_id'])->result_count, 422, 'La cantidad de posiciones no coincide con el sorteo.');

        $service->record($data, $r->user());



        return $r->expectsJson() ? response()->json(['ok' => true]) : back()->with('success', 'Resultado guardado y premios recalculados cuando corresponde.');

    }

    public function deleteResult(Request $r, DrawResult $result, ResultService $service)
    {
        abort_unless($r->user()->isSuperAdmin(), 403);
        $service->remove($result, $r->user());
        return response()->json(['ok' => true]);
    }
}
