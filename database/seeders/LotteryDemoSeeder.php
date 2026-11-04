<?php

namespace Database\Seeders;

use App\Models\{BetLimit, BranchOffice, Draw, Lottery, Office, User};
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/** Explicit opt-in: never called by the production DatabaseSeeder. */
class LotteryDemoSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            throw new \RuntimeException('Los datos de demostración solo se cargan en local o testing.');
        }
        DB::transaction(function () {
            $catalog = json_decode(file_get_contents(database_path('data/boletoganador.json')), true, flags: JSON_THROW_ON_ERROR);
            $draws = [];
            foreach ($catalog['draws'] as $item) {
                $group = match (true) {
                    str_starts_with($item['name'], 'Anguila') => 'Anguila',
                    str_starts_with($item['name'], 'Haiti') => 'Haití Bolet',
                    str_starts_with($item['name'], 'King') => 'King Lottery',
                    str_starts_with($item['name'], 'La Primera') => 'La Primera',
                    str_starts_with($item['name'], 'La Suerte') => 'La Suerte',
                    str_starts_with($item['name'], 'New York') => 'New York',
                    str_starts_with($item['name'], 'Florida') => 'Florida',
                    in_array($item['name'], ['Gana Mas', 'Loteria Nacional']) => 'Lotería Nacional',
                    in_array($item['name'], ['Quiniela Leidsa', 'Pega 3 Mas']) => 'LEIDSA',
                    $item['name'] === 'Quiniela Real' => 'Loto Real',
                    $item['name'] === 'Quiniela Loteka' => 'Loteka',
                    $item['name'] === 'Quiniela LoteDom' => 'LoteDom',
                    default => throw new \RuntimeException('Lotería sin clasificar: '.$item['name']),
                };
                $lottery = Lottery::firstOrCreate(['name' => $group], ['active' => true]);
                $draws[] = Draw::firstOrCreate(['source_key' => basename($item['url'])], [
                    'lottery_id' => $lottery->id, 'name' => $item['name'],
                    'opens_at' => '06:00:00',
                    'closes_at' => CarbonImmutable::parse($item['draws_at'])->subMinutes(5)->format('H:i:s'),
                    'draws_at' => $item['draws_at'], 'weekdays' => [0, 1, 2, 3, 4, 5, 6],
                    'modalities' => ['quiniela', 'pale', 'tripleta', 'super_pale'],
                    'result_count' => 3, 'source_url' => $item['url'], 'active' => true,
                ]);
            }
            $office = Office::firstOrCreate(['name' => 'Consorcio de prueba LotoEnlace'], [
                'currency' => 'DOP', 'is_active' => true, 'slogan' => 'DEMO — tarifas y límites de prueba',
            ]);
            // Preserve subsequent user edits when the command is run again.
            if ($office->wasRecentlyCreated) {
                $rules = $pairs = [];
                foreach ($draws as $draw) {
                    foreach (['quiniela' => ['1' => 60, '2' => 10, '3' => 5],
                        'pale' => ['1-2' => 1000, '1-3' => 1000, '2-3' => 100],
                        'tripleta' => ['3' => 2000, '2' => 100]] as $mode => $payouts) {
                        $rules[$draw->id.':'.$mode] = ['payouts' => $payouts, 'commission_bps' => 1000];
                    }
                    foreach ($draws as $other) {
                        if ($other->id <= $draw->id) {
                            continue;
                        }
                        $pairs[$draw->id.'-'.$other->id] = ['enabled' => true, 'ordered' => false,
                            'primary_draw_id' => $draw->id, 'payouts' => ['1-1' => 3000, '1-2' => 300, '1-3' => 100],
                            'commission_bps' => 1000];
                    }
                }
                $office->update(['lottery_settings' => [
                    'daily_limit_minor' => 1000000, 'consortium_limit_minor' => 5000000,
                    'cancel_minutes' => 5, 'reprint_minutes' => 15, 'show_qr' => false,
                    'discount_enabled' => true, 'discount_every_minor' => 1000, 'discount_amount_minor' => 100,
                    'footer' => 'DEMO LotoEnlace — sin valor comercial',
                    'draw_ids' => array_map(fn ($d) => $d->id, $draws), 'rules' => $rules, 'pairs' => $pairs,
                ]]);
            }
            $bank = BranchOffice::firstOrCreate(['office_id' => $office->id, 'code' => 'PRUEBA-001'], [
                'name' => 'Banca de prueba', 'is_main' => true, 'is_active' => true, 'lottery_settings' => [],
            ]);
            if ($bank->wasRecentlyCreated) {
                $national = collect($draws)->firstWhere('source_key', 'resultados-loteria-nacional-noche');
                $leidsa = collect($draws)->firstWhere('source_key', 'resultados-quiniela-leidsa');
                $pairIds = [$national->id, $leidsa->id];
                sort($pairIds);
                $examples = [
                    ['name' => 'DEMO: 00 bloqueado en todos los sorteos', 'modality' => 'quiniela', 'numbers' => '00', 'amount_minor' => 0],
                    ['name' => 'DEMO: 10 hasta RD$100 compartidos', 'modality' => 'quiniela', 'numbers' => '10', 'amount_minor' => 10000],
                    ['name' => 'DEMO banca: 20 hasta RD$50 compartidos', 'branch_office_id' => $bank->id, 'modality' => 'quiniela', 'numbers' => '20', 'amount_minor' => 5000],
                    ['name' => 'DEMO: palé 10-20 hasta RD$100 por sorteo', 'modality' => 'pale', 'numbers' => '10-20', 'amount_minor' => 10000, 'aggregation' => 'separate'],
                    ['name' => 'DEMO: tripleta 10-20-30 hasta RD$50', 'modality' => 'tripleta', 'numbers' => '10-20-30', 'amount_minor' => 5000],
                    ['name' => 'DEMO: súper palé 00-00 bloqueado sin restricción de sorteos', 'modality' => 'super_pale', 'category' => '1-1', 'numbers' => '00-00', 'amount_minor' => 0],
                    ['name' => 'DEMO: súper palé 10-20 hasta RD$100 sin restricción de sorteos', 'modality' => 'super_pale', 'category' => '1-2', 'numbers' => '10-20', 'amount_minor' => 10000],
                    ['name' => 'DEMO banca: súper palé 10-20 Nacional + LEIDSA hasta RD$25', 'branch_office_id' => $bank->id, 'modality' => 'super_pale', 'category' => '1-3', 'numbers' => '10-20', 'amount_minor' => 2500, 'pairs' => [implode('-', $pairIds)]],
                    ['name' => 'DEMO: 99 bloqueado solo en Nacional noche', 'modality' => 'quiniela', 'numbers' => '99', 'amount_minor' => 0, 'draw_ids' => [$national->id]],
                ];
                foreach ($examples as $example) {
                    BetLimit::create(array_replace(['office_id' => $office->id, 'category' => 'all',
                        'match_type' => 'exact', 'aggregation' => 'shared', 'active' => true], $example));
                }
            }
            $admin = User::where('email', 'admin@lotoenlace.test')->first();
            if ($admin) {
                $admin->branchOffices()->syncWithoutDetaching([$bank->id => ['is_default' => true]]);
                if (! $admin->active_branch_office_id) {
                    $admin->update(['active_branch_office_id' => $bank->id]);
                }
            }
        });
    }
}
