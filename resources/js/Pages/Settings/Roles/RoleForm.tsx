import BackLink from '@/Components/BackLink';

import InputError from '@/Components/InputError';

import PrimaryButton from '@/Components/PrimaryButton';

import TextInput from '@/Components/TextInput';

import { Link, useForm } from '@inertiajs/react';

import { Check, Save, Search, ShieldCheck, X } from 'lucide-react';

import { FormEventHandler, useMemo, useState } from 'react';

export type PermissionOption = {

    id: number;

    id_hash: string;

    name: string;

    slug: string;

    description: string | null;

};

export type PermissionGroup = {

    module: string;

    label: string;

    permissions: PermissionOption[];

};

export type RoleRecord = {

    id: number;

    id_hash: string;

    name: string;

    slug: string;

    description: string | null;

    is_system: boolean;

    is_active: boolean;

    users_count: number;

    permissions_count: number;

    permission_ids?: number[];

    can_manage?: boolean;

};

type RoleFormData = {

    _method?: 'put';

    name: string;

    slug: string;

    description: string;

    is_active: boolean;

    permission_ids: number[];

};

type Props = {
    onSaved?: () => void;
    onCancel?: () => void;

    permissions: PermissionGroup[];

    submitLabel: string;

    cancelHref: string;

    onSubmitTo: string;

    method?: 'post' | 'put';

    initialValues?: Partial<RoleFormData> & { is_system?: boolean };

};

const slugify = (value: string) => value

    .toLowerCase()

    .normalize('NFD')

    .replace(/[\u0300-\u036f]/g, '')

    .replace(/[^a-z0-9_-]+/g, '-')

    .replace(/^-+|-+$/g, '');

