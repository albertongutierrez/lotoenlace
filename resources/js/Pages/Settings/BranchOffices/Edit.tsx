import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';

import { PageProps } from '@/types';

import { Head } from '@inertiajs/react';

import { Store } from 'lucide-react';

import BranchOfficeForm, { OfficeOption } from './BranchOfficeForm';

type BranchOffice = {

    id: number;

    id_hash: string;

    office_id: number;

    name: string;

    code: string;

    phone: string | null;

    mobile_phone: string | null;

    email: string | null;

    address: string | null;

    is_main: boolean;

    is_active: boolean;

};

type Props = PageProps<{

    branchOffice: BranchOffice;

    offices: OfficeOption[];

}>;

export default function Edit({ auth, branchOffice, offices }: Props) {

    return (

        <AuthenticatedLayout user={auth.user} activeBranchOffice={auth.activeBranchOffice} header="Editar banca">

            <Head title="Editar banca" />

            <div className="mx-auto max-w-5xl space-y-5">

                <div>

                    <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-950 dark:text-white"><Store className="h-5 w-5 text-slate-500 dark:text-slate-400" />Editar banca</h1>

                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Actualiza los datos de contacto, direccion y estado.</p>

                </div>

                <BranchOfficeForm

                    offices={offices}

                    submitLabel="Actualizar banca"

                    cancelHref={route('settings.branch-offices.index')}

                    onSubmitTo={route('settings.branch-offices.update', branchOffice.id_hash)}

                    method="put"

                    initialValues={{

                        office_id: String(branchOffice.office_id),

                        name: branchOffice.name,

                        code: branchOffice.code,

                        phone: branchOffice.phone ?? '',

                        mobile_phone: branchOffice.mobile_phone ?? '',

                        email: branchOffice.email ?? '',

                        address: branchOffice.address ?? '',

                        is_main: branchOffice.is_main,

                        is_active: branchOffice.is_active,

                    }}

                />

            </div>

        </AuthenticatedLayout>

    );

}
