import test from 'node:test';
import assert from 'node:assert/strict';
import { clearTariffOverride } from '../../resources/js/lib/tariffSettings.ts';

test('borrar una personalización conserva las demás modalidades y la configuración original', () => {
    const settings = {
        general_rules: { quiniela: { commission_bps: 1500 }, pale: { commission_bps: 500 } },
        rules: { '1:quiniela': { payouts: { 1: 80 } } },
        super_pale: { payouts: { '1-1': 3000 } },
    };
    const next = clearTariffOverride(settings, 'general_rules', 'quiniela');
    assert.deepEqual(next.general_rules, { pale: { commission_bps: 500 } });
    assert.deepEqual(next.rules, settings.rules);
    assert.deepEqual(next.super_pale, settings.super_pale);
    assert.equal(settings.general_rules.quiniela.commission_bps, 1500);
});

test('borrar la última personalización retira también su sección', () => {
    for (const [section, key] of [['general_rules', 'quiniela'], ['rules', '1:quiniela'], ['pairs', '1-2']]) {
        const next = clearTariffOverride({ [section]: { [key]: { commission_bps: 0 } }, footer: 'Gracias' }, section, key);
        assert.deepEqual(next, { footer: 'Gracias' });
    }
});

test('borrar la global de súper palé conserva las excepciones de las parejas', () => {
    const settings = { super_pale: { commission_bps: 1000 }, pairs: { '1-2': { commission_bps: 500 } } };
    assert.deepEqual(clearTariffOverride(settings, 'super_pale'), { pairs: settings.pairs });
    assert.deepEqual(clearTariffOverride(settings, 'pairs', '1-2'), { super_pale: settings.super_pale });
});
