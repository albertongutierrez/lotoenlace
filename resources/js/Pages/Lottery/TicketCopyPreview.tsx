import { Tickets } from 'lucide-react';
import { CopyLine, ticketCopyTemplates } from '@/lib/ticketCopy';
import { modes, money } from './shared';

type Props = { lines: CopyLine[] | null; mode: string; currency: string; amounts: Record<string,string>; drawName: (id:number)=>string };

export default function TicketCopyPreview({lines, mode, currency, amounts, drawName}: Props) {
    const selected = mode === 'selected';
    const rows = selected ? ticketCopyTemplates(lines ?? []).map(item=>({...item.line, amount:item.amounts.length === 1 ? item.amounts[0] : item.amounts.includes(amounts[item.key]) ? amounts[item.key] : undefined, alternatives:item.amounts}))
        : (lines ?? []).map(line=>({...line, alternatives:[line.amount]}));
    const total = rows.every(line=>line.amount !== undefined) ? rows.reduce((sum,line)=>sum+Math.round(Number(line.amount)*100),0) : null;
    return <section aria-label="Jugadas del ticket a copiar" className="flex min-h-56 max-h-[60dvh] min-w-0 flex-col border-t border-slate-200 bg-slate-50/70 md:min-h-0 md:max-h-none md:border-l md:border-t-0 dark:border-slate-700 dark:bg-slate-950/40">
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700"><Tickets className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /><div className="min-w-0 flex-1"><h3 className="font-semibold">Jugadas del ticket</h3><p className="text-xs text-slate-500">{selected ? 'Jugadas únicas · sin sorteos' : 'Jugadas con sus sorteos originales'}</p></div>{lines && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{rows.length}</span>}</div>
        {!lines ? <div className="flex min-h-40 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-500"><Tickets className="h-10 w-10 opacity-40" /><p>Consulta un ticket para ver sus jugadas.</p></div> : <>
            <div className="min-h-0 flex-1 overflow-auto [scrollbar-width:thin]">
                <table aria-label="Detalle del ticket a copiar" className="w-full text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-100 text-slate-500 dark:bg-slate-900"><tr>{!selected && <th className="px-3 py-2 font-medium">Sorteo</th>}<th className="px-3 py-2 font-medium">Modalidad</th><th className="px-3 py-2 font-medium">Jugada</th><th className="px-3 py-2 text-right font-medium">Monto</th></tr></thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">{rows.map((line,index)=><tr key={index} className="align-top">{!selected && <td className="break-words px-3 py-2.5 leading-4">{drawName(line.draw_id)}{line.second_draw_id ? ` + ${drawName(line.second_draw_id)}` : ''}</td>}<td className="px-3 py-2.5 text-slate-500">{modes[line.modality as keyof typeof modes] ?? line.modality}</td><td className="whitespace-nowrap px-3 py-2.5 font-mono font-semibold">{line.numbers}</td><td className="px-3 py-2.5 text-right font-medium tabular-nums text-emerald-700 dark:text-emerald-300">{line.amount === undefined ? line.alternatives.map(amount=>money(Math.round(Number(amount)*100),currency)).join(' / ') : money(Math.round(Number(line.amount)*100),currency)}</td></tr>)}</tbody>
                </table>
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-700"><span className="text-slate-500">{selected ? 'Total base' : 'Total de jugadas'}</span><strong className="tabular-nums">{total === null ? '—' : money(total,currency)}</strong></div>
        </>}
    </section>;
}
