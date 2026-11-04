import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';

import { PageProps } from '@/types';

import { Head } from '@inertiajs/react';

import { UserPlus } from 'lucide-react';

import UserForm, { UserFormOptions } from './UserForm';

type Props = PageProps<{

    options: UserFormOptions;

}>;

export default function Create({ auth, options }: Props) {

    return (

        <AuthenticatedLayout user={auth.user} activeBranchOffice={auth.activeBranchOffice} header="Nuevo usuario">

            <Head title="Nuevo usuario" />

            <div className="space-y-5">

                <div>

                    <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-950 dark:text-white">

                        <UserPlus className="h-5 w-5 text-slate-500 dark:text-slate-400" />

                        Nuevo usuario

                    </h1>

                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Crea las credenciales y asigna los roles y bancas permitidas.</p>

                </div>

                <UserForm

                    options={options}

                    submitLabel="Guardar usuario"

                    cancelHref={route('settings.users.index')}

                    onSubmitTo={route('settings.users.store')}

                />

            </div>

        </AuthenticatedLayout>

    );

}
