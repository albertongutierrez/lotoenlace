import ComboboxSelect from '@/Components/ComboboxSelect';
import { formatDateTime, normalizeDateTimePreferences } from '@/lib/dateTime';
import { Field, input } from './shared';

const preferred: Record<string,string> = {'America/Santo_Domingo':'República Dominicana · Santo Domingo','Europe/Madrid':'España · Madrid','Atlantic/Canary':'España · Canarias','America/New_York':'Estados Unidos · Nueva York','America/Port-au-Prince':'Haití · Puerto Príncipe'};
export default function DateTimeSettings({settings,parent,branch,timezones,onChange}: {settings:Record<string,any>;parent:Record<string,any>;branch:boolean;timezones:string[];onChange:(settings:Record<string,any>)=>void}) {
    const effective=normalizeDateTimePreferences({display_timezone:settings.display_timezone??parent.display_timezone,time_format:settings.time_format??parent.time_format});
    const zones=[...new Set([...Object.keys(preferred),...timezones,effective.display_timezone])];
    const update=(key:string,value:string)=>{const next={...settings};if(value==='inherit')delete next[key];else next[key]=value;onChange(next);};
    return <fieldset className="col-span-full grid gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Visualización de fechas y horas</legend>
        <Field label="Zona horaria de visualización"><ComboboxSelect aria-label="Zona horaria de visualización" className={input} value={settings.display_timezone??'inherit'} onChange={e=>update('display_timezone',e.target.value)}>
            <option value="inherit">{branch?'Heredar del consorcio':'Predeterminado'} · {parent.display_timezone??'America/Santo_Domingo'}</option>
            {zones.map(zone=><option key={zone} value={zone}>{preferred[zone]?`${preferred[zone]} · `:''}{zone}</option>)}
        </ComboboxSelect></Field>
        <Field label="Formato de hora"><ComboboxSelect aria-label="Formato de hora" className={input} value={settings.time_format??'inherit'} onChange={e=>update('time_format',e.target.value)}>
            <option value="inherit">{branch?'Heredar del consorcio':'Predeterminado'} · {parent.time_format??'12'} horas</option>
            <option value="12">12 horas · 02:30 p. m.</option><option value="24">24 horas · 14:30</option>
        </ComboboxSelect></Field>
        <p className="text-xs text-slate-500 sm:col-span-2">Vista previa: <strong>{formatDateTime(new Date(),{dateStyle:'short',timeStyle:'short'},effective)}</strong> · {effective.display_timezone}</p>
        <p className="text-xs text-slate-500 sm:col-span-2">Solo cambia la visualización, incluidos tickets y documentos. Los días operativos y filtros por fecha siguen en RD; los sorteos conservan sus horarios y zona propios.</p>
    </fieldset>;
}
