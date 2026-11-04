import { useEffect, FormEventHandler } from 'react';

import GuestLayout from '@/Layouts/GuestLayout';

import InputError from '@/Components/InputError';

import InputLabel from '@/Components/InputLabel';

import PrimaryButton from '@/Components/PrimaryButton';

import TextInput from '@/Components/TextInput';

import { Head, Link, useForm } from '@inertiajs/react';

import { ArrowLeft, KeyRound, Mail, ShieldCheck } from 'lucide-react';

export default function ResetPassword({ token, email }: { token: string, email: string }) {

    const { data, setData, post, processing, errors, reset } = useForm({

        token: token,

        email: email,

        password: '',

        password_confirmation: '',

    });

    useEffect(() => {

        return () => {

            reset('password', 'password_confirmation');

        };

    }, []);

    const submit: FormEventHandler = (e) => {

        e.preventDefault();

        post(route('password.store'));

    };

    return (

        <GuestLayout>

            <Head title="Nueva contraseña" />

            <div className="mb-6">

                <h2 className="text-xl font-semibold text-slate-950 dark:text-white">Nueva contraseña</h2>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Completa los datos para actualizar tu acceso.</p>

            </div>

            <form onSubmit={submit}>

                <div>

                    <InputLabel htmlFor="email" value="Correo electronico" />

                    <div className="relative mt-1">

                        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />

                        <TextInput

                            id="email"

                            type="email"

                            name="email"

                            value={data.email}

                            className="block w-full pl-10"

                            autoComplete="username"

                            onChange={(e) => setData('email', e.target.value)}

                        />

                    </div>

                    <InputError message={errors.email} className="mt-2" />

                </div>

                <div className="mt-4">

                    <InputLabel htmlFor="password" value="Nueva contraseña" />

                    <div className="relative mt-1">

                        <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />

                        <TextInput

                            id="password"

                            type="password"

                            name="password"

                            value={data.password}

                            className="block w-full pl-10"

                            autoComplete="new-password"

                            isFocused={true}

                            onChange={(e) => setData('password', e.target.value)}

                        />

                    </div>

                    <InputError message={errors.password} className="mt-2" />

                </div>

                <div className="mt-4">

                    <InputLabel htmlFor="password_confirmation" value="Confirmar contraseña" />

                    <div className="relative mt-1">

                        <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />

                        <TextInput

                            type="password"

                            name="password_confirmation"

                            value={data.password_confirmation}

                            className="block w-full pl-10"

                            autoComplete="new-password"

                            onChange={(e) => setData('password_confirmation', e.target.value)}

                        />

                    </div>

                    <InputError message={errors.password_confirmation} className="mt-2" />

                </div>

                <div className="mt-4 flex items-center justify-between gap-3">

                    <Link

                        href={route('login')}

                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"

                    >

                        <ArrowLeft className="h-4 w-4" />

                        Volver atras

                    </Link>

                    <PrimaryButton className="ms-4 gap-2" disabled={processing}>

                        <KeyRound className="h-4 w-4" />

                        Restablecer contraseña

                    </PrimaryButton>

                </div>

            </form>

        </GuestLayout>

    );

}
