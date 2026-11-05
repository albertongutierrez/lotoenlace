import { useState } from 'react';
import { RotateCcw, Ticket } from 'lucide-react';
import ComboboxSelect from '@/Components/ComboboxSelect';
import Modal from '@/Components/Modal';
import { clearTariffOverride } from '@/lib/tariffSettings';
import { button, Draw, drawName, Field, input, modes, panel, secondary } from './shared';

type Mode = 'quiniela' | 'pale' | 'tripleta';
type Tariff = { commission_bps?: number | null; payouts?: Record<string, number> | null };
type Settings = {
    general_rules?: Partial<Record<Mode, Tariff | null>>;
    rules?: Record<string, Tariff>;
    [key: string]: any;
};
type Props = { settings: Settings; parent: Settings; draws: Draw[]; branch: boolean; onChange: (settings: Settings) => void };

const categories: Record<Mode, string[]> = { quiniela: ['1', '2', '3'], pale: ['1-2', '1-3', '2-3'], tripleta: ['3', '2'] };

function mergeTariffs(...rules: (Tariff | null | undefined)[]): Tariff {
    const result: Tariff = {};
    for (const rule of rules) {
        if (rule?.commission_bps != null) result.commission_bps = rule.commission_bps;
        if (rule?.payouts != null) result.payouts = rule.payouts;
    }
    return result;
}

export default function TariffRulesEditor({ settings, parent, draws, branch, onChange }: Props) {
    const [scope, setScope] = useState('general');
    const [drawId, setDrawId] = useState('');
    const [resetMode, setResetMode] = useState<Mode | null>(null);
    const draw = draws.find(item => String(item.id) === drawId);
    const general = scope === 'general';
    const availableModes = (Object.keys(categories) as Mode[]).filter(mode => general || draw?.modalities.includes(mode));
    const exceptionKeys = (mode: Mode) => Object.keys(settings.rules ?? {}).filter(key => key.endsWith(`:${mode}`));

    return <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Aplicar configuración">
                <ComboboxSelect aria-label="Alcance de comisiones y premios" className={input} value={scope} onChange={event => setScope(event.target.value)}>
                    <option value="general">General · todos los sorteos</option>
                    <option value="draw">Excepción para un sorteo</option>
                </ComboboxSelect>
            </Field>
            {!general && <Field label="Sorteo">
                <ComboboxSelect aria-label="Sorteo para comisiones y premios" className={input} value={drawId} onChange={event => setDrawId(event.target.value)}>
                    <option value="">Seleccionar sorteo</option>
                    {draws.map(item => <option key={item.id} value={String(item.id)}>{drawName(item)}</option>)}
                </ComboboxSelect>
            </Field>}
        </div>
        <p className="text-sm text-slate-500">Configura una comisión y una tabla de premios general para cada modalidad. Los ajustes propios de un sorteo tienen prioridad. Las bancas heredan del consorcio y pueden tener sus propios valores generales y excepciones.</p>
        <p className="text-sm text-slate-500">Los premios indican cuánto se paga por cada unidad apostada. La comisión se calcula sobre el monto cobrado.</p>
        <div className="grid items-start gap-4 xl:grid-cols-3">
            {availableModes.map(mode => {
                const section = general ? 'general_rules' : 'rules';
                const key = general ? mode : `${draw!.id}:${mode}`;
                const entries: Record<string, Tariff | null> = general ? (settings.general_rules ?? {}) : (settings.rules ?? {});
                const own = entries[key] ?? {};
                const inherited = general ? mergeTariffs(parent.general_rules?.[mode])
                    : mergeTariffs(parent.general_rules?.[mode], parent.rules?.[key], settings.general_rules?.[mode]);
                const effective = mergeTariffs(inherited, own);
                const change = (next: Tariff) => onChange({ ...settings, [section]: { ...entries, [key]: next } });
                const inherit = () => onChange(clearTariffOverride(settings, section, key));
                const customized = Object.hasOwn(entries, key);
                const prizeCategories = categories[mode].filter(category => general || mode !== 'quiniela' || Number(category) <= (draw?.result_count ?? 3));
                const exceptions = exceptionKeys(mode).length;

                return <section key={mode} className={`${panel} space-y-4`}>
                    <div className="space-y-1">
                        <h2 className="flex items-center gap-2 font-semibold"><Ticket size={16} aria-hidden />{modes[mode]}</h2>
                        <p className="text-xs text-slate-500">{customized ? 'Personalizado' : general && !branch ? 'Sin configuración global propia' : 'Heredado'}</p>
                    </div>
                    <Field label="Comisión sobre cobrado (%)">
                        <input aria-label={`Comisión de ${modes[mode]}`} className={input} type="number" min="0" max="100" step="0.01"
                            value={own.commission_bps == null ? '' : own.commission_bps / 100}
                            placeholder={String((inherited.commission_bps ?? 0) / 100)}
                            onChange={event => change({ ...own, commission_bps: event.target.value === '' ? null : Math.round(Number(event.target.value) * 100) })} />
                    </Field>
                    {prizeCategories.map(category => <Field key={category} label={`Premio ${category}`}>
                        <input aria-label={`Premio ${category} de ${modes[mode]}`} className={input} type="number" min="0" max="1000000" step="1"
                            value={effective.payouts?.[category] ?? ''}
                            onChange={event => {
                                const payouts = { ...effective.payouts };
                                if (event.target.value === '') delete payouts[category];
                                else payouts[category] = Number(event.target.value);
                                change({ ...own, payouts });
                            }} />
                    </Field>)}
                    <button type="button" disabled={!customized} className={`${secondary} inline-flex items-center gap-2 disabled:opacity-40`} onClick={inherit}>
                        <RotateCcw size={16} aria-hidden />{general ? (branch ? 'Heredar del consorcio' : 'Borrar personalización global') : 'Usar valores heredados'}
                    </button>
                    {general && exceptions > 0 && <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                        <p className="text-xs text-slate-500">{exceptions} sorteos tienen ajustes propios de {modes[mode]}.</p>
                        <button type="button" className={`${secondary} text-sm`} onClick={() => setResetMode(mode)}>Usar general en todos los sorteos</button>
                    </div>}
                </section>;
            })}
        </div>
        {!general && !draw && <p className="text-sm text-slate-500">Selecciona un sorteo para configurar sus comisiones y premios.</p>}
        {!general && draw?.modalities.includes('super_pale') && <p className="text-sm text-slate-500">El súper palé tiene valores generales y excepciones por pareja en su pestaña.</p>}
        <Modal show={resetMode !== null} maxWidth="md" onClose={() => setResetMode(null)}>
            <div className="space-y-4 p-6">
                <h2 className="text-lg font-semibold">Usar la configuración general</h2>
                <p className="text-sm text-slate-500">Se retirarán los {resetMode ? exceptionKeys(resetMode).length : 0} ajustes propios por sorteo de {resetMode ? modes[resetMode] : ''} en esta configuración. Los sorteos usarán los valores heredados. El cambio se aplicará al guardar la configuración.</p>
                <div className="flex justify-end gap-2">
                    <button type="button" className={secondary} onClick={() => setResetMode(null)}>Cancelar</button>
                    <button type="button" className={button} onClick={() => {
                        let next = settings;
                        for (const key of exceptionKeys(resetMode!)) next = clearTariffOverride(next, 'rules', key);
                        onChange(next);
                        setResetMode(null);
                    }}>Usar general</button>
                </div>
            </div>
        </Modal>
    </div>;
}
