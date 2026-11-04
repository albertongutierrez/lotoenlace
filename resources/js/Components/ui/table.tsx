import * as React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
const cn = (...values: Parameters<typeof clsx>) => twMerge(clsx(...values));

export function Table({ className, ...props }: React.ComponentProps<"table">) {
    return <div data-slot="table-container" className="relative w-full overflow-x-auto"><table data-slot="table" className={cn("w-full caption-bottom text-sm", className)} {...props} /></div>;
}
export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
    return <thead data-slot="table-header" className={cn("border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950", className)} {...props} />;
}
export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
    return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}
export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
    return <tr data-slot="table-row" className={cn("border-b border-slate-200 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50", className)} {...props} />;
}
export function TableHead({ className, ...props }: React.ComponentProps<"th">) {
    return <th data-slot="table-head" className={cn("h-12 px-4 text-left align-middle font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap", className)} {...props} />;
}
export function TableCell({ className, ...props }: React.ComponentProps<"td">) {
    return <td data-slot="table-cell" className={cn("p-4 align-middle", className)} {...props} />;
}
