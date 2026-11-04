<?php
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (! app()->environment('local')) throw new RuntimeException('Solo para el entorno local de prueba.');
Illuminate\Support\Facades\DB::transaction(function () {
    $bank = App\Models\BranchOffice::where('code', 'PRUEBA-001')->firstOrFail();
    $office = App\Models\Office::whereKey($bank->office_id)->lockForUpdate()->firstOrFail();
    if ($office->name !== 'Consorcio de prueba LotoEnlace') throw new RuntimeException('Consorcio inesperado.');
    $quemaito = App\Models\Draw::where('source_key', 'resultados-el-quemaito-mayor')->firstOrFail();
    $quiniela = App\Models\Draw::where('source_key', 'resultados-lotedom')->firstOrFail();
    foreach ([$quemaito, $quiniela] as $draw) {
        $draw->update(['modalities'=>array_values(array_unique([...$draw->modalities, 'super_pale']))]);
    }
    $ids = [$quemaito->id, $quiniela->id];
    sort($ids);
    $key = implode('-', $ids);
    $settings = $office->lottery_settings ?? [];
    $settings['draw_ids'] = array_values(array_unique(array_merge($settings['draw_ids'] ?? [], $ids)));
    $rule = array_replace(['ordered'=>false, 'payouts'=>['1-1'=>3000,'1-2'=>300,'1-3'=>100]], $settings['super_pale'] ?? [], $settings['pairs'][$key] ?? []);
    $rule['enabled'] = true;
    $rule['primary_draw_id'] = $quemaito->id;
    $settings['pairs'][$key] = $rule;
    $office->update(['lottery_settings'=>$settings]);
    $config = app(App\Services\Lottery\Configuration::class);
    $bank = $bank->fresh();
    $effective = $config->effective($bank);
    if (!($effective['pairs'][$key]['enabled'] ?? false)) throw new RuntimeException('La banca no hereda la pareja.');
    // Validate the selling path during the next normal opening, without issuing a ticket.
    Carbon\CarbonImmutable::setTestNow(Carbon\CarbonImmutable::now('America/Santo_Domingo')->addDay()->setTime(10,0));
    try {
        $prepared = $config->prepare($bank, ['draw_id'=>$quemaito->id,'second_draw_id'=>$quiniela->id,'modality'=>'super_pale','numbers'=>'01-22','amount'=>'1']);
    } finally { Carbon\CarbonImmutable::setTestNow(); }
    App\Models\LotteryAudit::create(['office_id'=>$office->id,'action'=>'configuration.demo_pair_enabled','payload'=>['pair'=>$key,'rule'=>$rule]]);
    echo json_encode(['bank'=>$bank->code,'pair'=>$key,'rule'=>$effective['pairs'][$key],'validation'=>'OK','open_now'=>$config->window($quemaito)['open']], JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL;
});
