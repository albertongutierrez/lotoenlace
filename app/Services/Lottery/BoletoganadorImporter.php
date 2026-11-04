<?php

namespace App\Services\Lottery;

use Carbon\CarbonImmutable;
use DOMDocument;
use DOMXPath;
use RuntimeException;

class BoletoganadorImporter
{
    public function parseDetail(string $html, string $key, CarbonImmutable $date, int $resultCount = 1): ?array
    {
        $doc = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        try {
            $doc->loadHTML('<?xml encoding="UTF-8">'.$html, LIBXML_NONET);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
        $xpath = new DOMXPath($doc);
        foreach ($xpath->query('//script[@type="application/ld+json"]') as $script) {
            $data = json_decode($script->textContent, true);
            foreach (($data['@graph'] ?? []) as $event) {
                if (($event['@type'] ?? '') !== 'Event'
                    || ($event['url'] ?? '') !== 'https://elboletoganador.com/loteria/'.basename($key)
                    || ($event['eventStatus'] ?? '') !== 'https://schema.org/EventCompleted'
                    || substr($event['startDate'] ?? '', 0, 10) !== $date->toDateString()) {
                    continue;
                }
                $properties = array_column($event['additionalProperty'] ?? [], 'value', 'name');
                if (($properties['Fecha del Sorteo'] ?? '') !== $date->toDateString()) {
                    continue;
                }
                $numbers = [];
                foreach (['Primer Premio', 'Segundo Premio', 'Tercer Premio'] as $label) {
                    if (isset($properties[$label])) $numbers[] = (string) $properties[$label];
                }
                if (count($numbers) !== $resultCount || count(array_filter($numbers, fn ($n) => preg_match('/^\d{2}$/D', $n))) !== $resultCount) {
                    throw new RuntimeException('Formato de resultados no reconocido.');
                }
                return $numbers;
            }
        }
        return null;
    }

    public function parse(string $html, string $key, CarbonImmutable $date, int $resultCount = 3): ?array
    {
        $doc = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        try {
            $doc->loadHTML('<?xml encoding="UTF-8">'.$html, LIBXML_NONET);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
        $xpath = new DOMXPath($doc);
        $path = '/loteria/'.basename($key);
        foreach ($xpath->query('//article[contains(concat(" ",normalize-space(@class)," ")," inicio-tarjeta-hoy ")]') as $card) {
            $matches = false;
            foreach ($xpath->query('.//a[@href]', $card) as $link) {
                if ($link->getAttribute('href') === $path) {
                    $matches = true;
                }
            }
            if (! $matches) {
                continue;
            }
            $dateNode = $xpath->query('.//*[contains(concat(" ",normalize-space(@class)," ")," tile-date ")]', $card)->item(0);
            $months = [1 => 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
            $expected = $date->day.' '.$months[$date->month];
            if (! $dateNode || ! preg_match('/(?:^|\s)'.preg_quote($expected, '/').'$/u', trim($dateNode->textContent))) {
                throw new RuntimeException('La fecha visible no coincide con hoy.');
            }
            $numbers = [];
            foreach ($xpath->query('.//*[contains(concat(" ",normalize-space(@class)," ")," tile-ball ")]', $card) as $ball) {
                $numbers[] = trim($ball->textContent);
            }
            if (count($numbers) !== $resultCount || count(array_filter($numbers, fn ($n) => preg_match('/^\d{2}$/D', $n))) !== $resultCount) {
                throw new RuntimeException('Formato de resultados no reconocido.');
            }

            return $numbers;
        }

        return null;
    }
}
