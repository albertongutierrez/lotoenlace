<?php

namespace App\Services\Lottery;

use App\Models\BranchOffice;
use App\Models\Draw;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

class Configuration
{
    public const PAYMENT_METHODS = ['cash'=>'Efectivo', 'transfer'=>'Transferencia', 'card'=>'Tarjeta', 'deposit'=>'Depósito'];
    public const DEFAULTS = ['payment_methods' => ['cash'], 'payment_method_labels' => [], 'payment_reference_required' => [], 'reconciliation_mode' => 'cash', 'daily_limit_minor' => null, 'consortium_limit_minor' => null, 'cancel_minutes' => 5,
        'reprint_minutes' => 15, 'show_qr' => false, 'discount_enabled' => false, 'discount_every_minor' => 1000,
        'discount_amount_minor' => 100, 'footer' => '', 'draw_ids' => [], 'general_rules' => [], 'rules' => [], 'pairs' => [], 'super_pale' => []];

    public function effective(BranchOffice $branch): array
    {
        $parent = array_replace(self::DEFAULTS, $branch->office->lottery_settings ?? []);
        $overrides = array_filter($branch->lottery_settings ?? [], fn ($value) => $value !== null);
        $result = array_replace($parent, $overrides);
        $result['payment_method_labels'] = self::paymentMethodLabels($parent, $overrides);
        $result['payment_reference_required'] = isset($overrides['payment_methods'])
            ? ($overrides['payment_reference_required'] ?? [])
            : ($parent['payment_reference_required'] ?? []);
        $result['consortium_limit_minor'] = $parent['consortium_limit_minor'];
        $result['draw_ids'] = array_values(array_intersect($parent['draw_ids'], $result['draw_ids']));
        // Override individual rule fields, rather than copying an entire parent's tariff table.
        $result['rules'] = $parent['rules'];
        foreach ($overrides['rules'] ?? [] as $key => $rule) {
            $result['rules'][$key] = array_replace($parent['rules'][$key] ?? [], array_filter($rule, fn ($v) => $v !== null));
        }
        $draws = Draw::whereIn('id', $result['draw_ids'])->get();
        $result['general_rules'] = [];
        foreach (['quiniela', 'pale', 'tripleta'] as $mode) {
            $general = array_filter($parent['general_rules'][$mode] ?? [], fn ($v) => $v !== null);
            $branchGeneral = array_filter($overrides['general_rules'][$mode] ?? [], fn ($v) => $v !== null);
            $result['general_rules'][$mode] = array_replace($general, $branchGeneral);
            foreach ($draws as $draw) {
                if (! in_array($mode, $draw->modalities, true)) {
                    continue;
                }
                $key = $draw->id.':'.$mode;
                $result['rules'][$key] = array_replace($general,
                    array_filter($parent['rules'][$key] ?? [], fn ($v) => $v !== null),
                    $branchGeneral,
                    array_filter($overrides['rules'][$key] ?? [], fn ($v) => $v !== null));
            }
        }
        $result['super_pale'] = array_replace($parent['super_pale'], array_filter($overrides['super_pale'] ?? [], fn ($v) => $v !== null));
        $result['pairs'] = [];
        $ids = $draws->filter(fn ($draw) => in_array('super_pale', $draw->modalities, true))->pluck('id')->sort()->values()->all();
        for ($i = 0; $i < count($ids); $i++) {
            for ($j = $i + 1; $j < count($ids); $j++) {
                $key = $ids[$i].'-'.$ids[$j];
                $consortiumRule = array_replace($parent['super_pale'], array_filter($parent['pairs'][$key] ?? [], fn ($v) => $v !== null));
                $rule = array_replace($consortiumRule,
                    array_filter($overrides['super_pale'] ?? [], fn ($v) => $v !== null),
                    array_filter($overrides['pairs'][$key] ?? [], fn ($v) => $v !== null));
                if (! ($consortiumRule['enabled'] ?? false)) {
                    $rule['enabled'] = false;
                }
                $result['pairs'][$key] = $rule;
            }
        }

        return $result;
    }

