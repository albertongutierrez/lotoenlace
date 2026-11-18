import type { PropsWithChildren } from 'react';
import type { LucideIcon } from 'lucide-react';

export default function SettingsSection({ title, description, icon: Icon, children }: PropsWithChildren<{title: string; description: string; icon: LucideIcon}>) {
    return <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700/80 dark:bg-slate-900/50">
        <div className="flex items-start gap-3 border-b border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-800/40">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-400"><Icon size={17} aria-hidden /></span>
            <div className="min-w-0"><h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3><p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p></div>
        </div>
        <div className="grid min-w-0 gap-3 p-4 sm:grid-cols-2">{children}</div>
    </section>;
}
