import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Trophy, Search, X, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import Modal from "@/Components/Modal";
import { DataTable, type DataColumn } from "@/Components/ui/data-table";
import { button, secondary, input, money, modes, drawName, Draw } from "./shared";

const ticketRowId = (ticket: any) => ticket.code;

export default function WinnersModal({ show, onClose, userId, branchId, draws }: { show: boolean; onClose: () => void; userId: number; branchId: number; draws: Draw[] }) {
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("");
    const [page, setPage] = useState(1);
    const listing = useQuery({
        queryKey: ["lottery", "winners-modal", userId, branchId, filter, page],
        enabled: show,
        refetchOnMount: "always",
        queryFn: async ({ signal }) => (await axios.get("/lottery/tickets", { signal, params: { branch_id: branchId, winners: 1, search: filter, page }, headers: { Accept: "application/json" } })).data,
    });
    const tickets = listing.data?.tickets;
    const total = (ticket: any, unpaid = false) => ticket.lines.reduce((sum: number, line: any) => sum + (unpaid && line.paid_at ? 0 : Math.max(0, line.prize_minor ?? 0)), 0);
    // Stable cell components preserve native disclosure state and keyboard focus as Sales ticks.
    const columns = useMemo<DataColumn<any>[]>(() => {
        const name = (id: number) => { const draw = draws.find(d => d.id === id); return draw ? drawName(draw) : `Sorteo #${id}`; };
        return [
                    { id: "ticket", header: "Ticket / jugadas", cell: ({ row }: any) => <div><span className="break-all font-mono text-xs">{row.original.reference ?? row.original.code}</span><p className="text-xs text-slate-500">{row.original.business_date}</p><details className="mt-2"><summary className="cursor-pointer text-sm text-emerald-700 dark:text-emerald-400">Ver premios</summary><ul className="mt-2 space-y-2">{row.original.lines.filter((l: any) => l.prize_minor > 0).map((l: any) => <li key={l.id} className="rounded bg-slate-50 p-2 text-xs dark:bg-slate-800"><b>{l.numbers} · {modes[l.modality as keyof typeof modes]}</b><p>{name(l.draw_id)}{l.second_draw_id ? ` + ${name(l.second_draw_id)}` : ""}</p><p>{money(l.prize_minor, row.original.currency)} · {l.paid_at ? "Pagado" : "Por pagar"}</p></li>)}</ul></details></div> },
                    { id: "prize", header: "Premio total", cell: ({ row }: any) => money(total(row.original), row.original.currency) },
                    { id: "pending", header: "Pendiente", cell: ({ row }: any) => <div>{money(total(row.original, true), row.original.currency)}<p className="text-xs text-slate-500">{total(row.original, true) > 0 ? "Por pagar" : "Pagado"}</p></div> },
                ];
    }, [draws]);
    return <Modal show={show} onClose={onClose} maxWidth="2xl">
        <div className="text-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
                <Trophy className="h-6 w-6 text-amber-500" /><div className="flex-1"><h2 className="text-lg font-semibold">Tickets ganadores</h2><p className="text-xs text-slate-500 dark:text-slate-400">Consulta premios y pagos según tu acceso.</p></div>
                <button className={secondary} onClick={onClose} aria-label="Cerrar ganadores"><X className="h-4 w-4" /></button>
            </div>
            <form className="flex gap-2 p-4" onSubmit={e => { e.preventDefault(); setPage(1); setFilter(search.trim()); }}>
                <input autoFocus className={input} aria-label="Código del ticket ganador" placeholder="Buscar por código de ticket" value={search} onChange={e => setSearch(e.target.value)} />
                <button className={button}><Search className="mr-1 inline h-4 w-4" />Buscar</button>
                <button type="button" className={secondary} disabled={listing.isFetching} onClick={() => listing.refetch()} aria-label="Actualizar ganadores"><RefreshCw className={`h-4 w-4 ${listing.isFetching ? "animate-spin" : ""}`} /></button>
            </form>
            <div className="max-h-[55vh] overflow-auto px-4 pb-4 [scrollbar-width:thin] dark:[scrollbar-color:#475569_#0f172a]">

                {listing.isError ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">No se pudieron consultar los ganadores. Pulsa Actualizar para reintentar.</p> : <DataTable loading={listing.isLoading} paginate={false} data={tickets?.data ?? []} getRowId={ticketRowId} emptyMessage="No hay tickets ganadores que coincidan." columns={columns} />}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-4 dark:border-slate-700">
                <span className="text-xs text-slate-500">{tickets?.total ?? 0} tickets · Página {page} de {tickets?.last_page ?? 1}</span>
                <div className="flex gap-2"><button className={secondary} disabled={page <= 1 || listing.isFetching} onClick={() => setPage(p => p - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></button><button className={secondary} disabled={!tickets || page >= tickets.last_page || listing.isFetching} onClick={() => setPage(p => p + 1)} aria-label="Página siguiente"><ChevronRight className="h-4 w-4" /></button><button className={button} onClick={onClose}><X className="mr-1 inline h-4 w-4" />Cerrar</button></div>
            </div>
        </div>
    </Modal>;
}
