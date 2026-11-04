import { useEffect, useRef, useState } from "react";
import { Dialog } from "@headlessui/react";
import axios from "axios";
import { FileText, Printer, X, RefreshCw } from "lucide-react";
import Modal from "./Modal";
import LoadingSkeleton from "./LoadingSkeleton";

export default function ReportPdfModal({url,title,autoPrint=false,onClose,description="A4 vertical · Filtros consultados"}:{url:string;title:string;autoPrint?:boolean;onClose:()=>void;description?:string}) {
 const frame=useRef<HTMLIFrameElement>(null);
 const printed=useRef(false);
 const [source,setSource]=useState<string|null>(null);
 const [ready,setReady]=useState(false);
 const [error,setError]=useState("");
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();let objectUrl:string|undefined;
  setSource(null);setReady(false);setError("");printed.current=false;
  axios.get(url,{responseType:"blob",signal:controller.signal,headers:{Accept:"application/pdf"}}).then(response=>{
   if(controller.signal.aborted)return;
   if(!String(response.headers['content-type']??'').includes('application/pdf')) throw new Error('invalid-pdf');
   objectUrl=URL.createObjectURL(response.data);setSource(objectUrl);
  }).catch(async error=>{
   if(controller.signal.aborted)return;
   let message="No se pudo generar el PDF. Intenta nuevamente.";
   if(error.response?.status===403)message="No tienes permiso para consultar este reporte.";
   else if(error.response?.status===409)message="Cambió el consorcio activo. Cierra esta ventana y actualiza el reporte.";
   if(!controller.signal.aborted)setError(message);
  });
  return ()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[url,attempt]);
 const print=()=>{
  try {frame.current?.contentWindow?.focus();frame.current?.contentWindow?.print();}
  catch {setError("Usa el icono de impresora del visor PDF para imprimir este documento.");}
 };
 const button="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium dark:border-slate-600 disabled:opacity-40";
 return <Modal show maxWidth="7xl" onClose={onClose}>
  <div className="flex h-[88dvh] min-h-0 flex-col">
   <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
    <div className="min-w-0"><Dialog.Title className="flex items-center gap-2 text-base font-semibold"><FileText className="h-5 w-5 shrink-0"/>PDF · {title}</Dialog.Title><p className="mt-1 text-xs text-slate-500">{description}</p></div>
    <div className="flex gap-2"><button type="button" className={button} onClick={onClose}><X className="h-4 w-4"/>Cerrar</button><button type="button" className={button+" border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"} disabled={!ready} onClick={print}><Printer className="h-4 w-4"/>Imprimir</button></div>
   </header>
   {error&&<div role="alert" className="shrink-0 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}{!source&&<button type="button" className={button+" ml-3"} onClick={()=>setAttempt(n=>n+1)}><RefreshCw className="h-4 w-4"/>Reintentar</button>}</div>}
   <div className="relative min-h-0 flex-1 bg-slate-100 dark:bg-slate-950">
    {!ready&&!error&&<div className="absolute inset-0 z-10 bg-white dark:bg-slate-900"><LoadingSkeleton label="Generando PDF…"/></div>}
    {source&&<iframe ref={frame} src={source} title={`PDF de ${title}`} className="h-full w-full border-0" onLoad={()=>{setReady(true);if(autoPrint&&!printed.current){printed.current=true;print();}}}/>}
   </div>
  </div>
 </Modal>;
}
