import ComboboxSelect from "@/Components/ComboboxSelect";
import { DataTable, DataColumn } from "@/Components/ui/data-table";
import { useMemo, useState } from "react";
import { Link, usePage } from "@inertiajs/react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Plus, Search, ArrowRight, Pencil } from "lucide-react";
import { PageProps } from "@/types";
import { Shell, input, button, secondary, panel } from "./shared";
import { LotteryEditor, LotteryRow, Status } from "./CatalogForms";

export default function Catalog({ lotteries }: { lotteries: LotteryRow[] }) {
    const { auth } = usePage<PageProps>().props;
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("all");
    const [editing, setEditing] = useState<LotteryRow | null | undefined>();
    const query = useQuery({
        queryKey: ["lottery", "catalog", auth.user.id],
        queryFn: async ({ signal }) => (await axios.get<{ lotteries: LotteryRow[] }>("/lottery/catalog", { signal, headers: { Accept: "application/json" } })).data,
        initialData: { lotteries }, refetchOnMount: "always",
    });
    const rows = query.data.lotteries.filter(l => l.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (status === "all" || l.active === (status === "active")));
    const columns = useMemo<DataColumn<LotteryRow>[]>(() => [
        { accessorKey: "name", header: "Lotería", cell: ({ row }) => <Link className="font-semibold hover:text-emerald-600" href={`/lottery/catalog/lotteries/${row.original.id}`}>{row.original.name}</Link> },
        { accessorKey: "draws_count", header: "Sorteos", sortFn: "basic", cell: ({ row }) => row.original.draws_count ?? 0 },
        { accessorKey: "active", header: "Estado", sortFn: "basic", cell: ({ row }) => <Status active={row.original.active} /> },
        { id: "actions", header: "Acciones", cell: ({ row }) => <div className="flex justify-end gap-2 whitespace-nowrap"><button className={`${secondary} inline-flex items-center gap-2`} aria-label={`Editar ${row.original.name}`} onClick={() => setEditing(row.original)}><Pencil size={14} />Editar</button><Link className={`${secondary} inline-flex items-center gap-2`} href={`/lottery/catalog/lotteries/${row.original.id}`}>Ver sorteos<ArrowRight size={14} /></Link></div> },
    ], []);
    return <Shell fullWidth title="Loterías">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-xl text-sm text-slate-500">Administra las loterías del catálogo global. Abre una lotería para consultar sus sorteos, horarios y modalidades.</p><button className={`${button} inline-flex items-center gap-2`} onClick={() => setEditing(null)}><Plus size={16} />Nueva lotería</button></div>
        <section className={`${panel} !p-0 overflow-hidden`}>
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
                <div className="relative min-w-48 flex-1"><Search size={16} aria-hidden className="absolute left-3 top-3 text-slate-400" /><input aria-label="Buscar lotería" className={`${input} !pl-9`} placeholder="Buscar lotería…" value={search} onChange={e => setSearch(e.target.value)} /></div>
                <ComboboxSelect aria-label="Estado de lotería" className={`${input} !w-auto`} value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todos los estados</option><option value="active">Activas</option><option value="inactive">Inactivas</option></ComboboxSelect>
                <span className="text-sm text-slate-500">{rows.length} loterías</span>
            </div>
            {query.isError && <div role="alert" className="p-4 text-red-600">No se pudo actualizar el catálogo. <button onClick={() => query.refetch()} className={secondary}>Reintentar</button></div>}
            <DataTable loading={query.isLoading} columns={columns} data={rows} resetKey={`${search}:${status}`} emptyMessage="No hay loterías que coincidan con los filtros." />
        </section>
        {editing !== undefined && <LotteryEditor key={editing?.id ?? "new"} lottery={editing ?? undefined} onClose={() => setEditing(undefined)} />}
    </Shell>;
}
