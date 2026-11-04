<?php

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ProfileUpdateRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.

     *

     * @return array<string, \Illuminate\Contracts\Validation\Rule|array|string>
     */
    public function rules(): array
    {

        return [

            'name' => ['required', 'string', 'max:255'],

            'email' => ['required', 'string', 'lowercase', 'email', 'max:255', Rule::unique(User::class)->ignore($this->user()->id)],

        ];

    }

    public function messages(): array
    {

        return [

            'name.required' => 'El nombre es obligatorio.',

            'name.max' => 'El nombre no puede tener mas de 255 caracteres.',

            'email.required' => 'El correo es obligatorio.',

            'email.email' => 'El correo no tiene un formato valido.',

            'email.max' => 'El correo no puede tener mas de 255 caracteres.',

            'email.unique' => 'Este correo ya esta registrado.',

        ];

    }
}
