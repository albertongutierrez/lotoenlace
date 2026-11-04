<?php

use Illuminate\Database\Migrations\Migration;
use App\Models\Permission;

return new class extends Migration {
    public function up(): void
    {
        foreach ([
            ['slug'=>'lottery.reconciliation.configure','name'=>'Elegir forma de cuadre por consorcio y banca','module'=>'lottery'],
            ['slug'=>'reports.reconciliation','name'=>'Consultar Cuadre por período','module'=>'reports'],
        ] as $permission) {
            Permission::firstOrCreate(['slug'=>$permission['slug']], $permission);
        }
    }

    public function down(): void
    {
        // Keep assigned permissions when reverting code; role assignments are user data.
    }
};