    /** Stable keys identify methods; names are captured with each sale, never inferred from today's settings. */
    public static function paymentMethodLabels(array ...$settings): array
    {
        $labels = self::PAYMENT_METHODS;
        foreach ($settings as $values) {
            foreach ($values['payment_method_labels'] ?? [] as $key => $name) {
                if (preg_match('/^custom_[a-f0-9]{12}$/D', $key) && is_string($name)) $labels[$key] = $name;
            }
        }
        return $labels;
    }

    public function clock(): CarbonImmutable
    {
        return CarbonImmutable::now('America/Santo_Domingo');
    }

    public function reconciliationMode(BranchOffice $branch): string
    {
        return ($branch->lottery_settings['reconciliation_mode'] ?? $branch->office->lottery_settings['reconciliation_mode'] ?? 'cash') === 'report' ? 'report' : 'cash';
    }

    public function window(Draw $draw, ?CarbonImmutable $now = null): ?array
    {
        $now ??= $this->clock();
        $exception = ($draw->exceptions ?? [])[$now->toDateString()] ?? [];
        if (! $draw->active || ($exception['closed'] ?? false) || ! in_array($now->dayOfWeek, $draw->weekdays, true)) {
            return null;
        }
        $open = $now->setTimeFromTimeString($exception['opens_at'] ?? $draw->opens_at);
        $close = $now->setTimeFromTimeString($exception['closes_at'] ?? $draw->closes_at);

        // Same-day sessions only; reject overnight schedules in configuration.
        return ['opens_at' => $open, 'closes_at' => $close, 'open' => $now->gte($open) && $now->lt($close)];
    }

    public function prepare(BranchOffice $branch, array $input): array
    {
        $settings = $this->effective($branch);
        $mode = $input['modality'] ?? '';
        $count = ['quiniela' => 1, 'pale' => 2, 'tripleta' => 3, 'super_pale' => 2][$mode] ?? 0;
        $raw = preg_replace('/[\s-]/', '', (string) ($input['numbers'] ?? ''));
        if (! $count || ! preg_match('/^\d{'.($count * 2).'}$/D', $raw)) {
            $this->fail('Jugada inválida. Usa números de dos cifras.');
        }
        $numbers = str_split($raw, 2);
        $first = (int) ($input['draw_id'] ?? 0);
        $second = $mode === 'super_pale' ? (int) ($input['second_draw_id'] ?? 0) : null;
        if ($mode === 'super_pale' && (! $second || $first === $second)) {
            $this->fail('El súper palé requiere dos sorteos distintos.');
        }
        if ($second && $first > $second) {
            [$first, $second] = [$second, $first];
        }
        $ids = array_values(array_filter([$first, $second]));
        $closing = [];
        foreach ($ids as $id) {
            if (! in_array($id, $settings['draw_ids'])) {
                $this->fail('Sorteo no habilitado para esta banca.');
            }
            $draw = Draw::find($id);
            if (! $draw || ! $draw->lottery?->active || ! in_array($mode, $draw->modalities, true)) {
                $this->fail('Lotería o modalidad no habilitada para el sorteo.');
            }
            $window = $this->window($draw);
            if (! $window || ! $window['open']) {
                $this->fail('Un sorteo está cerrado. Revisa las jugadas.');
            }
            $closing[] = $window['closes_at'];
        }
        if ($second) {
            $rule = $settings['pairs']["$first-$second"] ?? [];
            if (! ($rule['enabled'] ?? false)) {
                $this->fail('Configura y habilita esta pareja de súper palé.');
            }
        } else {
            $rule = $settings['rules']["$first:$mode"] ?? [];
        }
        if (empty($rule['payouts'])) {
            $this->fail('Falta configurar la tabla de premios.');
        }
        $ordered = $second && ($rule['ordered'] ?? false);
        if (! $ordered) {
            sort($numbers, SORT_STRING);
        }
        $amount = Money::minor($input['amount'] ?? '0');
        if ($amount < 1) {
            $this->fail('El monto debe ser mayor que cero.');
        }

        return ['draw_id' => $first, 'second_draw_id' => $second, 'modality' => $mode, 'numbers' => implode('-', $numbers),
            'amount_minor' => $amount, 'rules' => $rule, 'closes_at' => min($closing)->utc()->format('Y-m-d H:i:s')];
    }

    private function fail(string $message): never
    {
        throw ValidationException::withMessages(['sale' => $message]);
    }
}
