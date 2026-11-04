import ComboboxSelect from "@/Components/ComboboxSelect";
import MoneyInput from "@/Components/MoneyInput";
import { paymentMethodName } from "@/lib/paymentMethods";
import PublishedResultsModal from "./PublishedResultsModal";
import OpenCashModal from "./OpenCashModal";
import RandomPlaysModal from "./RandomPlaysModal";
import DragScrollArea from "@/Components/DragScrollArea";
import LoadingSkeleton from "@/Components/LoadingSkeleton";
import ReprintTicketModal from "./ReprintTicketModal";
import PrinterSettingsModal from "./PrinterSettingsModal";
import IssuedTicketModal from "./IssuedTicketModal";
import { newPlays, playIdentity } from "@/lib/playIdentity";
import TicketActionsModal from "./TicketActionsModal";
import WinnersModal from "./WinnersModal";
import Modal from "@/Components/Modal";
import { Printer, X, RefreshCw, Check, Pencil, Copy, Tickets, QrCode, Trophy, Shuffle, Wallet, Plus, ShoppingCart, Trash2, LoaderCircle, AlertCircle, ListChecks, Eraser, Pause, Dice5 } from "lucide-react";
import { parsePlay, parsePlayVariants } from "@/lib/parsePlay";
import { DataTable } from "@/Components/ui/data-table";
import { requestId } from "@/lib/requestId";
import { useCashStatus } from "@/lib/useCashStatus";
import { useEffect, useRef, useState } from "react";
import { Link, usePage } from "@inertiajs/react";
import { PageProps } from "@/types";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Shell,
    Field,
    Draw,
    input,
    button,
    secondary,

    modes,
    drawName,
    money,
} from "./shared";

const panel = "rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";

