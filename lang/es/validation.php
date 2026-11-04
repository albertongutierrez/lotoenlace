<?php

return [
    'required' => 'El campo :attribute es obligatorio.',
    'string' => 'El campo :attribute debe ser texto.',
    'numeric' => 'El campo :attribute debe ser numerico.',
    'boolean' => 'El campo :attribute debe ser verdadero o falso.',
    'image' => 'El campo :attribute debe ser una imagen valida.',
    'max' => [
        'numeric' => 'El campo :attribute no debe ser mayor que :max.',
        'file' => 'El archivo :attribute no debe pesar mas de :max kilobytes.',
        'string' => 'El campo :attribute no debe tener mas de :max caracteres.',
        'array' => 'El campo :attribute no debe tener mas de :max elementos.',
    ],
    'min' => [
        'numeric' => 'El campo :attribute debe ser al menos :min.',
        'file' => 'El archivo :attribute debe pesar al menos :min kilobytes.',
        'string' => 'El campo :attribute debe tener al menos :min caracteres.',
        'array' => 'El campo :attribute debe tener al menos :min elementos.',
    ],
    'unique' => 'El valor de :attribute ya existe.',

    'attributes' => [
        'name' => 'nombre',
        'description' => 'descripcion',
        'abbreviation' => 'abreviatura',
        'rate' => 'tasa',
        'image' => 'imagen',
        'is_active' => 'estado',
    ],
];