export default function RoleForm({ permissions, submitLabel, onSaved, onCancel, cancelHref, onSubmitTo, method = 'post', initialValues }: Props) {

    const [permissionSearch, setPermissionSearch] = useState('');

    const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

    const isSystem = initialValues?.is_system ?? false;

    const { data, setData, post, processing, errors } = useForm<RoleFormData>({

        _method: method === 'put' ? 'put' : undefined,

        name: initialValues?.name ?? '',

        slug: initialValues?.slug ?? '',

        description: initialValues?.description ?? '',

        is_active: initialValues?.is_active ?? true,

        permission_ids: initialValues?.permission_ids ?? [],

    });

    const selectedPermissions = useMemo(() => new Set(data.permission_ids), [data.permission_ids]);

    const filteredGroups = useMemo(() => {

        const query = permissionSearch.trim().toLowerCase();

        if (!query) return permissions;

        return permissions

            .map((group) => ({

                ...group,

                permissions: group.permissions.filter((permission) => [

                    group.label,

                    permission.name,

                    permission.slug,

                ].some((value) => value.toLowerCase().includes(query))),

            }))

            .filter((group) => group.permissions.length > 0);

    }, [permissionSearch, permissions]);

    const togglePermission = (permissionId: number, checked: boolean) => {

        setData('permission_ids', checked

            ? Array.from(new Set([...data.permission_ids, permissionId]))

            : data.permission_ids.filter((id) => id !== permissionId));

    };

    const toggleGroup = (group: PermissionGroup) => {

        const allSelected = group.permissions.every((permission) => selectedPermissions.has(permission.id));

        const groupIds = group.permissions.map((permission) => permission.id);

        setData('permission_ids', allSelected

            ? data.permission_ids.filter((id) => !groupIds.includes(id))

            : Array.from(new Set([...data.permission_ids, ...groupIds])));

    };

    const submit: FormEventHandler = (event) => {

        event.preventDefault();

        const nextErrors: Record<string, string> = {};

        if (!data.name.trim()) nextErrors.name = 'El nombre del rol es obligatorio.';

        if (!data.slug.trim()) nextErrors.slug = 'El codigo del rol es obligatorio.';

        if (data.permission_ids.length === 0) nextErrors.permission_ids = 'Selecciona al menos un permiso.';

        setClientErrors(nextErrors);

        if (Object.keys(nextErrors).length > 0) return;

        post(onSubmitTo, { onSuccess: onSaved, preserveScroll: true });

    };

    return (

        <form onSubmit={submit} className="space-y-5">

            <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">

                <div className="grid gap-5 lg:grid-cols-3">

                    <div>

                        <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Nombre</label>

                        <TextInput

                            id="name"

                            value={data.name}

                            onChange={(event) => {

                                setData('name', event.target.value);

                                if (!isSystem && method === 'post') {

                                    setData('slug', slugify(event.target.value));

                                }

                            }}

                            className="mt-2 block min-h-10 w-full"

                            isFocused

                        />

                        <InputError message={clientErrors.name || errors.name} className="mt-2" />

                    </div>

                    <div>

                        <label htmlFor="slug" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Codigo</label>

                        <TextInput

                            id="slug"

                            value={data.slug}

                            onChange={(event) => setData('slug', slugify(event.target.value))}

                            disabled={isSystem}

                            className="mt-2 block min-h-10 w-full disabled:cursor-not-allowed disabled:opacity-60"

                        />

                        <InputError message={clientErrors.slug || errors.slug} className="mt-2" />

                    </div>

                    <label className="flex min-h-10 items-center gap-3 self-end rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">

                        <input

                            type="checkbox"

                            checked={data.is_active}

                            disabled={isSystem}

                            onChange={(event) => setData('is_active', event.target.checked)}

                            className="rounded border-slate-300 text-slate-950 shadow-sm focus:ring-slate-500 dark:border-slate-700"

                        />

                        Activo

                    </label>

                    <div className="lg:col-span-3">

                        <label htmlFor="description" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Descripcion</label>

                        <textarea

                            id="description"

                            value={data.description}

                            onChange={(event) => setData('description', event.target.value)}

                            rows={3}

                            className="mt-2 block w-full rounded-md border-slate-300 bg-white text-sm text-slate-950 shadow-sm focus:border-slate-500 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"

                        />

                        <InputError message={errors.description} className="mt-2" />

                    </div>

                </div>

            </section>

            <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">

                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">

                    <div>

                        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white"><ShieldCheck className="h-4 w-4 text-slate-500 dark:text-slate-400" />Permisos</h2>

                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">La tabla rol-permiso se actualiza con los permisos seleccionados aqui.</p>

                    </div>

                    <div className="relative w-full lg:w-80">

                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                        <input

                            value={permissionSearch}

                            onChange={(event) => setPermissionSearch(event.target.value)}

                            autoComplete="off"

                            placeholder="Buscar permiso"

                            className="min-h-10 w-full rounded-md border-slate-300 bg-white pl-9 text-sm shadow-sm focus:border-slate-500 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"

                        />

                    </div>

                </div>

                <div className="space-y-3">

                    {filteredGroups.map((group) => {

                        const selectedInGroup = group.permissions.filter((permission) => selectedPermissions.has(permission.id)).length;

                        const allSelected = selectedInGroup === group.permissions.length;

                        return (

                            <div key={group.module} className="rounded-md border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/60">

                                <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">

                                    <div>

                                        <div className="font-semibold text-slate-950 dark:text-white">{group.label}</div>

                                        <div className="text-xs text-slate-500 dark:text-slate-400">{selectedInGroup} de {group.permissions.length} permisos</div>

                                    </div>

                                    <button

                                        type="button"

                                        onClick={() => toggleGroup(group)}

                                        className="inline-flex min-h-8 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"

                                    >

                                        {allSelected && <Check className="h-3.5 w-3.5" />}

                                        {allSelected ? 'Quitar grupo' : 'Marcar grupo'}

                                    </button>

                                </div>

                                <div className="grid gap-2 p-4 md:grid-cols-2 xl:grid-cols-3">

                                    {group.permissions.map((permission) => (

                                        <label key={permission.id_hash} className="flex cursor-pointer gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">

                                            <input

                                                type="checkbox"

                                                checked={selectedPermissions.has(permission.id)}

                                                onChange={(event) => togglePermission(permission.id, event.target.checked)}

                                                className="mt-1 rounded border-slate-300 text-slate-950 shadow-sm focus:ring-slate-500 dark:border-slate-700"

                                            />

                                            <span className="min-w-0">

                                                <span className="block font-medium text-slate-950 dark:text-white">{permission.name}</span>

                                                <span className="mt-1 block break-all text-xs text-slate-500 dark:text-slate-400">{permission.slug}</span>

                                            </span>

                                        </label>

                                    ))}

                                </div>

                            </div>

                        );

                    })}

                </div>

                <InputError message={clientErrors.permission_ids || errors.permission_ids} className="mt-3" />

            </section>

            <div className="flex flex-col-reverse gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:justify-end">

                {onCancel ? <button type="button" onClick={onCancel} className="rounded-md border px-4 py-2">Cancelar</button> : <BackLink href={cancelHref} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"><X className="h-4 w-4" />Cancelar</BackLink>}

                <PrimaryButton disabled={processing} className="gap-2">

                    <Save className="h-4 w-4" />

                    {submitLabel}

                </PrimaryButton>

            </div>

        </form>

    );

}
