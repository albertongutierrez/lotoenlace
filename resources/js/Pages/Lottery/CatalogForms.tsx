import { formatDateTime, displayTimezoneLabel } from '@/lib/dateTime';
import ComboboxSelect from "@/Components/ComboboxSelect";
import { useState } from "react";
import { Dialog } from "@headlessui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import Modal from "@/Components/Modal";
import { notify } from "@/lib/notify";
import { Field, Draw, input, button, secondary, modes } from "./shared";
import { drawLocalDate, drawTime, systemTimezone } from '@/lib/drawSchedule';

export type LotteryRow = { id: number; name: string; active: boolean; timezone?: string; draws_count?: number };
const preferredTimezones: Record<string, string> = { [systemTimezone]: 'República Dominicana · Santo Domingo', 'America/New_York': 'Estados Unidos · Nueva York', 'America/Port-au-Prince': 'Haití · Puerto Príncipe', 'America/Chicago': 'Estados Unidos · Chicago', 'America/Los_Angeles': 'Estados Unidos · Los Ángeles' };
function TimezoneSelect({ value, timezones, label, inheritZone, onChange }: { value: string | null; timezones: string[]; label: string; inheritZone?: string; onChange: (zone: string) => void }) {
    const zones = [...new Set([...Object.keys(preferredTimezones), ...timezones, ...(value ? [value] : []), ...(inheritZone ? [inheritZone] : [])])];
    return <ComboboxSelect aria-label={label} className={input} value={value ?? ''} onChange={e => onChange(e.target.value)}>
        {inheritZone && <option value="">Heredar de la lotería · {inheritZone}</option>}
        {zones.map(zone => <option key={zone} value={zone}>{preferredTimezones[zone] ? `${preferredTimezones[zone]} · ` : ''}{zone}</option>)}
    </ComboboxSelect>;
}
export function Status({ active }: { active: boolean }) {
    return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${active ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{active ? "Activa" : "Inactiva"}</span>;
}
export function useCatalogSave(url: string, done: () => void) {
    const client = useQueryClient();
    return useMutation({
        mutationFn: async (data: any) => (await axios.post(url, data)).data,
        onSuccess: async data => {
            await client.invalidateQueries({ queryKey: ["lottery"] });
            notify(data.message, "success");
            done();
        },
    });
}
function Errors({ error }: { error: any }) {
    if (!error) return null;
    const messages = error.response?.data?.errors ? Object.values(error.response.data.errors).flat() : [error.response?.data?.message ?? "No se pudo guardar. Intenta nuevamente."];
    return <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"><ul className="list-inside list-disc">{messages.map((message, i) => <li key={i}>{String(message)}</li>)}</ul></div>;
}
export function LotteryEditor({ lottery, timezones = [], onClose }: { lottery?: LotteryRow; timezones?: string[]; onClose: () => void }) {
    const [form, setForm] = useState({ id: lottery?.id, name: lottery?.name ?? "", active: lottery?.active ?? true, timezone: lottery?.timezone ?? systemTimezone });
    const save = useCatalogSave("/lottery/catalog/lotteries", onClose);
    return <Modal show onClose={onClose} closeable={!save.isPending} maxWidth="lg">
        <form className="space-y-5 p-6" onSubmit={event => { event.preventDefault(); save.mutate(form); }}>
            <Dialog.Title className="text-xl font-semibold">{lottery ? "Editar lotería" : "Nueva lotería"}</Dialog.Title>
            <Errors error={save.error} />
            <Field label="Nombre"><input autoFocus className={input} required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Zona horaria de la lotería"><TimezoneSelect label="Zona horaria de la lotería" value={form.timezone} timezones={timezones} onChange={timezone => setForm({ ...form, timezone })} /></Field>
            <p className="text-xs text-slate-500">Sus sorteos heredan esta zona por defecto. Al cambiarla se actualizan los que heredan; los sorteos con zona propia conservan su configuración.</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />Lotería activa</label>
            <p className="text-sm text-slate-500">Al desactivarla se detienen las ventas de todos sus sorteos. Los tickets y resultados anteriores se conservan.</p>
            <div className="flex justify-end gap-2"><button type="button" disabled={save.isPending} className={secondary} onClick={onClose}>Cancelar</button><button disabled={save.isPending} className={button}>{save.isPending ? "Guardando…" : "Guardar lotería"}</button></div>
        </form>
    </Modal>;
}
export function DrawEditor({ lottery, draw, timezones = [], onClose }: { lottery: LotteryRow; draw?: Draw; timezones?: string[]; onClose: () => void }) {
    const [form, setForm] = useState<any>(draw ? { ...draw, abbreviation: draw.abbreviation ?? '', timezone: draw.timezone_override !== undefined ? draw.timezone_override : draw.timezone ?? null, lottery_id: lottery.id, opens_at: draw.opens_at.slice(0, 5), closes_at: draw.closes_at.slice(0, 5), draws_at: draw.draws_at.slice(0, 5) } : {
        lottery_id: lottery.id, name: "", abbreviation: '', timezone: null, opens_at: "06:00", closes_at: "12:00", draws_at: "12:05",
        weekdays: [0, 1, 2, 3, 4, 5, 6], modalities: ["quiniela", "pale", "tripleta"], active: true,
        source_url: "", source_key: "", result_count: 3, exceptions: {},
    });
    const [exceptionDate, setExceptionDate] = useState("");
    const effectiveZone = form.timezone ?? lottery.timezone ?? systemTimezone;
    const rdTime = (value: string) => value ? formatDateTime(drawTime(drawLocalDate(new Date(), effectiveZone), value, effectiveZone),{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
    const save = useCatalogSave("/lottery/catalog/draws", onClose);
    return <Modal show onClose={onClose} closeable={!save.isPending}>
        <form className="flex max-h-[85dvh] flex-col" onSubmit={e => { e.preventDefault(); save.mutate(form); }}>
            <div className="border-b border-slate-200 p-6 dark:border-slate-700"><Dialog.Title className="text-xl font-semibold">{draw ? "Editar sorteo" : "Nuevo sorteo"}</Dialog.Title><p className="mt-1 text-sm text-slate-500">{lottery.name} · Horarios locales del sorteo</p></div>
            <div className="space-y-5 overflow-y-auto p-6">
                <Errors error={save.error} />
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Nombre del sorteo">
                                <input
                                    className={input}
                                    required
                                    value={form.name}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            name: e.target.value,
                                        })
                                    }
                                />
                            </Field>
                            <Field label="Abreviatura"><input className={input} maxLength={40} value={form.abbreviation} placeholder="Ej. ANG 6PM" onChange={e => setForm({ ...form, abbreviation: e.target.value })} /></Field>
                        </div>
                        <Field label="Zona horaria del sorteo"><TimezoneSelect label="Zona horaria del sorteo" value={form.timezone} inheritZone={lottery.timezone ?? systemTimezone} timezones={timezones} onChange={zone => setForm({ ...form, timezone: zone || null })} /></Field>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{form.timezone === null ? 'Heredada de la lotería' : 'Zona propia'} · {effectiveZone}</span>{form.timezone !== null && <button type="button" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400" onClick={() => setForm({ ...form, timezone: null })}>Heredar de la lotería</button>}</div>
                        <p className="text-xs text-slate-500">Introduce las horas y días de la zona seleccionada. En ventas se muestran los cierres equivalentes en la zona de visualización. Si no hay abreviatura, se muestra el nombre completo.</p>
                        <div className="grid gap-4 sm:grid-cols-3">
                            {[
                                ["opens_at", "Abre ventas"],
                                ["closes_at", "Cierra ventas"],
                                ["draws_at", "Hora del sorteo"],
                            ].map(([k, label]) => (
                                <Field key={k} label={`${label} · hora local`}>
                                    <input
                                        className={input}
                                        type="time"
                                        required
                                        value={form[k]}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                [k]: e.target.value,
                                            })
                                        }
                                    />
                                </Field>
                            ))}
                        </div>
                        <p className="rounded-md bg-slate-100 p-2 text-xs dark:bg-slate-800">Equivalencia en {displayTimezoneLabel()} para hoy: abre {rdTime(form.opens_at)} · cierra {rdTime(form.closes_at)} · sorteo {rdTime(form.draws_at)}. Se recalcula según la fecha.</p>
                        <div className="flex flex-wrap gap-4">
                            {[
                                "Dom",
                                "Lun",
                                "Mar",
                                "Mié",
                                "Jue",
                                "Vie",
                                "Sáb",
                            ].map((day, i) => (
                                <label key={day} className="flex gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={form.weekdays.includes(i)}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                weekdays: e.target.checked
                                                    ? [...form.weekdays, i]
                                                    : form.weekdays.filter(
                                                          (v: number) =>
                                                              v !== i,
                                                      ),
                                            })
                                        }
                                    />
                                    {day}
                                </label>
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-4">
                            {Object.entries(modes).map(([key, label]) => (
                                <label key={key} className="flex gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={form.modalities.includes(key)}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                modalities: e.target.checked
                                                    ? [...form.modalities, key]
                                                    : form.modalities.filter(
                                                          (v: string) =>
                                                              v !== key,
                                                      ),
                                            })
                                        }
                                    />
                                    {label}
                                </label>
                            ))}
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Página de resultados · El Boleto Ganador">
                                <input
                                    className={input}
                                    type="url"
                                    placeholder="https://elboletoganador.com/"
                                    value={form.source_url ?? ""}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            source_url: e.target.value,
                                        })
                                    }
                                />
                            </Field>
                            <Field label="Cantidad de posiciones del resultado"><ComboboxSelect className={input} value={form.result_count ?? 3} onChange={e=>setForm({...form,result_count:Number(e.target.value)})}>{[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</ComboboxSelect></Field>
                            <Field label="Identificador externo del sorteo">
                                <input
                                    className={input}
                                    value={form.source_key ?? ""}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            source_key: e.target.value,
                                        })
                                    }
                                />
                            </Field>
                        </div>
                        <div className="flex flex-wrap items-end gap-3">
                            <Field label="Suspender una fecha">
                                <input
                                    type="date"
                                    className={input}
                                    value={exceptionDate}
                                    onChange={(e) =>
                                        setExceptionDate(e.target.value)
                                    }
                                />
                            </Field>
                            <button
                                type="button"
                                className={secondary}
                                onClick={() => {
                                    if (exceptionDate)
                                        setForm({
                                            ...form,
                                            exceptions: {
                                                ...form.exceptions,
                                                [exceptionDate]: {
                                                    closed: true,
                                                },
                                            },
                                        });
                                }}
                            >
                                Añadir suspensión
                            </button>
                            {Object.keys(form.exceptions ?? {}).map((date) => (
                                <button
                                    type="button"
                                    key={date}
                                    className={secondary}
                                    onClick={() => {
                                        const x = { ...form.exceptions };
                                        delete x[date];
                                        setForm({ ...form, exceptions: x });
                                    }}
                                >
                                    {date} ×
                                </button>
                            ))}
                        </div>

                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />Sorteo activo</label>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-700"><button type="button" disabled={save.isPending} className={secondary} onClick={onClose}>Cancelar</button><button disabled={save.isPending} className={button}>{save.isPending ? "Guardando…" : "Guardar sorteo"}</button></div>
        </form>
    </Modal>;
}
