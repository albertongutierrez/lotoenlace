import { useId } from 'react';
import { BadgePercent, Copy, Globe2, RotateCcw, SlidersHorizontal, Ticket } from 'lucide-react';
import ComboboxSelect from '@/Components/ComboboxSelect';
import DateTimeSettings from './DateTimeSettings';
import SettingsSection from './SettingsSection';
import { Field, input } from './shared';

type Props = {
    settings: Record<string, any>; parent: Record<string, any>; scope: string;
    currency: string; onCurrencyChange: (currency: string) => void;
    timezones: string[]; errors: Record<string, string>; onChange: (settings: Record<string, any>) => void;
};

export default function GeneralPreferences({ settings, parent, scope, currency, onCurrencyChange, timezones, errors, onChange }: Props) {
    const id = useId();
    const branch = scope === 'branch';
    const value = (key: string) => settings[key] ?? parent[key];
    const update = (key: string, next: any) => onChange({ ...settings, [key]: next });
    const inherit = (key: string) => { const next = { ...settings }; delete next[key]; onChange(next); };
    const error = (key: string) => errors[`settings.${key}`] && <p role="alert" className="mt-1 text-xs text-red-500">{errors[`settings.${key}`]}</p>;
    const restore = (key: string, label: string) => branch && <button type="button" aria-label={`Heredar ${label}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400" onClick={() => inherit(key)}><RotateCcw size={11} aria-hidden />Heredar</button>;
    const number = (key: string, label: string) => {
        const money = key.endsWith('_minor');
        return <div className="min-w-0" key={key}>
            <div className="mb-1 flex items-start justify-between gap-2"><label htmlFor={`${id}-${key}`} className="text-sm font-medium">{label}</label>{restore(key, label)}</div>
            <div className="relative"><input id={`${id}-${key}`} className={input + (money ? ' !pr-14' : '')} type="number" min={0} step={money ? '0.01' : '1'}
                placeholder={value(key) == null ? 'Sin límite' : String(value(key) / (money ? 100 : 1))}
                value={settings[key] == null ? '' : settings[key] / (money ? 100 : 1)}
                onChange={e => update(key, e.target.value === '' ? null : Math.round(Number(e.target.value) * (money ? 100 : 1)))} />
                {money && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] font-semibold text-slate-500">{currency}</span>}
            </div>{error(key)}
        </div>;
    };
    const boolean = (key: string, label: string) => <div className="min-w-0" key={key}><Field label={label}>
        <ComboboxSelect aria-label={label} className={input} value={settings[key] == null ? 'inherit' : String(settings[key])} onChange={e => e.target.value === 'inherit' ? inherit(key) : update(key, e.target.value === 'true')}>
            <option value="inherit">{branch ? 'Heredar' : 'Predeterminado'} ({parent[key] ? 'Sí' : 'No'})</option><option value="true">Sí</option><option value="false">No</option>
        </ComboboxSelect>
    </Field>{error(key)}</div>;

    return <div className="col-span-full grid min-w-0 items-start gap-4 xl:grid-cols-2">
        <div className="min-w-0 space-y-4">
            <SettingsSection title="Operación y límites" description="Moneda y topes de venta de la operación." icon={SlidersHorizontal}>
                {!branch && <div className="sm:col-span-2"><Field label="Moneda del consorcio"><ComboboxSelect aria-label="Moneda del consorcio" className={input} value={currency} onChange={e => onCurrencyChange(e.target.value)}>{['DOP', 'USD', 'EUR', 'HTG'].map(code => <option key={code}>{code}</option>)}</ComboboxSelect></Field></div>}
                {number('daily_limit_minor', 'Límite diario por banca')}
                {!branch && number('consortium_limit_minor', 'Límite diario compartido')}
            </SettingsSection>
            <SettingsSection title="Descuentos" description="Define cuándo se aplica el descuento al vender." icon={BadgePercent}>
                <div className="sm:col-span-2">{boolean('discount_enabled', 'Descuento habilitado')}</div>
                {number('discount_every_minor', 'Por cada monto jugado')}
                {number('discount_amount_minor', 'Monto a descontar')}
            </SettingsSection>
            <SettingsSection title="Fechas y horas" description="Zona de visualización y formato del reloj." icon={Globe2}>
                <DateTimeSettings embedded settings={settings} parent={parent} branch={branch} timezones={timezones} onChange={onChange} />
            </SettingsSection>
        </div>
        <div className="min-w-0 space-y-4">
            <SettingsSection title="Tickets e impresión" description="Plazos, datos impresos y presentación del ticket." icon={Ticket}>
                {number('cancel_minutes', 'Minutos para anular')}
                {number('reprint_minutes', 'Minutos para reimprimir')}
                {boolean('show_qr', 'Mostrar QR en el ticket')}
                {boolean('abbreviate_draw_names', 'Usar abreviaturas en ventas')}
                {!branch && <div className="sm:col-span-2"><Field label="Mostrar PIN de pago al reimprimir"><ComboboxSelect aria-label="Mostrar PIN de pago al reimprimir" className={input} value={String(value('show_pin_on_reprint') ?? true)} onChange={e => update('show_pin_on_reprint', e.target.value === 'true')}><option value="true">Sí · incluir el PIN</option><option value="false">No · ocultar el PIN</option></ComboboxSelect></Field><p className="mt-1.5 text-xs leading-5 text-slate-500">Aplica a todas las bancas. El original y la primera continuación con PIN nuevo siempre lo incluyen.</p>{error('show_pin_on_reprint')}</div>}
                <div className="sm:col-span-2"><div className="mb-1 flex items-center justify-between gap-2"><label htmlFor={`${id}-footer`} className="text-sm font-medium">Pie de ticket</label>{restore('footer', 'Pie de ticket')}</div><textarea id={`${id}-footer`} className={input + ' min-h-20 resize-y'} rows={2} value={settings.footer ?? ''} placeholder={parent.footer || 'Gracias por jugar'} onChange={e => update('footer', e.target.value)} />{error('footer')}</div>
            </SettingsSection>
            <SettingsSection title="Copia de tickets" description="Origen de las jugadas y sorteos de destino." icon={Copy}>
                <div className="sm:col-span-2">{boolean('copy_consortium_tickets', 'Copiar tickets de otras bancas del consorcio')}</div>
                <div className="sm:col-span-2"><Field label="Cómo copiar tickets"><ComboboxSelect aria-label="Cómo copiar tickets" className={input} value={settings.ticket_copy_mode ?? 'inherit'} onChange={e => e.target.value === 'inherit' ? inherit('ticket_copy_mode') : update('ticket_copy_mode', e.target.value)}><option value="inherit">{branch ? 'Heredar del consorcio' : 'Predeterminado'} · {parent.ticket_copy_mode === 'selected' ? 'Sorteos seleccionados' : 'Sorteos originales'}</option><option value="selected">Copiar en los sorteos seleccionados</option><option value="original">Copiar en los sorteos originales</option></ComboboxSelect></Field><p className="mt-1.5 text-xs leading-5 text-slate-500">{value('ticket_copy_mode') === 'selected' ? 'Las jugadas regulares usan los sorteos seleccionados; los súper palés, las parejas elegidas.' : 'Conserva los sorteos y las parejas del ticket original.'}</p>{error('ticket_copy_mode')}</div>
            </SettingsSection>
        </div>
    </div>;
}
