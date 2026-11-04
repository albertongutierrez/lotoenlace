import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';

import { PageProps } from '@/types';

import { Head } from '@inertiajs/react';

import { ShieldCheck } from 'lucide-react';

import RoleForm, { PermissionGroup, RoleRecord } from './RoleForm';

type Props = PageProps<{

    role: RoleRecord & { permission_ids: number[] };

    permissions: PermissionGroup[];

}>;

export default function Edit({ auth, role, permissions }: Props) {

    return (

        <AuthenticatedLayout user={auth.user} activeBranchOffice={auth.activeBranchOffice} header="Editar rol">

            <Head title={`Editar ${role.name}`} />

            <div className="space-y-5">

                <div>

                    <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-950 dark:text-white">

                        <ShieldCheck className="h-5 w-5 text-slate-500 dark:text-slate-400" />

                        Editar rol

                    </h1>

                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Actualiza el rol y su relacion con los permisos.</p>

                </div>

                <RoleForm

                    permissions={permissions}

                    submitLabel="Actualizar rol"

                    cancelHref={route('settings.roles.index')}

                    onSubmitTo={route('settings.roles.update', role.id_hash)}

                    method="put"

                    initialValues={{

                        name: role.name,

                        slug: role.slug,

                        description: role.description ?? '',

                        is_active: role.is_active,

                        is_system: role.is_system,

                        permission_ids: role.permission_ids,

                    }}

                />

            </div>

        </AuthenticatedLayout>

    );

}
