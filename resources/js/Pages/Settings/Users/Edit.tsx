import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';

import { PageProps } from '@/types';

import { Head } from '@inertiajs/react';

import { UserCog } from 'lucide-react';

import UserForm, { ManagedUser, UserFormOptions } from './UserForm';

type Props = PageProps<{

    managedUser: ManagedUser;

    options: UserFormOptions;

}>;

export default function Edit({ auth, managedUser, options }: Props) {

    return (

        <AuthenticatedLayout user={auth.user} activeBranchOffice={auth.activeBranchOffice} header="Editar usuario">

            <Head title={`Editar ${managedUser.name}`} />

            <div className="space-y-5">

                <div>

                    <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-950 dark:text-white">

                        <UserCog className="h-5 w-5 text-slate-500 dark:text-slate-400" />

                        Editar usuario

                    </h1>

                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Actualiza datos, roles y bancas permitidas de {managedUser.name}.</p>

                </div>

                <UserForm

                    options={options}

                    submitLabel="Actualizar usuario"

                    cancelHref={route('settings.users.index')}

                    onSubmitTo={route('settings.users.update', managedUser.id_hash)}

                    method="put"

                    passwordOptional

                    initialValues={{

                        name: managedUser.name,

                        email: managedUser.email,

                        role_ids: managedUser.roles.map((role) => role.id),

                        branch_office_ids: managedUser.branch_offices.map((branchOffice) => branchOffice.id),

                        default_branch_office_id: managedUser.active_branch_office_id ? String(managedUser.active_branch_office_id) : '',

                    }}

                />

            </div>

        </AuthenticatedLayout>

    );

}
