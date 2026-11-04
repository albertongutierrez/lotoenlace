import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';

import { PageProps } from '@/types';

import { Head } from '@inertiajs/react';

import { ShieldPlus } from 'lucide-react';

import RoleForm, { PermissionGroup } from './RoleForm';

type Props = PageProps<{

    permissions: PermissionGroup[];

}>;

export default function Create({ auth, permissions }: Props) {

    return (

        <AuthenticatedLayout user={auth.user} activeBranchOffice={auth.activeBranchOffice} header="Nuevo rol">

            <Head title="Nuevo rol" />

            <div className="space-y-5">

                <div>

                    <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-950 dark:text-white">

                        <ShieldPlus className="h-5 w-5 text-slate-500 dark:text-slate-400" />

                        Nuevo rol

                    </h1>

                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Define un rol y los permisos que tendran sus usuarios.</p>

                </div>

                <RoleForm

                    permissions={permissions}

                    submitLabel="Guardar rol"

                    cancelHref={route('settings.roles.index')}

                    onSubmitTo={route('settings.roles.store')}

                />

            </div>

        </AuthenticatedLayout>

    );

}
