import test from 'node:test';
import assert from 'node:assert/strict';
import { hasBranchOverrides } from '../../resources/js/lib/branchSettings.ts';

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
