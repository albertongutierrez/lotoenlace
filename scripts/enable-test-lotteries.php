<?php
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
Illuminate\Support\Facades\DB::transaction(function () {
    $bank = App\Models\BranchOffice::where('code', 'PRUEBA-001')->firstOrFail();
    $office = App\Models\Office::whereKey($bank->office_id)->lockForUpdate()->firstOrFail();
    $settings = $office->lottery_settings ?? [];
    $ids = [];
    foreach (['A', 'B'] as $suffix) {
        $lottery = App\Models\Lottery::firstOrCreate(['name' => 'PRUEBA '.$suffix], ['active' => true]);
        $draw = App\Models\Draw::firstOrCreate(['lottery_id' => $lottery->id, 'name' => 'Sorteo de prueba '.$suffix], [
            'active' => true, 'opens_at' => '00:00:00', 'closes_at' => '23:59:00', 'draws_at' => '23:59:59',
            'weekdays' => [0,1,2,3,4,5,6], 'modalities' => ['quiniela','pale','tripleta','super_pale'], 'result_count' => 3,
        ]);
        $ids[] = $draw->id;
        foreach (['quiniela' => ['1'=>60,'2'=>10,'3'=>5], 'pale'=>['1-2'=>1000,'1-3'=>1000,'2-3'=>100], 'tripleta'=>['3'=>2000,'2'=>100]] as $mode=>$payouts) {
            $settings['rules'][$draw->id.':'.$mode] ??= ['payouts'=>$payouts,'commission_bps'=>1000];
        }
    }
    $settings['draw_ids'] = array_values(array_unique(array_merge($settings['draw_ids'] ?? [], $ids)));
    $settings['pairs'][implode('-', $ids)] = ['enabled'=>true,'ordered'=>false,'primary_draw_id'=>$ids[0], 'payouts'=>['1-1'=>3000,'1-2'=>300,'1-3'=>100],'commission_bps'=>1000];
    $office->update(['lottery_settings'=>$settings]);
    $config = app(App\Services\Lottery\Configuration::class);
    $bank = $bank->fresh();
    foreach ($ids as $id) {
        $config->prepare($bank, ['draw_id'=>$id,'modality'=>'quiniela','numbers'=>'01','amount'=>'1']);
    }
    $config->prepare($bank, ['draw_id'=>$ids[0],'second_draw_id'=>$ids[1],'modality'=>'super_pale','numbers'=>'01-22','amount'=>'1']);
    echo 'Habilitados y validados: '.implode(', ', $ids).PHP_EOL;
});
