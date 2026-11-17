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
    return <fieldset disabled={disabled} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-950/30">
        <legend className="px-2 text-sm font-semibold">Parejas de destino{pairs.length > 0 && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{pairs.length}</span>}</legend>
        <div role="group" aria-label="Seleccionar pareja de destino" className="grid max-h-48 gap-2 overflow-auto" style={{gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 190px), 1fr))'}}>
            {draws.map(draw => {
                const selected = first === draw.id;
                const unavailable = first !== null && !selected && (!isEnabled([first, draw.id]) || pairs.some(pair => pair.includes(first) && pair.includes(draw.id)));
                return <button key={draw.id} type="button" disabled={disabled || unavailable} aria-pressed={selected} className={`flex min-h-11 min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors disabled:opacity-40 ${selected ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600 dark:bg-emerald-950 dark:text-emerald-200' : 'border-slate-300 bg-white hover:border-emerald-500 hover:bg-emerald-50/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'}`} onClick={() => {
                    if (first === null) { setFirst(draw.id); return; }
                    if (selected) { setFirst(null); return; }
                    const pair: Pair = [Math.min(first, draw.id), Math.max(first, draw.id)];
                    if (isEnabled(pair) && !pairs.some(([a, b]) => a === pair[0] && b === pair[1])) onChange([...pairs, pair]);
                    setFirst(null);
                }}><span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-400 dark:border-slate-500'}`}>{selected && <Check size={12} />}</span><span className="min-w-0 break-words leading-4">{draw.name}</span></button>;
            })}
        </div>
        <div className="grid max-h-44 gap-2 overflow-auto" style={{gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 280px), 1fr))'}}>{pairs.map(([a, b]) => <span key={`${a}-${b}`} className="flex min-w-0 items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-50 px-3 py-2.5 text-sm dark:bg-emerald-950/40">
            <Check size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" /><span className="min-w-0 flex-1 break-words font-medium">{name(a)}<span className="mx-2 text-emerald-600 dark:text-emerald-400">+</span>{name(b)}</span><button type="button" className="shrink-0 rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" aria-label={`Quitar destino ${name(a)} + ${name(b)}`} onClick={() => onChange(pairs.filter(pair => pair[0] !== a || pair[1] !== b))}><X size={16} /></button>
        </span>)}</div>
        {!pairs.length && <p className="text-xs text-slate-500">Elige dos sorteos para añadir cada pareja. Solo aparecen parejas abiertas y habilitadas para esta banca.</p>}
    </fieldset>;
}
