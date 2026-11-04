import { Children, Fragment, isValidElement, useEffect, useRef, useState, type ReactNode, type SelectHTMLAttributes } from "react";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "./ui/combobox";

type Choice = { value:string; label:string; disabled:boolean };
type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"|"onBlur"|"onFocus"|"onKeyDown"|"onKeyUp"|"multiple"|"size"> & {
 onChange?: (event:{target:{value:string};currentTarget:{value:string}})=>void;
 onBlur?: ()=>void;
};
function text(node:ReactNode):string { return Children.toArray(node).map(n=>isValidElement<{children?:ReactNode}>(n)?text(n.props.children):String(n)).join(""); }
function choices(children:ReactNode):Choice[] { return Children.toArray(children).flatMap(n=>{
 if(!isValidElement<{children?:ReactNode;value?:string|number;disabled?:boolean}>(n)) return [];
 if(n.type===Fragment||n.type==="optgroup") return choices(n.props.children);
 return [{value:String(n.props.value??text(n.props.children)),label:text(n.props.children),disabled:!!n.props.disabled}];
}); }
export default function ComboboxSelect({children,value,defaultValue,onChange,onBlur,className="",disabled,required,name,id,autoFocus,...props}:Props) {
 const options=choices(children);
 const [local,setLocal]=useState(String(defaultValue??options[0]?.value??""));
 const current=String(value??local);
 const label=options.find(o=>o.value===current)?.label??"";
 const [search,setSearch]=useState(label);
 useEffect(()=>setSearch(label),[label]);
 const anchor=useRef<HTMLDivElement>(null);
 const [container,setContainer]=useState<HTMLElement|null>(null);
 const [open,setOpen]=useState(false);
 useEffect(()=>{setContainer(anchor.current?.closest<HTMLElement>('[data-modal-panel], [id^="headlessui-dialog-panel-"]')??anchor.current?.closest<HTMLElement>('[role="dialog"], [role="alertdialog"]')??null);},[]);
 return <Combobox items={options} value={options.find(o=>o.value===current)??null} disabled={disabled} required={required} name={name}
  itemToStringLabel={(item:Choice)=>item.label} itemToStringValue={(item:Choice)=>item.value} isItemEqualToValue={(a:Choice,b:Choice)=>a.value===b.value}
  inputValue={search} onInputValueChange={setSearch} open={open} onOpenChange={next=>{setOpen(next);if(!next)setSearch(label);}} onValueChange={(item:Choice|null)=>{if(!item)return;setSearch(item.label);setLocal(item.value);onChange?.({target:{value:item.value},currentTarget:{value:item.value}});}}>
  <ComboboxGroup ref={anchor} className={"flex min-w-0 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 "+className}>
   <ComboboxInput id={id} autoFocus={autoFocus} disabled={disabled} onBlur={onBlur} onFocus={e=>e.currentTarget.select()} onClick={e=>{if(search===label)e.currentTarget.select();}} aria-label={props['aria-label']} aria-labelledby={props['aria-labelledby']} aria-describedby={props['aria-describedby']} aria-invalid={props['aria-invalid']} title={props.title} placeholder="Seleccionar…" autoComplete="off" onKeyDown={e=>{if(open&&(e.key==="Escape"||e.key==="Enter"))e.stopPropagation();}} className="min-w-0 w-full border-0 !bg-transparent !p-0 text-inherit outline-none !shadow-none !ring-0 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50"/>
   <ComboboxTrigger/>
  </ComboboxGroup>
  <ComboboxContent anchor={anchor} container={container}><ComboboxEmpty className="p-3 text-sm text-slate-500 empty:hidden">Sin resultados.</ComboboxEmpty><ComboboxList className="max-h-[min(18rem,var(--available-height))] overflow-y-auto overscroll-contain [scrollbar-width:thin]">{(item:Choice)=><ComboboxItem key={item.value} value={item} disabled={item.disabled}>{item.label}</ComboboxItem>}</ComboboxList></ComboboxContent>
 </Combobox>;
}
