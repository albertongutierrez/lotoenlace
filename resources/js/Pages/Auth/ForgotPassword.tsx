import GuestLayout from '@/Layouts/GuestLayout';

import InputError from '@/Components/InputError';

import InputLabel from '@/Components/InputLabel';

import PrimaryButton from '@/Components/PrimaryButton';

import TextInput from '@/Components/TextInput';

import { Head, Link, useForm } from '@inertiajs/react';

import { ArrowLeft, Mail, Send } from 'lucide-react';

import { FormEventHandler } from 'react';

export default function ForgotPassword({ status }: { status?: string }) {

    const { data, setData, post, processing, errors } = useForm({

        email: '',

    });

    const submit: FormEventHandler = (e) => {

        e.preventDefault();

        post(route('password.email'));

    };

    return (

        <GuestLayout>

            <Head title="Restablecer contraseña" />

            <div className="mb-6">

                <h2 className="text-xl font-semibold text-slate-950 dark:text-white">Restablecer contraseña</h2>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">

                    Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.

                </p>

            </div>

            {status && <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">{status}</div>}

            <form onSubmit={submit}>

                <InputLabel htmlFor="email" value="Correo electronico" />

                <div className="relative mt-1">

                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />

                    <TextInput

                        id="email"

                        type="email"

                        name="email"

                        value={data.email}

                        className="block w-full pl-10"

                        isFocused={true}

                        onChange={(e) => setData('email', e.target.value)}

                    />

                </div>

                <InputError message={errors.email} className="mt-2" />

                <div className="mt-4 flex items-center justify-between gap-3">

                    <Link

                        href={route('login')}

                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"

                    >

                        <ArrowLeft className="h-4 w-4" />

                        Volver atras

                    </Link>

                    <PrimaryButton className="ms-4 gap-2" disabled={processing}>

                        <Send className="h-4 w-4" />

                        Enviar enlace

                    </PrimaryButton>

                </div>

            </form>

        </GuestLayout>

    );

}
