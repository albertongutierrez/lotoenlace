<?php
namespace Database\Seeders;
use App\Models\Permission;
use Illuminate\Database\Seeder;
class CashVisibilityPermissionSeeder extends Seeder {
 public function run(): void {
  Permission::firstOrCreate(['slug'=>'lottery.cash.view_open'],['module'=>'lottery','name'=>'Ver movimientos y saldo de caja antes del cierre']);
 }
}
