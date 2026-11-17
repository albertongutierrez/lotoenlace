import { useState } from 'react';
import { X } from 'lucide-react';
import ComboboxSelect from '@/Components/ComboboxSelect';
import { Field, input } from './shared';

type Pair = [number, number];
type Props = {
    draws: { id: number; name: string }[];
    pairs: Pair[];
    isEnabled: (pair: Pair) => boolean;
    onChange: (pairs: Pair[]) => void;
    disabled?: boolean;
};

export default function SuperPairTargets({ draws, pairs, isEnabled, onChange, disabled }: Props) {
    const [first, setFirst] = useState<number | null>(null);
    const name = (id: number) => draws.find(draw => draw.id === id)?.name ?? `Sorteo ${id}`;
    return <fieldset disabled={disabled} className="space-y-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
        <legend className="px-1 text-sm font-semibold">Parejas de destino</legend>
        <div className="grid grid-cols-2 gap-2">
            <Field label="Primer sorteo de destino"><ComboboxSelect className={input} value={first ?? ''} onChange={e => setFirst(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Seleccionar sorteo</option>
                {draws.map(draw => <option key={draw.id} value={draw.id}>{draw.name}</option>)}
            </ComboboxSelect></Field>
            <Field label="Segundo sorteo de destino"><ComboboxSelect className={input} value="" disabled={first === null} onChange={e => {
                if (first === null || !e.target.value) return;
                const pair: Pair = [Math.min(first, Number(e.target.value)), Math.max(first, Number(e.target.value))];
                if (isEnabled(pair) && !pairs.some(([a, b]) => a === pair[0] && b === pair[1])) onChange([...pairs, pair]);
                setFirst(null);
            }}>
                <option value="">Añadir segundo sorteo</option>
                {draws.filter(draw => first !== null && isEnabled([first, draw.id]) && !pairs.some(pair => pair.includes(first) && pair.includes(draw.id))).map(draw => <option key={draw.id} value={draw.id}>{draw.name}</option>)}
            </ComboboxSelect></Field>
        </div>
        <div className="flex max-h-32 flex-wrap gap-1 overflow-auto">{pairs.map(([a, b]) => <span key={`${a}-${b}`} className="inline-flex items-center gap-1 rounded border border-emerald-600/40 px-2 py-1 text-xs">
            {name(a)} + {name(b)}<button type="button" aria-label={`Quitar destino ${name(a)} + ${name(b)}`} onClick={() => onChange(pairs.filter(pair => pair[0] !== a || pair[1] !== b))}><X size={14} /></button>
        </span>)}</div>
        {!pairs.length && <p className="text-xs text-slate-500">Elige dos sorteos para añadir cada pareja. Solo aparecen parejas abiertas y habilitadas para esta banca.</p>}
    </fieldset>;
}
