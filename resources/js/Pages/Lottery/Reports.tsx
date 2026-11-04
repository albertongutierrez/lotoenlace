import ReportPdfModal from "@/Components/ReportPdfModal";
import ComboboxSelect from "@/Components/ComboboxSelect";
import { useState } from "react";
import { usePage } from "@inertiajs/react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { BarChart3, Hash, Tickets, Trophy, ListChecks, Layers3, Coins, Printer, Search, RefreshCw, FileText, Info, Wallet } from "lucide-react";
import { DataTable } from "@/Components/ui/data-table";
import { Shell, panel, input, button, secondary, money, modes } from "./shared";
const icons: Record<string, any> = { reconciliation:Wallet,sales:BarChart3,numbers:Hash,tickets:Tickets,winners:Trophy,results:ListChecks,draws:Layers3,commissions:Coins,printing:Printer };
export default function Reports(initial:any) {
 const page=usePage();
 const [preview,setPreview]=useState<{url:string;title:string;print:boolean}|null>(null);
 const initialFilters={period:"today",report:initial.report,office_id:String(initial.office.id),...Object.fromEntries(new URLSearchParams(page.url.split("?")[1]??""))};
 const [filters,setFilters]=useState<Record<string,string>>(initialFilters);
 const [draft,setDraft]=useState<Record<string,string>>(initialFilters);
 const query=useQuery({queryKey:["reports",initial.office.id,filters],queryFn:async()=> (await axios.get("/lottery/reports",{params:filters,headers:{Accept:"application/json"}})).data,initialData:JSON.stringify(filters)===JSON.stringify(initialFilters)?initial:undefined});
 const data=query.data;
 const exportUrl=(format:string)=>{const params=new URLSearchParams({...filters,period:"custom",from:data?.from??"",to:data?.to??"",format});params.delete("page");return `/lottery/reports?${params}`;};
 const kind=filters.report;
 const change=(key:string,value:string)=>setDraft(d=>({...d,[key]:value}));
 const select=(key:string)=>{const bankId=key==="reconciliation"&&initial.banks.find((b:any)=>String(b.id)===draft.branch_id)?.reconciliation_mode!=="report"?"":draft.branch_id??"";const next={period:draft.period,from:draft.from??"",to:draft.to??"",branch_id:bankId,office_id:String(initial.office.id),report:key};setDraft(next);setFilters(next);};
 const draws=(initial.draws as any[]).filter(d=>!draft.lottery_id||d.lottery_id===Number(draft.lottery_id));
 const lotteries=Array.from(new Map((initial.draws as any[]).map(d=>[d.lottery_id,d.lottery])).values()).filter(Boolean);
 const ticketFilters=["tickets","winners"].includes(kind);
 const playFilters=["sales","numbers","tickets","winners","draws","commissions"].includes(kind);
 const drawFilters=playFilters||kind==="results";
 const filterInput=input+" !h-8 !min-h-8 !px-2 !py-1 !text-xs";
 return <Shell fullWidth compact fixedViewport showNavbar title="Reportes">
  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
   <nav aria-label="Reportes" className={panel+" flex shrink-0 items-center gap-1 overflow-x-auto overscroll-contain !p-1.5 [scrollbar-width:thin] [scrollbar-color:#94a3b8_#f1f5f9] dark:[scrollbar-color:#475569_#0f172a]"}>{initial.available.map((r:any)=>{const Icon=icons[r.key];return <button key={r.key} onClick={()=>select(r.key)} aria-current={kind===r.key?"page":undefined} className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-left text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 ${kind===r.key?"bg-emerald-700 text-white":"hover:bg-slate-100 dark:hover:bg-slate-800"}`}><Icon className="h-4 w-4 shrink-0" />{r.label}</button>;})}</nav>
   <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
    <section className="shrink-0 max-h-[40dvh] space-y-2 overflow-y-auto [scrollbar-width:thin]">
    <form className={panel+" !p-2 flex flex-wrap items-end gap-x-2 gap-y-1.5 [&>label]:min-w-0 [&>label]:w-[calc(50%-4px)] sm:[&>label]:w-36 [&>label]:text-[11px]"} onSubmit={e=>{e.preventDefault();setFilters({...draft,page:"1"});}}>
     <label className="text-xs">Período<ComboboxSelect className={filterInput} value={draft.period} onChange={e=>change("period",e.target.value)}><option value="today">Hoy</option><option value="yesterday">Ayer</option><option value="month">Este mes</option><option value="last_month">Mes anterior</option><option value="custom">Personalizado</option></ComboboxSelect></label>
     {draft.period==="custom"&&<><label className="text-xs">Desde<input required type="date" className={filterInput} max={draft.to||undefined} value={draft.from??""} onChange={e=>change("from",e.target.value)}/></label><label className="text-xs">Hasta<input required type="date" className={filterInput} min={draft.from||undefined} value={draft.to??""} onChange={e=>change("to",e.target.value)}/></label></>}
     <label className="text-xs">Banca<ComboboxSelect className={filterInput} value={draft.branch_id??""} onChange={e=>change("branch_id",e.target.value)}><option value="">{kind==="reconciliation"?"Todas con cuadre por reporte":"Todas las autorizadas"}</option>{initial.banks.filter((b:any)=>kind!=="reconciliation"||b.reconciliation_mode==="report").map((b:any)=><option key={b.id} value={b.id}>{b.code}{b.name?` · ${b.name}`:""}</option>)}</ComboboxSelect></label>
     {drawFilters&&<><label className="text-xs">Lotería<ComboboxSelect className={filterInput} value={draft.lottery_id??""} onChange={e=>setDraft(d=>({...d,lottery_id:e.target.value,draw_id:""}))}><option value="">Todas</option>{lotteries.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}</ComboboxSelect></label><label className="text-xs">Sorteo<ComboboxSelect className={filterInput} value={draft.draw_id??""} onChange={e=>change("draw_id",e.target.value)}><option value="">Todos</option>{draws.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</ComboboxSelect></label></>}
     {playFilters&&<label className="text-xs">Modalidad<ComboboxSelect className={filterInput} value={draft.mode??""} onChange={e=>change("mode",e.target.value)}><option value="">Todas</option>{Object.entries(modes).map(([key,label])=><option key={key} value={key}>{label}</option>)}</ComboboxSelect></label>}
     {["sales","reconciliation"].includes(kind)&&<label className="text-xs">Vista<ComboboxSelect className={filterInput} value={draft.view??"summary"} onChange={e=>change("view",e.target.value)}><option value="summary">{kind==="reconciliation"?"Resumen por banca":"Resumen por fecha"}</option><option value="detail">{kind==="reconciliation"?"Detalle por ticket y operación":"Detalle de jugadas"}</option></ComboboxSelect></label>}
     {kind==="reconciliation"&&<label className="text-xs">Operación<ComboboxSelect className={filterInput} value={draft.operation??"all"} onChange={e=>change("operation",e.target.value)}><option value="all">Todas</option><option value="sale">Ventas</option><option value="refund">Anulaciones</option><option value="prize">Premios pagados</option></ComboboxSelect></label>}
     {kind==="tickets"&&<label className="text-xs">Estado<ComboboxSelect className={filterInput} value={draft.state??"all"} onChange={e=>change("state",e.target.value)}><option value="all">Todos</option><option value="pending">Pendientes</option><option value="lost">Perdidos</option><option value="winners">Ganadores</option><option value="cancelled">Anulados</option></ComboboxSelect></label>}
     {ticketFilters&&<label className="text-xs">Premios<ComboboxSelect className={filterInput} value={draft.payment??"all"} onChange={e=>change("payment",e.target.value)}><option value="all">Todos</option><option value="unpaid">Sin pagar</option><option value="partial">Pago parcial</option><option value="paid">Pagados</option></ComboboxSelect></label>}
     {kind==="printing"&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.risk==="1"} onChange={e=>change("risk",e.target.checked?"1":"0")}/>Solo reimpresos con premios pagados</label>}
     <label className="text-xs">Buscar en el listado<input className={filterInput} value={draft.search??""} onChange={e=>change("search",e.target.value)} placeholder="Ticket, número, banca…"/></label>
     <button className={button+" !h-8 !px-2 !py-1 !text-xs"} disabled={query.isFetching}><Search className="mr-1 inline h-4 w-4"/>Consultar</button><button type="button" aria-label="Actualizar reporte" className={secondary+" !h-8 !px-2 !py-1"} disabled={query.isFetching} onClick={()=>query.refetch()}><RefreshCw className={`h-4 w-4 ${query.isFetching?"animate-spin":""}`}/></button>
    </form>
    {query.isError&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950">{(query.error as any)?.response?.data?.message??"No se pudo cargar el reporte."}</p>}
    {data&&<>
     {!!Object.keys(data.totals).length&&<div className="grid grid-cols-2 gap-2 xl:grid-cols-4">{Object.entries(data.totals).map(([label,value])=><div key={label} className={panel+" !p-2"}><p className="text-xs text-slate-500">{label} · período</p><strong className="text-base">{money(Number(value),data.currency)}</strong></div>)}</div>}
    </>}
    </section>
    <div className={panel+" mt-1 flex min-h-0 flex-1 flex-col !p-0 overflow-hidden"}><div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-3 dark:border-slate-800"><div className="flex min-w-0 items-center gap-2"><h2 className="text-sm font-semibold">{initial.available.find((r:any)=>r.key===kind)?.label}</h2>{data?.note&&<details className="relative"><summary aria-label="Información del reporte" title="Información del reporte" className="cursor-pointer list-none rounded p-1 text-slate-500 hover:text-emerald-600 [&::-webkit-details-marker]:hidden"><Info className="h-4 w-4"/></summary><p className="absolute left-0 top-7 z-20 w-72 max-w-[70vw] rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">{data.note}</p></details>}</div><div className="flex gap-2">{[["pdf","Ver PDF",FileText],["print","Imprimir",Printer]].map(([format,label,Icon]:any)=><button key={format} type="button" disabled={!data||query.isFetching||query.isError} onClick={()=>setPreview({url:exportUrl("pdf"),title:initial.available.find((r:any)=>r.key===kind)?.label??"Reporte",print:format==="print"})} className={secondary+" disabled:opacity-50"}><Icon className="mr-1 inline h-4 w-4"/>{label}</button>)}</div></div><div className="min-h-0 flex-1"><DataTable footerNote={data?`${initial.office.name} · ${data.from} al ${data.to} · Hora RD`:undefined} fillHeight loading={query.isLoading} data={data?.rows.data??[]} columns={(data?.columns??[]).map((c:any)=>({accessorKey:c.key,header:c.label,cell:({row}:any)=>{const value=c.key==="ticket"?(row.original.reference??row.original[c.key]):row.original[c.key];return <span className={row.original.risk?"font-semibold text-amber-700 dark:text-amber-400":""}>{value==null?"—":c.type==="money"?money(Number(value),data.currency):c.type==="date"?new Date(value).toLocaleString("es-DO",{timeZone:"America/Santo_Domingo"}):c.key==="mode"?(modes as any)[value]??value:String(value)}</span>;}}))} serverPage={data?.rows} onPageChange={url=>setFilters(f=>({...f,page:new URL(url).searchParams.get("page")??"1"}))} emptyMessage="No hay registros para los filtros seleccionados."/></div></div>
   </main>
  </div>
 {preview&&<ReportPdfModal url={preview.url} title={preview.title} autoPrint={preview.print} onClose={()=>setPreview(null)}/>}
 </Shell>;
}
