const baseUrl = 'http://127.0.0.1:18745';
const connectionKey = 'lotoenlace:print-agent:connection';
const preferenceKey = (branchId: number) => `lotoenlace:printer:${branchId}`;
export type LocalPrinter = { name: string; driver: string; isDefault: boolean; offline: boolean; virtual: boolean };
export type PrinterPreference = { mode: 'browser' | 'local'; printer: string; profile: 'epson' | 'star'; paper_width: 58 | 80; cut: boolean; feed_lines?: number };
export type AgentConnection = { token: string; deviceId: string };
export const defaultPreference: PrinterPreference = { mode: 'browser', printer: '', profile: 'epson', paper_width: 80, cut: true, feed_lines: 2 };
export function printerPreference(branchId: number): PrinterPreference {
    try { const value = JSON.parse(localStorage.getItem(preferenceKey(branchId)) ?? 'null'); if (value?.mode === 'local' || value?.mode === 'browser') return { ...defaultPreference, ...value, feed_lines: Number.isInteger(value.feed_lines) && value.feed_lines >= 0 && value.feed_lines <= 15 ? value.feed_lines : 2 }; } catch { /* Storage may be unavailable. */ }
    return { ...defaultPreference };
}
export function agentConnection(): AgentConnection | null {
    try { return JSON.parse(localStorage.getItem(connectionKey) ?? 'null'); } catch { return null; }
}
export function savePrinterPreference(branchId: number, preference: PrinterPreference, connection?: AgentConnection) {
    if (connection) localStorage.setItem(connectionKey, JSON.stringify(connection));
    localStorage.setItem(preferenceKey(branchId), JSON.stringify(preference));
}
export class LocalPrinterError extends Error {
    constructor(message: string, public state = 'failed') { super(message); }
}
export async function agentRequest(path: '/printers' | '/health' | '/jobs', token: string, body?: unknown) {
    let response: Response;
    try {
        response = await fetch(baseUrl + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, credentials: 'omit', signal: AbortSignal.timeout(body ? 35000 : 15000), ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch { throw new LocalPrinterError('No se pudo contactar al agente local. Comprueba que esté iniciado y permite el acceso a la red local si el navegador lo solicita.', body ? 'unknown' : 'failed'); }
    const data = await response.json();
    if (!response.ok) throw new LocalPrinterError(data.message ?? 'No se pudo completar la impresión.', data.status);
    return data;
}
export function localPrintTarget(branchId: number) {
    const preference = printerPreference(branchId);
    if (preference.mode !== 'local') return null;
    const connection = agentConnection();
    if (!connection?.token || !connection.deviceId || !preference.printer) throw new LocalPrinterError('Configura la impresora de esta PC antes de imprimir.');
    return { preference, connection, target: { transport: 'local' as const, device_id: connection.deviceId, printer: preference.printer, profile: preference.profile, paper_width: preference.paper_width, cut: preference.cut, feed_lines: preference.feed_lines ?? 2 } };
}
