import { PropsWithChildren } from "react";

import { usePage } from "@inertiajs/react";

import ThemeToggle from "@/Components/ThemeToggle";

import { PageProps } from "@/types";

export default function GuestLayout({ children }: PropsWithChildren) {
    const { appName } = usePage<PageProps>().props;

    return (
        <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
            <div className="absolute right-4 top-4">
                <ThemeToggle />
            </div>

            <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-20">
                <div className="mb-8 flex items-center justify-center gap-3">
                    <img
                        src="/images/lotoenlace.png"
                        alt=""
                        className="h-12 w-44 rounded bg-white p-2 object-contain"
                    />
                    <h1 className="text-2xl font-semibold break-words">
                        {appName}
                    </h1>
                </div>

                <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    {children}
                </div>
            </main>
        </div>
    );
}
