import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';

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
    useEffect(() => {
        if (first !== null && !draws.some(draw => draw.id === first)) setFirst(null);
    }, [draws, first]);
    const name = (id: number) => draws.find(draw => draw.id === id)?.name ?? `Sorteo ${id}`;
    return <fieldset disabled={disabled} className="space-y-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
        <legend className="px-1 text-sm font-semibold">Parejas de destino</legend>
        <div role="group" aria-label="Seleccionar pareja de destino" className="grid max-h-48 grid-cols-2 gap-1.5 overflow-auto sm:grid-cols-3 lg:grid-cols-4">
            {draws.map(draw => {
                const selected = first === draw.id;
                const unavailable = first !== null && !selected && (!isEnabled([first, draw.id]) || pairs.some(pair => pair.includes(first) && pair.includes(draw.id)));
                return <button key={draw.id} type="button" disabled={disabled || unavailable} aria-pressed={selected} className={`flex min-w-0 items-start gap-2 rounded-md border px-2 py-1.5 text-left text-xs font-semibold disabled:opacity-40 ${selected ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : 'border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`} onClick={() => {
                    if (first === null) { setFirst(draw.id); return; }
                    if (selected) { setFirst(null); return; }
                    const pair: Pair = [Math.min(first, draw.id), Math.max(first, draw.id)];
                    if (isEnabled(pair) && !pairs.some(([a, b]) => a === pair[0] && b === pair[1])) onChange([...pairs, pair]);
                    setFirst(null);
                }}><span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-400 dark:border-slate-500'}`}>{selected && <Check size={12} />}</span><span className="min-w-0 break-words leading-4">{draw.name}</span></button>;
            })}
        </div>
        <div className="flex max-h-32 flex-wrap gap-1 overflow-auto">{pairs.map(([a, b]) => <span key={`${a}-${b}`} className="inline-flex items-center gap-1 rounded border border-emerald-600/40 px-2 py-1 text-xs">
            {name(a)} + {name(b)}<button type="button" aria-label={`Quitar destino ${name(a)} + ${name(b)}`} onClick={() => onChange(pairs.filter(pair => pair[0] !== a || pair[1] !== b))}><X size={14} /></button>
        </span>)}</div>
        {!pairs.length && <p className="text-xs text-slate-500">Elige dos sorteos para añadir cada pareja. Solo aparecen parejas abiertas y habilitadas para esta banca.</p>}
    </fieldset>;
}
