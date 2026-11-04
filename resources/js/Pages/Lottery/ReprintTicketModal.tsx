import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Dialog } from "@headlessui/react";
import { Printer, X, RefreshCw } from "lucide-react";
import Modal from "@/Components/Modal";
import { DataTable, DataColumn } from "@/Components/ui/data-table";
import IssuedTicketModal from "./IssuedTicketModal";
import { Draw, input, secondary, button, money } from "./shared";

export default function ReprintTicketModal({ branch, draws, currency, onClose }: { branch: any; draws: Draw[]; currency: string; onClose: () => void }) {
    const [search, setSearch] = useState("");

    const [ticket, setTicket] = useState<any>(null);
    const [now, setNow] = useState(Date.now());
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
    const list = useQuery({
        queryKey: ["lottery", "reprint-tickets", branch.id],
        queryFn: async ({ signal }) => { const response = await axios.get("/lottery/tickets", { signal, params: { branch_id: branch.id, reprint: true }, headers: { Accept: "application/json" } }); return { ...response.data, offset: Date.parse(response.data.server_now) - Date.now() }; },
        placeholderData: previous => previous,
        refetchInterval: 15000,
    });
    const query = useMutation({
        mutationFn: async (code: string) => (await axios.get(`/lottery/tickets/${encodeURIComponent(code)}`, { params: { branch_id: branch.id, reprint: true }, headers: { Accept: "application/json" } })).data,
        onSuccess: setTicket,
        onError: () => { void list.refetch(); },
    });

    const remaining = (r: any) => Math.max(0, Math.ceil((Date.parse(r.reprint_until) - now - (list.data?.offset ?? 0)) / 1000));
    const rows = (list.data?.tickets ?? []).filter((r: any) => `${r.reference ?? ""} ${r.code}`.toLowerCase().includes(search.toLowerCase()));
    const columns: DataColumn<any>[] = [
        { accessorKey: "code", header: "Ticket", cell: ({ row }) => <span className="break-all font-mono text-xs">{row.original.reference ?? row.original.code}</span> },
        { accessorKey: "created_at", header: "Hora RD", cell: ({ row }) => new Date(row.original.created_at).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", hour: "2-digit", minute: "2-digit" }) },
        { accessorKey: "net_minor", header: "Total", cell: ({ row }) => money(row.original.net_minor, row.original.currency) },
        { id: "remaining", header: "Tiempo restante", cell: ({ row }) => { if (row.original.status !== "sold") return <span className="text-red-500">Anulado</span>; const seconds = remaining(row.original); if (!seconds) return <span className="text-slate-500">Plazo vencido</span>; return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; } },
        { id: "actions", header: "Acciones", cell: ({ row }) => <button className={secondary + " disabled:cursor-not-allowed disabled:opacity-40"} disabled={query.isPending || (row.original.status !== "sold" || remaining(row.original) <= 0)} title={row.original.status !== "sold" ? "Ticket anulado" : remaining(row.original) <= 0 ? "Plazo de reimpresión vencido" : "Reimprimir ticket"} onClick={() => query.mutate(row.original.code)} aria-label={`Reimprimir ticket ${row.original.reference ?? row.original.code}`}><Printer className="mr-2 inline h-4 w-4" />Reimprimir</button> },
    ];
    if (ticket) return <IssuedTicketModal reprint ticket={ticket} draws={draws} branch={branch} currency={currency} onClose={onClose} />;
    return <Modal show onClose={onClose} closeable={!query.isPending} maxWidth="2xl">
        <div className="space-y-4 p-6 text-slate-900 dark:text-slate-100">
            <Dialog.Title className="text-lg font-semibold"><Printer className="mr-2 inline h-5 w-5 text-sky-500" />Reimprimir tickets de hoy</Dialog.Title>
            <p className="text-sm text-slate-500">Banca {branch.code} · Todos los tickets de hoy. Solo se pueden reimprimir los vigentes dentro del plazo configurado.</p>
            <div className="flex gap-2"><input autoFocus className={input} value={search} onChange={e => setSearch(e.target.value)} aria-label="Buscar ticket" placeholder="Filtrar por código del ticket" /><button className={secondary} onClick={() => list.refetch()} disabled={list.isFetching} aria-label="Actualizar tickets"><RefreshCw className="h-4 w-4" /></button></div>


            {list.isError && <p role="alert" className="text-red-500">No se pudo cargar la lista. Pulsa Actualizar para reintentar.</p>}
            {query.isError && <p role="alert" className="text-sm text-red-500">{(query.error as any).response?.data?.message ?? "No se pudo consultar el ticket."}</p>}
            <div className="max-h-[55vh] overflow-auto"><DataTable loading={list.isLoading || list.isPlaceholderData} data={rows} columns={columns} getRowId={r => r.code} resetKey={search} emptyMessage="No hay tickets de hoy que coincidan con la búsqueda." /></div>
            <div className="flex justify-end"><button disabled={query.isPending} className={secondary} onClick={onClose}><X className="mr-2 inline h-4 w-4" />Cerrar</button></div>
        </div>
    </Modal>;
}
