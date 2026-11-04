// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import ReprintTicketModal from '../../resources/js/Pages/Lottery/ReprintTicketModal';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@/Components/ui/data-table', () => ({ DataTable: ({ data, columns }: any) => <div>{data.map((r: any) => <div key={r.code}>{columns.map((c: any, i: number) => <div key={i}>{c.cell?.({ row: { original: r } })}</div>)}</div>)}</div> }));
vi.mock('../../resources/js/Pages/Lottery/IssuedTicketModal', () => ({ default: ({ ticket }: any) => <div>Imprimir {ticket.reference}</div> }));
vi.mock('../../resources/js/Pages/Lottery/shared', () => ({ button: 'button', secondary: 'secondary', input: 'input', money: (v: number) => `RD$${v / 100}` }));
const ticket = { code: 'old-ticket', reference: 'T-000001', created_at: '2026-10-21T13:00:00Z', reprint_until: '2026-10-21T13:15:00Z', status: 'cancelled', net_minor: 100, currency: 'DOP' };
let client: QueryClient;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); client?.clear(); vi.clearAllMocks(); });
function mount(testMode: boolean) {
    vi.mocked(axios.get).mockImplementation(async (url: string) => ({ data: url === '/lottery/tickets' ? { tickets: [ticket], server_now: '2026-10-22T13:00:00Z', test_reprint: testMode } : ticket }));
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ReprintTicketModal branch={{ id: 3, code: '001' }} draws={[]} currency="DOP" onClose={vi.fn()} /></QueryClientProvider>);
}
test('ignora la antigua bandera de prueba y bloquea anulados vencidos sin filtros de otros días', async () => {
    const user = userEvent.setup(); mount(true);
    const print = await screen.findByRole('button', { name: 'Reimprimir ticket T-000001' });
    expect((print as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Hoy y ayer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ayer', exact: true })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Reimprimir ticket T-000001' }));
    expect(screen.queryByText('Imprimir T-000001')).toBeNull();
    expect(axios.get).toHaveBeenCalledTimes(1);
});
test('fuera de prueba mantiene bloqueados los anulados y no ofrece filtros de días anteriores', async () => {
    mount(false);
    const print = await screen.findByRole('button', { name: 'Reimprimir ticket T-000001' });
    expect((print as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Ayer', exact: true })).toBeNull();
});
