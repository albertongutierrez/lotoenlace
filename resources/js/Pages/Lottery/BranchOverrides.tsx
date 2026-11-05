import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import Modal from '@/Components/Modal';
import { BranchOverride, inheritedBranchValue, listBranchOverrides, removeBranchOverride } from '@/lib/branchSettings';
import { paymentMethods } from '@/lib/paymentMethods';
import { button, Draw, drawName, modes, money, secondary } from './shared';

type Props = {
    settings: Record<string, any>;
    parent: Record<string, any>;
    draws: Draw[];
    currency: string;
    disabled: boolean;
    can: (permission: string) => boolean;
    errors: Record<string, string>;
    onChange: (settings: Record<string, any>) => void;
};

const labels: Record<string, string> = {
    daily_limit_minor: 'Límite diario de la banca', cancel_minutes: 'Tiempo para anular', reprint_minutes: 'Tiempo para reimprimir',
    discount_enabled: 'Descuento habilitado', discount_every_minor: 'Descuento por cada monto jugado', discount_amount_minor: 'Monto del descuento',
    footer: 'Pie del ticket', show_qr: 'QR del ticket', draw_ids: 'Sorteos habilitados', reconciliation_mode: 'Forma de cuadre',
    payment_methods: 'Medios de cobro y referencias', payment_method_labels: 'Nombres de los medios de cobro',
    commission_bps: 'Comisión', payouts: 'Premios', enabled: 'Habilitación', ordered: 'Números asignados por sorteo', primary_draw_id: 'Sorteo base',
};

function requiredPermission(path: string[]): string {
    if (path[0].startsWith('payment_')) return 'lottery.payments.configure';
    if (path[0] === 'reconciliation_mode') return 'lottery.reconciliation.configure';
    return 'lottery.settings';
}

