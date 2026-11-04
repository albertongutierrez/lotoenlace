import MoneyInput from "@/Components/MoneyInput";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@inertiajs/react";
import { Dialog } from "@headlessui/react";
import axios from "axios";
import { Wallet, Check, LoaderCircle, LogOut } from "lucide-react";
import Modal from "@/Components/Modal";
import { requestId } from "@/lib/requestId";
import { button, input, secondary } from "./shared";

export default function OpenCashModal({ branch, currency, canOpen, onOpened, notice }: { branch: any; currency: string; canOpen: boolean; onOpened: () => void; notice?: string }) {
    const [amount, setAmount] = useState("");
    const [note, setNote] = useState("");
    const key = useRef(requestId());
    const client = useQueryClient();
    const mutation = useMutation({
        mutationFn: async () => (await axios.post("/lottery/cash/open", { branch_id: branch.id, request_key: key.current, amount, note })).data,
        onSuccess: session => {
            client.setQueryData(["lottery", "cash-status", branch.id], { current: session, reconciliation_mode: "cash" });
            void client.invalidateQueries({ queryKey: ["cash"] });
            onOpened();
        },
        onError: () => { void client.invalidateQueries({ queryKey: ["lottery", "cash-status", branch.id] }); },
    });
    return <Modal show closeable={false} onClose={() => {}} maxWidth="lg">
        <form className="space-y-4 p-6 text-slate-900 dark:text-slate-100" onSubmit={event => { event.preventDefault(); if (!mutation.isPending && canOpen) mutation.mutate(); }}>
            <Dialog.Title className="flex items-center gap-2 text-lg font-semibold"><Wallet className="h-6 w-6 text-emerald-500" />Abre la caja para vender</Dialog.Title>
            <Dialog.Description className="text-sm text-slate-500">Banca {branch.code}. Registra el efectivo inicial para comenzar el turno. Tus jugadas en espera se conservan.</Dialog.Description>
            {notice && <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{notice}</p>}
            {canOpen ? <>
                <label className="block text-sm font-medium">Fondo inicial ({currency})<MoneyInput autoFocus required inputMode="decimal" className={`${input} mt-1 w-full`} value={amount} disabled={mutation.isPending} onValueChange={setAmount} placeholder="0.00" /></label>
                <label className="block text-sm font-medium">Observación (opcional)<textarea className={`${input} mt-1 w-full`} value={note} maxLength={1000} disabled={mutation.isPending} onChange={event => setNote(event.target.value)} /></label>
            </> : <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">No tienes permiso para abrir cajas. Un encargado debe abrir la caja de esta banca para que puedas vender.</p>}
            {mutation.isError && <p role="alert" className="text-sm text-red-500">{(mutation.error as any).response?.data?.message ?? "No se pudo abrir la caja. Intenta nuevamente."}</p>}
            <div className="flex justify-end gap-2">
                {!mutation.isPending && <Link href="/dashboard" className={secondary}><LogOut className="mr-1 inline h-4 w-4" />Salir de ventas</Link>}
                {canOpen && <button className={button} disabled={mutation.isPending}>{mutation.isPending ? <LoaderCircle className="mr-1 inline h-4 w-4 animate-spin" /> : <Check className="mr-1 inline h-4 w-4" />}{mutation.isPending ? "Abriendo…" : "Abrir caja"}</button>}
            </div>
        </form>
    </Modal>;
}
