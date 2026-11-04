import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Dialog } from "@headlessui/react";
import { Printer, X } from "lucide-react";
import Modal from "@/Components/Modal";
import { DataTable } from "@/Components/ui/data-table";
import { secondary } from "./shared";

export default function PrintHistoryModal({ ticket, onClose }: { ticket: any; onClose: () => void }) {
    const query = useQuery({
        queryKey: ["lottery", "print-history", ticket.code],
        queryFn: async () => (await axios.get(`/lottery/tickets/${encodeURIComponent(ticket.code)}/print-history`, { params: { branch_id: ticket.branch_office_id } })).data,
    });
    return <Modal show onClose={onClose} maxWidth="2xl"><div className="space-y-4 p-5 text-slate-900 dark:text-slate-100">
        <Dialog.Title className="flex items-center gap-2 text-lg font-semibold"><Printer className="h-5 w-5" />Auditoría de impresión</Dialog.Title>
        <p className="break-all font-mono text-xs">{ticket.reference ?? ticket.code}</p>
        <p className="text-sm text-slate-500">Registra las solicitudes, la impresora elegida y el envío a la cola del agente. No confirma la salida física del papel. Cancelar el diálogo del navegador también deja registrado el intento.</p>
        {query.isError && <p role="alert" className="text-red-500">No se pudo cargar el historial. <button onClick={() => query.refetch()}>Reintentar</button></p>}
        <div className="max-h-[55vh] overflow-auto"><DataTable loading={query.isLoading} data={query.data ?? []} getRowId={(r: any) => String(r.id)} emptyMessage="Sin solicitudes registradas." columns={[
            { accessorKey: "office_number", header: "Control" },
            { id: "date", header: "Fecha / hora RD", cell: ({ row }: any) => new Date(row.original.created_at).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" }) },
            { accessorKey: "user", header: "Usuario" },
            { accessorKey: "branch_code", header: "Banca" },
            { id: 'document', header: 'Documento', cell: ({ row }: any) => row.original.document_type === 'payout' ? 'Comprobante de pago' : row.original.document_type === 'continuation' ? 'Ticket de continuación' : 'Ticket de venta' },
            { id: "status", header: "Solicitud", cell: ({ row }: any) => <span className={row.original.status === "denied" ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}>{row.original.status === "denied" ? `Rechazada: ${row.original.reason}` : `${row.original.kind === "original" ? "Original" : "Reimpresión"} · Copia ${row.original.sequence}`}</span> },
            { id: "destination", header: "Destino", cell: ({ row }: any) => <span className="text-xs">{row.original.transport === 'local' ? row.original.printer : 'Navegador'}</span> },
            { id: "delivery", header: "Envío", cell: ({ row }: any) => row.original.transport !== 'local' ? 'Sin confirmación' : <span className={row.original.delivery?.status === 'submitted' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{({ submitted: 'En cola de Windows', failed: 'No enviado', unknown: 'Por verificar' } as Record<string, string>)[row.original.delivery?.status] ?? 'Solicitado'}{row.original.delivery?.spool_job_id ? ` · ${row.original.delivery.spool_job_id}` : ''}</span> },
            { accessorKey: "ip", header: "IP" },
            { id: "device", header: "Navegador", cell: ({ row }: any) => <span className="block max-w-48 break-words text-xs">{row.original.user_agent}</span> },
        ]} /></div>
        <div className="flex justify-end"><button autoFocus className={secondary} onClick={onClose}><X className="mr-2 inline h-4 w-4" />Cerrar</button></div>
    </div></Modal>;
}
