<?php

namespace App\Http\Requests\Settings;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateRoleRequest extends FormRequest
{
    public function authorize(): bool
    {

        return true;

    }

    public function rules(): array
    {

        $role = $this->route('role');

        $roleId = $role?->id;

        $officeId = $role?->office_id ?? $this->user()?->activeBranchOffice?->office_id;

        return [

            'name' => ['required', 'string', 'max:120', Rule::unique('roles', 'name')->where('office_id', $officeId)->ignore($roleId)],

            'slug' => ['required', 'string', 'max:80', 'alpha_dash', Rule::unique('roles', 'slug')->where('office_id', $officeId)->ignore($roleId)],

            'description' => ['nullable', 'string', 'max:250'],

            'is_active' => ['boolean'],

            'permission_ids' => ['required', 'array', 'min:1'],

            'permission_ids.*' => ['integer', Rule::exists('permissions', 'id')],

        ];

    }

    public function messages(): array
    {

        return [

            'name.required' => 'El nombre del rol es obligatorio.',

            'name.unique' => 'Ya existe un rol con ese nombre.',

            'slug.required' => 'El codigo del rol es obligatorio.',

            'slug.alpha_dash' => 'El codigo solo puede tener letras, numeros, guiones y guion bajo.',

            'slug.unique' => 'Ya existe un rol con ese codigo.',

            'permission_ids.required' => 'Selecciona al menos un permiso.',

            'permission_ids.min' => 'Selecciona al menos un permiso.',

        ];

    }
}
