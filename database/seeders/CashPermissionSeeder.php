<?php
namespace Database\Seeders;
use App\Models\{Permission,Role};
use Illuminate\Database\Seeder;
class CashPermissionSeeder extends Seeder {
 public function run(): void {
  $permission=Permission::firstOrCreate(['slug'=>'lottery.cash'],['name'=>'Administrar cajas de la banca','module'=>'lottery']);
  Role::whereHas('permissions',fn($q)=>$q->whereIn('slug',['lottery.sell','lottery.settings']))->get()->each(fn($role)=>$role->permissions()->syncWithoutDetaching([$permission->id]));
 }
}
