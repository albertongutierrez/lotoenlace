import { ticketOutcome } from "@/lib/ticketOutcome";
import { Dialog } from "@headlessui/react";
import LoadingSkeleton from "@/Components/LoadingSkeleton";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Tickets, Search, X, Ban, Banknote, Check, LoaderCircle, KeyRound } from "lucide-react";
import Modal from "@/Components/Modal";
import { canCancelTicket, useCancellationClock } from '@/lib/ticketCancellation';
import PaymentPrintModal from './PaymentPrintModal';
import { DataTable } from "@/Components/ui/data-table";
import { button, secondary, input, money, modes, drawName, Draw } from "./shared";

type Operation = "cancel" | "pay";
export default function TicketActionsModal({ onClose, user, branchId, draws, showQr = false }: { onClose: () => void; user: any; branchId: number; draws: Draw[]; showQr?: boolean }) {
    const [code, setCode] = useState("");
    const [lookup, setLookup] = useState("");
    const [pin, setPin] = useState("");
    const pinInput = useRef<HTMLInputElement>(null);
    const [confirmation, setConfirmation] = useState<Operation | null>(null);
    const [message, setMessage] = useState("");
    const [paymentReceipt, setPaymentReceipt] = useState<any>(null);
    const [continuationReceipt, setContinuationReceipt] = useState<any>(null);
    const [error, setError] = useState("");
    const client = useQueryClient();
    const now = useCancellationClock();
    const can = (permission: string) => user.is_super_admin || user.permissions?.includes(permission);
    const ticketQuery = useQuery({
        queryKey: ["lottery", "ticket-actions", user.id, branchId, lookup], enabled: !!lookup, retry: false, refetchInterval: 5000,
        queryFn: async ({ signal }) => (await axios.get(`/lottery/tickets/${encodeURIComponent(lookup)}`, { signal, params: { branch_id: branchId }, headers: { Accept: "application/json" } })).data,
    });
    const mutation = useMutation({
        mutationFn: async (operation: Operation) => (await axios.post(operation === "pay" ? `/lottery/sales/tickets/${encodeURIComponent(ticketQuery.data.code)}/pay` : `/lottery/tickets/${encodeURIComponent(ticketQuery.data.code)}/cancel`, { branch_id: branchId, pin }, { headers: { Accept: "application/json" } })).data,
        onSuccess: async (data, operation) => {
            setPin(""); setConfirmation(null); setError(""); setMessage(data.message);
            if (operation === 'pay' && data.payment_receipt) { setContinuationReceipt(data.continuation_ticket ?? null); setPaymentReceipt(data.payment_receipt); setMessage(''); }
            await client.invalidateQueries({ queryKey: ["lottery"] });
        },
        onError: (e: any) => {
            setPin("");
            setError(e.response?.data?.errors?.pin?.[0] ?? e.response?.data?.message ?? "No se pudo completar la operación. Consulta el ticket antes de reintentar.");
            void ticketQuery.refetch();
            requestAnimationFrame(() => pinInput.current?.focus());
        },
    });
    const ticket = ticketQuery.data;
    const cancellable = canCancelTicket(ticket, now, ticketQuery.dataUpdatedAt);
    const pending = ticket?.lines.reduce((sum: number, l: any) => sum + (!l.paid_at ? Math.max(0, l.prize_minor ?? 0) : 0), 0) ?? 0;
    const busy = mutation.isPending;
    const cancelConfirmation = () => { if (!busy) { setPin(""); setError(""); setConfirmation(null); } };
    const dismiss = () => { if (busy) return; if (confirmation) cancelConfirmation(); else onClose(); };
    const choose = (operation: Operation) => { setPin(""); setError(""); setMessage(""); setConfirmation(operation); };
    const name = (id: number) => { const d = draws.find(d => d.id === id); return d ? drawName(d) : `Sorteo #${id}`; };
    if (paymentReceipt) return <PaymentPrintModal key={paymentReceipt.payment_id} payout={paymentReceipt} continuation={continuationReceipt} branchId={branchId} draws={draws} onClose={() => { setPaymentReceipt(null); setContinuationReceipt(null); }} />;
    if (confirmation && ticket) return <Modal show onClose={cancelConfirmation} closeable={!busy} maxWidth="lg">
        <form onSubmit={e => { e.preventDefault(); if (!busy && pin.length === 6 && (confirmation !== 'cancel' || cancellable)) mutation.mutate(confirmation); }} className="text-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-3 border-b border-slate-200 p-5 dark:border-slate-800">
                <div className={"rounded-full p-3 " + (confirmation === "cancel" ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300")}>{confirmation === "cancel" ? <Ban className="h-6 w-6" /> : <Banknote className="h-6 w-6" />}</div>
                <Dialog.Title className="text-lg font-semibold">{confirmation === "cancel" ? "Anular ticket" : "Confirmar pago"}</Dialog.Title>
            </div>
            <div className="space-y-4 p-5">
                <Dialog.Description className="text-sm text-slate-600 dark:text-slate-300">{confirmation === "cancel" ? "Introduce el PIN impreso en el ticket para anularlo. Se retirarán sus jugadas y se liberará el cupo consumido." : "Introduce el PIN impreso en el ticket para pagar sus premios pendientes."}</Dialog.Description>
                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950"><p className="break-all font-mono text-xs">{ticket.reference ?? ticket.code}</p><p className="mt-2 text-sm text-slate-500">{ticket.business_date} · {ticket.lines.length} jugadas</p><p className="mt-2 text-xl font-bold">{money(confirmation === "cancel" ? ticket.net_minor : pending, ticket.currency)}</p></div>
                <label className="block text-sm font-medium"><span className="mb-1 flex items-center gap-2"><KeyRound className="h-4 w-4" />PIN del ticket</span><input ref={pinInput} autoFocus aria-label="PIN del ticket" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="off" className={input + " text-center font-mono text-lg tracking-[0.4em]"} placeholder="6 dígitos" value={pin} disabled={busy} onChange={e => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} aria-invalid={!!error} aria-describedby={error ? "ticket-action-error" : undefined} /></label>
                {confirmation === 'cancel' && !cancellable && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{ticket.cancellation?.reason ?? 'El ticket ya no está disponible para anulación.'}</p>}
                {error && <p id="ticket-action-error" role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 p-5 dark:border-slate-800">
                <button type="button" className={secondary} disabled={busy} onClick={cancelConfirmation}><X className="mr-2 inline h-4 w-4" />Cancelar</button>
                <button className={button + (confirmation === "cancel" ? " !bg-red-600 hover:!bg-red-700" : "")} type="submit" disabled={busy || pin.length !== 6 || (confirmation === 'cancel' && !cancellable)}>{busy ? <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" /> : <Check className="mr-2 inline h-4 w-4" />}{busy ? "Procesando…" : confirmation === "cancel" ? "Sí, anular ticket" : "Sí, registrar pago"}</button>
            </div>
        </form>
    </Modal>;
    if (message || error) return <Modal show onClose={() => { setMessage(""); setError(""); }} maxWidth="lg">
        <div className="space-y-4 p-6 text-slate-900 dark:text-slate-100">
            <Dialog.Title className={"flex items-center gap-2 text-lg font-semibold " + (error ? "text-red-500" : "text-emerald-500")}>{error ? <Ban /> : <Check />}{error ? "No se pudo completar" : "Operación completada"}</Dialog.Title>
            <Dialog.Description>{error || message}</Dialog.Description>
            <div className="flex justify-end"><button autoFocus className={button} onClick={() => { setMessage(""); setError(""); }}><Check className="mr-2 inline h-4 w-4" />Aceptar</button></div>
        </div>
    </Modal>;
    return <Modal show onClose={dismiss} closeable={!busy} maxWidth="2xl">
        <div className="text-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-3 border-b border-slate-200 p-4 dark:border-slate-700"><Tickets className="h-6 w-6 text-emerald-600 dark:text-emerald-400" /><h2 className="flex-1 text-lg font-semibold">Anular / Pagar ticket</h2><button disabled={busy} className={secondary} onClick={dismiss} aria-label="Cerrar"><X className="h-4 w-4" /></button></div>
            <div className="max-h-[70vh] space-y-4 overflow-auto p-4 [scrollbar-width:thin] dark:[scrollbar-color:#475569_#0f172a]">
                <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (busy || confirmation || !code.trim()) return; setError(""); setMessage(""); if (lookup === code.trim()) void ticketQuery.refetch(); else setLookup(code.trim()); }}>
                    <input autoFocus data-autofocus className={input} disabled={busy || !!confirmation} aria-label={showQr ? "Número o código QR del ticket" : "Número del ticket"} placeholder={showQr ? "T-000012 o código QR" : "Número de ticket: T-000012 o 12"} pattern={showQr ? undefined : '(?:[Tt]-)?[0-9]{1,18}'} title={showQr ? undefined : 'Escribe el número del ticket, con o sin T-.'} autoComplete="off" value={code} onChange={e => setCode(e.target.value)} />
                    <button className={button} disabled={busy || !!confirmation || !code.trim() || ticketQuery.isFetching}><Search className="mr-1 inline h-4 w-4" />Consultar</button>
                </form>
                {ticketQuery.isLoading && <LoadingSkeleton compact />}
                {ticketQuery.isError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">No se pudo consultar el ticket. Verifica el número{showQr ? ' o código QR' : ''} y que pertenezca a esta banca.</p>}
                {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
                {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"><Check className="mr-2 inline h-4 w-4" />{message}</p>}
                {ticket && !ticketQuery.isError && <>
                    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="break-all font-mono text-sm">{ticket.reference ?? ticket.code}</p><p className="mt-1 text-sm">{ticket.business_date} · {ticketOutcome(ticket)}</p><div className="mt-2 flex flex-wrap justify-between gap-2 text-sm"><span>Total: <b>{money(ticket.net_minor, ticket.currency)}</b></span><span>Premios pendientes: <b>{money(pending, ticket.currency)}</b></span></div></div>
                    <DataTable paginate={false} data={ticket.lines} columns={[
                        { id: "draw", header: "Sorteo", cell: ({ row }: any) => <span className="text-xs">{name(row.original.draw_id)}{row.original.second_draw_id ? ` + ${name(row.original.second_draw_id)}` : ""}</span> },
                        { id: "play", header: "Jugada", cell: ({ row }: any) => <div>{row.original.numbers}<p className="text-xs text-slate-500">{modes[row.original.modality as keyof typeof modes]}</p></div> },
                        { id: "prize", header: "Premio", cell: ({ row }: any) => row.original.prize_minor === null ? "Pendiente" : money(row.original.prize_minor, ticket.currency) },
                        { id: "paid", header: "Pago", cell: ({ row }: any) => row.original.paid_at ? "Pagado" : row.original.prize_minor > 0 ? "Por pagar" : "—" },
                    ]} />
                    <div className="flex flex-wrap gap-2">
                        {can("lottery.cancel") && cancellable && <button className={`${secondary} text-red-600 dark:text-red-400`} disabled={busy || ticketQuery.isFetching} onClick={() => choose("cancel")}><Ban className="mr-2 inline h-4 w-4" />Anular ticket</button>}
                        {can("lottery.pay") && ticket.status === "sold" && pending > 0 && <button className={button} disabled={busy || ticketQuery.isFetching} onClick={() => choose("pay")}><Banknote className="mr-2 inline h-4 w-4" />Pagar premios pendientes</button>}
                    </div>
                </>}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 p-4 dark:border-slate-700"><p className="text-xs text-slate-500">Tab cambia de opción · Enter activa · Escape vuelve o cierra</p><button className={secondary} disabled={busy} onClick={dismiss}><X className="mr-2 inline h-4 w-4" />Cerrar</button></div>
        </div>
    </Modal>;
}
