<?php

namespace App\Http\Requests\Settings;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreBranchOfficeRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $this->merge(['code' => strtoupper(trim((string) $this->input('code')))]);
    }

    public function authorize(): bool
    {

        return true;

    }

    public function rules(): array
    {

        $officeId = $this->input('office_id');

        return [

            'office_id' => ['required', 'integer', Rule::exists('offices', 'id')->whereNull('deleted_at')],

            'name' => ['nullable', 'string', 'max:120'],

            'code' => [

                'required',

                'string',

                'max:20',

                Rule::unique('branch_offices', 'code')

                    ->where('office_id', $officeId),

            ],

            'phone' => ['nullable', 'string', 'max:30'],

            'mobile_phone' => ['nullable', 'string', 'max:30'],

            'email' => ['nullable', 'email', 'max:120'],

            'address' => ['nullable', 'string', 'max:500'],

            'is_main' => ['boolean'],

            'is_active' => ['boolean'],

        ];

    }

    public function messages(): array
    {

        return [

            'office_id.required' => 'Debes seleccionar una consorcio.',

            'office_id.exists' => 'La consorcio seleccionada no existe.',

            'name.required' => 'El nombre de la banca es obligatorio.',

            'code.required' => 'El codigo de la banca es obligatorio.',

            'code.unique' => 'Ya existe una banca con ese codigo para esta consorcio.',

            'email.email' => 'El correo no tiene un formato valido.',

        ];

    }
}
