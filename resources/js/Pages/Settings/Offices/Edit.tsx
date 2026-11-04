import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';

import { PageProps } from '@/types';

import { Head } from '@inertiajs/react';

import { Building2 } from 'lucide-react';

import OfficeForm from './OfficeForm';

type Office = {

    id: number;

    id_hash: string;

    name: string;

    slogan: string | null;

    tax_id: string | null;

    show_print_company_details: boolean;

    logo_url: string | null;

    compact_logo_url: string | null;

};

type Props = PageProps<{

    office: Office;

}>;

export default function Edit({ auth, office }: Props) {

    return (

        <AuthenticatedLayout user={auth.user} activeBranchOffice={auth.activeBranchOffice} header="Editar consorcio">

            <Head title="Editar consorcio" />

            <div className="mx-auto max-w-5xl space-y-5">

                <div>

                    <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-950 dark:text-white"><Building2 className="h-5 w-5 text-slate-500 dark:text-slate-400" />Editar consorcio</h1>

                </div>

                <OfficeForm

                    submitLabel="Actualizar consorcio"

                    cancelHref={route('settings.offices.index')}

                    onSubmitTo={route('settings.offices.update', office.id_hash)}

                    method="put"

                    initialValues={{

                        name: office.name,

                        slogan: office.slogan ?? '',

                        tax_id: office.tax_id ?? '',

                        show_print_company_details: office.show_print_company_details,

                        logo_url: office.logo_url,

                        compact_logo_url: office.compact_logo_url,

                    }}

                />

            </div>

        </AuthenticatedLayout>

    );

}
