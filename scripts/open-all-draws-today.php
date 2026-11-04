<?php
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (!app()->environment('local')) throw new RuntimeException('Solo entorno local.');
$day = now('America/Santo_Domingo')->toDateString();
$bank = App\Models\BranchOffice::where('code','PRUEBA-001')->firstOrFail();
$office = App\Models\Office::findOrFail($bank->office_id);
$draws = App\Models\Draw::all();
$path = storage_path('app/private/test-opening-'.$day.'-'.date('His').'.json');
file_put_contents($path, json_encode(['office_id'=>$office->id,'office_settings'=>$office->lottery_settings,'branch_id'=>$bank->id,'branch_settings'=>$bank->lottery_settings,'draws'=>$draws->map->only(['id','active','weekdays','exceptions']),'lotteries'=>App\Models\Lottery::all(['id','active'])], JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
Illuminate\Support\Facades\DB::transaction(function () use ($bank,$office,$draws,$day) {
    foreach ($draws as $draw) {
        $exceptions = $draw->exceptions ?? [];
        $exceptions[$day] = ['closed'=>false,'opens_at'=>'00:00:00','closes_at'=>'23:59:59'];
        $draw->update(['active'=>true,'exceptions'=>$exceptions,'weekdays'=>array_values(array_unique(array_merge($draw->weekdays ?? [],[now('America/Santo_Domingo')->dayOfWeek])))]);
    }
    App\Models\Lottery::query()->update(['active'=>true]);
    $settings = $office->lottery_settings ?? [];
    $settings['draw_ids'] = $draws->modelKeys();
    $office->update(['lottery_settings'=>$settings]);
    $overrides = $bank->lottery_settings ?? [];
    if (array_key_exists('draw_ids',$overrides)) { $overrides['draw_ids']=$draws->modelKeys(); $bank->update(['lottery_settings'=>$overrides]); }
});
$config = app(App\Services\Lottery\Configuration::class);
$effective = $config->effective($bank->fresh());
$open = App\Models\Draw::whereIn('id',$effective['draw_ids'])->get()->filter(fn($d)=>($config->window($d)['open'] ?? false));
echo count($open).' sorteos abiertos hasta '.$day.' 23:59:59 RD'.PHP_EOL;
