<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use App\Models\Permission;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->string('payment_method', 20)->default('cash');
            $table->string('payment_reference', 100)->nullable();
        });
        Schema::table('cash_movements', fn (Blueprint $table) => $table->string('payment_method', 20)->default('cash'));
        foreach ([
            ['slug'=>'lottery.payments.configure','name'=>'Configurar medios de cobro por consorcio y banca','module'=>'lottery'],
            ['slug'=>'lottery.results.view','name'=>'Consultar resultados publicados desde Ventas','module'=>'lottery'],
        ] as $permission) Permission::firstOrCreate(['slug'=>$permission['slug']], $permission);
    }
    public function down(): void
    {
        Schema::table('tickets', fn (Blueprint $table) => $table->dropColumn(['payment_method','payment_reference']));
        Schema::table('cash_movements', fn (Blueprint $table) => $table->dropColumn('payment_method'));
    }
};
