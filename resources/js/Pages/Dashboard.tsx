import { useState } from 'react';
import WeeklySalesChart, { WeeklySales } from '@/Components/WeeklySalesChart';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowRight, BarChart3, Building2, CalendarDays, CheckCircle2, ChevronRight, Clock3, Layers3, LoaderCircle, Plus, RefreshCw, ShoppingCart, Store, Ticket, Trophy, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageProps } from '@/types';

type Period = 'today' | 'yesterday' | 'week' | 'month';
type Overview = {
    period: Period; from: string; to: string; updated_at: string; currency: string;
    sales: null | { net_minor: number; tickets: number; discount_minor: number; previous_minor: number; weekly: WeeklySales; series: {date: string; net_minor: number}[]; modalities: {modality: string; plays: number; net_minor: number}[] };
    tickets: null | {total: number; winners: number; pending: number; lost: number; cancelled: number};
    prizes: null | {pending_minor: number; paid_minor: number};
    cash: null | {reconciliation_mode?: 'cash' | 'report'; open: boolean; opened_at: string | null; opened_by: string | null; balance_minor: number | null};
    recent: null | {reference: string; created_at: string; net_minor: number; state: string}[];
};
const panel = 'min-w-0 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
const secondary = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800';
const periods: {key: Period; label: string}[] = [{key:'today',label:'Hoy'},{key:'yesterday',label:'Ayer'},{key:'week',label:'7 días'},{key:'month',label:'Este mes'}];
const modes: Record<string,string> = {quiniela:'Quiniela',pale:'Palé',tripleta:'Tripleta',super_pale:'Súper palé'};
type TicketState = 'winners' | 'pending' | 'lost' | 'cancelled';
const states: Record<TicketState,{label:string; color:string; dot:string}> = {
    winners:{label:'Ganadores',color:'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',dot:'bg-amber-400'},
    pending:{label:'Pendientes',color:'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',dot:'bg-sky-400'},
    lost:{label:'Perdidos',color:'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',dot:'bg-slate-400'},
    cancelled:{label:'Anulados',color:'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',dot:'bg-rose-400'},
};
const stateKeys = Object.keys(states) as TicketState[];
const rdTime = (value: string) => new Date(value).toLocaleTimeString('es-DO',{timeZone:'America/Santo_Domingo',hour:'2-digit',minute:'2-digit'});
const dateLabel = (value: string) => new Date(`${value}T12:00:00-04:00`).toLocaleDateString('es-DO',{day:'numeric',month:'short'});

function Metric({icon: Icon, label, value, detail, color = 'emerald'}: {icon: LucideIcon; label: string; value: string; detail: string; color?: 'emerald' | 'sky' | 'amber' | 'violet'}) {
    const colors = {emerald:'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',sky:'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400',amber:'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',violet:'bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400'};
    return <section className={panel + ' p-4 sm:p-5'}><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</h2><span className={'rounded-xl p-2.5 ' + colors[color]}><Icon aria-hidden className="h-5 w-5" /></span></div><p className="break-words text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</p><p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</p></section>;
}

