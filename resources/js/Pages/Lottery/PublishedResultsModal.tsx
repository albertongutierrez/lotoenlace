import { useState } from 'react';
import { Dialog } from '@headlessui/react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ListChecks, RefreshCw, X } from 'lucide-react';
import Modal from '@/Components/Modal';
import LoadingSkeleton from '@/Components/LoadingSkeleton';
import logos from '@/lib/resultLogos.json';
import { input, secondary } from './shared';

type Published = { id: number; name: string; source_key: string | null; numbers: string[]; published_at: string };
const time = (value: string) => new Date(value).toLocaleTimeString('es-DO', { timeZone: 'America/Santo_Domingo', hour: '2-digit', minute: '2-digit' });
export default function PublishedResultsModal({ branchId, userId, onClose }: { branchId: number; userId: number; onClose: () => void }) {
    const [search, setSearch] = useState('');
    const results = useQuery({ queryKey: ['lottery', 'published-results', userId, branchId], retry: false, staleTime: 0,
        queryFn: async ({ signal }) => (await axios.get('/lottery/published-results', { signal, params: { branch_id: branchId } })).data });
    const rows: Published[] = (results.data?.results ?? []).filter((row: Published) => `${row.name} ${row.numbers.join(' ')}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
    return <Modal show onClose={onClose} maxWidth="7xl"><div className="flex max-h-[90dvh] flex-col text-slate-900 dark:text-slate-100">
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 p-4 dark:border-slate-700"><ListChecks className="h-6 w-6 text-emerald-500" /><div className="flex-1"><Dialog.Title className="text-lg font-semibold">Resultados de hoy</Dialog.Title><p className="text-xs text-slate-500">{results.data?.date ?? 'Hora de República Dominicana'} · Publicados más recientes primero</p></div><button className={secondary} aria-label="Cerrar resultados" onClick={onClose}><X className="h-4 w-4" /></button></div>
        <div className="flex shrink-0 gap-2 p-4"><input autoFocus data-autofocus className={input} aria-label="Buscar resultado" placeholder="Buscar sorteo o número…" value={search} onChange={e => setSearch(e.target.value)} /><button className={secondary} disabled={results.isFetching} aria-label="Actualizar resultados" onClick={() => void results.refetch()}><RefreshCw className={'h-4 w-4 ' + (results.isFetching ? 'animate-spin' : '')} /></button></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {results.isLoading ? <LoadingSkeleton /> : results.isError ? <p role="alert" className="p-4 text-red-500">No se pudieron consultar los resultados. Pulsa Actualizar para reintentar.</p> : rows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{search ? 'No hay resultados que coincidan.' : 'Todavía no hay resultados confirmados de hoy para los sorteos de esta banca.'}</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{rows.map(row => <article key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40"><div className="flex items-center gap-3">{row.source_key && (logos as Record<string, string>)[row.source_key] ? <img src={(logos as Record<string, string>)[row.source_key]} alt="" width={44} height={44} loading="lazy" className="h-11 w-11 shrink-0 rounded-lg bg-white object-contain p-1" /> : <ListChecks className="h-8 w-8 shrink-0 text-slate-400" />}<h3 className="text-sm font-semibold leading-5">{row.name}</h3></div><div className="my-4 flex justify-center gap-3">{row.numbers.map((number, index) => <div key={index} className="text-center"><strong className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 font-mono text-xl text-white">{number}</strong><span className="mt-1 block text-[10px] text-slate-500">{row.numbers.length === 1 ? 'Único premio' : `${index + 1}ª posición`}</span></div>)}</div><p className="border-t border-slate-200 pt-2 text-xs text-slate-500 dark:border-slate-700">Publicado a las {time(row.published_at)}</p></article>)}</div>}
        </div><div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-700"><span>{results.data ? `${rows.length} resultados · Consulta ${time(results.data.consulted_at)}` : 'Resultados confirmados del día actual'}</span><span>Logos: El Boleto Ganador</span></div>
    </div></Modal>;
}
