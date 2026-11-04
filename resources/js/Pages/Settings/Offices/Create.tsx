import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';

import { PageProps } from '@/types';

import { Head } from '@inertiajs/react';

import { Building2 } from 'lucide-react';

import OfficeForm from './OfficeForm';

export default function Create({ auth }: PageProps) {

    return (

        <AuthenticatedLayout user={auth.user} activeBranchOffice={auth.activeBranchOffice} header="Nueva consorcio">

            <Head title="Nueva consorcio" />

            <div className="mx-auto max-w-5xl space-y-5">

                <div>

                    <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-950 dark:text-white"><Building2 className="h-5 w-5 text-slate-500 dark:text-slate-400" />Nueva consorcio</h1>

                </div>

                <OfficeForm submitLabel="Guardar consorcio" cancelHref={route('settings.offices.index')} onSubmitTo={route('settings.offices.store')} />

            </div>

        </AuthenticatedLayout>

    );

}