export default function Dashboard({ auth, overview: data }: PageProps<{overview: Overview}>) {
    const [busy, setBusy] = useState(false);
    const bank = auth.activeBranchOffice;
    const can = (permission: string) => auth.user.is_super_admin || auth.user.permissions?.includes(permission);
    const money = (minor: number) => `${data.currency === 'DOP' ? 'RD$' : data.currency + ' '}${(minor / 100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    const load = (period: Period) => { if (busy) return; router.get(route('dashboard'),{period},{preserveScroll:true,preserveState:true,onStart:()=>setBusy(true),onFinish:()=>setBusy(false)}); };
    const sales = data.sales;
    const totalTickets = data.tickets?.total ?? sales?.tickets;
    const quick = [
        {label:'Nueva venta',description:'Registrar un ticket',icon:ShoppingCart,href:'lottery.sales',visible:can('lottery.sell')},
        {label:data.cash?.reconciliation_mode === 'report' ? 'Historial de cajas' : 'Caja',description:data.cash?.reconciliation_mode === 'report' ? 'Consultar cierres anteriores' : 'Gestionar el turno',icon:Wallet,href:'lottery.cash',visible:can('lottery.cash')},
        {label:'Tickets',description:'Consultar estados',icon:Ticket,href:'lottery.tickets',visible:can('lottery.tickets')},
        {label:'Reportes',description:'Ver el detalle',icon:BarChart3,href:'lottery.reports',visible:auth.user.is_super_admin || auth.user.permissions?.some(p=>p.startsWith('reports.') && p!=='reports.cash')},
    ].filter(action=>action.visible && bank);

    return <AuthenticatedLayout user={auth.user} activeBranchOffice={bank} header="Panel de control">
        <Head title="Panel de control" />
        <div className="mx-auto w-full max-w-[1600px] space-y-5 sm:space-y-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="min-w-0"><p className="mb-1 text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Tu operación, de un vistazo</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Hola, {auth.user.name.split(' ')[0]}</h1><p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400"><Building2 aria-hidden className="h-4 w-4 shrink-0" /><span>{bank?.office_name ?? 'Sin consorcio seleccionado'}</span>{bank && <><span aria-hidden>·</span><span>{bank.name} · {bank.code}</span></>}</p></div>
                <div className="flex flex-wrap items-center gap-2"><button className={secondary} disabled={busy} onClick={()=>load(data.period)} aria-label="Actualizar dashboard">{busy ? <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" /> : <RefreshCw aria-hidden className="h-4 w-4" />}Actualizar</button>{bank && can('lottery.sell') && <Link href={route('lottery.sales')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"><Plus aria-hidden className="h-4 w-4" />Nueva venta</Link>}</div>
            </div>

            {!bank ? <section className={panel + ' p-6 sm:p-8'}><Store className="mb-4 h-8 w-8 text-emerald-500" /><h2 className="text-lg font-semibold">Configura tu primera banca</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">El resumen aparecerá cuando tengas una banca asignada. Cada consorcio conserva sus propios datos y permisos.</p>{auth.user.is_super_admin && <div className="mt-5 flex flex-wrap gap-3"><Link href={route('settings.offices.create')} className={secondary}><Plus className="h-4 w-4" />Crear consorcio</Link><Link href={route('settings.branch-offices.create')} className={secondary}><Plus className="h-4 w-4" />Crear banca</Link></div>}</section> : <>
                <div className="flex flex-col justify-between gap-3 border-y border-slate-200 py-3 dark:border-slate-800 sm:flex-row sm:items-center"><div role="group" aria-label="Período del dashboard" className="flex flex-wrap gap-1 rounded-xl bg-slate-200/60 p-1 dark:bg-slate-900">{periods.map(period=><button key={period.key} disabled={busy} aria-pressed={data.period===period.key} onClick={()=>load(period.key)} className={'rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ' + (data.period===period.key ? 'bg-white text-emerald-700 shadow-sm dark:bg-emerald-950 dark:text-emerald-300' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white')}>{period.label}</button>)}</div><p className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><CalendarDays aria-hidden className="h-4 w-4" /><span>{dateLabel(data.from)}{data.from!==data.to ? ` — ${dateLabel(data.to)}` : ''}</span><span aria-hidden>·</span><span>Hora RD · {rdTime(data.updated_at)}</span></p></div>

                <div aria-busy={busy} className="space-y-5 sm:space-y-6">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {sales && <Metric icon={ShoppingCart} label="Ventas netas" value={money(sales.net_minor)} detail="Después de descuentos · anulados excluidos" />}
                        {totalTickets !== undefined && <Metric icon={Ticket} label={data.tickets ? 'Tickets del período' : 'Tickets vendidos'} value={totalTickets.toLocaleString('es-DO')} detail={data.tickets ? `${data.tickets.cancelled} anulados · ${totalTickets-data.tickets.cancelled} vigentes` : 'Tickets vigentes de la banca activa'} color="sky" />}
                        {data.prizes && <Metric icon={Trophy} label="Premios por pagar" value={money(data.prizes.pending_minor)} detail="Premios confirmados de tickets del período" color="amber" />}
                        {data.cash && <Metric icon={Wallet} label={data.cash.reconciliation_mode === "report" ? "Forma de cuadre" : "Caja actual"} value={data.cash.reconciliation_mode === "report" ? "Por reporte" : data.cash.open ? 'Abierta' : 'Sin abrir'} detail={data.cash.reconciliation_mode === "report" ? "Por banca y período · sin apertura de caja" : data.cash.open ? (data.cash.balance_minor !== null ? `Saldo disponible: ${money(data.cash.balance_minor)}` : 'Turno en curso · saldo protegido') : 'Abre una caja antes de comenzar a vender'} color="violet" />}
                    </div>

                    <div className="grid gap-5 xl:grid-cols-3">
                        {sales?.weekly && <div className="min-w-0 xl:col-span-2 [&>section]:h-full"><WeeklySalesChart week={sales.weekly} money={money} /></div>}
                        {quick.length>0 && <section className={panel + ' h-full p-4 sm:p-5'}><h2 className="mb-3 font-semibold">Accesos rápidos</h2><div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-1">{quick.map(({label,description,icon:Icon,href})=><Link key={href} href={route(href)} className="group flex min-w-0 items-center gap-3 rounded-xl p-3 transition hover:bg-slate-50 dark:hover:bg-slate-800"><span className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{label}</p><p className="mt-0.5 text-xs text-slate-500">{description}</p></div><ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-emerald-500" /></Link>)}</div></section>}
                        {data.recent !== null && <section className={panel + ' h-full xl:col-span-2'}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-6"><div><h2 className="font-semibold">Últimos tickets</h2><p className="mt-1 text-xs text-slate-500">Banca activa · período seleccionado</p></div><Link href={route('lottery.tickets')} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400">Ver tickets<ArrowRight className="h-3.5 w-3.5" /></Link></div><div className="divide-y divide-slate-100 dark:divide-slate-800">{data.recent.length ? data.recent.map(item=><div key={item.reference} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6"><div className="flex min-w-0 items-center gap-3"><span className="hidden rounded-lg bg-slate-50 p-2 text-slate-400 dark:bg-slate-800 sm:block"><Ticket className="h-4 w-4" /></span><div><p className="font-mono text-xs font-semibold">{item.reference}</p><p className="mt-1 text-[11px] text-slate-500">{new Date(item.created_at).toLocaleDateString('es-DO',{timeZone:'America/Santo_Domingo',day:'2-digit',month:'2-digit'})} · {rdTime(item.created_at)}</p></div></div><div className="flex items-center gap-3"><span className={'rounded-full px-2 py-1 text-[10px] font-medium sm:text-xs ' + states[item.state as TicketState].color}>{states[item.state as TicketState].label}</span><strong className="text-sm tabular-nums">{money(item.net_minor)}</strong></div></div>) : <p className="p-6 text-center text-sm text-slate-500">No hay tickets en este período.</p>}</div></section>}
                        {data.tickets && <section className={panel + ' h-full p-4 sm:p-5'}><h2 className="font-semibold">Estado de tickets</h2><p className="mt-1 text-xs text-slate-500">Cada ticket se cuenta una sola vez</p><div className="mt-5 flex h-2 gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>{stateKeys.map(key=><div key={key} className={states[key].dot} style={{width:`${data.tickets!.total ? data.tickets![key]/data.tickets!.total*100 : 0}%`}} />)}</div><dl className="mt-4 space-y-3">{stateKeys.map(key=><div key={key} className="flex items-center justify-between text-sm"><dt className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><span className={'h-2 w-2 rounded-full ' + states[key].dot} />{states[key].label}</dt><dd className="font-semibold tabular-nums">{data.tickets![key]}</dd></div>)}</dl></section>}
                        {sales && <section className={panel + ' h-full p-4 sm:p-5 xl:col-span-2'}><h2 className="font-semibold">Ventas por modalidad</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(modes).map(([key,label])=>{const mode=sales.modalities.find(item=>item.modality===key);return <div key={key} className="min-w-0"><div className="flex flex-wrap items-center justify-between gap-1 text-sm"><dt className="text-slate-500 dark:text-slate-400">{label}</dt><dd className="font-medium tabular-nums">{money(mode?.net_minor ?? 0)}</dd></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-emerald-500" style={{width:`${sales.net_minor ? (mode?.net_minor ?? 0)/sales.net_minor*100 : 0}%`}} /></div></div>;})}</dl></section>}
                        {data.cash?.reconciliation_mode === "report" ? <section className={panel + " h-full p-4 sm:p-5"}><h2 className="font-semibold">Cuadre por reporte</h2><p className="mt-3 text-sm text-slate-500">Esta banca opera sin apertura de caja. Consulta ventas, anulaciones y premios pagados por período.</p>{can("reports.reconciliation") && <Link href={`/lottery/reports?report=reconciliation&branch_id=${bank?.id}`} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">Ver cuadre<ArrowRight className="h-4 w-4"/></Link>}</section> : data.cash && <section className={panel + ' h-full p-4 sm:p-5'}><div className="flex items-center gap-2 font-semibold">{data.cash.open ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Clock3 className="h-4 w-4 text-amber-500" />}Turno actual</div><p className="mt-3 text-sm text-slate-500">{data.cash.open ? `Abrió ${data.cash.opened_by ?? 'el responsable de caja'}` : 'No hay una caja abierta en esta banca.'}</p>{data.cash.opened_at && <p className="mt-1 text-xs text-slate-500">{new Date(data.cash.opened_at).toLocaleString('es-DO',{timeZone:'America/Santo_Domingo',dateStyle:'short',timeStyle:'short'})}</p>}{can('lottery.cash') && <Link href={route('lottery.cash')} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">{data.cash.open ? 'Ver caja' : 'Abrir caja'}<ArrowRight className="h-4 w-4" /></Link>}</section>}
                        {!sales && data.recent === null && <section className={panel + ' p-6 xl:col-span-3'}><Layers3 className="mb-3 h-7 w-7 text-emerald-500" /><h2 className="font-semibold">Todo listo para trabajar</h2><p className="mt-2 text-sm leading-6 text-slate-500">Usa los accesos de tu banca. Los indicadores y reportes aparecen según los permisos de tu usuario.</p></section>}
                    </div>
                </div>
                <p className="text-center text-[11px] leading-5 text-slate-400">Resumen de la banca activa · Fechas en República Dominicana · Premios de los tickets vendidos en el período</p>
            </>}
        </div>
    </AuthenticatedLayout>;
}
