import { useEffect, FormEventHandler } from 'react';

import Checkbox from '@/Components/Checkbox';

import GuestLayout from '@/Layouts/GuestLayout';

import InputError from '@/Components/InputError';

import InputLabel from '@/Components/InputLabel';

import PrimaryButton from '@/Components/PrimaryButton';

import TextInput from '@/Components/TextInput';

import { Head, Link, useForm } from '@inertiajs/react';

import { LogIn, Mail, ShieldCheck } from 'lucide-react';

export default function Login({ status, canResetPassword }: { status?: string, canResetPassword: boolean }) {

    const { data, setData, post, processing, errors, reset } = useForm({

        email: '',

        password: '',

        remember: false,

    });

    useEffect(() => {

        return () => {

            reset('password');

        };

    }, []);

    const submit: FormEventHandler = (e) => {

        e.preventDefault();

        post(route('login'));

    };

    return (

        <GuestLayout>

            <Head title="Iniciar sesion" />

            <div className="mb-6">

                <h2 className="text-xl font-semibold text-slate-950 dark:text-white">Iniciar sesion</h2>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Ingresa tus credenciales para continuar.</p>

            </div>

            {status && <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">{status}</div>}

            <form onSubmit={submit}>

                <div>

                    <InputLabel htmlFor="email" value="Correo electronico" />

                    <div className="relative mt-1">

                        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />

                        <TextInput

                            id="email"

                            type="email"

                            inputMode="email"

                            name="email"

                            value={data.email}

                            className="block w-full pl-10"

                            autoComplete="username"

                            isFocused={true}

                            onChange={(e) => setData('email', e.target.value)}

                        />

                    </div>

                    <InputError message={errors.email} className="mt-2" />

                </div>

                <div className="mt-4">

                    <InputLabel htmlFor="password" value="Contraseña" />

                    <div className="relative mt-1">

                        <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />

                        <TextInput

                            id="password"

                            type="password"

                            name="password"

                            value={data.password}

                            className="block w-full pl-10"

                            autoComplete="current-password"

                            onChange={(e) => setData('password', e.target.value)}

                        />

                    </div>

                    <InputError message={errors.password} className="mt-2" />

                </div>

                <div className="block mt-4">

                    <label className="flex items-center">

                        <Checkbox

                            name="remember"

                            checked={data.remember}

                            onChange={(e) => setData('remember', e.target.checked)}

                        />

                        <span className="ms-2 text-sm text-slate-600 dark:text-slate-300">Recordarme</span>

                    </label>

                </div>

                <div className="mt-5 flex items-center justify-end">

                    {canResetPassword && (

                        <Link

                            href={route('password.request')}

                            className="rounded-md text-sm text-slate-600 underline hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 dark:text-slate-300 dark:hover:text-white dark:focus:ring-offset-slate-900"

                        >

                            Olvidaste tu contraseña?

                        </Link>

                    )}

                    <PrimaryButton className="ms-4 gap-2" disabled={processing}>

                        <LogIn className="h-4 w-4" />

                        Entrar

                    </PrimaryButton>

                </div>

            </form>

        </GuestLayout>

    );

}
