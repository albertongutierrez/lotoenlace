import { expect, test } from 'vitest';
import { applyCopiedLines, copyToSelected, ticketCopyTemplates, CopyLine } from '../../resources/js/lib/ticketCopy';

const regular: CopyLine = { draw_id: 11, modality: 'quiniela', numbers: '07', amount: '2.50' };
const superLine: CopyLine = { draw_id: 11, second_draw_id: 12, modality: 'super_pale', numbers: '10-20', amount: '3.00' };

test('copiar a destinos seleccionados separa las modalidades y no multiplica una jugada repetida en el original', () => {
    const source = [regular, {...regular, draw_id:12}, superLine, {...superLine, draw_id:13, second_draw_id:14}];
    const snapshot = structuredClone(source);
    expect(copyToSelected(source, [1, 2], [[3, 4], [5, 6]])).toEqual([
        {...regular, draw_id:1, second_draw_id:undefined}, {...regular, draw_id:2, second_draw_id:undefined},
        {...superLine, draw_id:3, second_draw_id:4}, {...superLine, draw_id:5, second_draw_id:6},
    ]);
    expect(source).toEqual(snapshot);
});

test('copiar tickets mixtos requiere destinos para ambos tipos y los tickets puros solo necesitan los suyos', () => {
    expect(()=>copyToSelected([regular, superLine], [], [[1,2]])).toThrow('sorteo regular');
    expect(()=>copyToSelected([regular, superLine], [1], [])).toThrow('pareja de súper palé');
    expect(copyToSelected([superLine], [], [[1,2]])).toHaveLength(1);
    expect(copyToSelected([regular], [1], [])).toHaveLength(1);
});

test('los montos distintos requieren una elección y las combinaciones regulares equivalentes se reconocen', () => {
    const source = [regular, {...regular, draw_id:12, amount:'5'}, {...regular, draw_id:13, amount:'2.5'}];
    const template = ticketCopyTemplates(source)[0];
    expect(template.amounts).toEqual(['2.50','5.00']);
    expect(()=>copyToSelected(source, [1], [])).toThrow('montos distintos');
    expect(copyToSelected(source, [1], [], {[template.key]:'5.00'})[0].amount).toBe('5.00');
    expect(ticketCopyTemplates([{...regular, modality:'pale', numbers:'10-20'}, {...regular, draw_id:12, modality:'pale', numbers:'20-10'}])).toHaveLength(1);
});

test('la expansión de destinos respeta el máximo del ticket', () => {
    const source = Array.from({length:251}, (_, i)=>({...regular, numbers:String(i)}));
    expect(()=>copyToSelected(source, [1,2], [])).toThrow('Máximo 500');
});

test('conservar añade las jugadas y acumula repetidas sin modificar los datos originales', () => {
    const current = [regular, superLine];
    const copied = [{...regular, amount:'1.25'}, {...regular, draw_id:12}];
    const snapshot = structuredClone(current);
    expect(applyCopiedLines(current,copied)).toEqual([{...regular,amount:'3.75'},superLine,copied[1]]);
    expect(current).toEqual(snapshot);
    expect(copied[0].amount).toBe('1.25');
    expect(applyCopiedLines(current,copied,false)).toEqual(copied);
});

test('conservar respeta el máximo de jugadas después de combinar y evita exceder el monto permitido', () => {
    const full = Array.from({length:500},(_,i)=>({...regular,draw_id:i+1}));
    expect(applyCopiedLines(full,[regular])).toHaveLength(500);
    expect(()=>applyCopiedLines(full,[{...regular,draw_id:501}])).toThrow('Máximo 500');
    expect(()=>applyCopiedLines([{...regular,amount:'999999999.99'}],[regular])).toThrow('máximo permitido');
    expect(applyCopiedLines(full,[regular],false)).toEqual([regular]);
});
