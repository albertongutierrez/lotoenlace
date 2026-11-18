<?php

namespace App\Services\Lottery;

use App\Models\BranchOffice;
use Carbon\CarbonImmutable;
use DateTimeInterface;
use DateTimeZone;

class DateTimePreferences
{
    public const DEFAULTS = ['display_timezone' => 'America/Santo_Domingo', 'time_format' => '12'];

    public function resolve(array $parent = [], array $own = []): array
    {
        $zone = $own['display_timezone'] ?? $parent['display_timezone'] ?? self::DEFAULTS['display_timezone'];
        $format = $own['time_format'] ?? $parent['time_format'] ?? self::DEFAULTS['time_format'];
        return [
            'display_timezone' => in_array($zone, DateTimeZone::listIdentifiers(), true) ? $zone : self::DEFAULTS['display_timezone'],
            'time_format' => in_array($format, ['12', '24'], true) ? $format : self::DEFAULTS['time_format'],
        ];
    }

    public function forBranch(BranchOffice $branch): array
    {
        return $this->resolve($branch->office->lottery_settings ?? [], $branch->lottery_settings ?? []);
    }

    /** Display only: never use these preferences to define an operational date or draw schedule. */
    public function format(DateTimeInterface|string $value, array $preferences, bool $seconds = false): string
    {
        $preferences = $this->resolve($preferences);
        $date = $value instanceof DateTimeInterface ? CarbonImmutable::instance($value) : CarbonImmutable::parse($value, config('app.timezone'));
        $pattern = $preferences['time_format'] === '24' ? 'H:i' : 'h:i';
        if ($seconds) $pattern .= ':s';
        if ($preferences['time_format'] === '12') $pattern .= ' A';
        return $date->setTimezone($preferences['display_timezone'])->format('d/m/Y '.$pattern);
    }
}
