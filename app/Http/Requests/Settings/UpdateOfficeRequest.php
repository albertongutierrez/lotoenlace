<?php

namespace App\Http\Requests\Settings;

use App\Models\Office;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateOfficeRequest extends FormRequest
{
    public function authorize(): bool
    {

        return true;

    }

    public function rules(): array
    {

        /** @var Office|null $office */
        $office = $this->route('office');

        return [

            'name' => [

                'required',

                'string',

                'max:120',

                Rule::unique('offices', 'name')

                    ->ignore($office?->id)

                    ->whereNull('deleted_at'),

            ],

            'currency' => ['sometimes', 'required', Rule::in(['DOP', 'USD', 'EUR', 'HTG'])],

            'slogan' => ['nullable', 'string', 'max:180'],

            'tax_id' => ['nullable', 'string', 'max:30'],

            'logo' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],

            'compact_logo' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],

            'show_print_company_details' => ['required', 'boolean'],

            'remove_logo' => ['nullable', 'boolean'],

            'remove_compact_logo' => ['nullable', 'boolean'],

        ];

    }

    public function messages(): array
    {

        return [

            'name.required' => 'El nombre de la consorcio es obligatorio.',

            'name.unique' => 'Ya existe una consorcio con ese nombre.',

            'logo.image' => 'El logo debe ser una imagen valida.',

            'logo.mimes' => 'El logo debe ser JPG, PNG o WEBP.',

            'logo.max' => 'El logo no puede pesar mas de 2MB.',

            'compact_logo.image' => 'El logo compacto debe ser una imagen valida.',

            'compact_logo.mimes' => 'El logo compacto debe ser JPG, PNG o WEBP.',

            'compact_logo.max' => 'El logo compacto no puede pesar mas de 2MB.',

        ];

    }
}