type Line = {
    draw_id: number;
    second_draw_id?: number;
    modality: string;
    numbers: string;
    amount: string;
};
type Draft = { id: string; title: string; selected: number[]; lines: Line[]; mode: string; numbers: string; amount: string; discount: boolean; requestKey: string };
const emptyDraft = (title: string): Draft => ({ id: requestId(), title, selected: [], lines: [], mode: "quiniela", numbers: "", amount: "", discount: false, requestKey: requestId() });
export default function Sales(props: any) {
    const { auth } = usePage<PageProps>().props;
    return <SalesWorkspace key={`${auth.user.id}:${props.branch.id}`} {...props} />;
}
function SalesWorkspace({
    branch,
    currency,
    settings,
    draws,
    server_now,
}: any) {
    const { auth } = usePage<PageProps>().props;
    const { query: cashStatus, connection: cashConnection, notice: cashNotice } = useCashStatus(branch.id, branch.office_id, auth.user.id, settings.reconciliation_mode ?? "cash");
    const cashRequired = (cashStatus.data?.reconciliation_mode ?? settings.reconciliation_mode ?? "cash") === "cash";
    const cashOpen = cashStatus.isSuccess && (!cashRequired || !!cashStatus.data?.current);
    const storageKey = `lotoenlace:drafts:${auth.user.id}:${branch.id}`;
    const [initialDrafts] = useState(() => {
        try {
            const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
            if (saved?.version === 1 && Array.isArray(saved.drafts) && saved.drafts.length && saved.drafts.every((d: Draft) => typeof d.id === "string" && Array.isArray(d.lines) && Array.isArray(d.selected))) return saved as { version: number; drafts: Draft[]; activeId: string };
        } catch { /* Start an empty workspace when storage is unavailable. */ }
        const first = emptyDraft("Ticket 1");
        return { version: 1, drafts: [first], activeId: first.id };
    });
    const initial = initialDrafts.drafts.find(d => d.id === initialDrafts.activeId) ?? initialDrafts.drafts[0];
    const [drafts, setDrafts] = useState<Draft[]>(initialDrafts.drafts);
    const [activeDraftId, setActiveDraftId] = useState(initial.id);
    const [discardDraft, setDiscardDraft] = useState(false);
    const footerRef = useRef<HTMLElement>(null);
    const [footerHeight, setFooterHeight] = useState(160);
    useEffect(() => {
        const footer = footerRef.current;
        if (!footer) return;
        const observer = new ResizeObserver(() => setFooterHeight(footer.getBoundingClientRect().height));
        observer.observe(footer);
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        const onShortcut = (event: KeyboardEvent) => {
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;
            const shortcut = event.altKey
                ? event.key.toLowerCase() === "a" ? "Alt+A" : event.key.toLowerCase() === "r" ? "Alt+R" : null
                : ["F1", "F2", "F3", "F4", "F11", "F6", "F7", "F8", "F9", "F10"].includes(event.key) ? event.key : null;
            if (!shortcut) return;
            const control = document.querySelector<HTMLButtonElement | HTMLInputElement>(`[data-sale-shortcut="${shortcut}"]`);
            if (!control) return;
            event.preventDefault();
            if (event.repeat || document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') || control.disabled) return;
            control.click();
        };
        window.addEventListener("keydown", onShortcut);
        return () => window.removeEventListener("keydown", onShortcut);
    }, []);
    const [printerSettingsOpen, setPrinterSettingsOpen] = useState(false);
    const [reprintOpen, setReprintOpen] = useState(false);
    const [ticketActionsOpen, setTicketActionsOpen] = useState(false);
    const [winnersOpen, setWinnersOpen] = useState(false);
    const [selectedOnly, setSelectedOnly] = useState(false);
    const [lotteryFilter, setLotteryFilter] = useState<number | null>(null);
    const [selected, setSelected] = useState<number[]>(initial.selected);
    const [lines, setLines] = useState<Line[]>(initial.lines);
    const [mode, setMode] = useState(initial.mode);
    const [numbers, setNumbers] = useState(initial.numbers);
    const numbersRef = useRef<HTMLInputElement>(null);
    const amountRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const overlaySelector = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';
        let frame = 0;
        let keyboardNavigation = false;
        let overlayOpen = Boolean(document.querySelector(overlaySelector));
        const restore = () => {
            cancelAnimationFrame(frame);
            // Wait for click handlers and Headless UI's focus restoration to finish.
            frame = requestAnimationFrame(() => {
                frame = requestAnimationFrame(() => {
                    const jugada = numbersRef.current;
                    if (!jugada?.isConnected || jugada.matches(':disabled') || document.querySelector(overlaySelector)) return;
                    const active = document.activeElement;
                    if (active === jugada || active === amountRef.current) return;
                    // Keep filters and other editable controls usable, as well as Tab navigation.
                    if (active instanceof HTMLElement && (active.matches('input:not([readonly]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]') || keyboardNavigation && active !== document.body)) return;
                    jugada.focus({ preventScroll: true });
                });
            });
        };
        const pointer = () => { keyboardNavigation = false; };
        const key = (event: KeyboardEvent) => { if (event.key === 'Tab') keyboardNavigation = true; };
        const observer = new MutationObserver(() => {
            const current = Boolean(document.querySelector(overlaySelector));
            if (overlayOpen && !current) {
                keyboardNavigation = false;
                restore();
            }
            overlayOpen = current;
            if (document.activeElement === document.body) restore();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        document.addEventListener('pointerdown', pointer, true);
        document.addEventListener('keydown', key, true);
        document.addEventListener('click', restore);
        document.addEventListener('focusout', restore);
        window.addEventListener('focus', restore);
        restore();
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            document.removeEventListener('pointerdown', pointer, true);
            document.removeEventListener('keydown', key, true);
            document.removeEventListener('click', restore);
            document.removeEventListener('focusout', restore);
            window.removeEventListener('focus', restore);
        };
    }, []);
    const [settledNumbers, setSettledNumbers] = useState("");
    useEffect(() => {
        const timer = setTimeout(() => setSettledNumbers(numbers), 250);
        return () => clearTimeout(timer);
    }, [numbers]);
    const [amount, setAmount] = useState(initial.amount);
    const [discount, setDiscount] = useState(initial.discount);
    const [now, setNow] = useState(Date.now());
    const offset = useRef(new Date(server_now).getTime() - Date.now());
    const [message, setMessage] = useState("");
    const alertReturnFocus = useRef<HTMLElement | null>(null);
    useEffect(() => {
        if (message && document.activeElement instanceof HTMLElement && !document.activeElement.closest('[role="dialog"]')) {
            alertReturnFocus.current = document.activeElement;
        }
    }, [message]);
    const restoreAlertFocus = () => requestAnimationFrame(() => requestAnimationFrame(() => {
        const target = alertReturnFocus.current;
        if (target?.isConnected && (target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
            target.focus();
            if (target instanceof HTMLInputElement) target.select();
        } else numbersRef.current?.focus();
    }));
    const queryClient = useQueryClient();
    const saleMutation = useMutation({
        mutationFn: async (payload: { branch_id: number; lines: Line[]; discount: boolean; request_key: string; received: string; payment_method: string; payment_reference: string | null }) =>
            (await axios.post("/lottery/sales", payload)).data,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lottery"] }),
    });
    const [checkingPlay, setCheckingPlay] = useState(false);
    const [editingLine, setEditingLine] = useState<{ line: Line; amount: string } | null>(null);
    const [editAmountError, setEditAmountError] = useState("");
    const checkingRef = useRef(false);
    const busy = saleMutation.isPending || checkingPlay;
    const [ticket, setTicket] = useState<any>(null);
    const requestKey = useRef(initial.requestKey);
    const snapshot = (): Draft => ({ id: activeDraftId, title: drafts.find(d => d.id === activeDraftId)?.title ?? "Ticket", selected, lines, mode, numbers, amount, discount, requestKey: requestKey.current });
    useEffect(() => {
        try { sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, activeId: activeDraftId, drafts: drafts.map(d => d.id === activeDraftId ? snapshot() : d) })); } catch { /* Browsers may disable session storage. */ }
    }, [drafts, activeDraftId, selected, lines, mode, numbers, amount, discount]);
    const getWindow = (d: Draw) => {
        const current = new Date(now + offset.current);
        const date = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Santo_Domingo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(current);
        const day = new Date(`${date}T12:00:00-04:00`).getUTCDay();
        const ex = d.exceptions?.[date];
        return {
            eligible:
                d.active &&
                d.lottery?.active !== false &&
                settings.draw_ids.includes(d.id) &&
                d.weekdays.includes(day) &&
                !ex?.closed,
            open: new Date(
                `${date}T${ex?.opens_at ?? d.opens_at}-04:00`,
            ).getTime(),
            close: new Date(
                `${date}T${ex?.closes_at ?? d.closes_at}-04:00`,
            ).getTime(),
        };
    };
    const isOpen = (id: number) => {
        const d = draws.find((v: Draw) => v.id === id);
        if (!d) return false;
        const w = getWindow(d);
        return (
            w.eligible &&
            now + offset.current >= w.open &&
            now + offset.current < w.close
        );
    };
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);
    useEffect(() => {
        const closed = selected.filter((id) => !isOpen(id));
        const expired = lines.some(
            (l) =>
                !isOpen(l.draw_id) ||
                (l.second_draw_id && !isOpen(l.second_draw_id)),
        );
        if (closed.length || expired) {
            setSelected((s) => s.filter(isOpen));
            setLines((ls) =>
                ls.filter(
                    (l) =>
                        isOpen(l.draw_id) &&
                        (!l.second_draw_id || isOpen(l.second_draw_id)),
                ),
            );
            setMessage(
                "Se retiraron los sorteos cerrados y sus jugadas pendientes.",
            );
            requestKey.current = requestId();
        }
    }, [now]);
    const makeLines = (m = mode, n = numbers, stake = amount, targetIds = selected): Line[] => {
        const ids = targetIds.filter(id => m !== 'super_pale' || draws.find((d: Draw) => d.id === id)?.modalities.includes('super_pale')).sort((a, b) => a - b);
        if (!ids.length) throw Error("Selecciona al menos un sorteo.");
        if (!/^\d+(\.\d{1,2})?$/.test(stake) || Number(stake) <= 0)
            throw Error("Indica un monto válido.");
        const variants = parsePlayVariants(n, m);
        if (!variants.length || variants[0].modality !== m)
            throw Error("Indica 1–2 dígitos para quiniela, 4 para palé o 6 para tripleta; usa s para súper palé. Añade un punto final para derecho y revés.");
        const eligible = (id: number) =>
            draws.find((d: Draw) => d.id === id)?.modalities.includes(m);
        if (ids.some((id) => !eligible(id)))
            throw Error("Algún sorteo seleccionado no admite esa modalidad.");
        if (m === "super_pale") {
            if (ids.length < 2) throw Error("Selecciona dos sorteos o más.");
            const result: Line[] = [];
            for (let i = 0; i < ids.length; i++)
                for (let j = i + 1; j < ids.length; j++) {
                    if (!settings.pairs?.[`${ids[i]}-${ids[j]}`]?.enabled)
                        throw Error(
                            "Una pareja seleccionada no está habilitada para súper palé.",
                        );
                    result.push(...variants.map(({ numbers }) => ({
                        draw_id: ids[i],
                        second_draw_id: ids[j],
                        modality: m,
                        numbers,
                        amount: stake,
                    })));
                }
            return result;
        }
        return ids.flatMap((id) => variants.map(({ numbers }) => ({
            draw_id: id,
            modality: m,
            numbers,
            amount: stake,
        })));
    };
    const error = (e: any) =>
        setMessage(
            e.response?.data?.message ??
                e.message ??
                "No fue posible completar la operación.",
        );
    const [partialPlay, setPartialPlay] = useState<{ accepted: Line[]; warnings: string[] } | null>(null);
    const partialFocusTarget = useRef<"amount" | "numbers">("amount");
    const closePartialPlay = (correctAmount = true) => {
        partialFocusTarget.current = correctAmount ? "amount" : "numbers";
        setPartialPlay(null);
    };
    const restorePartialFocus = () => {
        // Run after the dialog unmounts and its focus trap restores the trigger.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const target = partialFocusTarget.current === "amount" ? amountRef.current : numbersRef.current;
            target?.focus();
            if (partialFocusTarget.current === "amount") target?.select();
        }));
    };
    const [repeatedPlay, setRepeatedPlay] = useState<Line[] | null>(null);
    const add = async (confirmed?: Line[]) => {
        if (checkingRef.current || busy) return;
        checkingRef.current = true;
        setCheckingPlay(true);
        setMessage("");
        try {
            const generated = confirmed ?? makeLines();
            if (!confirmed && generated.some(candidate => lines.some(existing => playIdentity(existing) === playIdentity(candidate)))) {
                setRepeatedPlay(generated);
                return;
            }
            if (confirmed) setRepeatedPlay(null);
            const pending = [...lines];
            const warnings: string[] = [];
            for (const line of generated) {
                try {
                    const { data } = await axios.post<{ available_minor: number | null }>("/lottery/availability", {
                        ...line, branch_id: branch.id, pending,
                    });
                    const requested = Math.round(Number(line.amount) * 100);
                    if (data.available_minor !== null && data.available_minor < requested) {
                        warnings.push(`${label(line)} · ${line.numbers}: disponible ${money(data.available_minor, currency)}; solicitado ${money(requested, currency)}.`);
                    } else {
                        // Include this candidate when checking the next draw's shared limits.
                        pending.push(line);
                    }
                } catch (e: any) {
                    warnings.push(`${label(line)} · ${line.numbers}: ${e.response?.data?.message ?? "No se pudo verificar el cupo. Intenta de nuevo."}`);
                }
            }
            const accepted = pending.slice(lines.length);
            if (accepted.length) {
                setLines(current => {
                    const updated = current.map(line => ({ ...line }));
                    for (const extra of accepted) {
                        const original = updated.find(line => playIdentity(line) === playIdentity(extra));
                        if (original) original.amount = ((Math.round(Number(original.amount) * 100) + Math.round(Number(extra.amount) * 100)) / 100).toFixed(2);
                        else updated.push(extra);
                    }
                    return updated;
                });
                setNumbers("");
                requestKey.current = requestId();
            }
            if (warnings.length) {
                setPartialPlay({ accepted, warnings });
            } else {
                requestAnimationFrame(() => numbersRef.current?.focus());
            }
        } catch (e) {
            error(e);
        } finally {
            checkingRef.current = false;
            setCheckingPlay(false);
        }
    };
    const availability = useQuery({
        queryKey: ["lottery", "availability", auth.user.id, branch.id, selected, mode, numbers, lines],
        enabled: selected.length === 1 && numbers === settledNumbers && parsePlayVariants(numbers, mode).length === 1 && mode !== "super_pale",
        retry: false,
        gcTime: 0,
        queryFn: async ({ signal }) => {
            const generated = makeLines(mode, numbers, "0.01");
            if (generated.length !== 1) throw Error("Consulta una sola selección o pareja.");
            return (await axios.post<{ available_minor: number | null; server_now: string }>("/lottery/availability", {
                ...generated[0], branch_id: branch.id, pending: lines,
            }, { signal })).data;
        },
    });
    useEffect(() => {
        if (availability.isError && selected.length === 1) {
            setMessage((availability.error as any)?.response?.data?.message ?? availability.error.message);
        }
    }, [availability.errorUpdatedAt]);
    const available = numbers !== settledNumbers || availability.isError || availability.isFetching ? undefined : availability.data?.available_minor;
    useEffect(() => {
        if (availability.data) offset.current = new Date(availability.data.server_now).getTime() - Date.now();
    }, [availability.data]);
    const [availabilityDetail, setAvailabilityDetail] = useState<{ lines: Line[]; pending: Line[]; key: string } | null>(null);
    const detailQuery = useQuery({
        queryKey: ["lottery", "availability-detail", auth.user.id, branch.id, availabilityDetail],
        enabled: availabilityDetail !== null,
        gcTime: 0,
        retry: false,
        queryFn: async ({ signal }) => {
            if (!availabilityDetail) return [];
            return Promise.all(availabilityDetail.lines.map(async (line) => {
                try {
                    const { data } = await axios.post<{ available_minor: number | null }>("/lottery/availability", {
                        ...line, branch_id: branch.id, pending: availabilityDetail.pending,
                    }, { signal });
                    return { ...line, available: data.available_minor, error: "" };
                } catch (e: any) {
                    if (signal.aborted) throw e;
                    return { ...line, available: undefined, error: e.response?.data?.message ?? "No se pudo consultar. Intenta actualizar." };
                }
            }));
        },
    });
    const check = () => {
        setMessage("");
        try {
            setAvailabilityDetail({ lines: makeLines(mode, numbers, "0.01"), pending: [...lines], key: requestId() });
        } catch (e) { error(e); }
    };
    const gross = lines.reduce(
        (s, l) => s + Math.round(Number(l.amount) * 100),
        0,
    );
    const rebate = discount
        ? Math.floor(gross / settings.discount_every_minor) *
          settings.discount_amount_minor
        : 0;
    const label = (l: Line) =>
        [l.draw_id, l.second_draw_id]
            .filter(Boolean)
            .map((id) => drawName(draws.find((d: Draw) => d.id === id)))
            .join(" + ");
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const enabledPaymentMethods: string[] = settings.payment_methods ?? ['cash'];
    const [paymentMethod, setPaymentMethod] = useState(enabledPaymentMethods[0] ?? 'cash');
    const [paymentReference, setPaymentReference] = useState('');
    const paymentReferenceRef = useRef<HTMLInputElement>(null);
    const referenceRequired = !!settings.payment_reference_required?.[paymentMethod];
    useEffect(() => { if (!cashOpen) setCheckoutOpen(false); }, [cashOpen]);
    const [received, setReceived] = useState("");
    const [checkoutError, setCheckoutError] = useState("");
    const receivedMinor = /^\d{1,9}(\.\d{1,2})?$/.test(received) ? Math.round(Number(received) * 100) : -1;
    const sell = () => {
        if (busy || !lines.length || !cashOpen) return;
        setReceived(((gross - rebate) / 100).toFixed(2));
        setPaymentMethod(enabledPaymentMethods[0] ?? 'cash');
        setPaymentReference('');
        setCheckoutError("");
        setCheckoutOpen(true);
    };
    const confirmSale = async () => {
        if (busy) return;
        if (receivedMinor < gross - rebate) { setCheckoutError("El dinero recibido no cubre el total a cobrar."); return; }
        if (referenceRequired && !paymentReference.trim()) { setCheckoutError(`Indica la referencia del cobro por ${paymentMethodName(paymentMethod, settings.payment_method_labels)}.`); paymentReferenceRef.current?.focus(); return; }
        setMessage("");
        try {
            const data = await saleMutation.mutateAsync({
                branch_id: branch.id,
                lines,
                discount,
                request_key: requestKey.current,
                received,
                payment_method: paymentMethod,
                payment_reference: paymentReference.trim() || null,
            });
            setCheckoutOpen(false);
            setTicket(data);
            setLines([]);
            setSelected([]);
            setSelectedOnly(false);
            requestKey.current = requestId();
        } catch (e) {
            void cashStatus.refetch();
            setCheckoutError((e as any)?.response?.data?.errors?.payment_reference?.[0] ?? (e as any)?.response?.data?.message ?? "No se pudo completar la venta. Revisa e intenta nuevamente.");
            if ((e as any)?.response?.data?.errors?.payment_reference) paymentReferenceRef.current?.focus();
        }
    };
    const [duplicateOpen, setDuplicateOpen] = useState(false);
    const [duplicateMethod, setDuplicateMethod] = useState<"number" | "qr">("number");
    const duplicateUsesQr = !!settings.show_qr && duplicateMethod === "qr";
    const duplicateInputRef = useRef<HTMLInputElement>(null);
    const duplicateSubmitRef = useRef<HTMLButtonElement>(null);
    const duplicateBusyRef = useRef(false);
    const [duplicateCode, setDuplicateCode] = useState("");
    const [duplicateReference, setDuplicateReference] = useState("");
    const [duplicateError, setDuplicateError] = useState("");
    const [duplicating, setDuplicating] = useState(false);
    const [duplicateSource, setDuplicateSource] = useState<Line[] | null>(null);
    const [duplicateTargets, setDuplicateTargets] = useState<Record<number, number>>( {} );
    const duplicate = async () => {
        if (duplicateBusyRef.current) return;
        let code = duplicateCode.trim();
        if (!code) { setDuplicateError(duplicateUsesQr ? "Escanea o pega el código QR del ticket." : "Escribe el número del ticket."); return; }
        if (!duplicateUsesQr) {
            const match = /^(?:T-\s*|#\s*)?(\d{1,18})$/i.exec(code);
            if (!match || !/[1-9]/.test(match[1])) { setDuplicateError("Escribe un número de ticket válido, por ejemplo T-000012 o 12."); return; }
            code = `T-${match[1]}`;
        }
        duplicateBusyRef.current = true;
        setDuplicating(true);
        setDuplicateError("");
        try {
            if (!duplicateSource) {
            const data = await queryClient.fetchQuery({
                queryKey: ["lottery", "ticket", auth.user.id, branch.id, code],
                staleTime: 0,
                queryFn: async ({ signal }) => (await axios.get(
                    `/lottery/tickets/${encodeURIComponent(code)}`,
                    { params: { branch_id: branch.id }, signal },
                )).data,
            });
            const copied = data.lines.map((l: any) => ({
                draw_id: l.draw_id,
                second_draw_id: l.second_draw_id,
                modality: l.modality,
                numbers: l.numbers,
                amount: (l.amount_minor / 100).toFixed(2),
            }));
            if (!copied.length) throw Error("El ticket no tiene jugadas para copiar.");
            setDuplicateReference(data.reference ?? code);
            setDuplicateSource(copied);
            const ids = Array.from(new Set<number>(copied.flatMap((line: Line) => [line.draw_id, ...(line.second_draw_id ? [line.second_draw_id] : [])])));
            setDuplicateTargets(Object.fromEntries(ids.map(id => [id, isOpen(id) ? id : 0])));
            return;
            }
            const copied = duplicateSource.map(line => ({
                ...line,
                draw_id: duplicateTargets[line.draw_id],
                ...(line.second_draw_id ? { second_draw_id: duplicateTargets[line.second_draw_id] } : {}),
            }));
            for (const line of copied) {
                const ids = [line.draw_id, ...(line.second_draw_id ? [line.second_draw_id] : [])];
                if (ids.some(id => !id || !isOpen(id))) throw Error("Selecciona un sorteo abierto para cada sorteo original.");
                if (ids.some(id => !draws.find((d: Draw) => d.id === id)?.modalities.includes(line.modality)))
                    throw Error("Un sorteo de destino no acepta todas las modalidades del original.");
                if (line.modality === "super_pale") {
                    if (!line.second_draw_id || line.draw_id === line.second_draw_id) throw Error("El súper palé requiere dos sorteos distintos.");
                    const pair = [...ids].sort((a, b) => a - b).join("-");
                    if (!settings.pairs?.[pair]?.enabled) throw Error("La pareja de destino no está habilitada para súper palé.");
                }
            }
            setLines(copied);
            setSelected(
                Array.from(
                    new Set<number>(
                        copied.flatMap((l: Line) => [
                            l.draw_id,
                            ...(l.second_draw_id ? [l.second_draw_id] : []),
                        ]),
                    ),
                ),
            );
            requestKey.current = requestId();
            setMessage(
                "Ticket cargado. Al vender se comprobarán las reglas actuales.",
            );
            setDuplicateOpen(false);
            setDuplicateCode("");
        } catch (e: any) {
            setDuplicateError(e.response?.status === 404 ? "No encontramos ese ticket en esta banca. Revisa el número o código QR e intenta nuevamente." : e.response?.data?.message ?? e.message ?? "No se pudo cargar el ticket.");
        } finally {
            duplicateBusyRef.current = false;
            setDuplicating(false);
        }
    };
    const duplicateActionRef = useRef(duplicate);
    duplicateActionRef.current = duplicate;
    useEffect(() => {
        if (!duplicateOpen || !duplicateUsesQr || duplicateSource || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(duplicateCode.trim())) return;
        const timer = setTimeout(() => { if (!duplicateBusyRef.current) void duplicateActionRef.current(); }, 180);
        return () => clearTimeout(timer);
    }, [duplicateCode, duplicateOpen, duplicateUsesQr, duplicateSource]);
    useEffect(() => {
        if (duplicateOpen && duplicateSource && !duplicating) duplicateSubmitRef.current?.focus();
    }, [duplicateOpen, duplicateSource, duplicating]);
    const [randomOpen, setRandomOpen] = useState(false);
    const [publishedResultsOpen, setPublishedResultsOpen] = useState(false);
    const [combineOpen, setCombineOpen] = useState(false);
    const [combineMode, setCombineMode] = useState("pale");
    const [combineAmount, setCombineAmount] = useState("");
    const [combineError, setCombineError] = useState("");
    const allCombineNumbers = Array.from(new Set(lines.flatMap(line => line.numbers.split("-")))).sort();
    const [chosenNumbers, setChosenNumbers] = useState<string[]>([]);
    const combineNumbers = chosenNumbers.filter(n => allCombineNumbers.includes(n)).sort();
    const [combinePreview, setCombinePreview] = useState<{ line: Line; available: number | null; error: string }[] | null>(null);
    const [combineAddedCount, setCombineAddedCount] = useState(0);
    const combiningRef = useRef(false);
    const [checkingCombinations, setCheckingCombinations] = useState(false);
    const combinationSize = combineMode === "quiniela" ? 1 : combineMode === "pale" ? 2 : 3;
    const combinationCount = combinationSize === 1 ? combineNumbers.length : combinationSize === 2
        ? combineNumbers.length * (combineNumbers.length - 1) / 2
        : combineNumbers.length * (combineNumbers.length - 1) * (combineNumbers.length - 2) / 6;
    const combine = async () => {
        if (combiningRef.current || checkingRef.current) return;
        combiningRef.current = true;
        setCombineError("");
        setCombinePreview(null);
        setCombineAddedCount(0);
        setCheckingCombinations(true);
        try {
            if (combineNumbers.length < combinationSize) throw Error(`Necesitas al menos ${combinationSize} números distintos para generar ${modes[combineMode as keyof typeof modes]}.`);
            if (!selected.length) throw Error("Selecciona los sorteos donde deseas agregar las combinaciones.");
            const compatible = selected.filter(id => draws.find((d: Draw) => d.id === id)?.modalities.includes(combineMode));
            const preview: { line: Line; available: number | null; error: string }[] = selected.filter(id => !compatible.includes(id)).map(draw_id => ({
                line: { draw_id, modality: combineMode, numbers: "—", amount: combineAmount },
                available: null,
                error: `No admite ${modes[combineMode as keyof typeof modes]}; sorteo omitido.`,
            }));
            if (!compatible.length) { setCombinePreview(preview); setCombineOpen(false); return; }
            if (combinationCount * compatible.length + lines.length > 500) throw Error("Máximo 500 jugadas por ticket. Reduce las combinaciones o los sorteos seleccionados.");
            const generated: Line[] = [];
            const append = (numbers: string[]) => generated.push(...makeLines(combineMode, numbers.join(""), combineAmount, compatible));
            for (let i = 0; i < combineNumbers.length; i++) {
                if (combinationSize === 1) { append([combineNumbers[i]]); continue; }
                for (let j = i + 1; j < combineNumbers.length; j++) {
                    if (combinationSize === 2) { append([combineNumbers[i], combineNumbers[j]]); continue; }
                    for (let k = j + 1; k < combineNumbers.length; k++) append([combineNumbers[i], combineNumbers[j], combineNumbers[k]]);
                }
            }
            const pending = [...lines];
            const fresh = newPlays(lines, generated);
            if (!fresh.length && !preview.length) throw Error("Todas estas combinaciones ya están agregadas.");
            for (const line of fresh) {
                try {
                    const { data } = await axios.post<{ available_minor: number | null }>("/lottery/availability", { ...line, branch_id: branch.id, pending });
                    const fits = data.available_minor === null || data.available_minor >= Math.round(Number(line.amount) * 100);
                    preview.push({ line, available: data.available_minor, error: fits ? "" : "Cupo insuficiente" });
                    if (fits) pending.push(line);
                } catch (e: any) {
                    preview.push({ line, available: null, error: e.response?.data?.message ?? "No se pudo consultar" });
                }
            }
            const accepted = preview.filter(item => !item.error).map(item => item.line);
            setCombineAddedCount(accepted.length);
            setLines(current => [...current, ...newPlays(current, accepted)]);
            requestKey.current = requestId();
            setCombinePreview(preview.filter(item => !!item.error));
            setCombineOpen(false);
            setMessage("");
        } catch (e: any) { setCombineError(e.message ?? "No se pudieron generar las combinaciones."); }
        finally { combiningRef.current = false; setCheckingCombinations(false); }
    };
    const [clearPlaysOpen, setClearPlaysOpen] = useState(false);
    const workspaceBusy = busy || checkingCombinations || duplicating;
    const saveLineAmount = async () => {
        if (!editingLine || checkingRef.current || workspaceBusy) return;
        const target = editingLine.line;
        const value = editingLine.amount;
        setEditAmountError("");
        if (!/^\d{1,9}(\.\d{1,2})?$/.test(value) || Number(value) <= 0) { setEditAmountError("Indica un monto mayor que cero, con hasta dos decimales."); return; }
        if (!lines.includes(target)) { setEditAmountError("La jugada ya no está en este ticket."); return; }
        if (Math.round(Number(value) * 100) === Math.round(Number(target.amount) * 100)) { setEditingLine(null); return; }
        checkingRef.current = true;
        setCheckingPlay(true);
        try {
            const { data } = await axios.post<{ available_minor: number | null }>("/lottery/availability", {
                ...target, amount: value, branch_id: branch.id, pending: lines.filter(line => line !== target),
            });
            if (data.available_minor !== null && data.available_minor < Math.round(Number(value) * 100)) throw Error(`Disponible para esta jugada: ${money(data.available_minor, currency)}. El monto anterior se conserva.`);
            setLines(current => current.map(line => line === target ? { ...line, amount: Number(value).toFixed(2) } : line));
            requestKey.current = requestId();
            setEditingLine(null);
        } catch (failure: any) {
            setEditAmountError(failure.response?.data?.message ?? failure.message ?? "No se pudo actualizar el monto. Intenta nuevamente.");
        } finally { checkingRef.current = false; setCheckingPlay(false); }
    };
    const loadDraft = (draft: Draft) => {
        const valid = draft.lines.filter(line => isOpen(line.draw_id) && (!line.second_draw_id || isOpen(line.second_draw_id)));
        setActiveDraftId(draft.id); setSelected(draft.selected.filter(isOpen)); setLines(valid);
        setMode(draft.mode); setNumbers(draft.numbers); setAmount(draft.amount); setDiscount(draft.discount);
        requestKey.current = valid.length === draft.lines.length ? draft.requestKey : requestId();
        setSelectedOnly(false); setLotteryFilter(null); setTicket(null);
        setMessage(valid.length !== draft.lines.length ? "Se retiraron de este ticket las jugadas cuyos sorteos ya cerraron." : "");
        requestAnimationFrame(() => numbersRef.current?.focus());
    };
    const switchDraft = (id: string) => {
        if (workspaceBusy || id === activeDraftId) return;
        const target = drafts.find(d => d.id === id);
        if (!target) return;
        setDrafts(current => current.map(d => d.id === activeDraftId ? snapshot() : d));
        loadDraft(target);
    };
    const createDraft = () => {
        if (workspaceBusy) return;
        const sequence = Math.max(0, ...drafts.map(d => Number(d.title.replace("Ticket ", "")) || 0)) + 1;
        const next = emptyDraft(`Ticket ${sequence}`);
        setDrafts(current => [...current.map(d => d.id === activeDraftId ? snapshot() : d), next]);
        loadDraft(next);
    };
    const removeActiveDraft = () => {
        if (workspaceBusy) return;
        const remaining = drafts.filter(d => d.id !== activeDraftId);
        if (!remaining.length) remaining.push(emptyDraft("Ticket 1"));
        setDrafts(remaining); setDiscardDraft(false); loadDraft(remaining[0]);
    };
    return (
        <Shell title={`Ventas · ${branch.code}`} fullWidth compact fixedViewport>
            <div className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto" role="tablist" aria-label="Tickets en trabajo">
                    {drafts.map(draft => { const active = draft.id === activeDraftId; const count = active ? lines.length : draft.lines.length; return <button key={draft.id} role="tab" aria-selected={active} disabled={workspaceBusy} onClick={() => switchDraft(draft.id)} className={`flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-xs ${active ? "border-emerald-600 bg-emerald-700 text-white" : "border-slate-300 dark:border-slate-600"}`}>{active ? <Tickets className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{draft.title} · {count} jugadas{!active && " · En espera"}</button>; })}
                </div>
                {cashRequired && <>
                    {cashOpen ? <Link href="/lottery/cash" className="shrink-0 rounded border border-emerald-500 px-2 py-1 text-xs text-emerald-600 dark:text-emerald-400">Caja abierta</Link> : <button type="button" onClick={() => void cashStatus.refetch()} className="shrink-0 rounded border border-amber-500 px-2 py-1 text-xs text-amber-600 dark:text-amber-400">{cashStatus.isLoading ? "Consultando forma de cuadre…" : cashStatus.isError ? "Reintentar consulta" : "Abrir caja"}</button>}
                    <span role="status" className={`shrink-0 text-[10px] ${cashConnection === "connected" ? "text-emerald-500" : "text-amber-500"}`} title={cashConnection === "connected" ? "Avisos de caja conectados" : "Avisos de caja desconectados. Se comprobará el estado al volver a esta ventana y al vender."}>●<span className="hidden lg:inline">{cashConnection === "connected" ? " En vivo" : " Sin avisos en vivo"}</span></span>
                </>}
                <button type="button" aria-label="Configurar impresora" className={secondary + ' shrink-0'} disabled={workspaceBusy} onClick={() => setPrinterSettingsOpen(true)} title="Configurar impresora de esta PC"><Printer size={16} className="inline md:mr-1" /><span className="hidden md:inline">Impresora</span></button>
                {(auth.user.is_super_admin || auth.user.permissions?.includes('lottery.results.view')) && <button type="button" className={secondary + ' shrink-0'} disabled={workspaceBusy} onClick={() => setPublishedResultsOpen(true)} data-sale-shortcut="Alt+R" aria-keyshortcuts="Alt+R" title="Resultados de hoy (Alt+R)"><ListChecks size={16} className="mr-1 hidden md:inline" />Resultados <kbd className="ml-1 rounded border px-1 text-[10px]">Alt+R</kbd></button>}
                <button type="button" aria-label="Nuevo ticket F10" className={secondary + ' shrink-0'} disabled={workspaceBusy} data-sale-shortcut="F10" aria-keyshortcuts="F10" title="Nuevo ticket (F10)" onClick={createDraft}><Plus className="inline h-4 w-4 md:mr-1" /><span className="hidden md:inline">Nuevo ticket</span><kbd className="ml-1 rounded border border-current/20 px-1 text-[10px] opacity-70">F10</kbd></button>
                <button type="button" className={secondary} disabled={workspaceBusy} onClick={() => setDiscardDraft(true)} aria-label="Descartar ticket actual"><Trash2 className="h-4 w-4" /></button>
            </div>
            <Modal show={cashStatus.isPending} closeable={false} onClose={() => {}} maxWidth="lg">
                <div className="space-y-4 p-6 text-slate-900 dark:text-slate-100">
                    <h2 className="flex items-center gap-2 text-lg font-semibold"><Wallet className="h-6 w-6 text-emerald-500" />Consultando forma de cuadre</h2>
                    <LoadingSkeleton compact label="Verificando si hay una caja abierta…" />
                </div>
            </Modal>
            {cashStatus.isSuccess && !cashOpen && <OpenCashModal notice={cashNotice} branch={branch} currency={currency} canOpen={!!auth.user.is_super_admin || !!auth.user.permissions?.includes("lottery.cash")} onOpened={() => requestAnimationFrame(() => numbersRef.current?.focus({ preventScroll: true }))} />}
            <Modal show={clearPlaysOpen} onClose={() => setClearPlaysOpen(false)} maxWidth="sm" afterLeave={() => requestAnimationFrame(() => numbersRef.current?.focus())}>
                <div className="space-y-4 p-5 text-slate-900 dark:text-slate-100">
                    <h2 className="flex items-center gap-2 text-lg font-semibold"><Eraser className="h-5 w-5 text-red-500" />Limpiar jugadas</h2>
                    <p className="text-sm">¿Eliminar las {lines.length} jugadas del ticket actual? Los sorteos seleccionados y los tickets en espera se conservan.</p>
                    <div className="flex justify-end gap-2">
                        <button autoFocus type="button" className={secondary} onClick={() => setClearPlaysOpen(false)}><X className="mr-1 inline h-4 w-4" />Cancelar</button>
                        <button type="button" className={button + " !bg-red-600 hover:!bg-red-700"} disabled={workspaceBusy || checkingPlay} onClick={() => {
                            setLines([]); setNumbers(""); setAmount(""); setCombinePreview(null); setRepeatedPlay(null); setPartialPlay(null);
                            requestKey.current = requestId(); setClearPlaysOpen(false);
                        }}><Eraser className="mr-1 inline h-4 w-4" />Sí, limpiar</button>
                    </div>
                </div>
            </Modal>
            <Modal show={discardDraft} onClose={() => setDiscardDraft(false)} maxWidth="sm"><div className="p-5 text-slate-900 dark:text-slate-100"><h2 className="font-semibold">¿Descartar este ticket en espera?</h2><p className="mt-2 text-sm">Se eliminarán sus jugadas sin emitir una venta.</p><div className="mt-4 flex justify-end gap-2"><button autoFocus className={secondary} onClick={() => setDiscardDraft(false)}>Cancelar</button><button className={button} onClick={removeActiveDraft}><Trash2 className="mr-1 inline h-4 w-4" />Descartar</button></div></div></Modal>
            <Modal show={editingLine !== null} closeable={!checkingPlay} onClose={() => setEditingLine(null)} maxWidth="sm">
                <form className="space-y-4 p-5 text-slate-900 dark:text-slate-100" onSubmit={event => { event.preventDefault(); void saveLineAmount(); }} onKeyDown={event => { if (event.key === "Escape" && !checkingPlay) { event.preventDefault(); event.stopPropagation(); setEditingLine(null); } }}>
                    <h2 className="flex items-center gap-2 text-lg font-semibold"><Pencil className="h-5 w-5 text-emerald-500" />Editar monto de jugada</h2>
                    {editingLine && <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800"><p className="font-semibold">{[editingLine.line.draw_id, editingLine.line.second_draw_id].filter(Boolean).map(id => draws.find((draw: Draw) => draw.id === id)?.name ?? `Sorteo #${id}`).join(" + ")}</p><p>{modes[editingLine.line.modality as keyof typeof modes]} · <span className="font-mono font-semibold">{editingLine.line.numbers}</span></p></div>}
                    <label className="block space-y-1 text-sm font-medium">Nuevo monto ({currency})<MoneyInput autoFocus className={input} value={editingLine?.amount ?? ""} disabled={checkingPlay} onFocus={event => event.target.select()} onValueChange={amount => { setEditingLine(current => current ? { ...current, amount } : null); setEditAmountError(""); }} /></label>
                    {editAmountError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{editAmountError}</p>}
                    <div className="flex justify-end gap-2"><button type="button" className={secondary} disabled={checkingPlay} onClick={() => setEditingLine(null)}>Cancelar</button><button className={button} disabled={checkingPlay}>{checkingPlay ? <LoaderCircle className="mr-1 inline h-4 w-4 animate-spin" /> : <Check className="mr-1 inline h-4 w-4" />}{checkingPlay ? "Verificando…" : "Guardar monto"}</button></div>
                </form>
            </Modal>
            <Modal show={repeatedPlay !== null} closeable={!checkingPlay} onClose={() => setRepeatedPlay(null)} maxWidth="lg">
                <div className="p-5 text-slate-900 dark:text-slate-100">
                    <h2 className="mb-3 text-lg font-semibold"><Plus className="mr-2 inline h-5 w-5" />Jugada ya agregada</h2>
                    <p className="mb-3 text-sm">¿Quieres sumar este monto a la jugada original?</p>
                    <ul className="max-h-[45vh] space-y-2 overflow-auto text-sm">{repeatedPlay?.map((extra, index) => {
                        const original = lines.find(line => playIdentity(line) === playIdentity(extra));
                        return <li key={index} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><b>{label(extra)} · {extra.numbers}</b><p>{original ? `${money(Math.round(Number(original.amount) * 100), currency)} + ${money(Math.round(Number(extra.amount) * 100), currency)} = ${money(Math.round(Number(original.amount) * 100) + Math.round(Number(extra.amount) * 100), currency)}` : `Nueva jugada: ${money(Math.round(Number(extra.amount) * 100), currency)}`}</p></li>;
                    })}</ul>
                    <p className="mt-3 text-xs text-slate-500">Se validará el cupo adicional. Las jugadas repetidas conservarán una sola fila.</p>
                    <div className="mt-4 flex justify-end gap-2"><button type="button" className={secondary} disabled={checkingPlay} onClick={() => setRepeatedPlay(null)}><X className="mr-2 inline h-4 w-4" />Cancelar</button><button autoFocus type="button" className={button} disabled={checkingPlay} onClick={() => { if (repeatedPlay) void add(repeatedPlay); }}><Plus className="mr-2 inline h-4 w-4" />Sí, sumar monto</button></div>
                </div>
            </Modal>
            {randomOpen && <RandomPlaysModal selectedIds={selected} existing={lines} currency={currency} initialAmount={amount} onClose={() => setRandomOpen(false)} onAdd={plays => {
                if (workspaceBusy) return;
                if (!selected.length) throw Error("Selecciona al menos un sorteo en ventas.");
                const candidates = newPlays(lines, plays.flatMap(play => selected.map(draw_id => ({ ...play, draw_id }))));
                if (!candidates.length) throw Error("Estas jugadas ya están agregadas. Vuelve a generar.");
                if (lines.length + candidates.length > 500) throw Error("Máximo 500 jugadas por ticket, contando todos los sorteos seleccionados.");
                setRandomOpen(false);
                void add(candidates);
            }} />}
            <Modal show={combineOpen} closeable={!checkingCombinations} onClose={() => setCombineOpen(false)} maxWidth="2xl">
                <form className="flex h-[min(700px,90dvh)] flex-col overflow-hidden p-3 text-slate-900 dark:text-slate-100" onSubmit={e => { e.preventDefault(); void combine(); }}>
                    <fieldset disabled={checkingCombinations} className="contents">
                    <div className="mb-2 flex shrink-0 items-center gap-2"><Shuffle className="h-6 w-6 text-emerald-600" /><h2 className="flex-1 text-lg font-semibold">Ligar números</h2><button type="button" className={secondary} aria-label="Cerrar" onClick={() => setCombineOpen(false)}><X className="h-4 w-4" /></button></div>
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="my-1 flex shrink-0 flex-nowrap gap-1 overflow-x-auto">
                        {allCombineNumbers.map(n => <button key={n} type="button" aria-pressed={combineNumbers.includes(n)} className={`rounded-lg border px-2 py-1 font-mono ${combineNumbers.includes(n) ? "border-emerald-600 bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100" : "border-slate-300 dark:border-slate-700"}`} onClick={() => { setChosenNumbers(current => current.includes(n) ? current.filter(v => v !== n) : [...current, n]); setCombinePreview(null); }}>{n}</button>)}
                    </div>
                    <div className="mb-2 flex shrink-0 gap-2"><button type="button" className={secondary} onClick={() => { setChosenNumbers(allCombineNumbers); setCombinePreview(null); }}>Seleccionar todos</button><button type="button" className={secondary} onClick={() => { setChosenNumbers([]); setCombinePreview(null); }}>Limpiar selección</button></div>
                    <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="min-w-0 space-y-1 text-sm">
                            <span className="font-medium text-slate-600 dark:text-slate-300">Quiero generar</span>
                            <div role="group" aria-label="Modalidad de combinaciones" className="grid grid-cols-3 gap-1">
                                {(["quiniela", "pale", "tripleta"] as const).map((value, index) => <button key={value} type="button" autoFocus={index === 0} aria-pressed={combineMode === value} className={`rounded-md border px-2 py-2 text-sm font-semibold transition-colors ${combineMode === value ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"}`} onClick={() => { setCombineMode(value); setCombineError(""); setCombinePreview(null); }}>{modes[value]}</button>)}
                            </div>
                        </div>
                        <Field label="Monto por jugada y sorteo"><MoneyInput className={input} inputMode="decimal" value={combineAmount} onValueChange={value => { setCombineAmount(value); setCombinePreview(null); }} /></Field>
                        <p className="rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-800 sm:col-span-2">{Math.max(0, combinationCount)} combinaciones × {selected.length} sorteos seleccionados. Se conservan las jugadas actuales y se omiten las combinaciones que ya están agregadas.</p>
                        {combineNumbers.length < combinationSize && <p className="text-sm text-amber-700 dark:text-amber-300">Necesitas {combinationSize} números distintos; tienes {combineNumbers.length}.</p>}
                        {combineError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{combineError}</p>}
                    </div>
                    <div className="mt-2 min-h-0 flex-1 overflow-auto text-sm [scrollbar-width:thin] dark:[scrollbar-color:#475569_#0f172a]">
                        <p className="mb-2 font-medium">Combinaciones a agregar</p>
                        <div className="flex flex-wrap gap-2">{(() => {
                            const result: string[] = [];
                            for (let i = 0; i < combineNumbers.length && result.length < 500; i++) {
                                if (combinationSize === 1) { result.push(combineNumbers[i]); continue; }
                                for (let j = i + 1; j < combineNumbers.length && result.length < 500; j++) {
                                    if (combinationSize === 2) { result.push(`${combineNumbers[i]}-${combineNumbers[j]}`); continue; }
                                    for (let k = j + 1; k < combineNumbers.length && result.length < 500; k++) result.push(`${combineNumbers[i]}-${combineNumbers[j]}-${combineNumbers[k]}`);
                                }
                            }
                            return result.map(value => <span key={value} className="rounded bg-slate-100 px-2 py-1 font-mono dark:bg-slate-800">{value}</span>);
                        })()}</div>
                    </div>
                    </div>
                    <div className="mt-2 flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                        <button type="button" className={secondary} onClick={() => setCombineOpen(false)}><X className="mr-2 inline h-4 w-4" />Cancelar</button>
                        <button className={button} disabled={combineNumbers.length < combinationSize || !selected.length}><Plus className="mr-2 inline h-4 w-4" />{checkingCombinations ? "Agregando…" : "Agregar combinaciones"}</button>
                    </div>
                    </fieldset>
                </form>
            </Modal>
            <Modal show={!combineOpen && !!combinePreview?.length} onClose={() => setCombinePreview(null)}>
                <div className="p-4 text-slate-900 dark:text-slate-100">
                    <h2 className="mb-3 text-lg font-semibold">Sorteos y jugadas omitidos</h2>
                    <div className="max-h-[55vh] overflow-auto"><DataTable paginate={false} data={combinePreview ?? []} columns={[
                        { id: "draw", header: "Sorteo", cell: ({ row }) => label(row.original.line) },
                        { id: "play", header: "Jugada", cell: ({ row }) => row.original.line.numbers },
                        { id: "reason", header: "Motivo", cell: ({ row }) => row.original.error },
                    ]} /></div>
                    <p className="mt-3 text-sm text-slate-500">{combineAddedCount ? `${combineAddedCount === 1 ? "Se agregó 1 jugada" : `Se agregaron ${combineAddedCount} jugadas`} en los sorteos compatibles y con cupo. Las jugadas anteriores se conservaron.` : "No se agregaron nuevas jugadas. Las jugadas anteriores se conservaron."}</p>
                    <div className="mt-3 flex justify-end"><button autoFocus className={button} onClick={() => setCombinePreview(null)}><Check className="mr-2 inline h-4 w-4" />Entendido</button></div>
                </div>
            </Modal>
            {ticketActionsOpen && <TicketActionsModal onClose={() => setTicketActionsOpen(false)} user={auth.user} branchId={branch.id} draws={draws} showQr={!!settings.show_qr} />}
            {publishedResultsOpen && <PublishedResultsModal branchId={branch.id} userId={auth.user.id} onClose={() => { setPublishedResultsOpen(false); requestAnimationFrame(() => numbersRef.current?.focus()); }} />}
            {printerSettingsOpen && <PrinterSettingsModal branchId={branch.id} onClose={() => setPrinterSettingsOpen(false)} />}
            {winnersOpen && <WinnersModal show onClose={() => setWinnersOpen(false)} userId={auth.user.id} branchId={branch.id} draws={draws} />}
            <Modal show={duplicateOpen} maxWidth="lg" closeable={!duplicating} onClose={() => setDuplicateOpen(false)} afterLeave={() => { requestAnimationFrame(() => numbersRef.current?.focus()); }}>
                <form onSubmit={e => { e.preventDefault(); void duplicate(); }} onKeyDown={e => { if (e.key === "Enter" && (e.repeat || e.nativeEvent.isComposing)) e.preventDefault(); }} className="text-slate-900 dark:text-slate-100">
                    <div className="flex items-start gap-3 border-b border-slate-200 p-5 dark:border-slate-700">
                        <div className="rounded-xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"><Copy className="h-6 w-6" /></div>
                        <div className="flex-1"><h2 className="text-lg font-semibold">Duplicar ticket</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Carga sus jugadas para preparar una nueva venta.</p></div>
                        <button type="button" disabled={duplicating} onClick={() => setDuplicateOpen(false)} aria-label="Cerrar" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
                    </div>
                    <div className="space-y-4 p-5">
                        {duplicating && <LoadingSkeleton compact />}
                        {!!settings.show_qr && <div role="group" aria-label="Buscar ticket por" className="grid grid-cols-2 gap-2">
                            {([['number', 'Número de ticket', Tickets], ['qr', 'Código QR', QrCode]] as const).map(([method, title, Icon]) => <button key={method} type="button" aria-pressed={duplicateMethod === method} disabled={duplicating} className={duplicateMethod === method ? button : secondary} onClick={() => {
                                if (duplicateMethod !== method) {
                                    setDuplicateMethod(method); setDuplicateCode(""); setDuplicateError(""); setDuplicateSource(null); setDuplicateTargets({}); setDuplicateReference("");
                                }
                                requestAnimationFrame(() => duplicateInputRef.current?.focus());
                            }}><Icon aria-hidden="true" className="mr-2 inline h-4 w-4" />{title}</button>)}
                        </div>}
                        <div className="space-y-2">
                            <label htmlFor="duplicate-ticket-code" className="block text-sm font-medium">{duplicateUsesQr ? "Código QR del ticket" : "Número del ticket"}</label>
                            <div className="relative">{duplicateUsesQr ? <QrCode aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" /> : <Tickets aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />}<input ref={duplicateInputRef} id="duplicate-ticket-code" autoFocus data-autofocus autoComplete="off" spellCheck={false} disabled={duplicating} className={`${input} pl-10 font-mono`} placeholder={duplicateUsesQr ? "Escanea o pega el código QR" : "T-000012 o 12"} value={duplicateCode} onChange={e => { setDuplicateCode(e.target.value); setDuplicateError(""); setDuplicateSource(null); setDuplicateTargets({}); setDuplicateReference(""); }} aria-invalid={!!duplicateError} aria-describedby={`duplicate-ticket-help${duplicateError ? ' duplicate-ticket-error' : ''}`} /></div>
                            <p id="duplicate-ticket-help" className="text-xs text-slate-500 dark:text-slate-400">{duplicateUsesQr ? "Escanea o pega el QR: se consultará automáticamente. Después pulsa Enter para cargar las jugadas." : "Usa el número impreso en el ticket de esta banca, con o sin T-."}</p>
                        </div>
                        {duplicateError && <p id="duplicate-ticket-error" role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{duplicateError}</p>}
                        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">Consulta el ticket y elige a qué sorteo abierto trasladar cada grupo de jugadas. El ticket original se conserva; la nueva venta se emite al pulsar Vender.</div>
                        {duplicateSource && <div className="space-y-3">
                            <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">Ticket {duplicateReference} · {duplicateSource.length === 1 ? "1 jugada encontrada" : `${duplicateSource.length} jugadas encontradas`}</p>
                            <h3 className="font-semibold">Sorteos de destino</h3>
                            <p className="text-xs text-slate-500">Se conservan los números y montos. Solo aparecen destinos compatibles con las modalidades del sorteo original.</p>
                            {Array.from(new Set(duplicateSource.flatMap(line => [line.draw_id, ...(line.second_draw_id ? [line.second_draw_id] : [])]))).map(id => {
                                const original = draws.find((d: Draw) => d.id === id);
                                const requiredModes = duplicateSource.filter(line => line.draw_id === id || line.second_draw_id === id).map(line => line.modality);
                                return <label key={id} className="block space-y-1 text-sm"><span className="font-medium">{original ? drawName(original) : `Sorteo original #${id}`}{!isOpen(id) && <span className="ml-2 text-amber-600 dark:text-amber-400">Cerrado</span>}</span>
                                    <ComboboxSelect className={input} disabled={duplicating} value={duplicateTargets[id] || ""} onChange={e => { setDuplicateTargets(current => ({ ...current, [id]: Number(e.target.value) })); setDuplicateError(""); }}>
                                        <option value="">Selecciona el sorteo de destino</option>
                                        {draws.filter((d: Draw) => isOpen(d.id) && requiredModes.every(mode => d.modalities.includes(mode))).map((d: Draw) => <option key={d.id} value={d.id}>{drawName(d)}</option>)}
                                    </ComboboxSelect>
                                </label>;
                            })}
                        </div>}
                        {lines.length > 0 && <p className="text-sm text-amber-700 dark:text-amber-300">Al cargar el ticket se reemplazarán las {lines.length} jugadas actuales.</p>}
                    </div>
                    <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-900">
                        <button type="button" className={secondary} disabled={duplicating} onClick={() => setDuplicateOpen(false)}><X className="mr-2 inline h-4 w-4" />Cancelar</button>
                        <button ref={duplicateSubmitRef} type="submit" className={button} disabled={duplicating || !duplicateCode.trim()}>{duplicating ? <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" /> : <Copy className="mr-2 inline h-4 w-4" />}{duplicating ? "Cargando…" : duplicateSource ? "Cargar jugadas" : "Consultar ticket"}</button>
                    </div>
                </form>
            </Modal>
            <Modal show={partialPlay !== null} onClose={() => closePartialPlay(!partialPlay?.accepted.length)} afterLeave={restorePartialFocus}>
                <div className="p-5 text-slate-900 dark:text-slate-100">
                    <h2 className="mb-3 text-lg font-semibold">No se pudo agregar en estos sorteos</h2>
                    <ul className="max-h-[55vh] list-disc space-y-2 overflow-auto rounded-lg bg-amber-50 p-4 pl-8 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{partialPlay?.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
                    <p className="mt-3 text-sm text-slate-500">{partialPlay?.accepted.length ? `Se agregó automáticamente en ${partialPlay.accepted.length} sorteo(s) o pareja(s) con cupo.` : "No se agregó ninguna jugada. Puedes corregir el monto."}</p>
                    <div className="mt-4 flex justify-end"><button autoFocus type="button" className={button} onClick={() => closePartialPlay(!partialPlay?.accepted.length)}><Check className="mr-2 inline h-4 w-4" />Entendido</button></div>
                </div>
            </Modal>
            <Modal show={availabilityDetail !== null} onClose={() => setAvailabilityDetail(null)} afterLeave={() => requestAnimationFrame(() => requestAnimationFrame(() => {
                if (!document.querySelector('[role="dialog"], [role="alertdialog"]')) numbersRef.current?.focus({ preventScroll: true });
            }))}>
                <div className="p-6 text-slate-900 dark:text-slate-100">
                    <div className="mb-4 flex items-center justify-between gap-4">
                        <h2 className="text-lg font-semibold">Disponible por sorteo / pareja</h2>
                        <button type="button" className={secondary} aria-label="Cerrar detalle" onClick={() => setAvailabilityDetail(null)}><X className="h-4 w-4" /></button>
                    </div>
                    {detailQuery.isFetching ? <LoadingSkeleton /> : detailQuery.isError ? <p role="alert">No se pudo consultar la disponibilidad.</p> :
                        <DataTable paginate={false} data={detailQuery.data ?? []} columns={[
                            { id: "draw", header: "Sorteo / pareja", cell: ({ row }) => label(row.original) },
                            { id: "numbers", header: "Jugada", cell: ({ row }) => <span className="font-mono">{row.original.numbers}<span className="block font-sans text-xs text-slate-500">{modes[row.original.modality as keyof typeof modes]}</span></span> },
                            { id: "available", header: "Disponible", cell: ({ row }) => row.original.error ? <span className="text-amber-600">{row.original.error}</span> : row.original.available === null ? "Sin límite configurado" : row.original.available === undefined ? "—" : money(row.original.available, currency) },
                        ]} />}
                    <p className="mt-4 text-sm text-slate-500">Incluye las jugadas pendientes del ticket. Los cupos pueden compartir límites y no se suman entre sí. Se verifican nuevamente al vender.</p>
                    <div className="mt-5 flex justify-end gap-2">
                        <button type="button" className={secondary} disabled={detailQuery.isFetching} onClick={() => detailQuery.refetch()}><RefreshCw className="mr-2 inline h-4 w-4" />Actualizar</button>
                        <button type="button" className={button} onClick={() => setAvailabilityDetail(null)}><X className="mr-2 inline h-4 w-4" />Cerrar</button>
                    </div>
                </div>
            </Modal>
            <Modal show={!!message} onClose={() => setMessage("")} afterLeave={restoreAlertFocus} maxWidth="lg">
                <div className="p-5 text-slate-900 dark:text-slate-100">
                    <div className="mb-3 flex items-center gap-3"><AlertCircle aria-hidden="true" className="h-6 w-6 shrink-0 text-amber-600 dark:text-amber-400" /><h2 className="text-lg font-semibold">Aviso de venta</h2></div>
                    <p role="alert" className="max-h-[55vh] overflow-auto whitespace-pre-line text-sm leading-6">{message}</p>
                    <div className="mt-5 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">Enter para aceptar · Escape para cerrar</span><button autoFocus type="button" className={button} onClick={() => setMessage("")}><Check aria-hidden="true" className="mr-2 inline h-4 w-4" />Entendido</button></div>
                </div>
            </Modal>
            {reprintOpen && <ReprintTicketModal branch={branch} draws={draws} currency={currency} onClose={() => { setReprintOpen(false); requestAnimationFrame(() => numbersRef.current?.focus()); }} />}
            <Modal show={checkoutOpen} onClose={() => { if (!busy) setCheckoutOpen(false); }}>
                <form className="space-y-4 p-6 text-slate-900 dark:text-slate-100" onSubmit={event => { event.preventDefault(); void confirmSale(); }}>
                    <h2 className="flex items-center gap-2 text-lg font-semibold"><Wallet className="h-5 w-5 text-emerald-500" />Cobrar ticket</h2>
                    <div className="rounded-lg bg-slate-100 p-4 dark:bg-slate-800"><p className="text-sm">Total a cobrar</p><p className="text-3xl font-bold">{money(gross - rebate, currency)}</p>{rebate > 0 && <p className="text-sm">Descuento: {money(rebate, currency)}</p>}</div>
                    <Field label="Medio de cobro"><ComboboxSelect aria-label="Medio de cobro" className={input} value={paymentMethod} disabled={busy} onChange={e => { setPaymentMethod(e.target.value); setPaymentReference(''); setReceived(((gross - rebate) / 100).toFixed(2)); setCheckoutError(''); }}>{enabledPaymentMethods.map(method => <option key={method} value={method}>{paymentMethodName(method, settings.payment_method_labels)}</option>)}</ComboboxSelect></Field>
                    {paymentMethod === 'cash' ? <><label className="block text-sm font-medium">Dinero recibido ({currency})<MoneyInput autoFocus data-autofocus onFocus={event => event.target.select()} className={`${input} mt-1 w-full`} inputMode="decimal" value={received} onValueChange={value => { setReceived(value); setCheckoutError(""); }} disabled={busy} /></label>
                    <div aria-live="polite" className="flex justify-between rounded-lg bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"><span>Devolución</span><strong>{money(Math.max(0, receivedMinor - (gross - rebate)), currency)}</strong></div></> : <p className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">Cobro exacto de {money(gross - rebate, currency)} por {paymentMethodName(paymentMethod, settings.payment_method_labels)}. Sin devolución de efectivo.</p>}
                    {(paymentMethod !== 'cash' || referenceRequired) && <div><label className="block text-sm">Referencia del cobro ({referenceRequired ? 'obligatoria' : 'opcional'})<input ref={paymentReferenceRef} autoFocus={paymentMethod !== 'cash'} data-autofocus={paymentMethod !== 'cash' || undefined} required={referenceRequired} aria-describedby={referenceRequired ? 'sale-reference-help' : undefined} className={input + ' mt-1'} maxLength={100} value={paymentReference} disabled={busy} onChange={e => { setPaymentReference(e.target.value); setCheckoutError(''); }} /></label>{referenceRequired && <p id="sale-reference-help" className="mt-1 text-xs text-slate-500">Este medio requiere una referencia para confirmar la venta.</p>}</div>}
                    {checkoutError && <p role="alert" className="text-sm text-red-500">{checkoutError}</p>}
                    <div className="flex justify-end gap-2"><button type="button" className={secondary} disabled={busy} onClick={() => setCheckoutOpen(false)}><X className="mr-2 inline h-4 w-4" />Cancelar</button><button className={button} disabled={busy || receivedMinor < gross - rebate || (referenceRequired && !paymentReference.trim())}>{busy ? <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" /> : <Check className="mr-2 inline h-4 w-4" />}Confirmar venta</button></div>
                </form>
            </Modal>
            {ticket && <IssuedTicketModal key={ticket.reference ?? ticket.code} ticket={ticket} draws={draws} branch={branch} currency={currency} onClose={() => { setTicket(null); requestAnimationFrame(() => numbersRef.current?.focus()); }} />}
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_240px] grid-rows-[auto_minmax(0,1fr)] gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
            <section className={`${panel} col-start-2 row-start-1 row-span-2 flex min-h-0 flex-col`}>
                <div className="mb-3 grid shrink-0 gap-2 border-b border-slate-200 pb-3 dark:border-slate-700" role="group" aria-label="Filtrar por lotería">
                    <ComboboxSelect aria-label="Filtrar por lotería" className={input} value={lotteryFilter ?? ""} onChange={e => setLotteryFilter(e.target.value ? Number(e.target.value) : null)}><option value="">Todas las loterías</option>{Array.from(new Map<number, { id: number; name: string }>(draws.filter((d: Draw) => isOpen(d.id)).map((d: Draw) => [d.lottery_id, { id: d.lottery_id, name: d.lottery?.name ?? "Lotería" }])).values()).map(lottery => <option key={lottery.id} value={lottery.id}>{lottery.name}</option>)}</ComboboxSelect>
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{selected.length} {selected.length === 1 ? "sorteo seleccionado" : "sorteos seleccionados"}</span>
                        <button type="button" title="Limpiar selección" aria-label="Limpiar selección" disabled={busy || !selected.length} onClick={() => { setSelected([]); setSelectedOnly(false); }} className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"><Eraser className="h-3.5 w-3.5" />Limpiar</button>
                    </div>
                    <button type="button" aria-pressed={selectedOnly} onClick={() => setSelectedOnly(value => !value)} className={`flex w-full items-center justify-center gap-2 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${selectedOnly ? "border-emerald-600 bg-emerald-700 text-white" : "border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"}`}><ListChecks className="h-4 w-4" />Solo seleccionados</button>
                </div>
                <div tabIndex={0} aria-label="Sorteos disponibles" className="grid min-h-0 flex-1 auto-rows-max grid-cols-1 content-start gap-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin] [scrollbar-color:#94a3b8_#f1f5f9] dark:[scrollbar-color:#475569_#0f172a]">
                    {draws
                        .filter((d: Draw) => isOpen(d.id) && (lotteryFilter === null || d.lottery_id === lotteryFilter) && (!selectedOnly || selected.includes(d.id)))
                        .sort((a: Draw, b: Draw) => getWindow(a).close - getWindow(b).close || a.closes_at.localeCompare(b.closes_at) || a.name.localeCompare(b.name, "es") || a.id - b.id)
                        .map((d: Draw) => {
                            const seconds = Math.max(
                                0,
                                Math.floor(
                                    (getWindow(d).close -
                                        now -
                                        offset.current) /
                                        1000,
                                ),
                            );
                            return (
                                <button
                                    disabled={busy}
                                    title={`${drawName(d)} · Cierra en ${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor(seconds / 60 % 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`}
                                    key={d.id}
                                    aria-pressed={selected.includes(d.id)}
                                    className={`relative min-w-0 rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${selected.includes(d.id) ? "border-emerald-600 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-600 dark:border-emerald-400 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-400" : "border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"}`}
                                    onClick={() =>
                                        setSelected(
                                            selected.includes(d.id)
                                                ? selected.filter(
                                                      (id) => id !== d.id,
                                                  )
                                                : [...selected, d.id],
                                        )
                                    }
                                >
                                    <span className="flex items-start gap-2">
                                        <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected.includes(d.id) ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-emerald-950" : "border-slate-400 dark:border-slate-500"}`}>
                                            {selected.includes(d.id) && <Check className="h-3 w-3" />}
                                        </span>
                                        <span className="min-w-0 break-words text-sm font-semibold leading-5">{d.name}</span>
                                    </span>
                                    <span className={`mt-1 block pl-6 text-xs tabular-nums ${seconds < 300 ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-400"}`}>
                                        Cierra en{" "}
                                        {Math.floor(seconds / 3600)
                                            .toString()
                                            .padStart(2, "0")}
                                        :
                                        {Math.floor((seconds % 3600) / 60)
                                            .toString()
                                            .padStart(2, "0")}
                                        :
                                        {(seconds % 60)
                                            .toString()
                                            .padStart(2, "0")}
                                    </span>
                                </button>
                            );
                        })}
                </div>
                {selectedOnly && !draws.some((d: Draw) => isOpen(d.id) && selected.includes(d.id) && (lotteryFilter === null || d.lottery_id === lotteryFilter)) && <p className="py-2 text-sm text-slate-500">No hay sorteos seleccionados para este filtro.</p>}
                {!draws.some((d: Draw) => isOpen(d.id)) && (
                    <p className="text-sm text-slate-500">
                        No hay sorteos abiertos y habilitados. Revisa el
                        catálogo y la configuración de la banca.
                    </p>
                )}
            </section>
            <section className={`${panel} shrink-0`}>
                <form
                    className="grid items-end gap-2 md:grid-cols-[1fr_1fr_1fr_auto_auto]"
                    onSubmit={(e) => {
                        e.preventDefault();
                        add();
                    }}
                >
                    <fieldset disabled={busy} className="contents">
                    <Field label="Jugada">
                        <input
                            className={input}
                            ref={numbersRef}
                            autoFocus
                            value={numbers}
                            aria-label="Jugada"
                            title="Añade un punto final para derecho y revés: 10. → 10 y 01; 1020. → 10-20 y 01-02."
                            placeholder={
                                mode === "quiniela"
                                    ? "10"
                                    : mode === "tripleta"
                                      ? "102030"
                                      : mode === "super_pale" ? "1020s" : "1020"
                            }
                            onChange={(e) => {
                                const value = e.target.value;
                                if (!/^(?:s?\d*|\d+s)\.?$/i.test(value)) return;
                                setNumbers(value);
                                const parsed = parsePlay(value);
                                if (parsed) setMode(parsed.modality);
                            }}
                            onKeyDown={(e) => {
                                if (e.key !== "Enter") return;
                                e.preventDefault();
                                const parsed = parsePlay(numbers, mode);
                                if (!parsed) { setMessage("Completa una jugada válida."); return; }
                                setNumbers(parsed.numbers.replaceAll("-", "") + (parsed.modality === "super_pale" ? "s" : "") + (numbers.endsWith(".") ? "." : ""));
                                setMode(parsed.modality);
                                setMessage("");
                                amountRef.current?.focus();
                                amountRef.current?.select();
                            }}
                        />
                        {numbers.endsWith(".") && parsePlay(numbers, mode) && <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400" aria-live="polite">Derecho y revés: {parsePlayVariants(numbers, mode).map(play => play.numbers).join(" + ")} · monto por jugada</p>}
                    </Field>
                    <Field label="Disponible">
                        <input className={`${input} bg-slate-50 dark:bg-slate-900`} readOnly tabIndex={-1}
                            aria-label="Disponible" aria-live="polite"
                            value={selected.length !== 1 ? "—" : availability.isFetching ? "Consultando…" : available === null ? "Sin límite" : available === undefined ? "—" : money(available, currency)} />
                    </Field>
                    <Field label="Monto por sorteo / pareja">
                        <MoneyInput
                            className={input}
                            ref={amountRef}
                            inputMode="decimal"
                            value={amount}
                            onValueChange={setAmount}
                        />
                    </Field>
                    <button type="button" disabled={busy || availability.isFetching} className={secondary} data-sale-shortcut="F1" aria-keyshortcuts="F1" title="Consultar disponible (F1)" onClick={check}>
                        {availability.isFetching ? <LoaderCircle aria-hidden="true" className="mr-2 inline h-4 w-4 animate-spin" /> : <Wallet aria-hidden="true" className="mr-2 inline h-4 w-4" />}{availability.isFetching ? "Consultando…" : <>Disponible <kbd className="ml-1 rounded border border-current/20 px-1 text-[10px]">F1</kbd></>}
                    </button>
                    <button disabled={busy} className={button}>
                        {checkingPlay ? <LoaderCircle aria-hidden="true" className="mr-2 inline h-4 w-4 animate-spin" /> : <Plus aria-hidden="true" className="mr-2 inline h-4 w-4" />}{checkingPlay ? "Verificando cupo…" : "Agregar"}
                    </button>
                    </fieldset>
                </form>


            </section>
            <div className="grid min-h-0 flex-1 grid-cols-3 gap-3">
                {["quiniela", "pale", "tripleta"].map((group) => (
                    <section className={`${panel} !p-3 flex min-h-0 min-w-0 flex-col`} key={group}>
                        <h2 className="mb-1 text-sm font-semibold leading-5">
                            {modes[group as keyof typeof modes]}{" "}
                            {group === "pale" ? " / Súper palé" : ""}
                        </h2>
                        <DragScrollArea tabIndex={0} aria-label={`Jugadas de ${modes[group as keyof typeof modes]}`} className="min-h-0 flex-1 overflow-auto overscroll-contain [&_td]:px-1.5 [&_td]:py-1 [&_td]:text-xs [&_td]:leading-4 [&_th]:h-8 [&_th]:px-2 [&_th]:py-1 [&_th]:text-xs [scrollbar-width:thin] [scrollbar-color:#94a3b8_#f1f5f9] dark:[scrollbar-color:#475569_#0f172a]">
                            <DataTable paginate={false} data={lines.map((line, index) => ({ ...line, index })).filter(l => l.modality === group || (group === "pale" && l.modality === "super_pale"))} getRowId={row => String(row.index)} emptyMessage="Sin jugadas." columns={[{ id: "column0", header: "Sorteo", cell: ({ row: { original: l } }) => <div className="whitespace-normal break-words text-xs leading-4">{[l.draw_id, l.second_draw_id].filter(Boolean).map(id => draws.find((d: Draw) => d.id === id)?.name ?? `Sorteo #${id}`).join(" + ")}
                                                        {l.modality ===
                                                            "super_pale" && (
                                                            <b className="block text-[10px] leading-3 text-blue-600 dark:text-blue-400">
                                                                Súper palé
                                                            </b>
                                                        )}</div> },{ id: "column1", header: "Jugada", cell: ({ row: { original: l } }) => <div className="whitespace-nowrap font-mono font-semibold">{l.numbers}</div> },{ id: "column2", header: "Monto", cell: ({ row: { original: l } }) => <button type="button" disabled={workspaceBusy} title="Editar monto de esta jugada" aria-label={`Editar monto de ${l.numbers} · ${[l.draw_id, l.second_draw_id].filter(Boolean).map(id => draws.find((draw: Draw) => draw.id === id)?.name).join(" + ")}`} className="ml-auto inline-flex min-h-6 items-center justify-end gap-1 whitespace-nowrap rounded px-1 font-medium text-emerald-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-950" onClick={() => { setEditAmountError(""); setEditingLine({ line: lines[l.index], amount: l.amount }); }}>{money(Math.round(Number(l.amount) * 100), currency)}<Pencil aria-hidden="true" className="h-3 w-3 shrink-0 opacity-60" /></button> },{ id: "actions", header: "Acciones", cell: ({ row: { original: l } }) => <div className="text-right"><button
                                                            disabled={busy}
                                                            aria-label="Quitar jugada"
                                                            className="inline-flex h-6 w-6 items-center justify-center rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                                                            onClick={() => {
                                                                setLines(
                                                                    lines.filter(
                                                                        (
                                                                            _,
                                                                            j,
                                                                        ) =>
                                                                            j !== l.index,
                                                                    ),
                                                                );
                                                                requestKey.current =
                                                                    requestId();
                                                            }}
                                                        >
                                                            <Trash2 aria-hidden="true" className="h-4 w-4" />
                                                        </button></div> }]} />
                        </DragScrollArea>
                        <div className="mt-2 flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 pt-2 text-sm dark:border-slate-700">
                            <span className="text-slate-500 dark:text-slate-400">Total apostado</span>
                            <strong className="whitespace-nowrap tabular-nums text-emerald-700 dark:text-emerald-400">
                                {money(lines.reduce((sum, line) => sum + (line.modality === group || (group === "pale" && line.modality === "super_pale") ? Math.round(Number(line.amount) * 100) : 0), 0), currency)}
                            </strong>
                        </div>
                    </section>
                ))}
            </div>
            </div>
            <div aria-hidden="true" className="shrink-0" style={{ height: footerHeight }} />
            <section
                ref={footerRef}
                aria-label="Acciones de venta"
                className="fixed bottom-0 left-14 right-0 z-30 flex flex-nowrap items-center justify-between gap-1 xl:gap-2 border-t border-slate-200 bg-white px-1 py-2 sm:px-2 xl:px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-lg dark:border-slate-700 dark:bg-slate-900"
            >
            <div aria-label="Opciones rápidas" className="flex min-w-0 flex-1 flex-nowrap items-center gap-0.5 self-center max-[720px]:gap-px xl:gap-1 [&>button]:h-8 [&>button]:shrink-0 [&>button]:whitespace-nowrap [&>button]:px-1 xl:[&>button]:px-2 [&>button]:py-1 [&>button]:text-[10px] xl:[&>button]:text-xs max-[720px]:[&>button]:px-px max-[720px]:[&>button]:text-[8.5px] [&_kbd]:inline max-[720px]:[&_kbd]:text-[7px]">
                <button type="button" className={secondary + " !border-red-500/40 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/60"} disabled={!lines.length || workspaceBusy || checkingPlay} onClick={() => setClearPlaysOpen(true)} aria-label="Limpiar jugadas F11" data-sale-shortcut="F11" aria-keyshortcuts="F11" title="Limpiar jugadas (F11)"><Eraser className="mr-1.5 hidden h-4 w-4 xl:inline" /><span>Limpiar</span><kbd className="ml-0.5 rounded border border-current/20 px-0.5 text-[8px] opacity-70 xl:ml-1 xl:px-1 xl:text-[10px]">F11</kbd></button>
                <button type="button" className={secondary + " !border-sky-500/40 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-900/60"} aria-label="Reimprimir F6" data-sale-shortcut="F6" aria-keyshortcuts="F6" title="Reimprimir (F6)" onClick={() => setReprintOpen(true)}><Printer className="mr-1.5 hidden h-4 w-4 xl:inline" /><span>Reimprimir</span> <kbd className="ml-0.5 rounded border border-current/20 px-0.5 text-[8px] opacity-70 xl:ml-1 xl:px-1 xl:text-[10px]">F6</kbd></button>
                <button className={secondary + " !border-indigo-500/40 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60"} disabled={busy} aria-label="Duplicar F4" data-sale-shortcut="F4" aria-keyshortcuts="F4" title="Duplicar (F4)" onClick={() => { setDuplicateMethod("number"); setDuplicateCode(""); setDuplicateReference(""); setDuplicateError(""); setDuplicateSource(null); setDuplicateTargets({}); setDuplicateOpen(true); }}>
                    <Copy aria-hidden="true" className="mr-1.5 hidden h-4 w-4 xl:inline" /><span>Duplicar</span> <kbd className="ml-0.5 rounded border border-current/20 px-0.5 text-[8px] opacity-70 xl:ml-1 xl:px-1 xl:text-[10px]">F4</kbd>
                </button>
                <button type="button" className={secondary + " !border-orange-500/40 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-950/40 dark:text-orange-300 dark:hover:bg-orange-900/60"} aria-label="Anular / Pagar F7" data-sale-shortcut="F7" aria-keyshortcuts="F7" title="Anular / Pagar (F7)" onClick={() => setTicketActionsOpen(true)}>
                    <Tickets aria-hidden="true" className="mr-1.5 hidden h-4 w-4 xl:inline" /><span>Anular / Pagar</span> <kbd className="ml-0.5 rounded border border-current/20 px-0.5 text-[8px] opacity-70 xl:ml-1 xl:px-1 xl:text-[10px]">F7</kbd>
                </button>
                <button type="button" className={secondary + " !border-amber-500/40 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/60"} aria-label="Ganadores F8" data-sale-shortcut="F8" aria-keyshortcuts="F8" title="Ganadores (F8)" onClick={() => setWinnersOpen(true)}>
                    <Trophy aria-hidden="true" className="mr-1.5 hidden h-4 w-4 xl:inline" /><span>Ganadores</span> <kbd className="ml-0.5 rounded border border-current/20 px-0.5 text-[8px] opacity-70 xl:ml-1 xl:px-1 xl:text-[10px]">F8</kbd>
                </button>
                <button className={secondary + " !border-violet-500/40 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/60"} disabled={busy} aria-label="Ligar números F9" data-sale-shortcut="F9" aria-keyshortcuts="F9" title="Ligar números (F9)" onClick={() => { setCombineError(""); setCombineAmount(amount); setChosenNumbers(allCombineNumbers); setCombinePreview(null); setCombineOpen(true); }}>
                    <Shuffle aria-hidden="true" className="mr-1.5 hidden h-4 w-4 xl:inline" /><span>Ligar</span> <kbd className="ml-0.5 rounded border border-current/20 px-0.5 text-[8px] opacity-70 xl:ml-1 xl:px-1 xl:text-[10px]">F9</kbd>
                </button>
                <button type="button" aria-label="Aleatorio" data-sale-shortcut="Alt+A" aria-keyshortcuts="Alt+A" title="Generar jugadas aleatorias (Alt+A)" className={secondary + " !border-cyan-500/40 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-300 dark:hover:bg-cyan-900/60"} disabled={workspaceBusy} onClick={() => setRandomOpen(true)}><Dice5 aria-hidden="true" className="mr-1.5 hidden h-4 w-4 xl:inline" /><span>Aleatorio</span><kbd className="ml-0.5 rounded border border-current/20 px-0.5 text-[8px] opacity-70 xl:ml-1 xl:px-1 xl:text-[10px]">Alt+A</kbd></button>
            </div>

                <div role="group" aria-label="Resumen de venta" className="ml-auto flex shrink-0 flex-nowrap items-center justify-end gap-1 self-stretch whitespace-nowrap rounded-lg border border-emerald-600/25 bg-emerald-50/60 px-1 py-1 xl:py-1.5 dark:bg-emerald-950/20 xl:gap-3 xl:px-3">
                    <span className="hidden text-xs text-slate-500 lg:inline dark:text-slate-400">{lines.length} {lines.length === 1 ? "jugada" : "jugadas"}</span>
                    {settings.discount_enabled && (
                        <label className="flex items-center gap-0.5 whitespace-nowrap text-[10px] xl:gap-1 xl:text-xs" title={`Apostado: ${money(gross, currency)}`}>
                            <input
                                type="checkbox"
                                disabled={busy}
                                data-sale-shortcut="F3"
                                aria-keyshortcuts="F3"
                                title="Aplicar descuento (F3)"
                                checked={discount}
                                onChange={(e) => {
                                    setDiscount(e.target.checked);
                                    requestKey.current = requestId();
                                }}
                            />
                            Dto. <span className="hidden xl:inline">{money(rebate, currency)}</span> <kbd className="rounded border px-0.5 text-[8px] xl:px-1 xl:text-[10px]">F3</kbd>
                        </label>
                    )}
                    <span className="flex items-baseline gap-1.5 lg:border-l lg:border-emerald-600/25 lg:pl-2" aria-label="Total a cobrar">
                        <span className="hidden text-xs font-medium text-slate-500 xl:inline">Total</span>
                        <strong className="whitespace-nowrap text-base font-bold tabular-nums lg:text-xl text-emerald-800 dark:text-emerald-300 xl:text-2xl">
                            {money(gross - rebate, currency)}
                        </strong>
                    </span>
                    <button
                        className={`${button} h-8 shrink-0 whitespace-nowrap !px-1.5 !py-1 !text-[10px] xl:h-9 xl:!px-3 xl:!py-1.5 xl:!text-xs`}
                        disabled={busy || !lines.length || !cashOpen}
                        data-sale-shortcut="F2" aria-keyshortcuts="F2" title="Vender (F2)" onClick={sell}
                    >
                        {busy ? <LoaderCircle aria-hidden="true" className="mr-2 inline h-4 w-4 animate-spin" /> : <ShoppingCart aria-hidden="true" className="mr-1.5 hidden h-4 w-4 xl:inline" />}{busy ? "Procesando…" : <>Vender <kbd className="ml-0.5 rounded border border-white/30 px-0.5 text-[8px] xl:ml-1 xl:px-1 xl:text-[10px]">F2</kbd></>}
                    </button>
                </div>
            </section>
        </Shell>
    );
}
