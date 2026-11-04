import axios from "axios";
import PrinterSettingsModal from "./PrinterSettingsModal";
import { agentRequest, LocalPrinterError, localPrintTarget, printerPreference } from "@/lib/localPrinter";
import { requestId } from "@/lib/requestId";
import { ticketReceiptHtml } from "@/lib/ticketReceipt";
import { useMemo, useRef, useState } from "react";
import { Dialog } from "@headlessui/react";
import { ticketPaymentMethodName } from '@/lib/paymentMethods';
import Modal from "@/Components/Modal";
import { Check, Copy, LoaderCircle, Printer, Settings2, X } from "lucide-react";
import { Draw, money, secondary } from "./shared";

export type PrintConfirmation = { mode: 'local' | 'browser'; at: string; spoolId?: number };

export default function IssuedTicketModal({ ticket, draws, branch, currency, onClose, reprint = false, onPrinted, previousPrints = [] }: { ticket: any; draws: Draw[]; branch: any; currency: string; onClose: () => void; reprint?: boolean; onPrinted?: (confirmation: PrintConfirmation) => void; previousPrints?: {label: string; confirmation: PrintConfirmation}[] }) {
    const payout = ticket.document_type === 'payout';
    const continuation = ticket.document_type === 'continuation';
    const frame = useRef<HTMLIFrameElement>(null);
    const attempted = useRef(false);
    const printing = useRef(false);
    const sent = useRef(false);
    const pendingAttempt = useRef<string | null>(null);
    const pendingTarget = useRef("");
    const [printBusy, setPrintBusy] = useState(false);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const [progress, setProgress] = useState('Preparando impresión…');
    const [sentInfo, setSentInfo] = useState<PrintConfirmation | null>(null);
    const [confirmCopy, setConfirmCopy] = useState(false);
    const [uncertain, setUncertain] = useState(false);
    const [configure, setConfigure] = useState(false);
    const [preference, setPreference] = useState(() => printerPreference(branch.id));
    const printMode = preference.mode;
    const receipt = useMemo(() => ticketReceiptHtml(ticket, draws, branch, currency, preference), [ticket, draws, branch.code, branch.name, branch.office?.name, currency, preference]);
    const print = async (trigger: "automatic" | "manual" = "manual") => {
        if (printing.current || sent.current) return;
        printing.current = true;
        setPrintBusy(true); setStatus(""); setError(''); setUncertain(false); setProgress('Preparando impresión…');
        try {
            const local = localPrintTarget(branch.id);
            const target = JSON.stringify(local?.target ?? { transport: 'browser' });
            if (pendingTarget.current !== target) pendingAttempt.current = null;
            pendingTarget.current = target;
            pendingAttempt.current ??= requestId();
            const { data } = await axios.post(`/lottery/tickets/${encodeURIComponent(ticket.code)}/print`, { branch_id: branch.id, attempt_key: pendingAttempt.current, trigger, ...(local?.target ?? {}), ...((payout || continuation) ? {document_type: ticket.document_type, payment_id: ticket.payment_id} : {}) });
            if (local) {
                setProgress(`Enviando a ${local.preference.printer}…`);
                const attemptKey = pendingAttempt.current;
                let result;
                try {
                    result = await agentRequest('/jobs', local.connection.token, { authorization: data.authorization });
                } catch (e) {
                    const unknown = e instanceof LocalPrinterError && e.state === 'unknown';
                    setUncertain(unknown);
                    await axios.post(`/lottery/tickets/${encodeURIComponent(ticket.code)}/print-status`, { branch_id: branch.id, attempt_key: attemptKey, status: unknown ? 'unknown' : 'failed' }).catch(() => {});
                    throw e;
                }
                if (result.status !== 'submitted') throw new LocalPrinterError('No se pudo confirmar el envío a la impresora.', 'unknown');
                sent.current = true;
                const confirmation: PrintConfirmation = { mode: 'local', at: new Date().toLocaleTimeString('es-DO', { timeZone: 'America/Santo_Domingo' }), spoolId: result.spool_job_id };
                setSentInfo(confirmation);
                setStatus(`Enviado a ${local.preference.printer}.`);
                pendingAttempt.current = null;
                let auditSaved = true;
                await axios.post(`/lottery/tickets/${encodeURIComponent(ticket.code)}/print-status`, { branch_id: branch.id, attempt_key: attemptKey, status: 'submitted', spool_job_id: result.spool_job_id }, { timeout: 10000 }).catch(() => { auditSaved = false; });
                setStatus(`Enviado a ${local.preference.printer}.${auditSaved ? '' : ' El envío quedó registrado en el agente; no se pudo actualizar su estado en el sistema.'}`);
                setError('');
                onPrinted?.(confirmation);
                return;
            }
            pendingAttempt.current = null;
            if (!payout && !/^[0-9]{6}$/.test(data.ticket_pin ?? "")) throw new Error("No se recibió el PIN de impresión.");
            const doc = frame.current?.contentDocument;
            if (doc) {
                if (data.continuation_ticket) {
                    doc.open(); doc.write(ticketReceiptHtml(data.continuation_ticket, draws, branch, currency, printerPreference(branch.id))); doc.close();
                }
                const pinLabel = doc.getElementById("ticket-pin");
                if (!payout && !pinLabel) throw new Error("No se encontró el PIN en el comprobante.");
                if (!payout && pinLabel) pinLabel.textContent = `PIN de cobro: ${data.ticket_pin}`;
                const testLabel = doc.getElementById('ticket-test');
                if (testLabel) testLabel.textContent = data.test_reprint ? `PRUEBA - SIN VALIDEZ${data.ticket_status === 'cancelled' ? ' · TICKET ANULADO' : ''}` : '';
                const stamp = doc.getElementById("print-audit");
                if (!stamp) throw new Error("No se encontró el control de impresión.");
                stamp.textContent = `${data.kind === "original" ? "ORIGINAL" : "REIMPRESIÓN"} · Copia ${data.sequence} · Control ${data.audit_number ?? data.audit_id}`;
            }
            if (!frame.current?.contentWindow) throw new Error();
            const printWindow = frame.current.contentWindow;
            setProgress('Abriendo el diálogo de impresión…');
            printWindow.focus();
            printWindow.print();
            sent.current = true;
            const confirmation: PrintConfirmation = { mode: 'browser', at: new Date().toLocaleTimeString('es-DO', { timeZone: 'America/Santo_Domingo' }) };
            setSentInfo(confirmation);
            setStatus('Se abrió el diálogo del navegador. El navegador no informa si imprimiste o cancelaste.');
            setError("");
            onPrinted?.(confirmation);
        } catch (e: any) {
            setError(e.response?.data?.reason ?? e.response?.data?.message ?? e.message ?? "No se pudo abrir la impresión. Usa Imprimir para reintentar.");
        } finally {
            printing.current = false;
            setPrintBusy(false);
        }
    };
    const dismiss = () => { if (!printing.current) onClose(); };
    return <><Modal show onClose={dismiss} closeable={!printBusy}>
        <div className="space-y-4 p-6 text-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-3"><Check className="h-6 w-6 text-emerald-500" /><Dialog.Title className="text-lg font-semibold">{continuation ? 'Ticket de sorteos pendientes' : payout ? 'Premio pagado' : reprint ? "Reimprimir ticket" : "Ticket emitido"}</Dialog.Title></div>
            {continuation && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Pago registrado: {money(ticket.paid_minor, ticket.currency ?? currency)}. Se imprime el ticket con las jugadas pendientes y un PIN nuevo. El PIN anterior quedó invalidado. No es una nueva venta.</p>}
            {payout && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">El pago quedó registrado. Se imprime el comprobante {ticket.payment_reference}. Si la impresión falla, reintenta aquí; no es necesario volver a pagar.</p>}
            {continuation && <p className="text-sm text-slate-500">Valor de las jugadas pendientes</p>}
            <p className="text-2xl font-bold">{money(ticket.net_minor, ticket.currency ?? currency)}</p>
            {!payout && !continuation && <p className="text-sm text-slate-500">Cobrado por {ticketPaymentMethodName(ticket)}{ticket.payment_reference ? ` · ${ticket.payment_reference}` : ''}</p>}
            {(ticket.payment_method ?? 'cash') === 'cash' && ticket.received_minor != null && <div className="grid grid-cols-2 gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"><p>Recibido<br /><strong>{money(ticket.received_minor, ticket.currency ?? currency)}</strong></p><p>Devolución<br /><strong>{money(ticket.change_minor, ticket.currency ?? currency)}</strong></p></div>}
            <p className="break-all rounded-lg bg-slate-100 p-3 font-mono text-sm dark:bg-slate-800">{ticket.reference ?? ticket.code}</p>
            <p className="text-sm text-slate-500">{printMode === 'local' ? 'Impresión directa con el agente de esta PC. El envío a la cola no confirma la salida física del papel.' : 'Se abre automáticamente el diálogo de impresión. Cerrar o cancelar la impresión no anula la venta.'}</p>
            <div role="status" aria-live="polite" aria-atomic="true">
                {previousPrints.map(({label, confirmation}) => <p key={label} className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"><Check className="mr-2 inline h-4 w-4" />{label}: {confirmation.mode === 'local' ? 'enviado a imprimir' : 'impresión solicitada al navegador'} · {confirmation.at}{confirmation.spoolId ? ` · Trabajo #${confirmation.spoolId}` : ''}</p>)}
                {printBusy && !sentInfo && <div className="flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200"><LoaderCircle className="h-6 w-6 shrink-0 animate-spin" /><div><p className="font-semibold">{progress}</p><p className="mt-1 text-xs">Espera la confirmación del envío. El botón está bloqueado para evitar otra copia.</p></div></div>}
                {sentInfo && <div className="flex items-start gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"><Check className="h-6 w-6 shrink-0" /><div><p className="font-semibold">{sentInfo.mode === 'local' ? (payout ? 'Comprobante enviado a imprimir' : 'Ticket enviado a imprimir') : 'Impresión solicitada al navegador'}</p><p className="mt-1 text-sm">{status}</p><p className="mt-1 text-xs">{sentInfo.at}{sentInfo.spoolId ? ` · Trabajo #${sentInfo.spoolId}` : ''}</p>{sentInfo.mode === 'local' && <p className="mt-2 text-xs">Ya se envió esta copia. Espera la salida del papel.</p>}</div></div>}
            </div>
            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
            {confirmCopy && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"><p className="font-semibold">{uncertain ? '¿Autorizar una copia nueva?' : (payout ? '¿Imprimir otra copia del comprobante?' : '¿Imprimir otra copia del ticket?')}</p><p className="mt-1">{uncertain ? 'No se confirmó el envío anterior. Revisa la cola y el papel antes de crear otra copia.' : 'La impresión anterior ya fue solicitada. Esta acción genera una copia adicional y queda registrada.'}</p><div className="mt-3 flex justify-end gap-2"><button autoFocus className={secondary} onClick={() => setConfirmCopy(false)}><X size={15} className="mr-1 inline" />Cancelar</button><button disabled={printBusy} className={secondary} onClick={() => { if (printing.current) return; sent.current = false; setSentInfo(null); setConfirmCopy(false); pendingAttempt.current = null; void print(); }}><Copy size={15} className="mr-1 inline" />Sí, imprimir otra copia</button></div></div>}
            <div className="flex flex-wrap justify-end gap-2"><button className={secondary} disabled={printBusy} title="Elegir impresora y configurar papel, corte y espacio final" onClick={() => setConfigure(true)}><Settings2 className="mr-2 inline h-4 w-4" />Configurar impresora</button>{(uncertain || sentInfo) && !confirmCopy && <button className={secondary + (uncertain ? ' text-amber-600' : '')} disabled={printBusy} onClick={() => setConfirmCopy(true)}><Copy className="mr-2 inline h-4 w-4" />{uncertain ? 'Autorizar otra copia' : 'Imprimir otra copia'}</button>}<button className={secondary} disabled={printBusy || !!sentInfo} onClick={() => void print()}>{printBusy && !sentInfo ? <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" /> : sentInfo ? <Check className="mr-2 inline h-4 w-4" /> : <Printer className="mr-2 inline h-4 w-4" />}{sentInfo ? (sentInfo.mode === 'local' ? 'Enviado a imprimir' : 'Impresión solicitada') : printBusy ? 'Enviando…' : 'Imprimir'}</button><button autoFocus className={secondary} disabled={printBusy} onClick={dismiss}><X className="mr-2 inline h-4 w-4" />Cerrar</button></div>
            <iframe ref={frame} title="Ticket para impresión" srcDoc={receipt} className="fixed -left-[10000px] top-0 h-px w-px border-0" aria-hidden tabIndex={-1} onLoad={() => { if (!attempted.current) { attempted.current = true; void print("automatic"); } }} />
        </div>
    </Modal>{configure && <PrinterSettingsModal branchId={branch.id} onClose={() => { setConfigure(false); setPreference(printerPreference(branch.id)); }} />}</>;
}
