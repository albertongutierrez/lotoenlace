import { playIdentity } from './playIdentity';

export type CopyLine = { draw_id: number; second_draw_id?: number; modality: string; numbers: string; amount: string };

export function ticketCopyTemplates(lines: CopyLine[]) {
    const templates = new Map<string, { key: string; line: CopyLine; amounts: string[] }>();
    for (const line of lines) {
        const key = playIdentity({ ...line, draw_id: 0, second_draw_id: undefined });
        const amount = Number(line.amount).toFixed(2);
        const template = templates.get(key);
        if (!template) templates.set(key, { key, line, amounts: [amount] });
        else if (!template.amounts.includes(amount)) template.amounts.push(amount);
    }
    return [...templates.values()];
}

export function copyToSelected(lines: CopyLine[], selected: number[], pairs: [number, number][], amounts: Record<string, string> = {}): CopyLine[] {
    const templates = ticketCopyTemplates(lines);
    if (templates.some(item => item.line.modality !== 'super_pale') && !selected.length) throw Error('Selecciona al menos un sorteo regular para copiar las jugadas regulares.');
    if (templates.some(item => item.line.modality === 'super_pale') && !pairs.length) throw Error('Selecciona al menos una pareja de súper palé para copiar esas jugadas.');
    const copied = templates.flatMap<CopyLine>(({ key, line, amounts: options }) => {
        const amount = options.length === 1 ? options[0] : amounts[key];
        if (!options.includes(amount)) throw Error(`Elige el monto para la jugada ${line.numbers}, que tiene montos distintos en el ticket original.`);
        return line.modality === 'super_pale'
            ? pairs.map(([draw_id, second_draw_id]) => ({ ...line, draw_id, second_draw_id, amount }))
            : selected.map(draw_id => ({ ...line, draw_id, second_draw_id: undefined, amount }));
    });
    if (copied.length > 500) throw Error('Máximo 500 jugadas por ticket. Reduce los destinos seleccionados.');
    return copied;
}
