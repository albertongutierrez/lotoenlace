import ComboboxSelect from "@/Components/ComboboxSelect";
import BackLink from '@/Components/BackLink';

import InputError from '@/Components/InputError';

import PrimaryButton from '@/Components/PrimaryButton';

import TextInput from '@/Components/TextInput';

import { formatDominicanPhone } from '@/lib/formatters';

import { Link, useForm } from '@inertiajs/react';

import { Save, X } from 'lucide-react';

import { FormEventHandler } from 'react';

export type OfficeOption = {

    id: number;

    name: string;

};

export type BranchOfficeFormData = {

    _method?: 'put';

    office_id: string;

    name: string;

    code: string;

    phone: string;

    mobile_phone: string;

    email: string;

    address: string;

    is_main: boolean;

    is_active: boolean;

};

type Props = {
    onSaved?: () => void;
    onCancel?: () => void;

    offices: OfficeOption[];

    submitLabel: string;

    cancelHref: string;

    onSubmitTo: string;

    method?: 'post' | 'put';

    initialValues?: Partial<BranchOfficeFormData>;

};

export default function BranchOfficeForm({ offices, submitLabel, onSaved, onCancel, cancelHref, onSubmitTo, method = 'post', initialValues }: Props) {

    const { data, setData, post, processing, errors } = useForm<BranchOfficeFormData>({

        _method: method === 'put' ? 'put' : undefined,

        office_id: initialValues?.office_id ?? (offices[0]?.id ? String(offices[0].id) : ''),

        name: initialValues?.name ?? '',

        code: initialValues?.code ?? '',

        phone: formatDominicanPhone(initialValues?.phone ?? ''),

        mobile_phone: formatDominicanPhone(initialValues?.mobile_phone ?? ''),

        email: initialValues?.email ?? '',

        address: initialValues?.address ?? '',

        is_main: initialValues?.is_main ?? false,

        is_active: initialValues?.is_active ?? true,

    });

    const submit: FormEventHandler = (event) => {

        event.preventDefault();

        post(onSubmitTo, { onSuccess: onSaved, preserveScroll: true });

    };

    return (

        <form onSubmit={submit} className="space-y-6 rounded-md border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">

            <div className="grid gap-5 md:grid-cols-2">

                    <div>

                        <label htmlFor="office_id" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Consorcio</label>

                        <ComboboxSelect

                            id="office_id"

                            value={data.office_id}

                            onChange={(event) => setData('office_id', event.target.value)}

                            className="mt-2 block min-h-10 w-full rounded-md border-slate-300 bg-white text-sm text-slate-950 shadow-sm focus:border-slate-500 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"

                        >

                            {offices.length === 0 && <option value="">No hay consorcios activas</option>}

                            {offices.map((office) => (

                                <option key={office.id} value={office.id}>

                                    {office.name}

                                </option>

                            ))}

                        </ComboboxSelect>

                        <InputError message={errors.office_id} className="mt-2" />

                    </div>

                    <div>

                        <label htmlFor="code" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Codigo</label>

                        <TextInput id="code" value={data.code} onChange={(event) => setData('code', event.target.value.toUpperCase())} className="mt-2 block w-full uppercase" />

                        <InputError message={errors.code} className="mt-2" />

                    </div>

                    <div className="md:col-span-2">

                        <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Nombre de la banca</label>

                        <TextInput id="name" value={data.name} onChange={(event) => setData('name', event.target.value)} className="mt-2 block w-full" isFocused />

                        <InputError message={errors.name} className="mt-2" />

                    </div>

                    <div>

                        <label htmlFor="phone" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Telefono</label>

                        <TextInput id="phone" inputMode="tel" value={data.phone} onChange={(event) => setData('phone', formatDominicanPhone(event.target.value))} className="mt-2 block w-full" />

                        <InputError message={errors.phone} className="mt-2" />

                    </div>

                    <div>

                        <label htmlFor="mobile_phone" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Celular</label>

                        <TextInput id="mobile_phone" inputMode="tel" value={data.mobile_phone} onChange={(event) => setData('mobile_phone', formatDominicanPhone(event.target.value))} className="mt-2 block w-full" />

                        <InputError message={errors.mobile_phone} className="mt-2" />

                    </div>

                    <div>

                        <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Correo</label>

                        <TextInput id="email" type="text" inputMode="email" value={data.email} onChange={(event) => setData('email', event.target.value)} className="mt-2 block w-full" />

                        <InputError message={errors.email} className="mt-2" />

                    </div>

                    <div className="md:col-span-2">

                        <label htmlFor="address" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Direccion</label>

                        <textarea

                            id="address"

                            value={data.address}

                            onChange={(event) => setData('address', event.target.value)}

                            rows={3}

                            className="mt-2 block w-full rounded-md border-slate-300 bg-white text-sm text-slate-950 shadow-sm focus:border-slate-500 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"

                        />

                        <InputError message={errors.address} className="mt-2" />

                    </div>

                    <label className="flex min-h-10 items-center gap-3 rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">

                        <input type="checkbox" checked={data.is_main} onChange={(event) => setData('is_main', event.target.checked)} className="rounded border-slate-300 text-slate-950 shadow-sm focus:ring-slate-500 dark:border-slate-700" />

                        Principal

                    </label>

                    <label className="flex min-h-10 items-center gap-3 rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">

                        <input type="checkbox" checked={data.is_active} onChange={(event) => setData('is_active', event.target.checked)} className="rounded border-slate-300 text-slate-950 shadow-sm focus:ring-slate-500 dark:border-slate-700" />

                        Activa

                    </label>

            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 dark:border-slate-800 sm:flex-row sm:justify-end">

                {onCancel ? <button type="button" onClick={onCancel} className="rounded-md border px-4 py-2">Cancelar</button> : <BackLink href={cancelHref} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"><X className="h-4 w-4" />Cancelar</BackLink>}

                <PrimaryButton disabled={processing || offices.length === 0} className="gap-2">

                    <Save className="h-4 w-4" />

                    {submitLabel}

                </PrimaryButton>

            </div>

        </form>

    );

}
