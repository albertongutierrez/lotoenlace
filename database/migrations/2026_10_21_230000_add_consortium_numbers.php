<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB,Schema};
return new class extends Migration {
    private array $tables=['tickets','cash_sessions','cash_movements','bet_limits','lottery_audits'];
    public function up(): void {
        Schema::create('office_sequences',function(Blueprint $t){$t->foreignId('office_id')->constrained();$t->string('entity',40);$t->unsignedBigInteger('last_number')->default(0);$t->primary(['office_id','entity']);});
        foreach($this->tables as $table){
            Schema::table($table,function(Blueprint $t)use($table){$t->unsignedBigInteger('office_number')->nullable();$t->unique(['office_id','office_number'],$table.'_office_number_unique');});
            $counts=[];
            DB::table($table)->whereNotNull('office_id')->orderBy('id')->chunkById(500,function($rows)use($table,&$counts){foreach($rows as $row){$counts[$row->office_id]=($counts[$row->office_id]??0)+1;DB::table($table)->where('id',$row->id)->update(['office_number'=>$counts[$row->office_id]]);}});
            foreach($counts as $officeId=>$number)DB::table('office_sequences')->insert(['office_id'=>$officeId,'entity'=>$table,'last_number'=>$number]);
        }
    }
    public function down(): void {foreach($this->tables as $table)Schema::table($table,function(Blueprint $t)use($table){$t->dropUnique($table.'_office_number_unique');$t->dropColumn('office_number');});Schema::dropIfExists('office_sequences');}
};
