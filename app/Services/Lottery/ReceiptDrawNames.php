<?php

namespace App\Services\Lottery;

use App\Models\Draw;

class ReceiptDrawNames
{
    public function fullNames(array $receipt): array
    {
        // Older payment snapshots may have stored abbreviations instead of full names.
        if (! ($receipt['print_settings']['abbreviate_draw_names'] ?? false)) return $receipt;

        $ids = collect($receipt['lines'])->flatMap(fn ($line) => [$line['draw_id'], $line['second_draw_id'] ?? null])->filter()->unique();
        $names = Draw::whereIn('id', $ids)->pluck('name', 'id');
        $receipt['lines'] = array_map(function ($line) use ($names) {
            $first = $names->get($line['draw_id']);
            $second = $names->get($line['second_draw_id'] ?? null);
            if ($first !== null && (empty($line['second_draw_id']) || $second !== null)) {
                $line['draw'] = $first.($second !== null ? ' + '.$second : '');
            }
            return $line;
        }, $receipt['lines']);
        $receipt['print_settings']['abbreviate_draw_names'] = false;

        return $receipt;
    }
}
