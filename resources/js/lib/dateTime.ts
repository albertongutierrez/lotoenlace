export type DateTimePreferences = { display_timezone: string; time_format: '12' | '24' };
export const defaultDateTimePreferences: DateTimePreferences = {display_timezone:'America/Santo_Domingo',time_format:'12'};
let current = {...defaultDateTimePreferences};
const validZones = new Set<string>();

export function normalizeDateTimePreferences(value?: Partial<DateTimePreferences> | null): DateTimePreferences {
    let zone=value?.display_timezone ?? defaultDateTimePreferences.display_timezone;
    if(!validZones.has(zone)) {
        try {new Intl.DateTimeFormat('es-DO',{timeZone:zone});validZones.add(zone);}
        catch {zone=defaultDateTimePreferences.display_timezone;}
    }
    return {display_timezone:zone,time_format:value?.time_format==='24'?'24':'12'};
}
export function setDateTimePreferences(value?: Partial<DateTimePreferences> | null) {current=normalizeDateTimePreferences(value);}
export function getDateTimePreferences() {return {...current};}
export function setDateTimeFromPage(page: {props: Record<string,unknown>}) {
    const auth=page.props.auth as {activeBranchOffice?: Partial<DateTimePreferences> | null} | undefined;
    setDateTimePreferences(auth?.activeBranchOffice);
}
export function displayTimezoneLabel() {return current.display_timezone==='America/Santo_Domingo'?'RD':current.display_timezone;}
function display(value: string | number | Date, options: Intl.DateTimeFormatOptions, preferences=current) {
    const date=value instanceof Date?value:new Date(value);
    if(Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('es-DO',{timeZone:preferences.display_timezone,hourCycle:preferences.time_format==='24'?'h23':'h12',...options}).format(date);
}
export function formatDateTime(value: string | number | Date, options: Intl.DateTimeFormatOptions={day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}, preferences=current) {return display(value,options,preferences);}
export function formatTime(value: string | number | Date, options: Intl.DateTimeFormatOptions={}, preferences=current) {return display(value,{hour:'2-digit',minute:'2-digit',...options},preferences);}
export function formatDate(value: string | number | Date, options: Intl.DateTimeFormatOptions={day:'2-digit',month:'2-digit',year:'numeric'}, preferences=current) {return display(value,options,preferences);}
/** A draw's wall-clock value stays in its own zone; only its 12/24 representation changes. */
export function formatLocalTime(value: string) {return formatTime(`2000-01-01T${value.length===5?value+':00':value}Z`,{}, {...current,display_timezone:'UTC'});}
