<?php

namespace App\Http\Requests\Settings;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {

        return true;

    }

    public function rules(): array
    {

        return [

            'name' => ['required', 'string', 'max:160'],

            'email' => ['required', 'email', 'max:160', Rule::unique('users', 'email')],

            'password' => ['required', 'string', Password::min(10)->mixedCase()->numbers(), 'max:120'],

            'role_ids' => ['required', 'array', 'min:1'],

            'role_ids.*' => ['integer', Rule::exists('roles', 'id')->where('is_active', true)],

            'branch_office_ids' => ['required', 'array', 'min:1'],

            'branch_office_ids.*' => ['integer', Rule::exists('branch_offices', 'id')->where('is_active', true)],

            'default_branch_office_id' => ['required', 'integer', Rule::exists('branch_offices', 'id')->where('is_active', true)],

        ];

    }

    public function messages(): array
    {

        return [

            'name.required' => 'El nombre del usuario es obligatorio.',

            'email.required' => 'El correo es obligatorio.',

            'email.email' => 'El correo no tiene un formato valido.',

            'email.unique' => 'Ya existe un usuario con ese correo.',

            'password.required' => 'La contrasena es obligatoria.',

            'password.min' => 'La contrasena debe tener al menos :min caracteres.',

            'role_ids.required' => 'Selecciona al menos un rol.',

            'role_ids.min' => 'Selecciona al menos un rol.',

            'branch_office_ids.required' => 'Selecciona al menos una banca.',

            'branch_office_ids.min' => 'Selecciona al menos una banca.',

            'default_branch_office_id.required' => 'Selecciona la banca predeterminada.',

        ];

    }

    public function withValidator($validator): void
    {

        $validator->after(function ($validator): void {

            $branches = collect($this->input('branch_office_ids', []))->map(fn ($id) => (int) $id);

            $defaultBranch = (int) $this->input('default_branch_office_id');

            if ($defaultBranch > 0 && ! $branches->contains($defaultBranch)) {

                $validator->errors()->add('default_branch_office_id', 'La banca predeterminada debe estar dentro de las bancas permitidas.');

            }

        });

    }
}
