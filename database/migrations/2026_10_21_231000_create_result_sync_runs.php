<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
 public function up():void {Schema::create('result_sync_runs',function(Blueprint $t){$t->id();$t->string('mode',16);$t->string('status',16);$t->timestamp('started_at');$t->timestamp('finished_at')->nullable();$t->json('stats')->nullable();$t->text('message')->nullable();$t->index(['mode','id']);});}
 public function down():void {Schema::dropIfExists('result_sync_runs');}
};
