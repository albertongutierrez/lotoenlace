<?php

namespace App\Console\Commands;

use App\Models\Role;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

class CreateAdministrator extends Command
{
    protected $signature = 'base:create-admin {--name=} {--email=}';

    protected $description = 'Crea el primer super administrador sin consorcios ni datos de ejemplo';

    public function handle(): int
    {

        if (User::whereHas('roles', fn ($query) => $query->where('slug', 'super_admin'))->exists()) {

            $this->error('Ya existe un super administrador. Usa la gestion de usuarios.');

            return self::FAILURE;

        }

        $data = [

            'name' => $this->option('name') ?: $this->ask('Nombre'),

            'email' => strtolower($this->option('email') ?: $this->ask('Correo')),

            'password' => $this->secret('Contrasena (10 caracteres, mayuscula, minuscula y numero)'),

            'password_confirmation' => $this->secret('Repite la contrasena'),

        ];

        $validator = Validator::make($data, ['name' => 'required|string|max:160', 'email' => 'required|email|max:160|unique:users,email', 'password' => ['required', 'confirmed', Password::defaults()]]);

        if ($validator->fails()) {

            foreach ($validator->errors()->all() as $error) {

                $this->error($error);

            }

            return self::FAILURE;

        }

        $role = Role::where('slug', 'super_admin')->whereNull('office_id')->first();

        if (! $role) {

            $this->error('Ejecuta primero php artisan migrate --seed.');

            return self::FAILURE;

        }

        DB::transaction(function () use ($data, $role) {

            $user = User::create(collect($data)->only(['name', 'email', 'password'])->all());

            $user->forceFill(['email_verified_at' => now()])->save();

            $user->roles()->attach($role->id, ['office_id' => null]);

        });

        $this->info('Administrador creado. Inicia sesion y crea tu consorcio y banca.');

        return self::SUCCESS;

    }
}
