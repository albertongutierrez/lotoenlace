import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlay, parsePlayVariants } from '../../resources/js/lib/parsePlay.ts';

test('detecta las jugadas compactas y conserva ceros iniciales', () => {
    for (const [input, modality, numbers] of [
        ['0201', 'pale', '02-01'], ['012025', 'tripleta', '01-20-25'],
        ['01', 'quiniela', '01'], ['5', 'quiniela', '05'],
        ['0122s', 'super_pale', '01-22'], ['s0122', 'super_pale', '01-22'],
        ['S01-22', 'super_pale', '01-22'], ['00', 'quiniela', '00'],
    ]) assert.deepEqual(parsePlay(input), { modality, numbers });
});
test('rechaza jugadas incompletas y caracteres inválidos', () => {
    for (const input of ['', '012', '01234', '0123456', 's01', 's0122s', '01x22', '-', '.', '10..', '10.20', '.10', '102.', '1020.s'])
        assert.equal(parsePlay(input), null);
});

test('el punto genera derecho y revés por cada número, conservando los ceros', () => {
    for (const [input, modality, expected] of [
        ['10.', 'quiniela', ['10', '01']],
        ['1020.', 'pale', ['10-20', '01-02']],
        ['102030.', 'tripleta', ['10-20-30', '01-02-03']],
        ['1020s.', 'super_pale', ['10-20', '01-02']],
        ['s10-20.', 'super_pale', ['10-20', '01-02']],
        ['5.', 'quiniela', ['05', '50']],
    ]) assert.deepEqual(parsePlayVariants(input), expected.map(numbers => ({ modality, numbers })));
    assert.deepEqual(parsePlayVariants('1020.', 'super_pale'), [
        { modality: 'super_pale', numbers: '10-20' }, { modality: 'super_pale', numbers: '01-02' },
    ]);
});

test('el punto no duplica números simétricos ni palés o tripletas equivalentes', () => {
    for (const input of ['00.', '11.', '1111.', '1001.', '1122.', '100111.']) {
        assert.deepEqual(parsePlayVariants(input), [parsePlay(input)]);
    }
    assert.equal(parsePlayVariants('1001s.').length, 2); // Las posiciones de súper palé sí importan.
    assert.deepEqual(parsePlayVariants('1020'), [{ modality: 'pale', numbers: '10-20' }]);
    assert.deepEqual(parsePlayVariants('10..'), []);
});
test('conserva súper palé al confirmar la jugada normalizada', () => {
    assert.deepEqual(parsePlay('01-22', 'super_pale'), { modality: 'super_pale', numbers: '01-22' });
});
