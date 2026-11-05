import test from 'node:test';
import assert from 'node:assert/strict';
import { hasBranchOverrides, inheritedBranchValue, listBranchOverrides, removeBranchOverride } from '../../resources/js/lib/branchSettings.ts';

test('una banca hereda cuando solo tiene tarifas vacías o valores nulos', () => {
    for (const settings of [null, undefined, {}, [], {
        daily_limit_minor: null,
        consortium_limit_minor: 5000000,
        payment_method_labels: {},
        rules: { '1:quiniela': { commission_bps: null, payouts: null } },
        general_rules: { quiniela: {}, pale: null },
        pairs: {},
        super_pale: { enabled: null, payouts: null },
    }]) assert.equal(hasBranchOverrides(settings), false);
});

test('cero, falso, un texto vacío y una lista vacía de sorteos son valores propios', () => {
    for (const settings of [
        { daily_limit_minor: 0 },
        { show_qr: false },
        { footer: '' },
        { draw_ids: [] },
        { rules: { '1:quiniela': { commission_bps: 0 } } },
        { general_rules: { quiniela: { payouts: {} } } },
        { super_pale: { enabled: false } },
        { pairs: { '1-2': { payouts: {} } } },
    ]) assert.equal(hasBranchOverrides(settings), true);
});

test('las referencias se heredan con los medios de cobro y los nombres propios cuentan como personalización', () => {
    const metadata = { payment_reference_required: { cash: false } };
    assert.equal(hasBranchOverrides(metadata), false);
    assert.equal(hasBranchOverrides({ ...metadata, payment_methods: null }), false);
    assert.equal(hasBranchOverrides({ ...metadata, payment_methods: ['cash'] }), true);
    assert.equal(hasBranchOverrides({ payment_method_labels: { custom_123456789abc: 'PayPal' } }), true);
});

test('lista las comisiones, premios y campos propios de cada sorteo sin contar nulos', () => {
    const overrides = listBranchOverrides({
        footer: '',
        rules: { '1:quiniela': { commission_bps: 0, payouts: { 1: 75 } }, '2:pale': { commission_bps: null } },
        super_pale: { enabled: false },
        payment_methods: ['cash'], payment_reference_required: { cash: true },
    });
    assert.deepEqual(overrides.map(override => override.path), [
        ['footer'], ['rules', '1:quiniela', 'commission_bps'], ['rules', '1:quiniela', 'payouts'], ['super_pale', 'enabled'], ['payment_methods'],
    ]);
});

test('quitar una comisión conserva los premios y quitar la última excepción limpia sus mapas', () => {
    const settings = { footer: 'Gracias', rules: { '1:quiniela': { commission_bps: 500, payouts: { 1: 75 } } } };
    const next = removeBranchOverride(settings, ['rules', '1:quiniela', 'commission_bps']);
    assert.deepEqual(next.rules, { '1:quiniela': { payouts: { 1: 75 } } });
    assert.equal(settings.rules['1:quiniela'].commission_bps, 500);
    assert.deepEqual(removeBranchOverride(next, ['rules', '1:quiniela', 'payouts']), { footer: 'Gracias' });
});

test('heredar los medios de cobro retira también sus nombres y exigencias de referencia', () => {
    assert.deepEqual(removeBranchOverride({ footer: 'Gracias', payment_methods: ['cash'], payment_method_labels: { custom_123456789abc: 'PayPal' }, payment_reference_required: { cash: true } }, ['payment_methods']), { footer: 'Gracias' });
});

test('la vista previa sigue la prioridad de las tarifas y el bloqueo del consorcio para parejas', () => {
    const parent = { general_rules: { quiniela: { commission_bps: 1000, payouts: { 1: 60 } } }, rules: { '1:quiniela': { commission_bps: 500 } }, super_pale: { enabled: true, payouts: { '1-1': 3000 } }, pairs: { '1-2': { enabled: false } } };
    const settings = { general_rules: { quiniela: { commission_bps: 0 } }, super_pale: { enabled: true, payouts: { '1-1': 2000 } } };
    assert.equal(inheritedBranchValue(settings, parent, ['rules', '1:quiniela', 'commission_bps']), 0);
    assert.deepEqual(inheritedBranchValue(settings, parent, ['rules', '1:quiniela', 'payouts']), { 1: 60 });
    assert.equal(inheritedBranchValue(settings, parent, ['general_rules', 'quiniela', 'commission_bps']), 1000);
    assert.deepEqual(inheritedBranchValue(settings, parent, ['pairs', '1-2', 'payouts']), { '1-1': 2000 });
    assert.equal(inheritedBranchValue(settings, parent, ['pairs', '1-2', 'enabled']), false);
});
