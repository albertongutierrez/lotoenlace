<?php

namespace App\Services\Lottery;

use Illuminate\Validation\ValidationException;

final class Money
{
    public static function minor(mixed $value): int
    {

        $value = (string) $value;

        if (! preg_match('/^\d{1,9}(\.\d{1,2})?$/D', $value)) {

            throw ValidationException::withMessages(['amount' => 'Indica un monto positivo con máximo dos decimales.']);
        }

        [$whole, $fraction] = array_pad(explode('.', $value), 2, '');

        return ((int) $whole * 100) + (int) str_pad($fraction, 2, '0');

    }
}
