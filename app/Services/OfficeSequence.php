<?php
namespace App\Services;
use App\Models\Office;
use Illuminate\Support\Facades\DB;
final class OfficeSequence {
    public function next(int $officeId,string $entity):int {
        return DB::transaction(function()use($officeId,$entity){
            Office::withTrashed()->whereKey($officeId)->lockForUpdate()->firstOrFail();
            DB::table('office_sequences')->insertOrIgnore(['office_id'=>$officeId,'entity'=>$entity,'last_number'=>0]);
            $row=DB::table('office_sequences')->where('office_id',$officeId)->where('entity',$entity)->lockForUpdate()->first();
            $number=(int)$row->last_number+1;
            DB::table('office_sequences')->where('office_id',$officeId)->where('entity',$entity)->update(['last_number'=>$number]);
            return $number;
        },3);
    }
}
