import InputError from '@/Components/InputError';

import InputLabel from '@/Components/InputLabel';

import PrimaryButton from '@/Components/PrimaryButton';

import TextInput from '@/Components/TextInput';

import { Link, router, useForm, usePage } from '@inertiajs/react';

import { Transition } from '@headlessui/react';

import { FormEventHandler, useState } from 'react';

import { PageProps } from '@/types';

import { Save, UserRound } from 'lucide-react';

export default function UpdateProfileInformation({ mustVerifyEmail, status, className = '' }: { mustVerifyEmail: boolean, status?: string, className?: string }) {

    const user = usePage<PageProps>().props.auth.user;

    const { data, setData } = useForm({

        name: user.name,

        email: user.email,

    });

    const [clientErrors, setClientErrors] = useState<{ name?: string; email?: string }>({});

    const [serverErrors, setServerErrors] = useState<{ name?: string; email?: string }>({});

    const [isSaving, setIsSaving] = useState(false);

    const [saved, setSaved] = useState(false);

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    const validate = () => {

        const nextErrors: { name?: string; email?: string } = {};

        const normalizedName = data.name.trim();

        const normalizedEmail = data.email.trim().toLowerCase();

        if (!normalizedName) {

            nextErrors.name = 'El nombre es obligatorio.';

        } else if (normalizedName.length < 2) {

            nextErrors.name = 'El nombre debe tener al menos 2 caracteres.';

        } else if (normalizedName.length > 255) {

            nextErrors.name = 'El nombre no puede tener mas de 255 caracteres.';

        }

        if (!normalizedEmail) {

            nextErrors.email = 'El correo es obligatorio.';

        } else if (!emailPattern.test(normalizedEmail)) {

            nextErrors.email = 'El correo no tiene un formato valido.';

        } else if (normalizedEmail.length > 255) {

            nextErrors.email = 'El correo no puede tener mas de 255 caracteres.';

        }

        setClientErrors(nextErrors);

        return {

            isValid: Object.keys(nextErrors).length === 0,

            normalizedName,

            normalizedEmail,

        };

    };

    const submit: FormEventHandler = (e) => {

        e.preventDefault();

        const validation = validate();

        if (!validation.isValid) {

            return;

        }

        router.patch(route('profile.update'), {

            name: validation.normalizedName,

            email: validation.normalizedEmail,

        }, {

            preserveScroll: true,

            onStart: () => {

                setIsSaving(true);

                setSaved(false);

                setServerErrors({});

            },

            onError: (errors) => {

                setServerErrors({

                    name: errors.name,

                    email: errors.email,

                });

            },

            onSuccess: () => {

                setClientErrors({});

                setData('name', validation.normalizedName);

                setData('email', validation.normalizedEmail);

                setSaved(true);

                window.setTimeout(() => setSaved(false), 1800);

            },

            onFinish: () => {

                setIsSaving(false);

            },

        });

    };

    return (

        <section className={className}>

            <header>

                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950 dark:text-white">

                    <UserRound className="h-5 w-5 text-slate-500 dark:text-slate-400" />

                    Informacion del perfil

                </h2>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">

                    Actualiza la informacion de tu cuenta y correo electronico.

                </p>

            </header>

            <form onSubmit={submit} className="mt-6 space-y-6">

                <div>

                    <InputLabel htmlFor="name" value="Nombre" />

                    <TextInput

                        id="name"

                        className="mt-1 block w-full"

                        value={data.name}

                        onChange={(e) => {

                            setData('name', e.target.value);

                            setClientErrors((current) => ({ ...current, name: undefined }));

                            setServerErrors((current) => ({ ...current, name: undefined }));

                        }}

                        required

                        isFocused

                        autoComplete="off"

                    />

                    <InputError className="mt-2" message={clientErrors.name ?? serverErrors.name} />

                </div>

                <div>

                    <InputLabel htmlFor="email" value="Correo electronico" />

                    <TextInput

                        id="email"

                        type="text"

                        inputMode="email"

                        className="mt-1 block w-full"

                        value={data.email}

                        onChange={(e) => {

                            setData('email', e.target.value);

                            setClientErrors((current) => ({ ...current, email: undefined }));

                            setServerErrors((current) => ({ ...current, email: undefined }));

                        }}

                        required

                        autoComplete="off"

                    />

                    <InputError className="mt-2" message={clientErrors.email ?? serverErrors.email} />

                </div>

                {mustVerifyEmail && user.email_verified_at === null && (

                    <div>

                        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">

                            Tu correo electronico no esta verificado.

                            <Link

                                href={route('verification.send')}

                                method="post"

                                as="button"

                                className="rounded-md text-sm text-slate-600 underline hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 dark:text-slate-300 dark:hover:text-white dark:focus:ring-offset-slate-900"

                            >

                                Haz clic aqui para reenviar el correo de verificacion.

                            </Link>

                        </p>

                        {status === 'verification-link-sent' && (

                            <div className="mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">

                                Se envio un nuevo enlace de verificacion a tu correo.

                            </div>

                        )}

                    </div>

                )}

                <div className="flex items-center gap-4">

                    <PrimaryButton disabled={isSaving}>

                        <Save className="mr-2 h-4 w-4" />

                        {isSaving ? 'Guardando...' : 'Guardar'}

                    </PrimaryButton>

                    <Transition

                        show={saved}

                        enter="transition ease-in-out"

                        enterFrom="opacity-0"

                        leave="transition ease-in-out"

                        leaveTo="opacity-0"

                    >

                        <p className="text-sm text-slate-500 dark:text-slate-400">Guardado.</p>

                    </Transition>

                </div>

            </form>

        </section>

    );

}
