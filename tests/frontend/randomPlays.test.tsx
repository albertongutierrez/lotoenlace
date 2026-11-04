import { expect, test } from 'vitest';
import { generateRandomPlays } from '../../resources/js/lib/randomPlays';
import { playIdentity } from '../../resources/js/lib/playIdentity';

test('genera las cantidades y montos de las tres modalidades sin repeticiones', () => {
    const plays = generateRandomPlays([{ modality: 'quiniela', count: 10, amount: '1' }, { modality: 'pale', count: 8, amount: '2.50' }, { modality: 'tripleta', count: 6, amount: '3' }], [], [1, 2]);
    expect(plays).toHaveLength(24);
    expect(new Set(plays.map(play => playIdentity({ ...play, draw_id: 1 }))).size).toBe(24);
    for (const [mode, count, amount, size] of [['quiniela', 10, '1', 1], ['pale', 8, '2.50', 2], ['tripleta', 6, '3', 3]] as const) {
        const group = plays.filter(play => play.modality === mode);
        expect(group).toHaveLength(count);
        for (const play of group) {
            expect(play.amount).toBe(amount);
            const numbers = play.numbers.split('-');
            expect(numbers).toHaveLength(size);
            expect(new Set(numbers).size).toBe(size);
            expect(numbers.every(number => /^\d{2}$/.test(number))).toBe(true);
        }
    }
});

test('permite generar las 100 quinielas aun con una fuente aleatoria constante', () => {
    const plays = generateRandomPlays([{ modality: 'quiniela', count: 100, amount: '1' }], [], [1], () => 0);
    expect(plays.map(play => play.numbers).sort()).toEqual(Array.from({ length: 100 }, (_, n) => String(n).padStart(2, '0')));
});

test('decodifica los extremos del rango sin perder los ceros iniciales', () => {
    const requests = [{ modality: 'pale', count: 1, amount: '1' }, { modality: 'tripleta', count: 1, amount: '1' }] as const;
    expect(generateRandomPlays([...requests], [], [1], () => 0).map(play => play.numbers)).toEqual(['00-01', '00-01-02']);
    expect(generateRandomPlays([...requests], [], [1], () => 0.999999999).map(play => play.numbers)).toEqual(['98-99', '97-98-99']);
});

test('excluye jugadas ya agregadas en cualquier sorteo seleccionado y sus permutaciones', () => {
    const existing = [{ draw_id: 1, modality: 'pale', numbers: '01-00' }, { draw_id: 2, modality: 'tripleta', numbers: '02-00-01' }];
    const plays = generateRandomPlays([{ modality: 'pale', count: 20, amount: '1' }, { modality: 'tripleta', count: 20, amount: '1' }], existing, [1, 2], () => 0);
    const identities = plays.map(play => playIdentity({ ...play, draw_id: 0 }));
    for (const play of existing) expect(identities).not.toContain(playIdentity({ ...play, draw_id: 0 }));
    expect(new Set(identities).size).toBe(40);
});

test('rechaza cantidades imposibles, montos inválidos y el límite acumulado por sorteos', () => {
    expect(() => generateRandomPlays([{ modality: 'quiniela', count: 101, amount: '1' }], [], [1])).toThrow(/100 quinielas/);
    for (const count of [-1, 0.5, NaN, 501]) expect(() => generateRandomPlays([{ modality: 'pale', count, amount: '1' }], [], [1])).toThrow(/enteros/);
    for (const amount of ['', '0', '-1', '1.001', '1e2']) expect(() => generateRandomPlays([{ modality: 'pale', count: 1, amount }], [], [1])).toThrow(/monto válido/);
    expect(() => generateRandomPlays([{ modality: 'pale', count: 251, amount: '1' }], [], [1, 2])).toThrow(/500 jugadas/);
    expect(() => generateRandomPlays([{ modality: 'pale', count: 1, amount: '1' }], [], [])).toThrow(/Selecciona/);
    expect(() => generateRandomPlays([{ modality: 'pale', count: 0, amount: '' }], [], [1])).toThrow(/cuántas/);
    const existing = Array.from({ length: 100 }, (_, n) => ({ draw_id: 1, modality: 'quiniela', numbers: String(n).padStart(2, '0') }));
    expect(() => generateRandomPlays([{ modality: 'quiniela', count: 1, amount: '1' }], existing, [1])).toThrow(/Solo quedan 0/);
});
