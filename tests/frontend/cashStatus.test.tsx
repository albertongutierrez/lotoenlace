// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import { useCashStatus } from '../../resources/js/lib/useCashStatus';

const socket = vi.hoisted(() => ({ changed: null as any, resync: null as any, state: null as any, stop: vi.fn(), subscribe: vi.fn() }));
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@/lib/cashRealtime', () => ({ subscribeCashStatus: (_office: number, _branch: number, changed: any, resync: any, state: any) => { socket.subscribe(); socket.changed = changed; socket.resync = resync; socket.state = state; return socket.stop; } }));
vi.mock('../../resources/js/lib/cashRealtime', () => ({ subscribeCashStatus: (_office: number, _branch: number, changed: any, resync: any, state: any) => { socket.subscribe(); socket.changed = changed; socket.resync = resync; socket.state = state; return socket.stop; } }));
let client: QueryClient;
function Probe({ branch = 1 }: { branch?: number }) {
    const { query, notice, connection } = useCashStatus(branch, 3, 8);
    return <><span>{query.data?.current ? 'Abierta' : 'Cerrada'}</span><span>{notice}</span><span>{connection}</span></>;
}
function mount() { return render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>); }
beforeEach(() => { client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); vi.mocked(axios.get).mockReset().mockResolvedValue({ data: { current: { id: 10 } } }); socket.stop.mockClear(); socket.subscribe.mockClear(); socket.changed = null; socket.resync = null; socket.state = null; });
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); });

test('sin sondeo: permanecer en ventas 30 segundos no genera más consultas', async () => {
    mount(); await screen.findByText('Abierta');
    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(axios.get).toHaveBeenCalledTimes(1);
});

test('recibir un cierre avisa y actualiza una vez sin perder el ámbito de la banca', async () => {
    mount(); await screen.findByText('Abierta');
    vi.mocked(axios.get).mockResolvedValue({ data: { current: null } });
    act(() => socket.changed({ office_id: 3, branch_id: 1, session_id: 10, state: 'closed' }));
    await screen.findByText(/La caja de esta banca fue cerrada/);
    await screen.findByText('Cerrada');
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
    act(() => socket.changed({ office_id: 99, branch_id: 1, session_id: 10, state: 'open' }));
    act(() => socket.changed({ office_id: 3, branch_id: 2, session_id: 10, state: 'open' }));
    expect(axios.get).toHaveBeenCalledTimes(2);
});

test('reconectar recupera el estado una vez y descarta eventos tardíos tras salir', async () => {
    const view = mount(); await screen.findByText('Abierta');
    act(() => socket.resync());
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
    act(() => socket.state('disconnected'));
    await screen.findByText('disconnected');
    view.unmount();
    expect(socket.stop).toHaveBeenCalledTimes(1);
    act(() => socket.resync());
    act(() => socket.changed({ office_id: 3, branch_id: 1, session_id: 10, state: 'closed' }));
    expect(axios.get).toHaveBeenCalledTimes(2);
});

test('un cambio de forma de cuadre consulta la política nueva una sola vez', async () => {
    mount(); await screen.findByText('Abierta');
    vi.mocked(axios.get).mockResolvedValue({ data: { current: null, reconciliation_mode: 'report' } });
    act(() => socket.changed({ office_id: 3, branch_id: 1, session_id: null, state: 'configuration_changed' }));
    await waitFor(() => expect(client.getQueryData(['lottery', 'cash-status', 1])).toEqual({ current: null, reconciliation_mode: 'report' }));
    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/La caja de esta banca fue cerrada/)).toBeNull();
    await screen.findByText('disabled');
    expect(socket.stop).toHaveBeenCalledTimes(1);
    act(() => socket.changed({ office_id: 3, branch_id: 1, session_id: 10, state: 'closed' }));
    expect(screen.queryByText(/La caja de esta banca fue cerrada/)).toBeNull();
});

test('reporte no abre WebSocket ni con una caja antigua en caché y activa avisos solo si cambia a cajas', async () => {
    let finish!: (data: any) => void;
    vi.mocked(axios.get).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    client.setQueryData(['lottery','cash-status',1], { current: { id: 10 }, reconciliation_mode: 'cash' });
    mount();
    expect(socket.subscribe).not.toHaveBeenCalled();
    await act(async () => { finish({ data: { current: null, reconciliation_mode: 'report' } }); });
    await screen.findByText('Cerrada');
    expect(socket.subscribe).not.toHaveBeenCalled();
    expect(socket.stop).not.toHaveBeenCalled();
    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(axios.get).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    vi.mocked(axios.get).mockResolvedValue({ data: { current: { id: 11 }, reconciliation_mode: 'cash' } });
    await act(async () => { await client.invalidateQueries({ queryKey: ['lottery','cash-status',1], exact: true }); });
    await screen.findByText('Abierta');
    expect(socket.subscribe).toHaveBeenCalledTimes(1);
});
