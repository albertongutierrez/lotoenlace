import { canCancelTicket, useCancellationClock } from '@/lib/ticketCancellation';
import ComboboxSelect from "@/Components/ComboboxSelect";
import PrintHistoryModal from "./PrintHistoryModal";

import { Printer } from "lucide-react";

import { ticketOutcome, ticketOutcomeColor } from "@/lib/ticketOutcome";

import Modal from "@/Components/Modal";

import { Dialog } from "@headlessui/react";

import { RowActions } from "@/Components/ui/row-actions";

import { Eye, X, LoaderCircle, Check, KeyRound } from "lucide-react";

import { LayoutGrid, List, Search, Trophy, Ban, CalendarDays } from "lucide-react";

import LoadingSkeleton from "@/Components/LoadingSkeleton";

import { DataTable } from "@/Components/ui/data-table";

import { useRef, useState } from "react";

import { Link, router, usePage } from "@inertiajs/react";

import axios from "axios";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { notify } from "@/lib/notify";

import { PageProps } from "@/types";

import { Shell, input, button, secondary, panel, money, modes } from "./shared";



export default function Tickets({ tickets: initialTickets, currency: initialCurrency }: any) {

    const page = usePage<PageProps>();

    const { auth } = page.props;

    const params = { period: "today", ...Object.fromEntries(new URLSearchParams(page.url.split("?")[1] ?? "")) } as Record<string, string>;

    const [search, setSearch] = useState(params.search ?? "");

    const [view, setView] = useState(params.view === "list" ? "list" : "grid");

    const [period, setPeriod] = useState(params.period);

    const [from, setFrom] = useState(params.from ?? "");

    const [to, setTo] = useState(params.to ?? "");

    const apply = (extra: Record<string, string> = {}) => router.get("/lottery/tickets", { search, period, view, outcome: params.outcome ?? (params.winners === "1" ? "winners" : "all"), ...(period === "custom" ? { from, to } : {}), ...extra });

    const [printHistory, setPrintHistory] = useState<any>(null);

    const [detail, setDetail] = useState<any>(null);

    const [confirmation, setConfirmation] = useState<{ ticket: any; operation: "cancel" } | null>(null);

    const [pin, setPin] = useState("");
    const pinInput = useRef<HTMLInputElement>(null);

    const [actionError, setActionError] = useState("");

    const queryClient = useQueryClient();
    const now = useCancellationClock();

    const listing = useQuery({

        queryKey: ["lottery", "tickets", auth.user.id, auth.activeBranchOffice?.id_hash, params],

        queryFn: async ({ signal }) => (await axios.get("/lottery/tickets", {

            params, signal, headers: { Accept: "application/json" },

        })).data,

        initialData: { tickets: initialTickets, currency: initialCurrency },

        refetchOnMount: "always",

        refetchInterval: 5000,

        refetchOnWindowFocus: "always",

    });

    const { tickets, currency } = listing.data;
    const cancellable = (ticket: any) => canCancelTicket(ticket, now, listing.dataUpdatedAt);
    const currentConfirmation = confirmation ? tickets.data.find((t: any) => t.code === confirmation.ticket.code) ?? confirmation.ticket : null;

    const ticketMutation = useMutation({

        mutationFn: async ({ code, operation }: { code: string; operation: "cancel" }) =>

            (await axios.post(`/lottery/tickets/${encodeURIComponent(code)}/${operation}`, { pin }, { headers: { Accept: "application/json" } })).data,

        onSuccess: (data) => { setPin(""); setConfirmation(null); setActionError(""); notify(data.message, "success"); },

        onError: (e: any) => { setPin(""); setActionError(e.response?.data?.errors?.pin?.[0] ?? e.response?.data?.message ?? "No fue posible completar la operación."); requestAnimationFrame(() => pinInput.current?.focus()); },

        onSettled: () => queryClient.invalidateQueries({ queryKey: ["lottery"] }),

    });

    const busy = ticketMutation.isPending;
    const closeConfirmation = () => { if (!busy) { setPin(""); setActionError(""); setConfirmation(null); } };

    const can = (p: string) =>

        auth.user.is_super_admin || auth.user.permissions?.includes(p);

    const action = (code: string, operation: "cancel") => {

        if (busy) return;

        const ticket = tickets.data.find((t: any) => t.code === code);

        if (!ticket || !cancellable(ticket)) return;

        setActionError("");

        setPin("");
        setConfirmation({ ticket, operation });

    };

    return (

        <Shell fullWidth title="Tickets y ganadores">

            {listing.isLoading && <LoadingSkeleton compact label="Actualizando tickets…" />}

            {listing.isError && <div role="alert" className={panel}>

                No se pudieron actualizar los tickets.

                <button className={secondary} onClick={() => listing.refetch()}>Reintentar</button>

            </div>}

            <form

                className="flex flex-wrap items-center gap-3"

                onSubmit={(e) => {

                    e.preventDefault();

                    apply();

                }}

            >

                <input

                    className={input + " min-w-48 flex-1"}

                    placeholder="Buscar código de ticket"

                    value={search}

                    onChange={(e) => setSearch(e.target.value)}

                />

                <ComboboxSelect aria-label="Período" className={input + " !w-auto"} value={period} onChange={e => { const value = e.target.value; setPeriod(value); if (value !== "custom") apply({ period: value }); }}>

                    <option value="today">Hoy</option><option value="yesterday">Ayer</option><option value="month">Este mes</option><option value="last_month">Mes anterior</option><option value="custom">Personalizado</option>

                </ComboboxSelect>

                {period === "custom" && <><label className="text-xs">Desde<input aria-label="Desde" required type="date" className={input} value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label><label className="text-xs">Hasta<input aria-label="Hasta" required type="date" className={input} value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label></>}

                <button className={button}><Search className="mr-1 inline h-4 w-4" />Buscar</button>

                <ComboboxSelect aria-label="Estado del ticket" className={input + " !w-auto"} value={params.outcome ?? (params.winners === "1" ? "winners" : "all")} onChange={e => apply({ outcome: e.target.value, winners: "" })}><option value="all">Todos los estados</option><option value="winners">Ganadores</option><option value="lost">Perdidos</option><option value="pending">Pendientes</option><option value="cancelled">Anulados</option></ComboboxSelect>

                <div className="flex gap-1" role="group" aria-label="Vista de tickets"><button type="button" aria-label="Ver en bloques" aria-pressed={view === "grid"} className={view === "grid" ? button : secondary} onClick={() => setView("grid")}><LayoutGrid className="h-4 w-4" /></button><button type="button" aria-label="Ver en lista" aria-pressed={view === "list"} className={view === "list" ? button : secondary} onClick={() => setView("list")}><List className="h-4 w-4" /></button></div>

            </form>

            <p className="text-xs text-slate-500">Actualización automática cada 5 segundos · {listing.dataUpdatedAt ? new Date(listing.dataUpdatedAt).toLocaleTimeString("es-DO", { timeZone: "America/Santo_Domingo" }) : "Sincronizando"}</p>

            <div className={view === "grid" ? "grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>

                {tickets.data.map((t: any) => (

                    <article key={t.id} className={panel + " min-w-0 !p-0 overflow-hidden"}>

                        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">

                            <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + ticketOutcomeColor(t)}>{ticketOutcome(t)}</span>

                            <RowActions label={t.reference ?? t.code} actions={[

                                { label: "Auditoría de impresión", icon: Printer, onClick: () => setPrintHistory(t) },

                                { label: "Ver jugadas y premios", icon: Eye, onClick: () => setDetail(t) },

                                ...(cancellable(t) && can("lottery.cancel") ? [{ label: "Anular ticket", icon: Ban, destructive: true, onClick: () => action(t.code, "cancel") }] : []),


                            ]} />

                        </div>

                        <div className="space-y-3 p-4">

                            <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Código del ticket</p><p className="break-all font-mono text-xs font-semibold">{t.reference ?? t.code}</p></div>

                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span><CalendarDays className="mr-1 inline h-3.5 w-3.5" />{t.business_date} · {new Date(t.created_at).toLocaleTimeString("es-DO", { timeZone: "America/Santo_Domingo", hour: "2-digit", minute: "2-digit" })}</span><span>{t.lines.length} {t.lines.length === 1 ? "jugada" : "jugadas"}</span></div>

                            <div className="flex items-end justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-800"><div><p className="text-xs text-slate-500">Total cobrado</p><p className="text-xl font-bold">{money(t.net_minor, t.currency)}</p></div><div className="text-right"><p className="text-xs text-slate-500">Descuento</p><p className="text-sm">{money(t.discount_minor, t.currency)}</p></div></div>

                        </div>

                    </article>

                ))}

                {!tickets.data.length && (

                    <p className={panel}>No hay tickets que coincidan.</p>

                )}

            </div>

            {printHistory && <PrintHistoryModal ticket={printHistory} onClose={() => setPrintHistory(null)} />}

            <Modal show={!!confirmation} onClose={closeConfirmation} closeable={!busy} maxWidth="lg">

                {confirmation && <form onSubmit={e => { e.preventDefault(); if (!busy && pin.length === 6 && cancellable(currentConfirmation)) ticketMutation.mutate({ code: confirmation.ticket.code, operation: confirmation.operation }); }} className="text-slate-900 dark:text-slate-100">

                    <div className="flex items-center gap-3 border-b border-slate-200 p-5 dark:border-slate-800">

                        <div className="rounded-full p-3 bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300"><Ban className="h-6 w-6" /></div>

                        <Dialog.Title className="text-lg font-semibold">Anular ticket</Dialog.Title>

                    </div>

                    <div className="space-y-4 p-5">

                        <Dialog.Description className="text-sm text-slate-600 dark:text-slate-300">Introduce el PIN impreso en el ticket para anularlo. Sus jugadas dejarán de participar y se liberará el cupo consumido.</Dialog.Description>

                        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">

                            <p className="break-all font-mono text-xs">{confirmation.ticket.reference ?? confirmation.ticket.code}</p>

                            <div className="flex justify-between gap-3 text-sm"><span className="text-slate-500">{confirmation.ticket.business_date} · {confirmation.ticket.lines.length} jugadas</span><strong>{money(confirmation.ticket.net_minor, confirmation.ticket.currency)}</strong></div>

                        </div>

                        <label className="block text-sm font-medium"><span className="mb-1 flex items-center gap-2"><KeyRound size={16} />PIN del ticket</span><input ref={pinInput} autoFocus aria-label="PIN del ticket" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="off" className={input + " text-center font-mono text-lg tracking-[0.4em]"} placeholder="6 dígitos" value={pin} disabled={busy} onChange={e => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} aria-invalid={!!actionError} aria-describedby={actionError ? "cancel-ticket-error" : undefined} /></label>

                        {!cancellable(currentConfirmation) && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{currentConfirmation?.cancellation?.reason ?? 'El ticket ya no está disponible para anulación.'}</p>}
                        {actionError && <p id="cancel-ticket-error" role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{actionError}</p>}

                    </div>

                    <div className="flex justify-end gap-3 border-t border-slate-200 p-5 dark:border-slate-800">

                        <button type="button" disabled={busy} className={secondary} onClick={closeConfirmation}><X className="mr-2 inline h-4 w-4" />Cancelar</button>

                        <button type="submit" disabled={busy || pin.length !== 6 || !cancellable(currentConfirmation)} className={button + " !bg-red-600 hover:!bg-red-700"}>{busy ? <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" /> : <Check className="mr-2 inline h-4 w-4" />}{busy ? "Procesando…" : "Sí, anular ticket"}</button>

                    </div>

                </form>}

            </Modal>

            <Modal show={!!detail} onClose={() => setDetail(null)}>

                <div className="p-5 text-slate-900 dark:text-slate-100">

                    <div className="mb-4 flex items-center justify-between gap-3"><Dialog.Title className="font-semibold">Jugadas y premios</Dialog.Title><button className={secondary} onClick={() => setDetail(null)} aria-label="Cerrar detalle"><X className="h-4 w-4" /></button></div>

                    {detail && <><p className="mb-4 break-all font-mono text-xs">{detail.code}</p><div className="max-h-[60vh] overflow-auto">

                                <DataTable data={detail.lines} getRowId={(row: any) => String(row.id)} columns={[{ id: "column0", header: "Modalidad", cell: ({ row: { original: l } }: { row: { original: any } }) => <>{modes[l.modality as keyof typeof modes] ?? l.modality}</> },{ id: "column1", header: "Sorteos", cell: ({ row: { original: l } }: { row: { original: any } }) => <>{l.draw?.name ?? "Sorteo no disponible"}

                                                    {l.second_draw_id

                                                        ? ` + ${l.second_draw?.name ?? "Sorteo no disponible"}`

                                                        : ""}</> },{ id: "column2", header: "Jugada", cell: ({ row: { original: l } }: { row: { original: any } }) => <>{l.numbers}</> },{ id: "column3", header: "Apostado", cell: ({ row: { original: l } }: { row: { original: any } }) => <>{money(

                                                        l.amount_minor,

                                                        detail.currency,

                                                    )}</> },{ id: "column4", header: "Premio", cell: ({ row: { original: l } }: { row: { original: any } }) => <>{l.prize_minor === null

                                                        ? "Pendiente"

                                                        : money(

                                                              l.prize_minor,

                                                              detail.currency,

                                                          )}</> },{ id: "column5", header: "Pago", cell: ({ row: { original: l } }: { row: { original: any } }) => <>{l.paid_at

                                                        ? "Pagado"

                                                        : l.prize_minor > 0

                                                          ? "Por pagar"

                                                          : "—"}</> }]} />

                    </div></>}

                </div>

            </Modal>

            <div className="flex flex-wrap gap-2">

                {tickets.links.map((l: any, i: number) =>

                    l.url ? (

                        <Link

                            key={i}

                            href={l.url + (l.url.includes("?") ? "&" : "?") + "view=" + view}

                            className={l.active ? button : secondary}

                        >

                            {l.label

                                .replace(/&laquo;/g, "«")

                                .replace(/&raquo;/g, "»")}

                        </Link>

                    ) : null,

                )}

            </div>

        </Shell>

    );

}
