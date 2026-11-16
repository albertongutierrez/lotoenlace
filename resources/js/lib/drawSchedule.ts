import type { Draw } from '@/Pages/Lottery/shared';

export const systemTimezone = 'America/Santo_Domingo';
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();
export function drawLocalDate(now: Date, timezone = systemTimezone) {
    let formatter = dateFormatters.get(timezone);
    if (!formatter) { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }); dateFormatters.set(timezone, formatter); }
    const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Resolve wall-clock time using the offset for that date, including seasonal changes. */
export function drawTime(date: string, time: string, timezone = systemTimezone): number {
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute, second = 0] = time.split(':').map(Number);
    const wall = Date.UTC(year, month - 1, day, hour, minute, second);
    let formatter = offsetFormatters.get(timezone);
    if (!formatter) { formatter = new Intl.DateTimeFormat('en', { timeZone: timezone, timeZoneName: 'longOffset' }); offsetFormatters.set(timezone, formatter); }
    let instant = wall;
    for (let i = 0; i < 3; i++) {
        const offset = formatter.formatToParts(new Date(instant)).find(part => part.type === 'timeZoneName')!.value;
        const match = offset.match(/GMT([+-])(\d{2}):(\d{2})/);
        const minutes = match ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '+' ? 1 : -1) : 0;
        const resolved = wall - minutes * 60000;
        if (resolved === instant) break;
        instant = resolved;
    }
    return instant;
}

export function drawWindow(draw: Draw, now: Date) {
    const timezone = draw.timezone ?? systemTimezone;
    const date = drawLocalDate(now, timezone);
    const exception = draw.exceptions?.[date];
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return {
        date,
        eligible: draw.active && draw.weekdays.includes(weekday) && !exception?.closed,
        open: drawTime(date, exception?.opens_at ?? draw.opens_at, timezone),
        close: drawTime(date, exception?.closes_at ?? draw.closes_at, timezone),
        result: drawTime(date, draw.draws_at ?? draw.closes_at, timezone),
    };
}
