<?php

use App\Models\Role;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (! app()->environment('local') || config('database.connections.mysql.database') !== 'lotoenlace') {
    throw new RuntimeException('Solo para LotoEnlace local.');
}
if (User::whereHas('roles', fn ($q) => $q->where('slug', 'super_admin'))->exists()) {
    echo "Ya existe un administrador; no se modifica.\n";
    exit;
}
$password = 'Le!'.bin2hex(random_bytes(10)).'9';
$user = User::create(['name' => 'Administrador LotoEnlace', 'email' => 'admin@lotoenlace.test', 'password' => $password]);
$user->forceFill(['email_verified_at' => now()])->save();
$user->roles()->attach(Role::where('slug', 'super_admin')->firstOrFail()->id, ['office_id' => null]);
file_put_contents(dirname(__DIR__).'/.local-access.md', "# Acceso local LotoEnlace\n\nURL: http://lotoenlace.test\nUsuario: admin@lotoenlace.test\nContraseña: ".$password."\n\nCambia la contraseña desde tu perfil. Este archivo no debe compartirse ni versionarse.\n");
echo "Administrador creado. Credenciales guardadas en .local-access.md.\n";
