import * as React from "react";
import { Combobox as Base } from "@base-ui/react/combobox";
import { Check, ChevronsUpDown } from "lucide-react";

// shadcn Base UI composition, styled with LotoEnlace's light/dark palette.
export const Combobox = Base.Root;
export const ComboboxInput = Base.Input;
export const ComboboxList = Base.List;
export const ComboboxEmpty = Base.Empty;
export function ComboboxItem(props: React.ComponentProps<typeof Base.Item>) {
 return <Base.Item {...props} className="relative flex cursor-default items-center rounded-md py-2 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-emerald-100 data-[highlighted]:text-emerald-950 data-[disabled]:opacity-40 dark:data-[highlighted]:bg-emerald-900 dark:data-[highlighted]:text-white"><Base.ItemIndicator className="absolute left-2"><Check className="h-4 w-4"/></Base.ItemIndicator><span className="whitespace-normal break-words">{props.children}</span></Base.Item>;
}
export function ComboboxContent({children,container,anchor}: {children:React.ReactNode;container?:HTMLElement|null;anchor:React.RefObject<HTMLDivElement|null>}) {
 return <Base.Portal container={container??undefined}><Base.Positioner anchor={anchor} sideOffset={5} collisionBoundary={container??undefined} className="z-[100] outline-none"><Base.Popup className="w-[var(--anchor-width)] min-w-36 max-w-[calc(100vw-24px)] rounded-lg border border-slate-200 bg-white p-1 text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">{children}</Base.Popup></Base.Positioner></Base.Portal>;
}
export const ComboboxGroup = Base.InputGroup;
export function ComboboxTrigger(){return <Base.Trigger aria-label="Mostrar opciones" className="shrink-0 rounded p-0.5 text-slate-500 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"><ChevronsUpDown className="h-4 w-4"/></Base.Trigger>;}
