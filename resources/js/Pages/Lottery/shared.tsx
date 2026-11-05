import { PropsWithChildren } from "react";
import { Head, usePage } from "@inertiajs/react";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { PageProps } from "@/types";

export const modes = {
    quiniela: "Quiniela",
    pale: "Palé",
    tripleta: "Tripleta",
    super_pale: "Súper palé",
};
export type Draw = {
    id: number;
    name: string;
    lottery_id: number;
    lottery?: { name: string; active?: boolean };
    opens_at: string;
    closes_at: string;
    draws_at: string;
    weekdays: number[];
    modalities: string[];
    active: boolean;
    source_url?: string;
    source_key?: string;
    result_count?: number;
    exceptions?: Record<
        string,
        { closed: boolean; opens_at?: string; closes_at?: string }
    >;
};
export const input =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
export const button =
    "rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
export const secondary =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700";
export const panel =
    "rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
export const money = (minor: number, currency = "DOP") =>
    new Intl.NumberFormat("es-DO", { style: "currency", currency }).format(
        minor / 100,
    );
export const drawName = (d: Draw) => `${d.lottery?.name ?? ""} · ${d.name}`;
export function Field({
    label,
    children,
}: PropsWithChildren<{ label: string }>) {
    return (
        <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-600 dark:text-slate-300">
                {label}
            </span>
            {children}
        </label>
    );
}
export function Shell({
    title,
    fullWidth = false,
    compact = false,
    fixedViewport = false,
    showNavbar = false,
    children,
}: PropsWithChildren<{ title: string; fullWidth?: boolean; compact?: boolean; fixedViewport?: boolean; showNavbar?: boolean }>) {
    const { auth } = usePage<PageProps>().props;
    return (
        <AuthenticatedLayout user={auth.user} header={title} fixedViewport={fixedViewport} showNavbar={showNavbar}>
            <Head title={title} />
            <div className={`w-full ${fixedViewport ? "flex h-full min-h-0 flex-col gap-3 overflow-hidden" : compact ? "space-y-3" : "space-y-6"} ${fullWidth ? "" : "mx-auto max-w-7xl"}`}>
                {!fixedViewport && <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">
                        LotoEnlace
                    </p>
                    <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
                </div>}
                {children}
            </div>
        </AuthenticatedLayout>
    );
}
