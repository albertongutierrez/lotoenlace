<?php

namespace Database\Seeders;

use App\Models\Draw;
use App\Models\Lottery;
use Illuminate\Database\Seeder;

class QuemaitoMayorSeeder extends Seeder
{
    public function run(): void
    {
        $sourceKey = 'resultados-el-quemaito-mayor';
        if (Draw::where('source_key', $sourceKey)->exists()) {
            return;
        }

        $lottery = Lottery::firstOrCreate(['name' => 'LoteDom'], ['active' => true]);
        $lottery->draws()->firstOrCreate(['name' => 'El Quemaito Mayor'], [
            'opens_at' => '06:00:00', 'closes_at' => '11:55:00', 'draws_at' => '12:00:00',
            'weekdays' => [0, 1, 2, 3, 4, 5, 6], 'modalities' => ['quiniela', 'super_pale'],
            'result_count' => 1, 'active' => true,
            'source_key' => $sourceKey,
            'source_url' => 'https://elboletoganador.com/loteria/resultados-el-quemaito-mayor',
        ]);
    }
}
