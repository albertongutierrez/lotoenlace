import ComboboxSelect from "@/Components/ComboboxSelect";
import { DataTable, DataColumn } from "@/Components/ui/data-table";
import { useMemo, useState } from "react";
import { Link, usePage } from "@inertiajs/react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { ArrowLeft, Plus, Pencil } from "lucide-react";
import { PageProps } from "@/types";
import { Shell, Draw, input, button, secondary, panel, modes } from "./shared";
import { LotteryEditor, DrawEditor, LotteryRow, Status } from "./CatalogForms";

const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export default function LotteryDetail({ lottery: initialLottery, draws: initialDraws }: { lottery: LotteryRow; draws: Draw[] }) {
    const { auth } = usePage<PageProps>().props;
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("all");
    const [editing, setEditing] = useState<Draw | null | undefined>();
    const [editLottery, setEditLottery] = useState(false);
    const query = useQuery({
        queryKey: ["lottery", "catalog", auth.user.id, initialLottery.id],
        queryFn: async ({ signal }) => (await axios.get<{ lottery: LotteryRow; draws: Draw[] }>(`/lottery/catalog/lotteries/${initialLottery.id}`, { signal, headers: { Accept: "application/json" } })).data,
        initialData: { lottery: initialLottery, draws: initialDraws }, refetchOnMount: "always",
    });
    const { lottery, draws } = query.data;
    const rows = draws.filter(d => d.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (status === "all" || d.active === (status === "active")));
    const columns = useMemo<DataColumn<Draw>[]>(() => [
        { accessorKey: "name", header: "Sorteo", cell: ({ row: { original: d } }) => <div><b>{d.name}</b><p className="mt-1 text-xs text-slate-500">{d.source_url ? "Resultados enlazados" : "Sin fuente de resultados"}</p></div> },
        { accessorKey: "draws_at", header: "Horario RD", cell: ({ row: { original: d } }) => <div className="whitespace-nowrap"><b>Sorteo {d.draws_at.slice(0, 5)}</b><p className="mt-1 text-xs text-slate-500">Venta {d.opens_at.slice(0, 5)}–{d.closes_at.slice(0, 5)}</p></div> },
        { id: "days", header: "Días", cell: ({ row: { original: d } }) => <span className="text-xs">{d.weekdays.length === 7 ? "Todos los días" : d.weekdays.map(n => days[n]).join(" · ")}</span> },
        { id: "modes", header: "Modalidades", cell: ({ row: { original: d } }) => <div className="flex flex-wrap gap-1">{d.modalities.map(m => <span key={m} className="rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{modes[m as keyof typeof modes]}</span>)}</div> },
        { accessorKey: "active", header: "Estado", sortFn: "basic", cell: ({ row }) => <Status active={row.original.active} /> },
        { id: "actions", header: "Acciones", cell: ({ row }) => <button className={secondary} aria-label={`Editar ${row.original.name}`} onClick={() => setEditing(row.original)}>Editar</button> },
    ], []);
    return <Shell fullWidth title={lottery.name}>
        <Link href="/lottery/catalog" className="inline-flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300"><ArrowLeft size={16} />Volver a loterías</Link>
        <div className={`${panel} flex flex-wrap items-center justify-between gap-4`}>
            <div className="space-y-2"><Status active={lottery.active} /><p className="text-sm text-slate-500">{draws.length} sorteos · {draws.filter(d => d.active).length} activos · Horarios RD (UTC−4)</p></div>
            <div className="flex flex-wrap gap-2"><button className={`${secondary} inline-flex items-center gap-2`} onClick={() => setEditLottery(true)}><Pencil size={16} />Editar lotería</button><button className={`${button} inline-flex items-center gap-2`} onClick={() => setEditing(null)}><Plus size={16} />Nuevo sorteo</button></div>
        </div>
        {!lottery.active && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Esta lotería está inactiva. Ninguno de sus sorteos está disponible para vender.</p>}
        <section className={`${panel} !p-0 overflow-hidden`}>
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4 dark:border-slate-800"><input aria-label="Buscar sorteo" className={`${input} !w-auto flex-1`} placeholder="Buscar sorteo…" value={search} onChange={e => setSearch(e.target.value)} /><ComboboxSelect aria-label="Estado del sorteo" className={`${input} !w-auto`} value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todos los estados</option><option value="active">Activos</option><option value="inactive">Inactivos</option></ComboboxSelect></div>
            {query.isError && <div role="alert" className="p-4 text-red-600">No se pudieron actualizar los sorteos. <button className={secondary} onClick={() => query.refetch()}>Reintentar</button></div>}
            <DataTable loading={query.isLoading} columns={columns} data={rows} resetKey={`${search}:${status}`} emptyMessage="No hay sorteos que coincidan con los filtros." />
        </section>
        {editLottery && <LotteryEditor lottery={lottery} onClose={() => setEditLottery(false)} />}
        {editing !== undefined && <DrawEditor key={editing?.id ?? "new"} lottery={lottery} draw={editing ?? undefined} onClose={() => setEditing(undefined)} />}
    </Shell>;
}
