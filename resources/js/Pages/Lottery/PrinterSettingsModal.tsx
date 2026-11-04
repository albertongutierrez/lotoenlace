import { useId, useState } from 'react';
import { Dialog } from '@headlessui/react';
import { Check, Download, KeyRound, LoaderCircle, Monitor, Printer, RefreshCw, Save, X } from 'lucide-react';
import Modal from '@/Components/Modal';
import ComboboxSelect from '@/Components/ComboboxSelect';
import LoadingSkeleton from '@/Components/LoadingSkeleton';
import { agentConnection, agentRequest, LocalPrinter, printerPreference, savePrinterPreference } from '@/lib/localPrinter';
import { button, input, secondary } from './shared';

export default function PrinterSettingsModal({ branchId, onClose }: { branchId: number; onClose: () => void }) {
    const feedId = useId();
    const [preference, setPreference] = useState(() => printerPreference(branchId));
    const [token, setToken] = useState(() => agentConnection()?.token ?? '');
    const [printers, setPrinters] = useState<LocalPrinter[]>([]);
    const [deviceId, setDeviceId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const connect = async () => {
        if (busy) return;
        setBusy(true); setError(''); setDeviceId('');
        try {
            const data = await agentRequest('/printers', token.trim());
            if (new URL(data.issuer).origin !== window.location.origin) throw new Error('El agente está vinculado a otro sistema.');
            setPrinters(data.printers); setDeviceId(data.device_id);
            const current = data.printers.find((p: LocalPrinter) => p.name === preference.printer);
            setPreference(p => ({ ...p, printer: current && !current.virtual ? current.name : '' }));
        } catch (e: any) { setPrinters([]); setError(e.message ?? 'No se pudieron consultar las impresoras.'); }
        finally { setBusy(false); }
    };
    const validFeed = Number.isInteger(preference.feed_lines) && preference.feed_lines! >= 0 && preference.feed_lines! <= 15;
    const canSave = validFeed && (preference.mode === 'browser' || (deviceId && printers.some(p => p.name === preference.printer && !p.virtual && !p.offline)));
    return <Modal show onClose={onClose} closeable={!busy} maxWidth="2xl"><form className="text-slate-900 dark:text-slate-100" onSubmit={e => {
        e.preventDefault(); if (!canSave || busy) return;
        try { savePrinterPreference(branchId, preference, deviceId ? { token: token.trim(), deviceId } : undefined); onClose(); } catch { setError('El navegador no permitió guardar la configuración de esta PC.'); }
    }}>
        <div className="flex items-center gap-3 border-b border-slate-200 p-4 dark:border-slate-700"><Printer className="h-5 w-5 text-emerald-500" /><div className="flex-1"><Dialog.Title className="font-semibold">Impresora de esta PC</Dialog.Title><Dialog.Description className="text-xs text-slate-500">Configuración local para la banca actual.</Dialog.Description></div><button type="button" disabled={busy} className={secondary} aria-label="Cerrar configuración de impresora" onClick={onClose}><X size={16} /></button></div>
        <div className="max-h-[70dvh] space-y-4 overflow-y-auto p-4">
            <label className="block text-sm font-medium">Imprimir con<ComboboxSelect autoFocus className={input} value={preference.mode} onChange={e => setPreference(p => ({ ...p, mode: e.target.value as 'browser' | 'local' }))}><option value="browser">Diálogo del navegador</option><option value="local">Agente local · impresión térmica directa</option></ComboboxSelect></label>
            {preference.mode === 'local' && <>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950"><p className="mb-2 font-medium"><Monitor size={15} className="mr-2 inline" />Instala el agente en esta PC</p><p className="text-xs text-slate-500">Descarga el paquete completo, extrae la carpeta y abre Instalar.bat con doble clic. Instala Node.js si hace falta y activa el inicio automático con Windows. El icono junto al reloj permite ver el estado, reiniciar y consultar logs. Copia aquí la clave que muestra al terminar.</p><a href="/lottery/print-agent/download" className={secondary + ' mt-3 inline-flex items-center gap-2'}><Download size={15} />Descargar paquete completo (.zip)</a></div>
                <div className="flex items-end gap-2"><label className="min-w-0 flex-1 text-sm"><span className="mb-1 flex items-center gap-2"><KeyRound size={15} />Clave de conexión local</span><input type="password" className={input} value={token} autoComplete="off" onChange={e => { setToken(e.target.value); setDeviceId(''); }} placeholder="Clave mostrada por el agente" /></label><button type="button" className={secondary} disabled={busy || !token.trim()} onClick={() => void connect()}>{busy ? <LoaderCircle size={16} className="mr-2 inline animate-spin" /> : <RefreshCw size={16} className="mr-2 inline" />}Detectar impresoras</button></div>
                {busy ? <LoadingSkeleton compact label="Consultando impresoras de esta PC…" /> : deviceId && <>
                    <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400"><Check size={16} className="mr-1 inline" />Agente conectado · {printers.length} impresoras detectadas</p>
                    <label className="block text-sm">Impresora térmica<ComboboxSelect className={input} value={preference.printer} onChange={e => setPreference(p => ({ ...p, printer: e.target.value }))}><option value="">Selecciona la impresora</option>{printers.map(p => <option key={p.name} value={p.name} disabled={p.virtual || p.offline}>{p.name}{p.isDefault ? ' · Predeterminada' : ''}{p.virtual ? ' · Virtual' : p.offline ? ' · Sin conexión' : ''}</option>)}</ComboboxSelect></label>
                    {!printers.length && <p className="text-sm text-slate-500">Instala la impresora en Windows y vuelve a detectar.</p>}
                </>}
                <div className="grid grid-cols-2 gap-3"><label className="text-sm">Lenguaje<ComboboxSelect className={input} value={preference.profile} onChange={e => setPreference(p => ({ ...p, profile: e.target.value as 'epson' | 'star' }))}><option value="epson">ESC/POS · Epson compatible</option><option value="star">Star</option></ComboboxSelect></label><label className="text-sm">Papel<ComboboxSelect className={input} value={preference.paper_width} onChange={e => setPreference(p => ({ ...p, paper_width: Number(e.target.value) as 58 | 80 }))}><option value={80}>80 mm</option><option value={58}>58 mm</option></ComboboxSelect></label></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={preference.cut} onChange={e => setPreference(p => ({ ...p, cut: e.target.checked }))} />Cortar papel al terminar</label>
                <p className="text-xs text-slate-500">El agente requiere una impresora térmica compatible con el lenguaje elegido. Windows confirma la recepción en la cola; la salida física depende del equipo.</p>
            </>}
            <div className="text-sm"><label htmlFor={feedId} className="block">Líneas en blanco al final del ticket</label><input id={feedId} aria-describedby={feedId + '-help'} type="number" min={0} max={15} step={1} required className={input + ' mt-1 max-w-28'} value={preference.feed_lines ?? ''} onChange={e => setPreference(p => ({ ...p, feed_lines: e.target.value === '' ? undefined : Number(e.target.value) }))} /><p id={feedId + '-help'} className="mt-1 text-xs text-slate-500">De 0 a 15 líneas después del último texto. Ajusta el espacio para el corte de tu impresora.</p></div>
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-300">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-700"><button type="button" disabled={busy} className={secondary} onClick={onClose}><X size={15} className="mr-1 inline" />Cancelar</button><button type="submit" className={button} disabled={busy || !canSave}><Save size={15} className="mr-1 inline" />Guardar impresora</button></div>
    </form></Modal>;
}
