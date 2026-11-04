import ComboboxSelect from "@/Components/ComboboxSelect";
import { DataTable } from "@/Components/ui/data-table";
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';

import { confirmAction } from '@/lib/notify';

import { PageProps } from '@/types';

import { Head, Link, router } from '@inertiajs/react';

import { Edit, Plus, Search, ShieldCheck, Trash2, UserCog } from 'lucide-react';

import { FormEvent, useState, useEffect, useRef } from 'react';

import { BranchOfficeOption, RoleOption, ManagedUser } from './UserForm';

type PaginatedUsers = {

    data: ManagedUser[];

    links: { url: string | null; label: string; active: boolean }[];

    from: number | null;

    to: number | null;

    total: number;

};

type Props = PageProps<{

    users: PaginatedUsers;

    options: {

        roles: RoleOption[];

        branchOffices: BranchOfficeOption[];

    };

    filters: { search: string; role_id: string | number; branch_office_id: string | number };

}>;

export default function Index({ auth, users, options, filters }: Props) {

    const [search, setSearch] = useState(filters.search ?? '');

    const [roleId, setRoleId] = useState(String(filters.role_id ?? ''));

    const [branchOfficeId, setBranchOfficeId] = useState(String(filters.branch_office_id ?? ''));

    const permissions = new Set(auth.user.permissions ?? []);

    const canCreate = permissions.has('users.create');

    const canUpdate = permissions.has('users.update');

    const canDelete = permissions.has('users.delete');

    const canManage = canUpdate || canDelete;

    const filtersReady = useRef(false);

    const submit = (event: FormEvent) => {

        event.preventDefault();

        router.get(route('settings.users.index'), {

            search,

            role_id: roleId,

            branch_office_id: branchOfficeId,

        }, { preserveState: true, replace: true });

    };

    useEffect(() => {

        if (!filtersReady.current) {

            filtersReady.current = true;

            return;

        }

        const timeout = window.setTimeout(() => {

                    router.get(route('settings.users.index'), {

                        search,

                        role_id: roleId,

                        branch_office_id: branchOfficeId,

                    }, { preserveState: true, replace: true });

        }, 300);

        return () => window.clearTimeout(timeout);

    }, [search, roleId, branchOfficeId]);

    return (

        <AuthenticatedLayout user={auth.user} activeBranchOffice={auth.activeBranchOffice} header="Usuarios">

            <Head title="Usuarios" />

            <div className="space-y-5">

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                    <div>

                        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-950 dark:text-white">

                            <UserCog className="h-5 w-5 text-slate-500 dark:text-slate-400" />

                            Usuarios

                        </h1>

                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Crea usuarios, asigna roles y define las bancas donde pueden trabajar.</p>

                    </div>

                    {canCreate && (

                        <Link

                            href={route('settings.users.create')}

                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-800 dark:ring-1 dark:ring-slate-700"

                        >

                            <Plus className="h-4 w-4" />

                            Nuevo usuario

                        </Link>

                    )}

                </div>

                <form onSubmit={submit} className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 lg:grid-cols-[1fr_210px_250px_auto]">

                    <input

                        value={search}

                        onChange={(event) => setSearch(event.target.value)}

                        autoComplete="off"

                        placeholder="Buscar por nombre, correo, rol o banca"

                        className="min-h-10 rounded-md border-slate-300 bg-white text-sm shadow-sm focus:border-slate-500 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"

                    />

                    <ComboboxSelect

                        value={roleId}

                        onChange={(event) => setRoleId(event.target.value)}

                        className="min-h-10 rounded-md border-slate-300 bg-white text-sm shadow-sm focus:border-slate-500 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"

                    >

                        <option value="">Todos los roles</option>

                        {options.roles.map((role) => (

                            <option key={role.id} value={role.id}>{role.name}</option>

                        ))}

                    </ComboboxSelect>

                    <ComboboxSelect

                        value={branchOfficeId}

                        onChange={(event) => setBranchOfficeId(event.target.value)}

                        className="min-h-10 rounded-md border-slate-300 bg-white text-sm shadow-sm focus:border-slate-500 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"

                    >

                        <option value="">Todas las bancas</option>

                        {options.branchOffices.map((branchOffice) => (

                            <option key={branchOffice.id_hash} value={branchOffice.id}>

                                {branchOffice.name} ({branchOffice.code})

                            </option>

                        ))}

                    </ComboboxSelect>

                </form>

                <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">

                    <div className="overflow-x-auto">

                        <DataTable data={users.data} paginate={false} serverPage={users} onPageChange={url => router.get(url)} getRowId={row => String(row.id)} emptyMessage="No hay registros que coincidan con los filtros." columns={[
{ id: "column0", header: "Usuario", cell: ({ row: { original: managedUser } }: { row: { original: ManagedUser } }) => <><div className="flex items-center gap-3">

                                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">

                                                    <UserCog className="h-5 w-5 text-slate-400" />

                                                </span>

                                                <div>

                                                    <div className="font-medium text-slate-950 dark:text-white">{managedUser.name}</div>

                                                    <div className="text-xs text-slate-500 dark:text-slate-400">{managedUser.email}</div>

                                                </div>

                                            </div></> },
{ id: "column1", header: "Roles", cell: ({ row: { original: managedUser } }: { row: { original: ManagedUser } }) => <><div className="flex flex-wrap gap-1.5">

                                                {managedUser.roles.map((role) => (

                                                    <span key={role.id} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">

                                                        <ShieldCheck className="h-3 w-3" />

                                                        {role.name}

                                                    </span>

                                                ))}

                                            </div></> },
{ id: "column2", header: "Banca activa", cell: ({ row: { original: managedUser } }: { row: { original: ManagedUser } }) => <>{managedUser.active_branch_office_name ?? '-'}</> },
{ id: "column3", header: "Bancas", cell: ({ row: { original: managedUser } }: { row: { original: ManagedUser } }) => <><span className="font-semibold text-slate-950 dark:text-white">{managedUser.branch_offices.length}</span>

                                            <span className="text-slate-500 dark:text-slate-400"> asignada(s)</span></> },
...(canManage ? [{ id: "actions", header: "Acciones", cell: ({ row: { original: managedUser } }: { row: { original: ManagedUser } }) => <><div className="flex justify-end gap-2">

                                                    {canUpdate && (

                                                        <Link href={route('settings.users.edit', managedUser.id_hash)} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">

                                                            <Edit className="h-3.5 w-3.5" />

                                                            Editar

                                                        </Link>

                                                    )}

                                                    {canDelete && managedUser.id !== auth.user.id && (

                                                        <button

                                                            type="button"

                                                            onClick={() => {

                                                                confirmAction('Eliminar este usuario?', () => router.delete(route('settings.users.destroy', managedUser.id_hash)))

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
