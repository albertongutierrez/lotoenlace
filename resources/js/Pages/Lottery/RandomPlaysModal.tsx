import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Dice5, Plus, RefreshCw, X } from "lucide-react";
import Modal from "@/Components/Modal";
import MoneyInput from "@/Components/MoneyInput";
import { generateRandomPlays, randomModes, type RandomMode, type RandomPlay } from "@/lib/randomPlays";
import { button, input, modes, money, secondary } from "./shared";

type Props = {
    selectedIds: number[];
    existing: { draw_id: number; modality: string; numbers: string }[];
    currency: string;
    initialAmount: string;
    onClose: () => void;
    onAdd: (plays: RandomPlay[]) => void;
};

export default function RandomPlaysModal({ selectedIds, existing, currency, initialAmount, onClose, onAdd }: Props) {
    const [counts, setCounts] = useState<Record<RandomMode, string>>({ quiniela: "0", pale: "0", tripleta: "0" });
    const [amounts, setAmounts] = useState<Record<RandomMode, string>>({ quiniela: initialAmount, pale: initialAmount, tripleta: initialAmount });
    const [plays, setPlays] = useState<RandomPlay[]>([]);
    const [error, setError] = useState("");
    const acceptRef = useRef<HTMLButtonElement>(null);
    useEffect(() => { if (plays.length) acceptRef.current?.focus(); }, [plays]);
    const update = () => { setPlays([]); setError(""); };
    const count = randomModes.reduce((sum, mode) => sum + (Number(counts[mode]) || 0), 0);
    const total = randomModes.reduce((sum, mode) => sum + (Number(counts[mode]) || 0) * Math.round((Number(amounts[mode]) || 0) * 100), 0) * selectedIds.length;
    const generate = () => {
        try {
            if (randomModes.some(mode => !/^\d+$/.test(counts[mode]))) throw Error("Las cantidades deben ser números enteros; usa 0 para omitir una modalidad.");
            setPlays(generateRandomPlays(randomModes.map(modality => ({ modality, count: Number(counts[modality]), amount: amounts[modality] })), existing, selectedIds));
            setError("");
        } catch (failure: any) { setPlays([]); setError(failure.message); }
    };
    const accept = () => {
        try { onAdd(plays); } catch (failure: any) { setError(failure.message); }
    };
    const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
        if (event.key === "Escape") {
            event.preventDefault(); event.stopPropagation(); onClose(); return;
        }
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
        if (event.repeat) { event.preventDefault(); return; }
        if (!(event.target instanceof HTMLInputElement)) return;
        event.preventDefault(); event.stopPropagation();
        if (plays.length) { accept(); return; }
        const fields = Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>("[data-random-field]"));
        const skipAmount = event.target.type === "number" && /^\d+$/.test(event.target.value) && Number(event.target.value) === 0;
        const next = fields[fields.indexOf(event.target) + (skipAmount ? 2 : 1)];
        if (next) { next.focus(); next.select(); }
        else if (selectedIds.length) generate();
    };
    return <Modal show onClose={onClose} maxWidth="2xl">
        <form onSubmit={event => { event.preventDefault(); if (plays.length) accept(); else generate(); }} onKeyDown={onKeyDown} className="flex max-h-[90dvh] flex-col p-4 text-slate-900 dark:text-slate-100">
            <div className="mb-2 flex items-center gap-2"><Dice5 className="h-5 w-5 text-cyan-500" /><h2 className="flex-1 text-lg font-semibold">Jugadas aleatorias</h2><button type="button" aria-label="Cerrar" className={secondary} onClick={onClose}><X size={16} /></button></div>
            <p className="mb-4 text-sm text-slate-500">Indica la cantidad y el monto por jugada para cada modalidad. Se aplicarán a {selectedIds.length} sorteo(s) seleccionado(s).</p>
            <div className="min-h-0 overflow-y-auto">
                <div className="grid grid-cols-[minmax(0,1fr)_80px_minmax(0,1fr)] items-center gap-2 text-sm sm:grid-cols-[1fr_100px_1fr]">
                    <span className="text-xs font-medium text-slate-500">Modalidad</span><span className="text-xs font-medium text-slate-500">Cantidad</span><span className="text-xs font-medium text-slate-500">Monto por jugada</span>
                    {randomModes.map((mode, index) => <div key={mode} className="contents"><span className="font-semibold">{modes[mode]}</span><input data-random-field autoFocus={index === 0} data-autofocus={index === 0 ? true : undefined} className={`${input} !px-2`} aria-label={`Cantidad de ${modes[mode]}`} type="number" min="0" max={mode === "quiniela" ? 100 : 500} step="1" value={counts[mode]} onFocus={event => event.target.select()} onChange={event => { setCounts(current => ({ ...current, [mode]: event.target.value })); update(); }} /><MoneyInput data-random-field onFocus={event => event.target.select()} className={`${input} !px-2`} aria-label={`Monto de ${modes[mode]}`} value={amounts[mode]} onValueChange={value => { setAmounts(current => ({ ...current, [mode]: value })); update(); }} /></div>)}
                </div>
                <div className="my-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800"><span>{count} jugadas × {selectedIds.length} sorteos</span><strong>Total: {money(total, currency)}</strong></div>
                <p className="text-xs text-slate-500">Sin jugadas repetidas. Los palés y tripletas usan números distintos entre 00 y 99. Máximo 500 jugadas por ticket.</p><p className="mt-1 text-xs text-slate-500">Enter: siguiente campo; al terminar, generar y luego agregar las jugadas.</p>
                {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
                {!!plays.length && <div className="mt-4 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700" aria-label="Vista previa de jugadas aleatorias">{randomModes.map(mode => {
                    const group = plays.filter(play => play.modality === mode);
                    return group.length ? <section key={mode}><h3 className="mb-1 text-sm font-semibold">{modes[mode]} · {group.length} · {money(Math.round(Number(group[0].amount) * 100), currency)} c/u</h3><div className="flex flex-wrap gap-1">{group.map(play => <span key={play.numbers} className="rounded bg-slate-100 px-2 py-1 font-mono text-xs dark:bg-slate-800">{play.numbers}</span>)}</div></section> : null;
                })}</div>}
            </div>
            <div className="mt-4 flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700"><button type="button" className={secondary} onClick={onClose}>Cancelar</button><button type="button" onClick={generate} className={plays.length ? secondary : button} disabled={!selectedIds.length}>{plays.length ? <RefreshCw className="mr-1 inline h-4 w-4" /> : <Dice5 className="mr-1 inline h-4 w-4" />}{plays.length ? "Volver a generar" : "Generar jugadas"}</button>{!!plays.length && <button ref={acceptRef} type="submit" className={button}><Plus className="mr-1 inline h-4 w-4" />Agregar jugadas</button>}</div>
        </form>
    </Modal>;
}
