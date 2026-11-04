<?php

namespace Tests\Feature;

use App\Services\Lottery\BoletoganadorImporter;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\TestCase;

class QuemaitoImporterTest extends TestCase
{
    private function html(array $numbers = ['07']): string
    {
        $properties = [['name' => 'Fecha del Sorteo', 'value' => '2026-10-21']];
        foreach ($numbers as $i => $number) {
            $properties[] = ['name' => ['Primer Premio', 'Segundo Premio', 'Tercer Premio'][$i], 'value' => $number];
        }
        return '<script type="application/ld+json">'.json_encode(['@graph' => [[
            '@type' => 'Event', 'url' => 'https://elboletoganador.com/loteria/resultados-el-quemaito-mayor',
            'eventStatus' => 'https://schema.org/EventCompleted', 'startDate' => '2026-10-21T12:04:00-04:00',
            'additionalProperty' => $properties,
        ]]]).'</script>';
    }

    public function test_single_number_is_preserved_and_wrong_dates_or_draws_are_ignored(): void
    {
        $parser = new BoletoganadorImporter;
        $date = CarbonImmutable::parse('2026-10-21', 'America/Santo_Domingo');
        $this->assertSame(['07'], $parser->parseDetail($this->html(), 'resultados-el-quemaito-mayor', $date));
        $this->assertNull($parser->parseDetail($this->html(), 'resultados-lotedom', $date));
        $this->assertNull($parser->parseDetail($this->html(), 'resultados-el-quemaito-mayor', $date->addDay()));
    }

    public function test_more_than_one_number_is_rejected(): void
    {
        $this->expectException(\RuntimeException::class);
        (new BoletoganadorImporter)->parseDetail($this->html(['07', '12']), 'resultados-el-quemaito-mayor', CarbonImmutable::parse('2026-10-21'));
    }
}
