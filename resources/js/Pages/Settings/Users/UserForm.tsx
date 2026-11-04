import BackLink from '@/Components/BackLink';

import InputError from '@/Components/InputError';

import PrimaryButton from '@/Components/PrimaryButton';

import TextInput from '@/Components/TextInput';

import { Link, useForm } from '@inertiajs/react';

import { Check, MapPin, Save, Search, ShieldCheck, X } from 'lucide-react';

import { FormEventHandler, useMemo, useState } from 'react';

export type RoleOption = {

    id: number;

    name: string;

    slug: string;

    description: string | null;

};

export type BranchOfficeOption = {

    id: number;

    id_hash: string;

    name: string;

    code: string;

    office_name: string | null;

};

export type UserFormOptions = {

    roles: RoleOption[];

    branchOffices: BranchOfficeOption[];

};

export type ManagedUser = {

    id: number;

    id_hash: string;

    name: string;

    email: string;

    active_branch_office_id: number | null;

    active_branch_office_name: string | null;

    roles: { id: number; name: string; slug: string }[];

    branch_offices: { id: number; name: string; code: string }[];

};

type UserFormData = {

    _method?: 'put';

    name: string;

    email: string;

    password: string;

    role_ids: number[];

    branch_office_ids: number[];

    default_branch_office_id: string;

};

type Props = {
    onSaved?: () => void;
    onCancel?: () => void;

    options: UserFormOptions;

    submitLabel: string;

    cancelHref: string;

    onSubmitTo: string;

    method?: 'post' | 'put';

    initialValues?: Partial<UserFormData>;

    passwordOptional?: boolean;

};

const emailIsValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export default function UserForm({ options, submitLabel, onSaved, onCancel, cancelHref, onSubmitTo, method = 'post', initialValues, passwordOptional = false }: Props) {

    const [branchSearch, setBranchSearch] = useState('');

    const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

    const { data, setData, post, processing, errors } = useForm<UserFormData>({

        _method: method === 'put' ? 'put' : undefined,

        name: initialValues?.name ?? '',

        email: initialValues?.email ?? '',

        password: '',

        role_ids: initialValues?.role_ids ?? [],

        branch_office_ids: initialValues?.branch_office_ids ?? [],

        default_branch_office_id: initialValues?.default_branch_office_id ?? '',

    });

    const selectedBranches = useMemo(() => new Set(data.branch_office_ids), [data.branch_office_ids]);

    const selectedRoles = useMemo(() => new Set(data.role_ids), [data.role_ids]);

    const filteredBranchOffices = useMemo(() => {

        const query = branchSearch.trim().toLowerCase();

        if (!query) return options.branchOffices;

        return options.branchOffices.filter((branchOffice) => [

            branchOffice.name,

            branchOffice.code,

            branchOffice.office_name ?? '',

        ].some((value) => value.toLowerCase().includes(query)));

    }, [branchSearch, options.branchOffices]);

    const toggleRole = (roleId: number, checked: boolean) => {

        setData('role_ids', checked

            ? Array.from(new Set([...data.role_ids, roleId]))

            : data.role_ids.filter((id) => id !== roleId));

    };

    const toggleBranchOffice = (branchOfficeId: number, checked: boolean) => {

        const nextBranches = checked

            ? Array.from(new Set([...data.branch_office_ids, branchOfficeId]))

            : data.branch_office_ids.filter((id) => id !== branchOfficeId);

        setData('branch_office_ids', nextBranches);

        if (checked && !data.default_branch_office_id) {

            setData('default_branch_office_id', String(branchOfficeId));

            return;

        }

        if (!checked && data.default_branch_office_id === String(branchOfficeId)) {

            setData('default_branch_office_id', nextBranches[0] ? String(nextBranches[0]) : '');

        }

    };

    const submit: FormEventHandler = (event) => {

        event.preventDefault();

        const nextErrors: Record<string, string> = {};

        if (!data.name.trim()) nextErrors.name = 'El nombre del usuario es obligatorio.';

        if (!emailIsValid(data.email)) nextErrors.email = 'El correo no tiene un formato valido.';

        if (!passwordOptional && data.password.trim().length < 5) nextErrors.password = 'La contrasena debe tener al menos 5 caracteres.';

        if (passwordOptional && data.password.trim() && data.password.trim().length < 5) nextErrors.password = 'La contrasena debe tener al menos 5 caracteres.';

        if (data.role_ids.length === 0) nextErrors.role_ids = 'Selecciona al menos un rol.';

        if (data.branch_office_ids.length === 0) nextErrors.branch_office_ids = 'Selecciona al menos una banca.';

        if (!data.default_branch_office_id) nextErrors.default_branch_office_id = 'Selecciona la banca predeterminada.';

        setClientErrors(nextErrors);

        if (Object.keys(nextErrors).length > 0) return;

        post(onSubmitTo, { onSuccess: onSaved, preserveScroll: true });

    };

    return (

        <form onSubmit={submit} className="space-y-5">

            <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">

                <div className="grid gap-5 lg:grid-cols-3">

                    <div className="lg:col-span-2">

                        <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Nombre</label>

                        <TextInput

                            id="name"

                            value={data.name}

                            onChange={(event) => setData('name', event.target.value)}

                            className="mt-2 block min-h-10 w-full"

                            isFocused

                        />

                        <InputError message={clientErrors.name || errors.name} className="mt-2" />

                    </div>

                    <div>

                        <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Correo</label>

                        <TextInput

                            id="email"

                            type="text"

                            inputMode="email"

                            value={data.email}

                            onChange={(event) => setData('email', event.target.value.trim().toLowerCase())}

                            className="mt-2 block min-h-10 w-full"

                        />

                        <InputError message={clientErrors.email || errors.email} className="mt-2" />

                    </div>

                    <div>

                        <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Contrasena</label>

                        <TextInput

                            id="password"

                            type="password"

                            value={data.password}

                            onChange={(event) => setData('password', event.target.value)}

                            className="mt-2 block min-h-10 w-full"

                        />

                        {passwordOptional && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Dejala vacia para conservar la contrasena actual.</p>}

                        <InputError message={clientErrors.password || errors.password} className="mt-2" />

                    </div>

                </div>

            </section>

            <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">

                <div className="mb-4">

                    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white"><ShieldCheck className="h-4 w-4 text-slate-500 dark:text-slate-400" />Roles y permisos generales</h2>

                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Los roles definen que modulos y acciones puede usar el usuario.</p>

                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">

                    {options.roles.map((role) => (

                        <label

                            key={role.id}

                            className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 transition ${selectedRoles.has(role.id) ? 'border-slate-950 bg-slate-50 dark:border-slate-500 dark:bg-slate-800' : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700'}`}

                        >

                            <input

                                type="checkbox"

                                checked={selectedRoles.has(role.id)}

                                onChange={(event) => toggleRole(role.id, event.target.checked)}

                                className="mt-1 rounded border-slate-300 text-slate-950 shadow-sm focus:ring-slate-500 dark:border-slate-700"

                            />

                            <span className="min-w-0">

                                <span className="block font-medium text-slate-950 dark:text-white">{role.name}</span>

                                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{role.description ?? role.slug}</span>

                            </span>

                        </label>

                    ))}

                </div>

                <InputError message={clientErrors.role_ids || errors.role_ids} className="mt-3" />

            </section>

            <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">

                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">

                    <div>

                        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white"><MapPin className="h-4 w-4 text-slate-500 dark:text-slate-400" />Bancas permitidas</h2>

                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Aqui decides en que bancas puede trabajar y cual abre por defecto.</p>

                    </div>

                    <div className="relative w-full lg:w-80">

                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                        <input

                            value={branchSearch}

                            onChange={(event) => setBranchSearch(event.target.value)}

                            autoComplete="off"

                            placeholder="Buscar banca"

                            className="min-h-10 w-full rounded-md border-slate-300 bg-white pl-9 text-sm shadow-sm focus:border-slate-500 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"

                        />

                    </div>

                </div>

                <div className="grid max-h-[360px] gap-3 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">

                    {filteredBranchOffices.map((branchOffice) => {

                        const checked = selectedBranches.has(branchOffice.id);

                        const isDefault = data.default_branch_office_id === String(branchOffice.id);

                        return (

                            <div

                                key={branchOffice.id_hash}

                                className={`rounded-md border p-4 transition ${checked ? 'border-slate-950 bg-slate-50 dark:border-slate-500 dark:bg-slate-800' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950'}`}

                            >

                                <label className="flex cursor-pointer items-start gap-3">

                                    <input

                                        type="checkbox"

                                        checked={checked}

                                        onChange={(event) => toggleBranchOffice(branchOffice.id, event.target.checked)}

                                        className="mt-1 rounded border-slate-300 text-slate-950 shadow-sm focus:ring-slate-500 dark:border-slate-700"

                                    />

                                    <span className="min-w-0">

                                        <span className="block font-medium text-slate-950 dark:text-white">{branchOffice.name}</span>

                                        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">

                                            {branchOffice.code} {branchOffice.office_name ? `- ${branchOffice.office_name}` : ''}

                                        </span>

                                    </span>

                                </label>

                                <button

                                    type="button"

                                    disabled={!checked}

                                    onClick={() => setData('default_branch_office_id', String(branchOffice.id))}

                                    className={`mt-3 inline-flex min-h-8 items-center gap-2 rounded-md px-3 text-xs font-semibold transition ${isDefault ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-700'}`}

                                >

                                    {isDefault && <Check className="h-3.5 w-3.5" />}

                                    {isDefault ? 'Predeterminada' : 'Marcar predeterminada'}

                                </button>

                            </div>

                        );

                    })}

                </div>

                {filteredBranchOffices.length === 0 && (

                    <div className="rounded-md border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">

                        No hay bancas con esa busqueda.

                    </div>

                )}

                <InputError message={clientErrors.branch_office_ids || errors.branch_office_ids} className="mt-3" />

                <InputError message={clientErrors.default_branch_office_id || errors.default_branch_office_id} className="mt-2" />

            </section>

            <div className="flex flex-col-reverse gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:justify-end">

                {onCancel ? <button type="button" onClick={onCancel} className="rounded-md border px-4 py-2">Cancelar</button> : <BackLink href={cancelHref} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"><X className="h-4 w-4" />Cancelar</BackLink>}

                <PrimaryButton disabled={processing || options.roles.length === 0 || options.branchOffices.length === 0} className="gap-2">

                    <Save className="h-4 w-4" />

                    {submitLabel}

                </PrimaryButton>

            </div>

        </form>

    );

}
