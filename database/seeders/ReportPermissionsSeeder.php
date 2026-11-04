<?php
namespace Database\Seeders;
use App\Models\Permission;
use Illuminate\Database\Seeder;
class ReportPermissionsSeeder extends Seeder {
 public function run(): void {
  foreach(config('reports') as $key=>$label) Permission::firstOrCreate(['slug'=>'reports.'.$key],['module'=>'reports','name'=>'Consultar '.$label]);
 }
}
