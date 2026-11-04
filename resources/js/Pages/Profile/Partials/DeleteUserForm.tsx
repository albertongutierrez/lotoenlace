import { useRef, useState, FormEventHandler } from 'react';

import DangerButton from '@/Components/DangerButton';

import InputError from '@/Components/InputError';

import InputLabel from '@/Components/InputLabel';

import Modal from '@/Components/Modal';

import SecondaryButton from '@/Components/SecondaryButton';

import TextInput from '@/Components/TextInput';

import { useForm } from '@inertiajs/react';

import { AlertTriangle, Trash2, X } from 'lucide-react';

export default function DeleteUserForm({ className = '' }: { className?: string }) {

    const [confirmingUserDeletion, setConfirmingUserDeletion] = useState(false);

    const passwordInput = useRef<HTMLInputElement>(null);

    const {

        data,

        setData,

        delete: destroy,

        processing,

        reset,

        errors,

    } = useForm({

        password: '',

    });

    const confirmUserDeletion = () => {

        setConfirmingUserDeletion(true);

    };

    const deleteUser: FormEventHandler = (e) => {

        e.preventDefault();

        destroy(route('profile.destroy'), {

            preserveScroll: true,

            onSuccess: () => closeModal(),

            onError: () => passwordInput.current?.focus(),

            onFinish: () => reset(),

        });

    };

    const closeModal = () => {

        setConfirmingUserDeletion(false);

        reset();

    };

    return (

        <section className={`space-y-6 ${className}`}>

            <header>

                <h2 className="flex items-center gap-2 text-lg font-semibold text-red-700 dark:text-red-300">

                    <AlertTriangle className="h-5 w-5" />

                    Eliminar cuenta

                </h2>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">

                    Al eliminar tu cuenta, sus datos se eliminaran permanentemente. Esta accion no se puede deshacer.

                </p>

            </header>

            <DangerButton onClick={confirmUserDeletion}><Trash2 className="mr-2 h-4 w-4" />Eliminar cuenta</DangerButton>

            <Modal show={confirmingUserDeletion} onClose={closeModal}>

                <form onSubmit={deleteUser} className="p-6">

                    <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950 dark:text-white">

                        <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-300" />

                        Estas seguro de eliminar tu cuenta?

                    </h2>

                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">

                        Escribe tu contrasena para confirmar que quieres eliminar la cuenta permanentemente.

                    </p>

                    <div className="mt-6">

                        <InputLabel htmlFor="password" value="Contrasena" className="sr-only" />

                        <TextInput

                            id="password"

                            type="password"

                            name="password"

                            ref={passwordInput}

                            value={data.password}

                            onChange={(e) => setData('password', e.target.value)}

                            className="mt-1 block w-3/4"

                            isFocused

                            placeholder="Contrasena"

                        />

                        <InputError message={errors.password} className="mt-2" />

                    </div>

                    <div className="mt-6 flex justify-end">

                        <SecondaryButton onClick={closeModal}><X className="mr-2 h-4 w-4" />Cancelar</SecondaryButton>

                        <DangerButton className="ms-3" disabled={processing}>

                            <Trash2 className="mr-2 h-4 w-4" />

                            Eliminar cuenta

                        </DangerButton>

                    </div>

                </form>

            </Modal>

        </section>

    );

}
