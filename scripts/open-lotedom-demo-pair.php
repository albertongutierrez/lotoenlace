<?php
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (!app()->environment('local')) throw new RuntimeException('Solo local.');
Illuminate\Support\Facades\DB::transaction(function () {
    $bank=App\Models\BranchOffice::where('code','PRUEBA-001')->firstOrFail();
    $office=App\Models\Office::whereKey($bank->office_id)->lockForUpdate()->firstOrFail();
    if ($office->name !== 'Consorcio de prueba LotoEnlace') throw new RuntimeException('Consorcio inesperado');
    $today=app(App\Services\Lottery\Configuration::class)->clock()->toDateString();
    $clones=[];
    foreach (['resultados-el-quemaito-mayor','resultados-lotedom'] as $key) {
        $original=App\Models\Draw::where('source_key',$key)->firstOrFail();
        $clone=App\Models\Draw::firstOrCreate(['lottery_id'=>$original->lottery_id,'name'=>$original->name.' · PRUEBA'],[
            'opens_at'=>'00:00:00','closes_at'=>'00:00:00','draws_at'=>'23:59:59','active'=>true,
            'weekdays'=>[0,1,2,3,4,5,6],'modalities'=>$original->modalities,'result_count'=>$original->result_count,
        ]);
        $exceptions=$clone->exceptions ?? [];
        $exceptions[$today]=['closed'=>false,'opens_at'=>'00:00:00','closes_at'=>'23:59:59'];
        $clone->update(['exceptions'=>$exceptions]);
        $clones[]=$clone;
    }
    [$q,$l]=$clones;
    $settings=$office->lottery_settings ?? [];
    $settings['draw_ids']=array_values(array_unique(array_merge($settings['draw_ids'] ?? [],[$q->id,$l->id])));
    $settings['pairs'][min($q->id,$l->id).'-'.max($q->id,$l->id)]=['enabled'=>true,'ordered'=>false,'primary_draw_id'=>$q->id,'payouts'=>['1-1'=>3000,'1-2'=>300,'1-3'=>100]];
    $settings['rules'][$q->id.':quiniela']=['payouts'=>['1'=>70]];
    $settings['rules'][$l->id.':quiniela']=['payouts'=>['1'=>60,'2'=>10,'3'=>5]];
    $office->update(['lottery_settings'=>$settings]);
    $prepared=app(App\Services\Lottery\Configuration::class)->prepare($bank->fresh(),['draw_id'=>$q->id,'second_draw_id'=>$l->id,'modality'=>'super_pale','numbers'=>'01-22','amount'=>'10']);
    echo json_encode(['draws'=>array_map(fn($d)=>$d->name,$clones),'prepared'=>$prepared],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE).PHP_EOL;
});