export default function BranchOverrides({ settings, parent, draws, currency, disabled, can, errors, onChange }: Props) {
    const [confirmAll, setConfirmAll] = useState(false);
    const overrides = listBranchOverrides(settings);
    const canResetAll = overrides.every(override => can(requiredPermission(override.path)));
    const drawLabel = (id: string | number) => {
        const draw = draws.find(item => item.id === Number(id));
        return draw ? drawName(draw) : `Sorteo ${id}`;
    };
    const title = ({ path }: BranchOverride) => {
        const [section, key, field] = path;
        if (path.length === 1) return labels[section] ?? section;
        if (section === 'super_pale') return `Súper palé general · ${labels[key] ?? key}`;
        if (section === 'general_rules') return `${modes[key as keyof typeof modes]} general · ${labels[field] ?? field}`;
        if (section === 'pairs') return `Súper palé · ${key.split('-').map(drawLabel).join(' + ')} · ${labels[field] ?? field}`;
        const [id, mode] = key.split(':');
        return `${modes[mode as keyof typeof modes]} · ${drawLabel(id)} · ${labels[field] ?? field}`;
    };
    const showValue = (override: BranchOverride, value: any, inherited: boolean) => {
        const field = override.path.at(-1)!;
        if (value == null) return field === 'daily_limit_minor' ? 'Sin límite diario' : 'Sin configuración';
        if (field === 'commission_bps') return `${new Intl.NumberFormat('es-DO').format(value / 100)} %`;
        if (field.endsWith('_minor')) return money(value, currency);
        if (field.endsWith('_minutes')) return `${value} minutos`;
        if (field === 'reconciliation_mode') return value === 'report' ? 'Cuadre por reporte' : 'Cajas';
        if (field === 'primary_draw_id') return drawLabel(value);
        if (field === 'draw_ids') return <details><summary className="cursor-pointer">{value.length} sorteos</summary><ul className="mt-2 space-y-1">{value.map((id: number) => <li key={id}>{drawLabel(id)}</li>)}</ul></details>;
        if (field === 'payouts') {
            const prizes = Object.entries(value);
            return prizes.length ? <ul className="space-y-1">{prizes.map(([category, payout]) => <li key={category}>Premio {category} · {String(payout)} por unidad apostada</li>)}</ul> : 'Sin categorías de premio';
        }
        if (field === 'payment_methods') {
            const source = inherited ? parent : settings;
            const names = { ...paymentMethods, ...parent.payment_method_labels, ...source.payment_method_labels };
            return value.length ? <ul className="space-y-1">{value.map((method: string) => <li key={method}>{names[method] ?? method}{source.payment_reference_required?.[method] ? ' · referencia obligatoria' : ''}</li>)}</ul> : 'Ninguno';
        }
        if (field === 'payment_method_labels') return Object.values(value).join(', ') || 'Sin nombres propios';
        if (typeof value === 'boolean') return value ? 'Sí' : 'No';
        return String(value) || 'Vacío';
    };

    return <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-semibold">Excepciones de esta banca</h2><p className="mt-1 text-sm text-slate-500">{overrides.length} personalizaciones propias. Revisa qué valor se usará al heredar y guarda la configuración para aplicar los cambios.</p></div>
            {overrides.length > 0 && <button type="button" className={`${secondary} inline-flex items-center gap-2 disabled:opacity-40`} disabled={disabled || !canResetAll} onClick={() => setConfirmAll(true)}><RotateCcw size={16} aria-hidden />Heredar todo del consorcio</button>}
        </div>
        {Object.values(errors).length > 0 && <div role="alert" className="text-sm text-red-500">{[...new Set(Object.values(errors))].map(message => <p key={message}>{message}</p>)}</div>}
        {!canResetAll && <p className="text-sm text-amber-600">Para restablecer toda la banca necesitas los permisos de las configuraciones que tiene personalizadas.</p>}
        {overrides.length === 0 ? <p className="rounded-lg border border-emerald-600/30 p-4 text-sm text-emerald-600">Esta banca hereda toda su configuración del consorcio.</p> : <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 dark:bg-slate-950"><tr><th className="px-4 py-3">Excepción</th><th className="px-4 py-3">Valor propio</th><th className="px-4 py-3">Al heredar</th><th className="px-4 py-3">Acciones</th></tr></thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">{overrides.map(override => {
                    const name = title(override);
                    const allowed = can(requiredPermission(override.path));
                    return <tr key={override.path.join('/')} className="align-top">
                        <td className="min-w-48 px-4 py-3 font-medium">{name}</td>
                        <td className="min-w-40 px-4 py-3">{showValue(override, override.value, false)}</td>
                        <td className="min-w-40 px-4 py-3 text-slate-500">{showValue(override, inheritedBranchValue(settings, parent, override.path), true)}</td>
                        <td className="px-4 py-3"><button type="button" aria-label={`Heredar ${name}`} disabled={disabled || !allowed} className={`${secondary} inline-flex items-center gap-2 disabled:opacity-40`} onClick={() => onChange(removeBranchOverride(settings, override.path))}><RotateCcw size={15} aria-hidden />Heredar</button>{!allowed && <p className="mt-2 text-xs text-amber-600">Requiere permiso para modificar esta configuración.</p>}</td>
                    </tr>;
                })}</tbody>
            </table>
        </div>}
        <Modal show={confirmAll} onClose={() => setConfirmAll(false)} maxWidth="md">
            <div className="space-y-4 p-6"><h2 className="text-lg font-semibold">Heredar toda la configuración</h2><p className="text-sm text-slate-500">Se quitarán las {overrides.length} personalizaciones propias de esta banca. El cambio se aplicará al pulsar Guardar configuración.</p><div className="flex justify-end gap-2"><button type="button" className={secondary} onClick={() => setConfirmAll(false)}>Cancelar</button><button type="button" className={button} disabled={disabled || !canResetAll} onClick={() => { onChange({}); setConfirmAll(false); }}>Heredar todo</button></div></div>
        </Modal>
    </div>;
}
