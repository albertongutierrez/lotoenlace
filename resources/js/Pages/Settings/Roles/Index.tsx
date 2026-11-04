import ComboboxSelect from "@/Components/ComboboxSelect";
import { DataTable } from "@/Components/ui/data-table";
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';

import { confirmAction } from '@/lib/notify';

import { PageProps } from '@/types';

import { Head, Link, router } from '@inertiajs/react';

import { Edit, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react';

import { FormEvent, useState, useEffect, useRef } from 'react';

import { RoleRecord } from './RoleForm';

type PaginatedRoles = {

    data: RoleRecord[];

    links: { url: string | null; label: string; active: boolean }[];

    from: number | null;

    to: number | null;

    total: number;

};

type Props = PageProps<{

    roles: PaginatedRoles;

    filters: { search: string; status: string };

}>;

export default function Index({ auth, roles, filters }: Props) {

    const [search, setSearch] = useState(filters.search ?? '');

    const [status, setStatus] = useState(filters.status ?? '');

    const permissions = new Set(auth.user.permissions ?? []);

    const canManage = permissions.has('roles.manage');

    const filtersReady = useRef(false);

    const submit = (event: FormEvent) => {

        event.preventDefault();

        router.get(route('settings.roles.index'), { search, status }, { preserveState: true, replace: true });

    };

    useEffect(() => {

        if (!filtersReady.current) {

            filtersReady.current = true;

            return;

        }

        const timeout = window.setTimeout(() => {

                    router.get(route('settings.roles.index'), { search, status }, { preserveState: true, replace: true });

        }, 300);

        return () => window.clearTimeout(timeout);

    }, [search, status]);

    return (

        <AuthenticatedLayout user={auth.user} activeBranchOffice={auth.activeBranchOffice} header="Roles y permisos">

            <Head title="Roles y permisos" />

            <div className="space-y-5">

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                    <div>

                        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-950 dark:text-white">

                            <ShieldCheck className="h-5 w-5 text-slate-500 dark:text-slate-400" />

                            Roles y permisos

                        </h1>

                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Administra roles y su relacion con los permisos del sistema.</p>

                    </div>

                    {canManage && (

                        <Link

                            href={route('settings.roles.create')}

                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-800 dark:ring-1 dark:ring-slate-700"

                        >

                            <Plus className="h-4 w-4" />

                            Nuevo rol

                        </Link>

                    )}

                </div>

                <form onSubmit={submit} className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 md:grid-cols-[1fr_180px_auto]">

                    <input

                        value={search}

                        onChange={(event) => setSearch(event.target.value)}

                        autoComplete="off"

                        placeholder="Buscar por nombre, codigo o descripcion"

                        className="min-h-10 rounded-md border-slate-300 bg-white text-sm shadow-sm focus:border-slate-500 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"

                    />

                    <ComboboxSelect

                        value={status}

                        onChange={(event) => setStatus(event.target.value)}

                        className="min-h-10 rounded-md border-slate-300 bg-white text-sm shadow-sm focus:border-slate-500 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"

                    >

                        <option value="">Todos</option>

                        <option value="active">Activos</option>

                        <option value="inactive">Inactivos</option>

                    </ComboboxSelect>

                </form>

                <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">

                    <div className="overflow-x-auto">

                        <DataTable data={roles.data} paginate={false} serverPage={roles} onPageChange={url => router.get(url)} getRowId={row => String(row.id)} emptyMessage="No hay registros que coincidan con los filtros." columns={[
{ id: "column0", header: "Rol", cell: ({ row: { original: role } }: { row: { original: RoleRecord } }) => <><div className="flex items-center gap-3">

                                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">

                                                    <ShieldCheck className="h-5 w-5 text-slate-400" />

                                                </span>

                                                <div>

                                                    <div className="flex flex-wrap items-center gap-2 font-medium text-slate-950 dark:text-white">

                                                        {role.name}

                                                        {role.is_system && (

                                                            <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300">

                                                                Sistema

                                                            </span>

                                                        )}

                                                    </div>

                                                    <div className="text-xs text-slate-500 dark:text-slate-400">{role.slug}</div>

                                                </div>

                                            </div></> },
{ id: "column1", header: "Permisos", cell: ({ row: { original: role } }: { row: { original: RoleRecord } }) => <>{role.permissions_count}</> },
{ id: "column2", header: "Usuarios", cell: ({ row: { original: role } }: { row: { original: RoleRecord } }) => <>{role.users_count}</> },
{ id: "column3", header: "Estado", cell: ({ row: { original: role } }: { row: { original: RoleRecord } }) => <><span className={`rounded-md px-2 py-1 text-xs font-semibold ${role.is_active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>

                                                {role.is_active ? 'Activo' : 'Inactivo'}

                                            </span></> },
...(canManage ? [{ id: "actions", header: "Acciones", cell: ({ row: { original: role } }: { row: { original: RoleRecord } }) => <>{role.can_manage ? (

                                                    <div className="flex justify-end gap-2">

                                                        <Link href={route('settings.roles.edit', role.id_hash)} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">

                                                            <Edit className="h-3.5 w-3.5" />

                                                            Editar

                                                        </Link>

                                                        {!role.is_system && role.users_count === 0 && (

                                                            <button

                                                                type="button"

                                                                onClick={() => {

                                                                    confirmAction('Eliminar este rol?', () => router.delete(route('settings.roles.destroy', role.id_hash)))

                                                                }}

                                                                className="inline-flex min-h-9 items-center gap-2 rounded-md border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"

                                                            >

                                                                <Trash2 className="h-3.5 w-3.5" />

                                                                Eliminar

                                                            </button>

                                                        )}

                                                    </div>

                                                ) : (

                                                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Fijo del sistema</span>

                                                )}</> }] : [])
]} />

                    </div>



                </div>

            </div>

        </AuthenticatedLayout>

    );

}
