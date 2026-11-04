import { useState } from 'react';
import ComboboxSelect from '@/Components/ComboboxSelect';
import { Plus } from 'lucide-react';
import { paymentMethods } from '@/lib/paymentMethods';
import { requestId } from '@/lib/requestId';
import { input, secondary } from './shared';

type Settings = { payment_methods?: string[] | null; payment_method_labels?: Record<string, string> | null; payment_reference_required?: Record<string, boolean> | null; [key: string]: any };
type Props = { settings: Settings; parent: Settings; branch: boolean; disabled: boolean; errors?: Record<string, string>; onChange: (settings: Settings) => void };

export default function PaymentMethodsEditor({ settings, parent, branch, disabled, errors = {}, onChange }: Props) {
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const inherited = branch && settings.payment_methods == null;
    const custom = { ...parent.payment_method_labels, ...(inherited ? {} : settings.payment_method_labels) };
    const catalog = { ...paymentMethods, ...custom };
    const enabled = settings.payment_methods ?? parent.payment_methods ?? ['cash'];
    const references = inherited ? (parent.payment_reference_required ?? {}) : (settings.payment_reference_required ?? (branch ? {} : parent.payment_reference_required) ?? {});
    const add = () => {
        const label = name.trim();
        if (!label) { setError('Escribe el nombre del medio de cobro.'); return; }
        if (Object.values(catalog).some(value => value.trim().toLocaleLowerCase() === label.toLocaleLowerCase())) { setError('Ya existe un medio de cobro con ese nombre.'); return; }
        const key = `custom_${requestId().replaceAll('-', '').slice(0, 12)}`;
        onChange({ ...settings, payment_methods: [...enabled, key], payment_method_labels: { ...custom, [key]: label } });
        setName(''); setError('');
    };
    return <fieldset disabled={disabled} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 md:col-span-2 xl:col-span-3">
        <legend className="px-1 text-sm font-semibold">Medios de cobro de ventas</legend>
        {branch && <ComboboxSelect aria-label="Configuración de medios de cobro" className={input} value={inherited ? 'inherit' : 'own'} onChange={event => {
            setError('');
            if (event.target.value === 'inherit') {
                const copy = { ...settings }; delete copy.payment_methods; delete copy.payment_method_labels; delete copy.payment_reference_required; onChange(copy);
            } else onChange({ ...settings, payment_methods: [...(parent.payment_methods ?? ['cash'])], payment_method_labels: { ...custom }, payment_reference_required: { ...parent.payment_reference_required } });
        }}><option value="inherit">Heredar del consorcio</option><option value="own">Configuración independiente de esta banca</option></ComboboxSelect>}
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(catalog).map(([key, label]) => <div key={key} className="min-w-0 space-y-2 rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700"><div className="flex min-w-0 items-center gap-2">
            <input type="checkbox" aria-label={`Habilitar ${label}`} disabled={inherited} checked={enabled.includes(key)} onChange={event => onChange({ ...settings, payment_methods: event.target.checked ? [...enabled, key] : enabled.filter(method => method !== key) })} />
            {key in paymentMethods ? <span className="text-sm">{label}</span> : <input aria-label={`Nombre del medio ${key}`} className="min-w-0 flex-1 rounded border-0 bg-transparent p-0 text-sm focus:ring-1 focus:ring-emerald-500" value={label} maxLength={80} disabled={inherited} onChange={event => onChange({ ...settings, payment_method_labels: { ...custom, [key]: event.target.value } })} />}
        </div><label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" aria-label={`Referencia obligatoria para ${label}`} disabled={inherited} checked={!!references[key]} onChange={event => onChange({ ...settings, payment_reference_required: { ...references, [key]: event.target.checked } })} />Referencia obligatoria</label></div>)}</div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="min-w-48 flex-1 text-xs sm:max-w-sm">Nuevo medio de cobro<input aria-label="Nuevo medio de cobro" className={`${input} mt-1`} placeholder="Ej.: PayPal, Cash App, Zelle…" maxLength={80} value={name} disabled={inherited} onChange={event => { setName(event.target.value); setError(''); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} /></label>
            <button type="button" className={`${secondary} inline-flex items-center gap-2`} disabled={inherited} onClick={add}><Plus size={16} aria-hidden />Agregar medio</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Agrega los medios que necesites y marca los habilitados. Puedes editar los nombres personalizados o desmarcarlos para dejar de usarlos; las ventas anteriores conservan su nombre original. Solo Efectivo afecta el saldo de caja.</p>
        <p className="mt-1 text-xs text-slate-500">Marca «Referencia obligatoria» en los medios que deban exigir un número o código de operación antes de vender.</p>
        {inherited && <p className="mt-2 text-xs text-slate-500">Para agregar medios propios, elige una configuración independiente. Las bancas independientes conservan sus medios aunque cambie el consorcio.</p>}
        {disabled && <p className="mt-2 text-xs text-amber-600">Requiere el permiso «Configurar medios de cobro por consorcio y banca».</p>}
        {error && <p role="alert" className="mt-2 text-sm text-red-500">{error}</p>}
        {Object.entries(errors).filter(([key]) => key.startsWith('settings.payment_method') || key.startsWith('settings.payment_reference_required')).map(([key, message]) => <p role="alert" key={key} className="mt-2 text-sm text-red-500">{message}</p>)}
    </fieldset>;
}
