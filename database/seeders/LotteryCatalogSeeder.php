<?php

namespace Database\Seeders;

use App\Models\Draw;
use App\Models\Lottery;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class LotteryCatalogSeeder extends Seeder
{
    public function run(): void
    {
        Cache::lock('lottery-catalog-seed', 60)->block(10, function () {
            DB::transaction(function () {
                $this->seedBaseDraws();
                $this->call(QuemaitoMayorSeeder::class);
            });
        });
    }

    /** @return array<string, Draw> */
    public function seedBaseDraws(): array
    {
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
                in_array($item['name'], ['Gana Mas', 'Loteria Nacional'], true) => 'Lotería Nacional',
                in_array($item['name'], ['Quiniela Leidsa', 'Pega 3 Mas'], true) => 'LEIDSA',
                $item['name'] === 'Quiniela Real' => 'Loto Real',
                $item['name'] === 'Quiniela Loteka' => 'Loteka',
                $item['name'] === 'Quiniela LoteDom' => 'LoteDom',
                default => throw new \RuntimeException('Lotería sin clasificar: '.$item['name']),
            };
            $lottery = Lottery::firstOrCreate(['name' => $group], ['active' => true]);
            $sourceKey = basename($item['url']);
            $draws[$sourceKey] = Draw::firstWhere('source_key', $sourceKey)
                ?? $lottery->draws()->firstOrCreate(['name' => $item['name']], [
                    'opens_at' => '06:00:00',
                    'closes_at' => CarbonImmutable::parse($item['draws_at'])->subMinutes(5)->format('H:i:s'),
                    'draws_at' => $item['draws_at'], 'weekdays' => [0, 1, 2, 3, 4, 5, 6],
                    'modalities' => ['quiniela', 'pale', 'tripleta', 'super_pale'], 'result_count' => 3,
                    'source_key' => $sourceKey, 'source_url' => $item['url'], 'active' => true,
                ]);
        }

        return $draws;
    }
}
