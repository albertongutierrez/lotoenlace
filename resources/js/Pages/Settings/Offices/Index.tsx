import { DataTable } from "@/Components/ui/data-table";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";

import { confirmAction } from "@/lib/notify";

import { PageProps } from "@/types";

import { Head, Link, router } from "@inertiajs/react";

import { Building2, Edit, Plus, Search, Trash2 } from "lucide-react";

import { FormEvent, useState, useEffect, useRef } from "react";

type Office = {
    id: number;

    id_hash: string;

    name: string;

    slogan: string | null;

    tax_id: string | null;

    logo_url: string | null;

    effective_compact_logo_url: string | null;

    branch_offices_count: number | null;
};

type PaginatedOffices = {
    data: Office[];

    links: { url: string | null; label: string; active: boolean }[];

    from: number | null;

    to: number | null;

    total: number;
};

type Props = PageProps<{
    offices: PaginatedOffices;

    filters: { search: string };
}>;

export default function Index({ auth, offices, filters }: Props) {
    const [search, setSearch] = useState(filters.search ?? "");

    const permissions = new Set(auth.user.permissions ?? []);

    const canCreate = permissions.has("settings.offices.create");

    const canUpdate = permissions.has("settings.offices.update");

    const canDelete = permissions.has("settings.offices.delete");

    const canManage = canUpdate || canDelete;

    const filtersReady = useRef(false);

    const submit = (event: FormEvent) => {
        event.preventDefault();

        router.get(
            route("settings.offices.index"),
            { search },
            { preserveState: true, replace: true },
        );
    };

    useEffect(() => {
        if (!filtersReady.current) {
            filtersReady.current = true;

            return;
        }

        const timeout = window.setTimeout(() => {
            router.get(
                route("settings.offices.index"),
                { search },
                { preserveState: true, replace: true },
            );
        }, 300);

        return () => window.clearTimeout(timeout);
    }, [search]);

    return (
        <AuthenticatedLayout
            user={auth.user}
            activeBranchOffice={auth.activeBranchOffice}
            header="Consorcios"
        >
            <Head title="Consorcios" />

            <div className="space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-950 dark:text-white">
                            <Building2 className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                            Consorcios
                        </h1>

                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Administra nombre, slogan, documento fiscal y logo
                            de cada consorcio.
                        </p>
                    </div>

                    {canCreate && (
                        <Link
                            href={route("settings.offices.create")}

                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-800 dark:ring-1 dark:ring-slate-700"
                        >
                            <Plus className="h-4 w-4" />
                            Nueva consorcio
                        </Link>
                    )}
                </div>

                <form
                    onSubmit={submit}
                    className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 md:grid-cols-[1fr_auto]"
                >
                    <input
                        value={search}

                        onChange={(event) => setSearch(event.target.value)}

                        autoComplete="off"

                        placeholder="Buscar por nombre, slogan o RNC/Cedula"

                        className="min-h-10 rounded-md border-slate-300 bg-white text-sm shadow-sm focus:border-slate-500 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                </form>

                <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="overflow-x-auto">
                        <DataTable data={offices.data} paginate={false} serverPage={offices} onPageChange={url => router.get(url)} getRowId={row => String(row.id)} emptyMessage="No hay registros que coincidan con los filtros." columns={[
{ id: "column0", header: "Consorcio", cell: ({ row: { original: office } }: { row: { original: Office } }) => <><div className="flex items-center gap-3">
                                                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
                                                    {office.logo_url ? (
                                                        <img
                                                            src={
                                                                office.logo_url
                                                            }
                                                            alt={office.name}
                                                            className="h-full w-full object-contain p-1"
                                                        />
                                                    ) : (
                                                        <Building2 className="h-5 w-5 text-slate-400" />
                                                    )}
                                                </span>

                                                <div>
                                                    <div className="font-medium text-slate-950 dark:text-white">
                                                        {office.name}
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                                        <span>
                                                            {office.slogan ??
                                                                "Sin slogan"}
                                                        </span>

                                                        {office.effective_compact_logo_url && (
                                                            <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                                                                <img
                                                                    src={
                                                                        office.effective_compact_logo_url
                                                                    }
                                                                    alt={`${office.name} compacto`}
                                                                    className="h-full w-full object-contain p-0.5"
                                                                />
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div></> },
{ id: "column1", header: "RNC / Cedula", cell: ({ row: { original: office } }: { row: { original: Office } }) => <>{office.tax_id ?? "-"}</> },
{ id: "column2", header: "Bancas", cell: ({ row: { original: office } }: { row: { original: Office } }) => <>{office.branch_offices_count ?? 0}</> },
...(canManage ? [{ id: "actions", header: "Acciones", cell: ({ row: { original: office } }: { row: { original: Office } }) => <><div className="flex justify-end gap-2">
                                                    {canUpdate && (
                                                        <>

                                                            <Link
                                                                href={route(
                                                                    "lottery.settings.consortium",
                                                                    office.id_hash,
                                                                )}
                                                                className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                                            >
                                                                <Edit className="h-3.5 w-3.5" />
                                                                Administrar
                                                            </Link>
                                                        </>
                                                    )}

                                                    {canDelete && (
                                                        <button
                                                            type="button"

                                                            onClick={() => {
                                                                confirmAction(
                                                                    "Eliminar esta consorcio?",
                                                                    () =>
                                                                        router.delete(
                                                                            route(
                                                                                "settings.offices.destroy",
                                                                                office.id_hash,
                                                                            ),
                                                                        ),
                                                                );
                                                            }}

                                                            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                            Eliminar
                                                        </button>
                                                    )}
                                                </div></> }] : [])
]} />
                    </div>


                </div>
            </div>
        </AuthenticatedLayout>
    );
}
