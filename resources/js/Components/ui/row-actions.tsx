import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { Ellipsis, type LucideIcon } from "lucide-react";

export function RowActions({ label, actions }: { label: string; actions: { label: string; icon: LucideIcon; onClick: () => void; destructive?: boolean }[] }) {
    return <Menu>
        <MenuButton aria-label={`Acciones de ${label}`} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:border-slate-700 dark:hover:bg-slate-800">
            <Ellipsis size={18} aria-hidden />
        </MenuButton>
        <MenuItems anchor="bottom end" portal className="z-50 min-w-40 rounded-lg border border-slate-200 bg-white p-1 text-sm text-slate-900 shadow-lg outline-none [--anchor-gap:6px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            {actions.map(({ label, icon: Icon, onClick, destructive }) => <MenuItem key={label}>
                <button onClick={onClick} className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left data-focus:bg-slate-100 dark:data-focus:bg-slate-800 ${destructive ? "text-red-600 dark:text-red-400" : ""}`}><Icon size={16} aria-hidden />{label}</button>
            </MenuItem>)}
        </MenuItems>
    </Menu>;
}
