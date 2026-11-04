import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';

import UpdatePasswordForm from './Partials/UpdatePasswordForm';

import UpdateProfileInformationForm from './Partials/UpdateProfileInformationForm';

import { Head } from '@inertiajs/react';

import { PageProps } from '@/types';

import { UserCircle } from 'lucide-react';

export default function Edit({ auth, mustVerifyEmail, status }: PageProps<{ mustVerifyEmail: boolean, status?: string }>) {

    return (

        <AuthenticatedLayout

            user={auth.user}

            activeBranchOffice={auth.activeBranchOffice}

            header={<h2 className="flex items-center gap-2 text-xl font-semibold leading-tight text-slate-950 dark:text-white"><UserCircle className="h-5 w-5 text-slate-500 dark:text-slate-400" />Perfil</h2>}

        >

            <Head title="Perfil" />

            <div className="py-6">

                <div className="mx-auto max-w-7xl space-y-6">

                    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">

                        <UpdateProfileInformationForm

                            mustVerifyEmail={mustVerifyEmail}

                            status={status}

                            className="max-w-xl"

                        />

                    </div>

                    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">

                        <UpdatePasswordForm className="max-w-xl" />

                    </div>

                </div>

            </div>

        </AuthenticatedLayout>

    );

}
