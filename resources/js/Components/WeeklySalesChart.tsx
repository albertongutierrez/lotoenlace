import { useId } from 'react';
import { BarChart3 } from 'lucide-react';

export type WeeklySales = {
    from: string; to: string; today: string; net_minor: number; tickets: number;
    series: {date: string; net_minor: number; tickets: number}[];
};
const displayDate = (date: string, options: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00:00-04:00`).toLocaleDateString('es-DO',{timeZone:'America/Santo_Domingo',...options});

export default function WeeklySalesChart({week, money}: {week: WeeklySales; money: (minor: number) => string}) {
    const titleId = useId();
    const maximum = Math.max(1,...week.series.map(day=>day.net_minor));
    const last = week.series.at(-1)?.net_minor ?? 0;
    const previous = week.series.at(-2)?.net_minor ?? 0;
    const change = previous > 0 ? (last-previous)/previous*100 : null;
    const comparison = week.to===week.today ? 'ayer' : 'el día anterior';
    const description = change !== null
        ? `${change>0 ? 'Subida' : change<0 ? 'Bajada' : 'Sin variación'}${change ? ` de ${Math.abs(change).toLocaleString('es-DO',{maximumFractionDigits:1})}%` : ''} contra ${comparison}.`
        : last>0 ? `Venta del último día: ${money(last)}. El día anterior no hubo ventas.` : `Sin ventas en los últimos dos días.`;

    return <section aria-labelledby={titleId} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-5"><h2 id={titleId} className="flex items-center gap-2 text-sm font-semibold"><BarChart3 aria-hidden className="h-4 w-4 text-slate-400" />Ventas de los últimos 7 días</h2><p className="text-[11px] text-slate-500">{displayDate(week.from,{day:'numeric',month:'short'})} — {displayDate(week.to,{day:'numeric',month:'short'})}</p></div>
        <div className="p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 min-[480px]:grid-cols-4 lg:grid-cols-7" role="list" aria-label="Resumen diario de los últimos siete días">
                {week.series.map(day=>{
                    const today = day.date===week.today;
                    const label = displayDate(day.date,{weekday:'short',day:'numeric'});
                    return <div key={day.date} role="listitem" aria-label={`${displayDate(day.date,{weekday:'long',day:'numeric',month:'long'})}: ${money(day.net_minor)}, ${day.tickets} tickets`} title={`${money(day.net_minor)} · ${day.tickets} tickets`} className="min-w-0 text-center">
                        <div aria-hidden className={'flex h-24 items-end rounded-md bg-slate-100 p-1 dark:bg-slate-950 sm:h-40 lg:h-48 ' + (today ? 'ring-1 ring-emerald-300/60 dark:ring-emerald-800' : '')}><div className={'w-full rounded-sm ' + (day.net_minor ? 'bg-emerald-400 dark:bg-emerald-400' : 'bg-transparent')} style={{height:day.net_minor ? `${Math.max(3,day.net_minor/maximum*100)}%` : '0px'}} /></div>
                        <p className={'mt-2 text-xs font-semibold ' + (today ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200')}>{label}</p><p className="mt-0.5 break-words text-[11px] leading-4 tabular-nums text-slate-500 dark:text-slate-400">{money(day.net_minor)}</p>
                    </div>;
                })}
            </div>
            <p className="mt-5 rounded-md bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600 dark:bg-slate-950 dark:text-slate-300">{description}</p>
        </div>
    </section>;
}
