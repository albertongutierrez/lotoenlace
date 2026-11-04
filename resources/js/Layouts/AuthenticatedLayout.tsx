import ComboboxSelect from "@/Components/ComboboxSelect";
import { Menu as ProfileMenu } from "@headlessui/react";
import NavigationLoading from "@/Components/NavigationLoading";
import { PropsWithChildren, ReactNode, useEffect, useState } from "react";

import { Link, router, usePage } from "@inertiajs/react";

import {
    ChevronsUpDown,
    Building2,
    BarChart3,
    Wallet,
    Home,
    Layers3,
    LogOut,
    Menu,
    ShieldCheck,
    Store,
    UserCircle,
    Users,
    X,
} from "lucide-react";

import ThemeToggle from "@/Components/ThemeToggle";

import { notify } from "@/lib/notify";

import { BranchOfficeSummary, PageProps, User } from "@/types";

export default function AuthenticatedLayout({
    children,
    header,
    fixedViewport = false,
    showNavbar = false,
}: PropsWithChildren<{
    user: User;
    activeBranchOffice?: BranchOfficeSummary | null;
    header?: ReactNode;
    fixedViewport?: boolean;
    showNavbar?: boolean;
}>) {
    const { props, url } = usePage<PageProps>();

    const { auth, appName, flash, errors } = props;

    const [open, setOpen] = useState(false);

    const [switching, setSwitching] = useState(false);

    const can = (permission: string) =>
        auth.user.is_super_admin || auth.user.permissions?.includes(permission);

    useEffect(() => {
        if (flash?.success) notify(flash.success, "success");
    }, [flash]);

    useEffect(() => {
        if (Object.keys(errors).length) notify(Object.values(errors).join(" "));
    }, [errors]);

    useEffect(() => {
        setOpen(false);
    }, [url]);

    useEffect(() => {
        const close = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };

        window.addEventListener("keydown", close);
        return () => window.removeEventListener("keydown", close);
    }, []);

    const entries = [
        { label: "Reportes", name: "lottery.reports", path: "/lottery/reports", icon: BarChart3, visible: !!auth.activeBranchOffice && (auth.user.is_super_admin || auth.user.permissions?.some(p => p.startsWith("reports.") && p !== "reports.cash")) },
        { label: auth.activeBranchOffice?.reconciliation_mode === "report" ? "Historial de cajas" : "Cajas", name: "lottery.cash", path: "/lottery/cash", icon: Wallet, visible: !!auth.activeBranchOffice && can("lottery.cash") },
        {
            label: "Venta",
            name: "lottery.sales",
            path: "/lottery/sales",
            icon: Store,
            visible: !!auth.activeBranchOffice && can("lottery.sell"),
        },

        {
            label: "Tickets y ganadores",
            name: "lottery.tickets",
            path: "/lottery/tickets",
            icon: Layers3,
            visible: !!auth.activeBranchOffice && can("lottery.tickets"),
        },

        {
            label: "Configuración del consorcio",
            name: "lottery.settings",
            path: "/lottery/settings",
            icon: Building2,
            visible: !auth.user.is_super_admin && !!auth.activeBranchOffice && can("lottery.settings"),
        },

        {
            label: "Bloqueos y límites",
            name: "lottery.limits",
            path: "/lottery/limits",
            icon: ShieldCheck,
            visible: !!auth.activeBranchOffice && can("lottery.limits"),
        },

        {
            label: "Loterías y sorteos",
            name: "lottery.catalog",
            path: "/lottery/catalog",
            icon: Layers3,
            visible: auth.user.is_super_admin,
        },

        {
            label: "Resultados",
            name: "lottery.results",
            path: "/lottery/results",
            icon: Layers3,
            visible: auth.user.is_super_admin,
        },

        {
            label: "Panel",
            name: "dashboard",
            path: "/dashboard",
            icon: Home,
            visible: true,
        },

        {
            label: "Consorcios",
            name: "settings.offices.index",
            path: "/settings/offices",
            icon: Building2,
            visible: auth.user.is_super_admin,
        },

        {
            label: "Usuarios",
            name: "settings.users.index",
            path: "/settings/users",
            icon: Users,
            visible: !!auth.user.is_super_admin && can("users.view"),
        },

        {
            label: "Roles y permisos",
            name: "settings.roles.index",
            path: "/settings/roles",
            icon: ShieldCheck,
            visible: !!auth.user.is_super_admin && can("roles.view"),
        },
    ];

    const directLinks = ["dashboard", "lottery.sales", "lottery.cash", "lottery.reports", "lottery.tickets", "lottery.catalog", "lottery.results", "settings.offices.index", "lottery.settings", "lottery.limits", "settings.users.index", "settings.roles.index"];
    const pathname = url.split("?")[0];
    const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`) ||
        ((path === "/lottery/settings" || (auth.user.is_super_admin && path === "/settings/offices")) && pathname.startsWith("/lottery/consortium/"));

    return (
        <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
            {open && (
                <button
                    aria-label="Cerrar menú al hacer clic fuera"
                    onClick={() => setOpen(false)}
                    className={`fixed inset-0 z-30 bg-black/50 ${fixedViewport ? "" : "lg:hidden"}`}
                />
            )}

            <aside
                className={`${open ? "flex" : "hidden"} fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${fixedViewport ? "" : "lg:flex"}`}
            >
                <div className="flex min-h-16 shrink-0 items-center gap-3 border-b border-slate-200 px-5 dark:border-slate-800">
                    {auth.activeBranchOffice?.office_compact_logo_url ? (
                        <img
                            src={
                                auth.activeBranchOffice.office_compact_logo_url
                            }
                            alt="Logo"
                            className="h-8 w-8 object-contain"
                        />
                    ) : (
                        <img
                            src="/images/lotoenlace.png"
                            alt="LotoEnlace"
                            className="h-10 w-44 rounded bg-white p-1.5 object-contain"
                        />
                    )}

                    {auth.activeBranchOffice?.office_compact_logo_url && (
                        <span className="min-w-0 break-words font-semibold">
                            {appName}
                        </span>
                    )}

                    <button
                        type="button"
                        title={fixedViewport ? "Minimizar menú" : "Cerrar menú"}
                        aria-label={fixedViewport ? "Minimizar menú" : "Cerrar menú"}
                        onClick={() => setOpen(false)}
                        className={`ml-auto shrink-0 rounded-md p-2 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 dark:hover:bg-slate-800 ${fixedViewport ? "" : "lg:hidden"}`}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {auth.availableBranchOffices.length > 1 && <div className="shrink-0 p-4">
                    <label
                        htmlFor="branch-switcher"
                        className="mb-2 block text-xs font-semibold uppercase text-slate-500"
                    >
                        Consorcio / banca
                    </label>

                    <ComboboxSelect
                        id="branch-switcher"
                        className="w-full rounded-md border-slate-300 bg-white text-sm dark:border-slate-700 dark:bg-slate-950"
                        value={auth.activeBranchOffice?.id_hash ?? ""}
                        disabled={
                            switching || !auth.availableBranchOffices.length
                        }
                        onChange={(event) => {
                            setSwitching(true);

                            router.patch(
                                route("settings.active-branch-office.update"),
                                { branch_office: event.target.value },
                                {
                                    preserveState: false,
                                    onFinish: () => setSwitching(false),
                                },
                            );
                        }}
                    >
                        {!auth.activeBranchOffice && (
                            <option value="">Sin banca</option>
                        )}

                        {auth.availableBranchOffices.map((branch) => (
                            <option key={branch.id_hash} value={branch.id_hash}>
                                {branch.office_name} / {branch.name}
                            </option>
                        ))}
                    </ComboboxSelect>
                </div>}

                <nav
                    data-navigation-menu
                    aria-label="Navegación principal"
                    className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4"
                >
                    {directLinks.flatMap(name => entries.filter(entry => entry.name === name && entry.visible)).map(({ name, label, path, icon: Icon }) => (
                        <Link
                            key={name}
                            href={route(name)}
                            aria-current={isActive(path) ? "page" : undefined}
                            className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm ${isActive(path) ? "bg-emerald-50 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                        >
                            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                            {label}
                        </Link>
                    ))}
                </nav>

                <div className="shrink-0 border-t border-slate-200 p-2 dark:border-slate-800">
                    <ProfileMenu as="div" className="relative">
                        <ProfileMenu.Button className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-slate-200 p-2 text-left text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
                            <UserCircle className="h-7 w-7 shrink-0" />
                            <span className="min-w-0 flex-1 truncate font-medium">{auth.user.name}</span>
                            <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-500" />
                        </ProfileMenu.Button>
                        <ProfileMenu.Items className="absolute bottom-full left-0 z-50 mb-2 w-full rounded-lg border border-slate-200 bg-white p-1 shadow-xl focus:outline-none dark:border-slate-700 dark:bg-slate-900">
                            <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-700"><p className="truncate text-sm font-semibold">{auth.user.name}</p><p className="truncate text-xs text-slate-500">{auth.user.email}</p></div>
                            <ProfileMenu.Item>{({ active }) => <Link href={route("profile.edit")} className={`flex items-center gap-2 rounded px-3 py-2 text-sm ${active ? "bg-slate-100 dark:bg-slate-800" : ""}`}><UserCircle className="h-4 w-4" />Perfil</Link>}</ProfileMenu.Item>
                            <ProfileMenu.Item>{({ active }) => <Link href={route("logout")} method="post" as="button" className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm ${active ? "bg-slate-100 dark:bg-slate-800" : ""}`}><LogOut className="h-4 w-4" />Cerrar sesión</Link>}</ProfileMenu.Item>
                        </ProfileMenu.Items>
                    </ProfileMenu>
                </div>
            </aside>

            <div className={`min-w-0 ${fixedViewport ? "flex h-dvh flex-col overflow-hidden pl-14" : "lg:pl-64"}`}>
                <header className={`${fixedViewport && !showNavbar ? "hidden" : "flex"} min-h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900 sm:px-8`}>
                    <button
                        title="Abrir menú"
                        onClick={() => setOpen(true)}
                        className={`rounded-md border border-slate-300 p-2 dark:border-slate-700 ${fixedViewport ? "hidden" : "lg:hidden"}`}
                    >
                        <Menu className="h-5 w-5" />
                    </button>

                    <div className="min-w-0 flex-1 break-words text-sm font-semibold">
                        {header || "Inicio"}
                    </div>
                    <ThemeToggle />
                </header>

                {fixedViewport && <div className="fixed inset-y-0 left-0 z-20 flex w-14 flex-col items-center border-r border-slate-200 bg-white py-4 dark:border-slate-800 dark:bg-slate-900"><button title="Abrir menú" aria-label="Abrir menú" aria-expanded={open} onClick={() => setOpen(value => !value)} className="rounded-lg border border-slate-300 p-2 dark:border-slate-700"><Menu className="h-5 w-5" /></button></div>}
                <main className={fixedViewport ? "relative min-h-0 min-w-0 flex-1 overflow-hidden p-3 sm:p-4" : "relative min-w-0 p-4 sm:p-8"}>{children}<NavigationLoading /></main>
            </div>
        </div>
    );
}
