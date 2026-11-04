import ComboboxSelect from "@/Components/ComboboxSelect";
import ReportPdfModal from "@/Components/ReportPdfModal";
import LoadingSkeleton from "@/Components/LoadingSkeleton";
import MoneyInput from "@/Components/MoneyInput";
import { paymentMethodName } from "@/lib/paymentMethods";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Dialog } from "@headlessui/react";
import { Wallet, Plus, Minus, Lock, Eye, Check, X, FileText, Printer, Search, RotateCcw, CalendarDays, UserRound, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import Modal from "@/Components/Modal";
import { DataTable } from "@/Components/ui/data-table";
import { RowActions } from "@/Components/ui/row-actions";
import { requestId } from "@/lib/requestId";
import { Shell, panel, input, button, secondary, money } from "./shared";
const date = (value: string) => value ? new Date(value).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" }) : "—";
const types: Record<string, string> = { opening: "Fondo inicial", sale: "Venta neta", refund: "Devolución por anulación", prize: "Pago de premios", deposit: "Entrada manual", withdrawal: "Salida manual" };
export default function Cash(props: any) {
 const client=useQueryClient();
 const initialFilters={period:"all",date_field:"opened",state:"all",from:"",to:"",session_id:"",user_id:"",...props.filters};
 const [filters,setFilters]=useState<Record<string,string>>(initialFilters); const [draft,setDraft]=useState<Record<string,string>>(initialFilters); const [page,setPage]=useState(1);
 const [movementType,setMovementType]=useState("all");
 const [preview,setPreview]=useState<{id:number;print:boolean}|null>(null);
 const viewDetail=(id:number)=>{setDetail(id);setMovementPage(1);setMovementType("all");};
 const setFilter=(key:string,value:string)=>setDraft(d=>({...d,[key]:value}));
 const [detail,setDetail]=useState<number|null>(null); const [movementPage,setMovementPage]=useState(1);
 const [operation,setOperation]=useState<"open"|"deposit"|"withdrawal"|"close"|null>(null);
 const [target,setTarget]=useState<number|null>(null); const [amount,setAmount]=useState(""); const [note,setNote]=useState(""); const [key,setKey]=useState(""); const [error,setError]=useState("");
 const listing=useQuery({queryKey:["cash",props.bank.id,filters,page],queryFn:async({signal})=> (await axios.get("/lottery/cash",{signal,params:{branch_id:props.bank.id,...filters,page},headers:{Accept:"application/json"}})).data, initialData: JSON.stringify(filters)===JSON.stringify(initialFilters)&&page===1 ? props : undefined, refetchInterval:props.reconciliation_mode==="report"?false:10000});
 const data=listing.data ?? props; const current=data.current; const byReport=data.reconciliation_mode==="report";
 const details=useQuery({queryKey:["cash","detail",props.bank.id,detail,movementPage,movementType],enabled:detail!==null,queryFn:async({signal})=> (await axios.get(`/lottery/cash/${detail}`,{signal,params:{branch_id:props.bank.id,page:movementPage,movement_type:movementType}})).data,refetchInterval:props.reconciliation_mode==="report"?false:10000});
 const start=(op:typeof operation)=> {setOperation(op);setTarget(current?.id??null);setAmount("");setNote("");setKey(requestId());setError("");};
 const mutation=useMutation({mutationFn:async()=> {
  const url=operation==="open"?"/lottery/cash/open":`/lottery/cash/${target}/${operation==="close"?"close":"movements"}`;
  return (await axios.post(url,{branch_id:props.bank.id,amount,note,request_key:key,type:operation})).data;
 },onSuccess:(saved:any)=>{if(operation==="close")viewDetail(saved.id);setOperation(null);void client.invalidateQueries({queryKey:["cash"]});void client.invalidateQueries({queryKey:["lottery","cash-status"]});},onError:(e:any)=>setError(e.response?.data?.message??"No se pudo registrar la operación.")});
 const title=operation==="open"?"Abrir caja":operation==="close"?"Cerrar caja":operation==="deposit"?"Entrada de efectivo":"Salida de efectivo";
 return <Shell fullWidth title={`Cajas · ${props.bank.code}`}>
  <div className={panel+" flex flex-wrap items-center justify-between gap-4"}>
   <div><p className="flex items-center gap-2 font-semibold"><Wallet className="h-5 w-5" />{byReport?"Cuadre por reporte":current?"Caja abierta":"Sin caja abierta"}</p><p className="mt-1 text-sm text-slate-500">{current?`Responsable: ${current.opener?.name} · ${date(current.created_at)}`:byReport?"Esta banca opera sin apertura de caja. Su historial de cajas anteriores se conserva.":"Abre una caja para vender, anular tickets o pagar premios."}</p></div>
   {current&&data.can_view_open&&<div><p className="text-xs text-slate-500">Efectivo esperado</p><strong className="text-2xl">{money(current.balance_minor,data.currency)}</strong></div>}
   <div className="flex flex-wrap gap-2">{byReport?(data.can_reconcile_report&&<a className={button} href={`/lottery/reports?report=reconciliation&branch_id=${props.bank.id}`}><FileText className="mr-1 inline h-4 w-4"/>Ver cuadre por período</a>):current?<><button className={secondary} onClick={()=>start("deposit")}><Plus className="mr-1 inline h-4 w-4" />Entrada</button><button className={secondary} onClick={()=>start("withdrawal")}><Minus className="mr-1 inline h-4 w-4" />Salida</button><button className={button} onClick={()=>start("close")}><Lock className="mr-1 inline h-4 w-4" />Cerrar caja</button></>:<button className={button} onClick={()=>start("open")}><Plus className="mr-1 inline h-4 w-4" />Abrir caja</button>}</div>
  </div>
  <p className="text-sm text-slate-500">{byReport?"Historial de cajas anteriores. El cuadre actual se consulta en Reportes por banca y período.":"Una caja por banca. Las ventas suman el total neto, después del descuento y la devolución de cambio. Las comisiones no descuentan efectivo automáticamente."}</p>
  <form className={panel+" !p-3 flex flex-wrap items-end gap-3"} onSubmit={e=>{e.preventDefault();setFilters({...draft});setPage(1);}}>
   <label className="text-xs w-36">Período<ComboboxSelect className={input} value={draft.period} onChange={e=>setFilter("period",e.target.value)}>{Object.entries({all:"Todo el historial",today:"Hoy",yesterday:"Ayer",month:"Este mes",last_month:"Mes anterior",custom:"Personalizado"}).map(([key,label])=><option key={key} value={key}>{label}</option>)}</ComboboxSelect></label>
   <label className="text-xs w-36">Fecha de<ComboboxSelect className={input} value={draft.date_field} onChange={e=>setFilter("date_field",e.target.value)}><option value="opened">Apertura</option><option value="closed">Cierre</option></ComboboxSelect></label>
   {draft.period==="custom"&&<><label className="text-xs">Desde<input type="date" className={input} value={draft.from} max={draft.to||undefined} onChange={e=>setFilter("from",e.target.value)}/></label><label className="text-xs">Hasta<input type="date" className={input} value={draft.to} min={draft.from||undefined} onChange={e=>setFilter("to",e.target.value)}/></label></>}
   <label className="text-xs w-32">Estado<ComboboxSelect className={input} value={draft.state} onChange={e=>setFilter("state",e.target.value)}><option value="all">Todos</option><option value="open">Abierta</option><option value="closed">Cerrada</option></ComboboxSelect></label>
   <label className="text-xs w-48">Responsable<ComboboxSelect className={input} value={draft.user_id} onChange={e=>setFilter("user_id",e.target.value)}><option value="">Todos</option>{(data.operators??[]).map((u:any)=><option key={u.id} value={u.id}>{u.name}</option>)}</ComboboxSelect></label>

   <button className={button} disabled={listing.isFetching}><Search className="mr-1 inline h-4 w-4"/>Consultar</button><button type="button" title="Limpiar filtros" className={secondary} onClick={()=>{const next={period:"all",date_field:"opened",state:"all",from:"",to:"",session_id:"",user_id:""};setDraft(next);setFilters(next);setPage(1);}}><RotateCcw className="h-4 w-4"/></button>
  </form>
  {listing.isError&&<p role="alert" className="text-red-500">No se pudo actualizar la caja. <button onClick={()=>listing.refetch()}>Reintentar</button></p>}
  <div className={panel+" !p-0 overflow-hidden"}><DataTable loading={listing.isLoading} data={data.sessions.data} serverPage={data.sessions} onPageChange={url=>setPage(Number(new URL(url).searchParams.get("page")??1))} getRowId={(r:any)=>String(r.id)} columns={[
   {id:"opened",header:"Apertura RD",cell:({row}:any)=><button type="button" className="font-medium text-emerald-700 hover:underline disabled:text-slate-500 disabled:no-underline dark:text-emerald-400" disabled={row.original.status==="open"&&!data.can_view_open} onClick={()=>viewDetail(row.original.id)}>{date(row.original.created_at)}</button>},
   {id:"closed",header:"Cierre RD",cell:({row}:any)=>date(row.original.closed_at)},
   {id:"owner",header:"Responsable",cell:({row}:any)=>row.original.opener?.name},
   {id:"status",header:"Estado",cell:({row}:any)=><span className={row.original.status==="open"?"text-emerald-500":"text-slate-500"}>{row.original.status==="open"?"Abierta":"Cerrada"}</span>},
   {id:"expected",header:"Esperado",cell:({row}:any)=>row.original.balance_minor == null ? "Oculto hasta el cierre" : money(row.original.balance_minor,row.original.currency)},
   {id:"counted",header:"Contado",cell:({row}:any)=>row.original.counted_minor==null?"—":money(row.original.counted_minor,row.original.currency)},
   {id:"difference",header:"Diferencia",cell:({row}:any)=><span className={row.original.difference_minor?"text-red-500":""}>{row.original.difference_minor==null?"—":money(row.original.difference_minor,row.original.currency)}</span>},
   {id:"actions",header:"Acciones",cell:({row}:any)=>row.original.status==="open"&&!data.can_view_open ? <span className="text-xs text-slate-500">Disponible al cerrar</span> : <RowActions label={`Cuadre del ${date(row.original.created_at)}`} actions={[{label:"Ver cuadre",icon:Eye,onClick:()=>viewDetail(row.original.id)},...(data.can_print_report?[{label:"Ver PDF",icon:FileText,onClick:()=>setPreview({id:row.original.id,print:false})},{label:"Imprimir cuadre",icon:Printer,onClick:()=>setPreview({id:row.original.id,print:true})}]:[])]} />},
  ]}/></div>
  <Modal show={operation!==null} onClose={()=>{if(!mutation.isPending)setOperation(null);}} closeable={!mutation.isPending} maxWidth="lg"><form className="space-y-4 p-5 text-slate-900 dark:text-slate-100" onSubmit={e=>{e.preventDefault();if(!mutation.isPending)mutation.mutate();}}>
   <Dialog.Title className="flex items-center gap-2 text-lg font-semibold"><Wallet className="h-5 w-5" />{title}</Dialog.Title>
   {operation==="close"&&<p className="text-sm">Cuenta el efectivo real. El cierre es definitivo; después podrás consultar el cuadre y sus movimientos.</p>}
   <label className="block text-sm">{operation==="open"?"Fondo inicial":operation==="close"?"Efectivo contado":"Monto"} ({data.currency})<MoneyInput autoFocus required className={input} inputMode="decimal" value={amount} onValueChange={setAmount} disabled={mutation.isPending}/></label>
   <label className="block text-sm">{operation==="close"?"Observación de cierre":"Motivo u observación"}<textarea required={operation==="deposit"||operation==="withdrawal"||operation==="close"} className={input} value={note} maxLength={1000} onChange={e=>setNote(e.target.value)} disabled={mutation.isPending}/></label>
   {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
   <div className="flex justify-end gap-2"><button type="button" className={secondary} disabled={mutation.isPending} onClick={()=>setOperation(null)}><X className="mr-1 inline h-4 w-4" />Cancelar</button><button className={button} disabled={mutation.isPending}><Check className="mr-1 inline h-4 w-4" />{mutation.isPending?"Guardando…":"Confirmar"}</button></div>
  </form></Modal>
  <Modal show={detail!==null} onClose={()=>setDetail(null)} maxWidth="7xl"><div className="flex h-[86dvh] min-h-0 flex-col text-slate-900 dark:text-slate-100">
   <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
    <div><Dialog.Title className="flex items-center gap-2 text-lg font-semibold"><Wallet className="h-5 w-5 text-emerald-600"/>Cuadre de caja</Dialog.Title><p className="mt-0.5 text-xs text-slate-500">Banca {props.bank.code} · {props.bank.name} · {details.data?.session.status==="closed"?"Cierre definitivo":"Caja abierta"}</p></div>
    <div className="flex flex-wrap gap-2">{data.can_print_report&&<><button type="button" className={secondary} disabled={!details.data||details.isError} onClick={()=>setPreview({id:detail!,print:false})}><FileText className="mr-1 inline h-4 w-4"/>Ver PDF</button><button type="button" className={button} disabled={!details.data||details.isError} onClick={()=>setPreview({id:detail!,print:true})}><Printer className="mr-1 inline h-4 w-4"/>Imprimir</button></>}<button type="button" autoFocus className={secondary} onClick={()=>setDetail(null)}><X className="mr-1 inline h-4 w-4"/>Cerrar</button></div>
   </header>
   {details.isError&&<p role="alert" className="m-4 text-red-500">{(details.error as any)?.response?.data?.message??"No se pudo cargar el cuadre."}</p>}
   {details.isLoading?<LoadingSkeleton label="Cargando cuadre…"/>:<>
   {details.data&&<section className="shrink-0 max-h-[40dvh] space-y-3 overflow-y-auto p-4 [scrollbar-width:thin]">
    <div className="grid grid-cols-2 gap-3 text-xs lg:grid-cols-4"><div><p className="mb-1 flex items-center gap-1 text-slate-500"><CalendarDays className="h-3.5 w-3.5"/>Apertura</p>{date(details.data.session.created_at)}</div><div><p className="mb-1 flex items-center gap-1 text-slate-500"><UserRound className="h-3.5 w-3.5"/>Abrió</p>{details.data.session.opener?.name}</div><div><p className="mb-1 text-slate-500">Cierre</p>{date(details.data.session.closed_at)}</div><div><p className="mb-1 text-slate-500">Cerró</p>{details.data.session.closer?.name??"Pendiente"}</div></div>
    <div className="grid grid-cols-3 gap-3">{[["Efectivo esperado",details.data.session.balance_minor],["Efectivo contado",details.data.session.counted_minor],["Diferencia",details.data.session.difference_minor]].map(([label,value]:any)=><div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60"><p className="text-xs text-slate-500">{label}</p><strong className={`mt-1 block text-lg ${label==="Diferencia"&&value?"text-amber-600 dark:text-amber-400":""}`}>{value==null?"Pendiente":money(value,details.data.session.currency)}</strong></div>)}</div>
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">{details.data.totals.map((t:any)=><p key={`${t.type}:${t.payment_method ?? 'cash'}:${t.payment_method_label ?? ''}`}><span className="text-slate-500">{types[t.type]} · {t.payment_method_label ?? paymentMethodName(t.payment_method)}:</span> <strong>{money(Number(t.total_minor),details.data.session.currency)}</strong></p>)}</div>
    {(details.data.session.opening_note||details.data.session.closing_note)&&<details className="text-xs"><summary className="cursor-pointer text-slate-500">Observaciones</summary><p className="mt-2 whitespace-pre-wrap">{details.data.session.opening_note&&<>Apertura: {details.data.session.opening_note}<br/></>}Cierre: {details.data.session.closing_note??"—"}</p></details>}
   </section>}
   <div className="flex shrink-0 items-center justify-between gap-3 border-y border-slate-200 px-4 py-2 dark:border-slate-700"><h3 className="text-sm font-semibold">Movimientos del cuadre</h3><ComboboxSelect aria-label="Tipo de movimiento" className={input+" !w-48 !py-1 !text-xs"} value={movementType} onChange={e=>{setMovementType(e.target.value);setMovementPage(1);}}><option value="all">Todos los movimientos</option>{Object.entries(types).map(([key,label])=><option key={key} value={key}>{label}</option>)}</ComboboxSelect></div>
   <div className="min-h-0 flex-1"><DataTable fillHeight loading={details.isLoading} data={details.data?.movements.data??[]} serverPage={details.data?.movements} onPageChange={url=>setMovementPage(Number(new URL(url).searchParams.get("page")??1))} columns={[
    {id:"date",header:"Fecha RD",cell:({row}:any)=>date(row.original.created_at)}, {id:"type",header:"Tipo",cell:({row}:any)=>types[row.original.type]},
    {id:"reference",header:"Ticket / motivo",cell:({row}:any)=><span className="break-all text-xs">{row.original.ticket?.reference??row.original.ticket?.code??row.original.note}</span>},
    {id:"user",header:"Usuario",cell:({row}:any)=>row.original.user?.name},
    {id:"payment_method",header:"Medio",cell:({row}:any)=>row.original.payment_method_label ?? paymentMethodName(row.original.payment_method)},
    {id:"amount",header:"Monto",cell:({row}:any)=><span className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${row.original.amount_minor<0?"text-rose-600 dark:text-rose-400":"text-emerald-700 dark:text-emerald-400"}`}>{row.original.amount_minor<0?<ArrowUpRight className="h-3 w-3"/>:<ArrowDownLeft className="h-3 w-3"/>}{money(row.original.amount_minor,details.data?.session.currency)}</span>},
   ]}/></div></>}
  </div></Modal>
  {preview&&<ReportPdfModal description="A4 vertical · Reporte individual de esta caja" url={`/lottery/reports?report=cash&cash_session_id=${preview.id}&office_id=${props.office_id}&branch_id=${props.bank.id}&format=pdf`} title={`Cuadre de caja · ${props.bank.code}`} autoPrint={preview.print} onClose={()=>setPreview(null)}/>}
 </Shell>;
}
