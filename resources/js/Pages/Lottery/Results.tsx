import ComboboxSelect from "@/Components/ComboboxSelect";
import Modal from "@/Components/Modal";
import { Eye, Save, X, Plus, Trash2, RefreshCw, CheckCircle2, AlertCircle, Info, Check, Clock3 } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { DataTable, DataColumn } from "@/Components/ui/data-table";
import { RowActions } from "@/Components/ui/row-actions";
import { Dialog } from "@headlessui/react";
import {
    Shell,
    Field,
    Draw,
    input,
    button,
    secondary,
    panel,
    drawName,
} from "./shared";

export default function Results({ draws, results: initialResults, result_dates, last_results_updated_at, last_automatic_sync }: any) {
    const [form, setForm] = useState({
        draw_id: "",
        business_date: new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Santo_Domingo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(new Date()),
        numbers: ["", "", ""],
        confirmed: false,
    });
    const client = useQueryClient();
    const [syncMessage, setSyncMessage] = useState("");
    const [syncOk, setSyncOk] = useState(true);
    const syncLines = syncMessage.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const confirmedLines = syncLines.filter(line => line.startsWith("Importado y confirmado:"));
    const noticeLines = syncLines.filter(line => !line.startsWith("Importado y confirmado:"));

    const sync = useMutation({
        mutationFn: async () => (await axios.post("/lottery/results/sync", {}, { timeout: 60000 })).data,
        onSuccess: async data => { setSyncOk(data.ok !== false); setSyncMessage(data.message); await client.invalidateQueries({ queryKey: ["lottery", "results"] }); },
        onError: (error: any) => { setSyncOk(false); setSyncMessage(error.response?.data?.message ?? "No se pudo obtener la respuesta. Actualiza la lista antes de reintentar."); },
    });
    const [record, setRecord] = useState<any>(null);
    const [deleting, setDeleting] = useState<any>(null);
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("all");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
    const [period, setPeriod] = useState("today");
    const [dates, setDates] = useState(result_dates ?? { from: today, to: today });
    const [customFrom, setCustomFrom] = useState(dates.from);
    const [customTo, setCustomTo] = useState(dates.to);
    const [lottery, setLottery] = useState("");
    const [drawFilter, setDrawFilter] = useState("");
    const choosePeriod = (value: string) => {
        setPeriod(value);
        if (value === "custom") return;
        const day = new Date(today + "T12:00:00Z");
        const iso = (d: Date) => d.toISOString().slice(0, 10);
        let from = today, to = today;
        if (value === "yesterday") { day.setUTCDate(day.getUTCDate() - 1); from = to = iso(day); }
        if (value === "month" || value === "last_month") {
            const month = day.getUTCMonth() - (value === "last_month" ? 1 : 0);
            from = iso(new Date(Date.UTC(day.getUTCFullYear(), month, 1)));
            to = iso(new Date(Date.UTC(day.getUTCFullYear(), month + 1, 0)));
        }
        setDates({ from, to }); setCustomFrom(from); setCustomTo(to);
    };
    const query = useQuery({ queryKey: ["lottery", "results", dates], refetchInterval: 30000, initialData: dates.from === result_dates?.from && dates.to === result_dates?.to ? { results: initialResults, last_results_updated_at, last_automatic_sync } : undefined, queryFn: async ({ signal }) => (await axios.get("/lottery/results", { signal, params: dates, headers: { Accept: "application/json" } })).data });

    const automatic=query.data?.last_automatic_sync;
    const automaticTime=automatic?.finished_at??automatic?.started_at;
    const automaticLabels:Record<string,string>={running:"Consultando…",success:"Correcta",partial:"Con observaciones",failed:"Falló"};
    const automaticClass=automatic?.status==="failed"?"text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300":automatic?.status==="partial"?"text-amber-700 bg-amber-50 dark:bg-amber-950 dark:text-amber-300":automatic?.status==="running"?"text-sky-700 bg-sky-50 dark:bg-sky-950 dark:text-sky-300":"text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300";
    const mutation = useMutation({
        mutationFn: async (remove: boolean) => remove ? axios.delete("/lottery/results/" + deleting.id) : axios.post("/lottery/results", form),
        onSuccess: async () => { await client.invalidateQueries({ queryKey: ["lottery", "results"] }); setReviewing(false); setDeleting(null); },
        onError: (error: any) => setErrors(error.response?.data?.errors ? Object.fromEntries(Object.entries(error.response.data.errors).map(([key, value]) => [key, Array.isArray(value) ? value.join(" ") : String(value)])) : { result: error.response?.data?.message ?? "No se pudo guardar el cambio." }),
    });
    const busy = mutation.isPending;
    const [reviewing, setReviewing] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const editor = (
            <section className={panel}>
                <div className="mb-4 flex items-center justify-between"><Dialog.Title className="font-semibold">{record ? "Revisar / editar resultado" : "Nuevo resultado"}</Dialog.Title>{reviewing && <button type="button" className={secondary} aria-label="Cerrar revisión" disabled={busy} onClick={() => setReviewing(false)}><X className="h-4 w-4" /></button>}</div>
                {Object.keys(errors).length > 0 && <div role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{Object.entries(errors).map(([key, value]) => <p key={key}>{value}</p>)}</div>}
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        setErrors({});
                        mutation.mutate(false);
                    }}
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Sorteo">
                            <ComboboxSelect
                                required
                                disabled={!!record}
                                className={input}
                                value={form.draw_id}
                                onChange={(e) => {
                                    setForm({
                                        ...form,
                                        draw_id: e.target.value,
                                        numbers: Array(draws.find((d: any) => d.id === Number(e.target.value))?.result_count ?? 3).fill(''),
                                    });
                                }}
                            >
                                <option value="">Seleccionar</option>
                                {draws.map((d: Draw) => (
                                    <option key={d.id} value={d.id}>
                                        {drawName(d)}
                                    </option>
                                ))}
                            </ComboboxSelect>
                        </Field>
                        <Field label="Fecha del sorteo">
                            <input
                                required
                                type="date"
                                disabled={!!record}
                                className={input}
                                value={form.business_date}
                                onChange={(e) => {
                                    setForm({
                                        ...form,
                                        business_date: e.target.value,
                                    });
                                }}
                            />
                        </Field>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                        {form.numbers.map((n, i) => (
                            <Field key={i} label={`Premio ${i + 1}`}>
                                <input
                                    required
                                    autoFocus={reviewing && i === 0}
                                    inputMode="numeric"
                                    pattern="[0-9]{2}"
                                    maxLength={2}
                                    className={input}
                                    value={n}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            numbers: form.numbers.map((v, j) =>
                                                i === j ? e.target.value : v,
                                            ),
                                        })
                                    }
                                />
                            </Field>
                        ))}
                    </div>
                    <label className="flex gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={form.confirmed}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    confirmed: e.target.checked,
                                })
                            }
                        />
                        Confirmado: habilitar cálculo de ganadores
                    </label>
                    <p className="text-sm text-slate-500">
                        Los resultados válidos de la fuente configurada se confirman
                        automáticamente. Las correcciones quedan auditadas; no se
                        sobrescriben resultados con premios pagados.
                    </p>
                    <button disabled={busy} className={button}>
                        <Save className="mr-2 inline h-4 w-4" />Guardar resultado
                    </button>
                </form>
            </section>
    );
    const openEditor = (r?: any) => {
        setErrors({}); setRecord(r ?? null);
        setForm(r ? { draw_id: String(r.draw_id), business_date: String(r.business_date).slice(0, 10), numbers: [...r.numbers], confirmed: r.status === "confirmed" } : {
            draw_id: "", business_date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date()), numbers: ["", "", ""], confirmed: false,
        });
        setReviewing(true);
    };
    const rows = (query.data?.results ?? []).filter((r: any) => (!drawFilter || String(r.draw_id) === drawFilter) && (!lottery || String(draws.find((d: Draw) => d.id === r.draw_id)?.lottery_id) === lottery)).map((r: any) => ({ ...r, name: draws.find((d: Draw) => d.id === r.draw_id)?.name ?? "Sorteo" })).filter((r: any) => (r.name + " " + r.business_date + " " + r.numbers.join(" ")).toLowerCase().includes(search.toLowerCase()) && (status === "all" || r.status === status));
    const columns: DataColumn<any>[] = [
        { accessorKey: "name", header: "Sorteo" },
        { accessorKey: "business_date", header: "Fecha" },
        { id: "numbers", header: "Números ganadores", cell: ({ row }) => <span className="font-mono text-lg">{row.original.numbers.join(" · ")}</span> },
        { accessorKey: "status", header: "Estado", cell: ({ row }) => <span className={row.original.status === "confirmed" ? "text-emerald-500" : "text-amber-500"}>{row.original.status === "confirmed" ? "Confirmado" : "Pendiente de revisión"}</span> },
        { id: "actions", header: "Acciones", cell: ({ row }) => <RowActions label={row.original.name} actions={[
            { label: "Revisar / editar", icon: Eye, onClick: () => openEditor(row.original) },
            { label: "Eliminar", icon: Trash2, destructive: true, onClick: () => { setErrors({}); setDeleting(row.original); } },
        ]} /> },
    ];
    return (
        <Shell fullWidth title="Resultados">
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 text-xs text-slate-500"><Clock3 className="h-4 w-4 shrink-0"/>{query.data?.last_results_updated_at?<span>Última actualización: <time dateTime={query.data.last_results_updated_at} className="font-medium text-slate-700 dark:text-slate-300">{new Date(query.data.last_results_updated_at).toLocaleString("es-DO",{timeZone:"America/Santo_Domingo",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}</time> · Hora RD</span>:"Sin actualizaciones registradas"}</p><div className="flex gap-2"><button className={secondary} disabled={sync.isPending} onClick={() => sync.mutate()}><RefreshCw className={"mr-2 inline h-4 w-4 " + (sync.isPending ? "animate-spin" : "")} />{sync.isPending ? "Sincronizando…" : "Sincronizar ahora"}</button><button className={button} onClick={() => openEditor()}><Plus className="mr-2 inline h-4 w-4" />Nuevo resultado</button></div></div>
            <section className={panel+" !p-3"} aria-label="Estado de sincronización automática">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex flex-wrap items-center gap-2 text-sm"><RefreshCw className={`h-4 w-4 text-slate-500 ${automatic?.status==="running"?"animate-spin":""}`}/><span className="font-medium">Última consulta automática</span>{automaticTime&&<time dateTime={automaticTime} className="text-xs text-slate-500">{new Date(automaticTime).toLocaleString("es-DO",{timeZone:"America/Santo_Domingo",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})} · Hora RD</time>}</p>{automatic&&<span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${automaticClass}`}>{automaticLabels[automatic.status]??automatic.status}</span>}</div>
                <p className="mt-1 text-xs text-slate-500">{automatic?.status==="running"?"Consultando la fuente y verificando resultados…":automatic?.status==="success"&&automatic?.stats?.source_checked?(automatic.stats.published_results?`Resultados publicados: ${automatic.stats.published_results}. Tickets verificados: ${automatic.stats.tickets_checked}. Con premios: ${automatic.stats.winning_tickets}.`:"Consulta correcta: sin resultados nuevos."):automatic?.message??"Pendiente de la próxima consulta automática."}</p>
                {!!automatic?.stats?.tickets_checked&&<p className="mt-2 text-xs">Tickets verificados: <b>{automatic.stats.tickets_checked}</b> · Con premios: <b>{automatic.stats.winning_tickets}</b> · Perdidos: <b>{automatic.stats.losing_tickets}</b> · Pendientes de otros sorteos: <b>{automatic.stats.pending_tickets}</b></p>}
            </section>
            <div className={panel + " !p-4 space-y-3"}>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Período de resultados">{[["today", "Hoy"], ["yesterday", "Ayer"], ["month", "Este mes"], ["last_month", "Mes anterior"], ["custom", "Personalizado"]].map(([value, label]) => <button key={value} className={period === value ? button : secondary} aria-pressed={period === value} onClick={() => choosePeriod(value)}>{label}</button>)}</div>
                {period === "custom" && <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); setDates({ from: customFrom, to: customTo }); }}><Field label="Desde"><input required type="date" className={input} value={customFrom} max={customTo || undefined} onChange={e => setCustomFrom(e.target.value)} /></Field><Field label="Hasta"><input required type="date" className={input} value={customTo} min={customFrom || undefined} onChange={e => setCustomTo(e.target.value)} /></Field><button className={button}>Aplicar fechas</button></form>}
                <p className="text-xs text-slate-500">Fecha RD: {dates.from === dates.to ? dates.from : dates.from + " — " + dates.to}</p>
            </div>
            <section className={panel + " !p-0 overflow-hidden"}>
                <div className="flex flex-wrap gap-3 p-4">
                    <input className={input + " flex-1"} placeholder="Buscar sorteo, fecha o número…" aria-label="Buscar resultados" value={search} onChange={e => setSearch(e.target.value)} />
                    <ComboboxSelect className={input + " !w-auto max-w-full"} aria-label="Lotería" value={lottery} onChange={e => { setLottery(e.target.value); setDrawFilter(""); }}><option value="">Todas las loterías</option>{Array.from(new Map<number, string>(draws.map((d: Draw) => [d.lottery_id, d.lottery?.name ?? "Lotería"]))).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</ComboboxSelect>
                    <ComboboxSelect className={input + " !w-auto max-w-full"} aria-label="Sorteo" value={drawFilter} onChange={e => setDrawFilter(e.target.value)}><option value="">Todos los sorteos</option>{draws.filter((d: Draw) => !lottery || String(d.lottery_id) === lottery).map((d: Draw) => <option key={d.id} value={d.id}>{d.name}</option>)}</ComboboxSelect>
                    <ComboboxSelect className={input + " !w-auto"} aria-label="Estado" value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todos los estados</option><option value="pending">Pendientes de revisión</option><option value="confirmed">Confirmados</option></ComboboxSelect>
                </div>
                {query.isError && <p role="alert" className="p-4 text-red-500">No se pudo cargar la lista. <button onClick={() => query.refetch()}>Reintentar</button></p>}
                <DataTable loading={query.isLoading} columns={columns} data={rows} getRowId={r => String(r.id)} resetKey={JSON.stringify([search, status, lottery, drawFilter, dates])} emptyMessage="No hay resultados que coincidan." />
            </section>
            <Modal show={!!syncMessage} onClose={() => setSyncMessage("")}>
                <div className="text-slate-900 dark:text-slate-100">
                    <div className="flex items-center gap-3 border-b border-slate-200 p-5 dark:border-slate-800">
                        <div className={"rounded-xl p-3 " + (syncOk ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300")}>{syncOk ? <CheckCircle2 className="h-6 w-6" /> : <AlertCircle className="h-6 w-6" />}</div>
                        <div className="flex-1"><Dialog.Title className="text-lg font-semibold">{syncOk ? "Sincronización completada" : "Sincronización con avisos"}</Dialog.Title><Dialog.Description className="mt-1 text-sm text-slate-500">Resultados consultados en El Boleto Ganador</Dialog.Description></div>
                        <button className={secondary} aria-label="Cerrar sincronización" onClick={() => setSyncMessage("")}><X className="h-4 w-4" /></button>
                    </div>
                    <div className="space-y-4 p-5">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30"><p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{confirmedLines.length}</p><p className="text-xs text-emerald-700 dark:text-emerald-300">Sorteos confirmados en esta consulta</p></div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"><p className="text-2xl font-bold">{noticeLines.length}</p><p className="text-xs text-slate-500 dark:text-slate-400">Avisos de la consulta</p></div>
                        </div>
                        <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin] dark:[scrollbar-color:#475569_#0f172a]">
                            {confirmedLines.map((line, index) => <div key={"confirmed-" + index} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" /><span className="min-w-0 flex-1 break-words text-sm font-medium">{line.replace("Importado y confirmado:", "").trim()}</span><span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Confirmado</span></div>)}
                            {noticeLines.map((line, index) => <div key={"notice-" + index} className={"flex items-start gap-3 rounded-lg p-3 text-sm " + (syncOk ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" : "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200")}><Info className="mt-0.5 h-4 w-4 shrink-0" /><p className="break-words">{line}</p></div>)}
                        </div>
                    </div>
                    <div className="flex justify-end border-t border-slate-200 p-5 dark:border-slate-800"><button autoFocus className={button} onClick={() => setSyncMessage("")}><Check className="mr-2 inline h-4 w-4" />Aceptar</button></div>
                </div>
            </Modal>
            <Modal show={reviewing} onClose={() => setReviewing(false)} closeable={!busy}><div className="max-h-[85vh] overflow-auto text-slate-900 dark:text-slate-100">{editor}</div></Modal>
            <Modal show={!!deleting} onClose={() => setDeleting(null)} closeable={!busy}>
                <div className="space-y-4 p-6 text-slate-900 dark:text-slate-100">
                    <Dialog.Title className="text-lg font-semibold">Eliminar resultado</Dialog.Title>
                    <p>¿Eliminar el resultado de {deleting?.name} del {deleting?.business_date}? Las jugadas afectadas volverán a estar pendientes de resultados. No se permite si hay premios pagados.</p>
                    {Object.values(errors).map((error, i) => <p key={i} role="alert" className="text-red-500">{error}</p>)}
                    <div className="flex justify-end gap-2"><button autoFocus disabled={busy} className={secondary} onClick={() => setDeleting(null)}><X className="mr-2 inline h-4 w-4" />Cancelar</button><button disabled={busy} className={button + " !bg-red-600"} onClick={() => mutation.mutate(true)}><Trash2 className="mr-2 inline h-4 w-4" />Eliminar</button></div>
                </div>
            </Modal>
        </Shell>
    );
}
