// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import Sales from '../../resources/js/Pages/Lottery/Sales';

vi.setConfig({ testTimeout: 10000 });

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const cashSocket = vi.hoisted(() => ({ changed: null as any }));
vi.mock('@/lib/cashRealtime', () => ({ subscribeCashStatus: (_office: number, _branch: number, changed: any) => { cashSocket.changed = changed; return () => {}; } }));
vi.mock('@inertiajs/react', () => ({ usePage: () => ({ props: { auth: { user: { id: 1, is_super_admin: true, permissions: [] } } } }), Head: () => null, Link: ({ children }: any) => <span>{children}</span> }));
vi.mock('@/Layouts/AuthenticatedLayout', () => ({ default: ({ children }: any) => <main>{children}</main> }));
vi.mock('@/Components/LoadingSkeleton', () => ({ default: () => <div>Cargando</div> }));

const clients: QueryClient[] = [];
const storageKey = 'lotoenlace:drafts:1:1';
beforeAll(() => {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    HTMLElement.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(axios.get).mockResolvedValue({ data: { current: { id: 1 } } });
    vi.mocked(axios.post).mockReset().mockResolvedValue({ data: { available_minor: null, server_now: new Date().toISOString() } });
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; });

function draftLines() {
    const saved = JSON.parse(sessionStorage.getItem(storageKey)!);
    return saved.drafts.find((draft: any) => draft.id === saved.activeId).lines;
}
async function mount(drawModalities: Record<number, string[]> = {}, settings: Record<string, unknown> = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    clients.push(client);
    render(<QueryClientProvider client={client}><Sales branch={{ id: 1, office_id: 1, code: 'PRUEBA' }} currency="DOP" settings={{ draw_ids: [1, 2], pairs: {}, discount_enabled: false, ...settings }} server_now={new Date().toISOString()} draws={[1, 2].map(id => ({ id, name: `Sorteo ${id}`, lottery_id: 1, lottery: { name: 'Prueba', active: true }, active: true, opens_at: '00:00:00', closes_at: '23:59:59', weekdays: [0, 1, 2, 3, 4, 5, 6], modalities: drawModalities[id] ?? ['quiniela', 'pale', 'tripleta'] }))} /></QueryClientProvider>);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });
    return userEvent.setup();
}
async function enterPlay(user: ReturnType<typeof userEvent.setup>, numbers: string) {
    await user.clear(screen.getByLabelText('Jugada', { exact: true }));
    await user.type(screen.getByLabelText('Jugada', { exact: true }), numbers);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Monto por sorteo / pareja')));
    await user.clear(screen.getByLabelText('Monto por sorteo / pareja'));
    await user.type(screen.getByLabelText('Monto por sorteo / pareja'), '1');
    await user.keyboard('{Enter}');
}

const duplicateQr = '514011a0-42cb-42f5-b074-331a834bb98e';
function mockDuplicateTicket() {
    vi.mocked(axios.get).mockImplementation(async (url) => {
        if (String(url).startsWith('/lottery/tickets/')) return { data: {
            code: duplicateQr, reference: 'T-000012',
            lines: [{ draw_id: 1, second_draw_id: null, modality: 'quiniela', numbers: '07', amount_minor: 250 }],
        } };
        return { data: { current: { id: 1 } } };
    });
}
async function openDuplicate(showQr = false) {
    const user = await mount({}, { show_qr: showQr });
    await screen.findByText('Caja abierta');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Duplicar F4' }));
    await screen.findByLabelText('Número del ticket');
    return user;
}

test.each(['12', 'T-000012', '#12'])('Duplicar por número %s consulta en la banca actual y carga solo al confirmar', async reference => {
    mockDuplicateTicket();
    const user = await openDuplicate();
    expect(screen.queryByRole('button', { name: 'Código QR', exact: true })).toBeNull();
    expect(screen.queryByLabelText('Código QR del ticket')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Número del ticket')));
    await user.type(screen.getByLabelText('Número del ticket'), reference);
    await user.keyboard('{Enter}');
    await screen.findByText('Ticket T-000012 · 1 jugada encontrada');
    expect(axios.get).toHaveBeenCalledWith(`/lottery/tickets/T-${reference === 'T-000012' ? '000012' : '12'}`, expect.objectContaining({ params: { branch_id: 1 } }));
    expect(draftLines()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Cargar jugadas' }));
    await screen.findByText('Ticket cargado. Al vender se comprobarán las reglas actuales.');
    await user.click(screen.getByRole('button', { name: 'Entendido' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(draftLines()).toEqual([{ draw_id: 1, second_draw_id: null, modality: 'quiniela', numbers: '07', amount: '2.50' }]);
    expect(axios.post).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Jugada', { exact: true })));
});

test('Duplicar consulta automáticamente el QR completo y Enter carga sus jugadas sin una segunda consulta', async () => {
    mockDuplicateTicket();
    const user = await openDuplicate(true);
    await user.click(screen.getByRole('button', { name: 'Código QR', exact: true }));
    const field = screen.getByLabelText('Código QR del ticket');
    await waitFor(() => expect(document.activeElement).toBe(field));
    await user.paste(duplicateQr);
    await screen.findByText('Ticket T-000012 · 1 jugada encontrada');
    expect(axios.get).toHaveBeenCalledWith(`/lottery/tickets/${duplicateQr}`, expect.objectContaining({ params: { branch_id: 1 } }));
    fireEvent.keyDown(field, { key: 'Enter', repeat: true });
    expect(draftLines()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Cargar jugadas' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cargar jugadas' })));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(draftLines()).toHaveLength(1));
    expect(draftLines()[0]).toMatchObject({ numbers: '07', amount: '2.50' });
    expect(vi.mocked(axios.get).mock.calls.filter(([url]) => String(url).startsWith('/lottery/tickets/'))).toHaveLength(1);
    expect(axios.post).not.toHaveBeenCalled();
});

test('Duplicar QR con Enter final del lector hace una sola consulta y espera un nuevo Enter para cargar', async () => {
    let resolveTicket!: (value: any) => void;
    const response = new Promise(resolve => { resolveTicket = resolve; });
    vi.mocked(axios.get).mockImplementation(async url => String(url).startsWith('/lottery/tickets/') ? response as any : { data: { current: { id: 1 } } });
    const user = await openDuplicate(true);
    await user.click(screen.getByRole('button', { name: 'Código QR', exact: true }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Código QR del ticket')));
    fireEvent.change(screen.getByLabelText('Código QR del ticket'), { target: { value: duplicateQr } });
    await user.keyboard('{Enter}');
    await waitFor(() => expect(vi.mocked(axios.get).mock.calls.filter(([url]) => String(url).startsWith('/lottery/tickets/'))).toHaveLength(1));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 220)); });
    await act(async () => { resolveTicket({ data: { reference: 'T-000012', lines: [{ draw_id: 1, modality: 'quiniela', numbers: '07', amount_minor: 250 }] } }); });
    await screen.findByRole('button', { name: 'Cargar jugadas' });
    expect(draftLines()).toHaveLength(0);
    expect(vi.mocked(axios.get).mock.calls.filter(([url]) => String(url).startsWith('/lottery/tickets/'))).toHaveLength(1);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(draftLines()).toHaveLength(1));
});

test('Duplicar valida el número, limpia la consulta al cambiar de método y permite corregir un QR no encontrado', async () => {
    mockDuplicateTicket();
    const user = await openDuplicate(true);
    await user.type(screen.getByLabelText('Número del ticket'), 'abc');
    await user.keyboard('{Enter}');
    await screen.findByText(/Escribe un número de ticket válido/);
    expect(vi.mocked(axios.get).mock.calls.filter(([url]) => String(url).startsWith('/lottery/tickets/'))).toHaveLength(0);
    await user.clear(screen.getByLabelText('Número del ticket'));
    await user.type(screen.getByLabelText('Número del ticket'), '12');
    await user.keyboard('{Enter}');
    await screen.findByRole('button', { name: 'Cargar jugadas' });
    await user.click(screen.getByRole('button', { name: 'Código QR', exact: true }));
    expect((screen.getByLabelText('Código QR del ticket') as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('button', { name: 'Cargar jugadas' })).toBeNull();
    vi.mocked(axios.get).mockRejectedValueOnce({ response: { status: 404 } });
    await user.type(screen.getByLabelText('Código QR del ticket'), 'qr-no-encontrado');
    await user.keyboard('{Enter}');
    await screen.findByText(/No encontramos ese ticket en esta banca/);
    expect(draftLines()).toEqual([]);
    await user.clear(screen.getByLabelText('Código QR del ticket'));
    await user.paste(duplicateQr);
    await user.keyboard('{Enter}');
    await screen.findByRole('button', { name: 'Cargar jugadas' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(draftLines()).toEqual([]);
});

test('Ventas ofrece solo los medios configurados y no permite devolución en un cobro por transferencia', async () => {
    const user = await mount({}, { payment_methods: ['cash', 'transfer'] });
    await screen.findByText('Caja abierta');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: /^Sorteo 1/ }));
    await enterPlay(user, '10');
    await waitFor(() => expect(draftLines()).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: /Vender/ }));
    await screen.findByText('Cobrar ticket');
    expect(screen.getByLabelText('Dinero recibido (DOP)')).toBeTruthy();
    await user.click(screen.getByRole('combobox', { name: 'Medio de cobro' }));
    await user.keyboard('Transferencia');
    await user.click(await screen.findByRole('option', { name: 'Transferencia', exact: true }));
    expect(screen.queryByLabelText('Dinero recibido (DOP)')).toBeNull();
    expect(screen.getByText(/Sin devolución de efectivo/)).toBeTruthy();
    expect(screen.getByLabelText('Referencia del cobro (opcional)')).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Tarjeta' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Depósito' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmar venta' }).hasAttribute('disabled')).toBe(false);
    expect(vi.mocked(axios.post).mock.calls.some(([url]) => url === '/lottery/sales')).toBe(false);
});

test('Ventas permite seleccionar medios personalizados habilitados por nombre sin devolución', async () => {
    const paypal = 'custom_0123456789ab';
    const user = await mount({}, { payment_methods: ['cash', paypal], payment_method_labels: { [paypal]: 'PayPal' } });
    await screen.findByText('Caja abierta');
    await user.click(screen.getByRole('button', { name: /^Sorteo 1/ }));
    await enterPlay(user, '10');
    await waitFor(() => expect(draftLines()).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: /Vender/ }));
    await screen.findByText('Cobrar ticket');
    await user.click(screen.getByRole('combobox', { name: 'Medio de cobro' }));
    await user.click(await screen.findByRole('option', { name: 'PayPal', exact: true }));
    expect(screen.getByText(/por PayPal. Sin devolución de efectivo/)).toBeTruthy();
    expect(screen.queryByLabelText('Dinero recibido (DOP)')).toBeNull();
    expect(screen.getByLabelText('Referencia del cobro (opcional)')).toBeTruthy();
});

test.each([
    ['custom_0123456789ab', 'PayPal'],
    ['custom_abcdef012345', 'Cash App'],
    ['transfer', 'Transferencia'],
    ['cash', 'Efectivo'],
])('Ventas exige referencia para %s solo si está configurada y envía el valor normalizado', async (method, name) => {
    const user = await mount({}, { payment_methods: [method], payment_method_labels: { [method]: name }, payment_reference_required: { [method]: true } });
    await screen.findByText('Caja abierta');
    await user.click(screen.getByRole('button', { name: /^Sorteo 1/ }));
    await enterPlay(user, '10');
    await waitFor(() => expect(draftLines()).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: /Vender/ }));
    const reference = await screen.findByLabelText('Referencia del cobro (obligatoria)');
    const confirm = screen.getByRole('button', { name: 'Confirmar venta' });
    expect(reference.hasAttribute('required')).toBe(true);
    expect(confirm.hasAttribute('disabled')).toBe(true);
    await user.type(reference, '   ');
    fireEvent.submit(reference.closest('form')!);
    expect(screen.getByRole('alert').textContent).toContain(`Indica la referencia del cobro por ${name}`);
    expect(document.activeElement).toBe(reference);
    expect(vi.mocked(axios.post).mock.calls.some(([url]) => url === '/lottery/sales')).toBe(false);
    await user.clear(reference);
    await user.type(reference, ' REF-123 ');
    expect(confirm.hasAttribute('disabled')).toBe(false);
    vi.mocked(axios.post).mockRejectedValueOnce({ response: { data: { message: 'Validación de prueba' } } });
    await user.click(confirm);
    await screen.findByText('Validación de prueba');
    expect(axios.post).toHaveBeenCalledWith('/lottery/sales', expect.objectContaining({ payment_method: method, payment_reference: 'REF-123' }));
});

test('cambiar de medio actualiza la obligación y limpia la referencia del medio anterior', async () => {
    const user = await mount({}, { payment_methods: ['transfer', 'card'], payment_reference_required: { transfer: true } });
    await screen.findByText('Caja abierta');
    await user.click(screen.getByRole('button', { name: /^Sorteo 1/ }));
    await enterPlay(user, '10');
    await waitFor(() => expect(draftLines()).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: /Vender/ }));
    await user.type(await screen.findByLabelText('Referencia del cobro (obligatoria)'), 'TRANSFER-001');
    await user.click(screen.getByRole('combobox', { name: 'Medio de cobro' }));
    await user.click(await screen.findByRole('option', { name: 'Tarjeta', exact: true }));
    const reference = screen.getByLabelText('Referencia del cobro (opcional)') as HTMLInputElement;
    expect(reference.value).toBe('');
    expect(reference.required).toBe(false);
    expect(screen.getByRole('button', { name: 'Confirmar venta' }).hasAttribute('disabled')).toBe(false);
});

test('Resultados Alt+R abre bloques de hoy con logo, filtra y vuelve a Jugada sin modificar el borrador', async () => {
    vi.mocked(axios.get).mockImplementation(async url => ({ data: String(url) === '/lottery/published-results' ? {
        date: '2026-10-22', consulted_at: '2026-10-22T22:00:00-04:00', results: [
            { id: 2, name: 'Quiniela LoteDom', source_key: 'resultados-lotedom', numbers: ['10','20','30'], published_at: '2026-10-22T12:05:00-04:00' },
            { id: 1, name: 'Quemaito Mayor', source_key: 'resultados-el-quemaito-mayor', numbers: ['07'], published_at: '2026-10-22T12:00:00-04:00' },
        ],
    } : { current: { id: 1 } } }));
    const user = await mount();
    await screen.findByText('Caja abierta');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.keyboard('{Alt>}r{/Alt}');
    await screen.findByText('Resultados de hoy');
    await screen.findByText('Quemaito Mayor');
    expect(screen.getByText('Único premio')).toBeTruthy();
    const images = document.querySelectorAll('article img');
    expect(images).toHaveLength(2);
    expect(images[1].getAttribute('src')).toBe('/lottery-logos/Lotedom.png');
    await user.type(screen.getByLabelText('Buscar resultado'), 'Quemaito');
    expect(screen.queryByText('Quiniela LoteDom')).toBeNull();
    expect(screen.getByText('Quemaito Mayor')).toBeTruthy();
    expect(axios.get).toHaveBeenCalledWith('/lottery/published-results', expect.objectContaining({ params: { branch_id: 1 } }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Jugada', { exact: true })));
    expect(draftLines()).toEqual([]);
});

test('10. conserva el punto al pasar a monto y agrega 10 y 01 por cada sorteo', async () => {
    const user = await mount();
    await user.click(await screen.findByRole('button', { name: /^Sorteo 1/ }));
    await user.click(screen.getByRole('button', { name: /^Sorteo 2/ }));
    await enterPlay(user, '10.');
    await waitFor(() => expect(draftLines()).toHaveLength(4));
    expect(draftLines().map((line: any) => [line.draw_id, line.numbers, line.amount])).toEqual([[1, '10', '1'], [1, '01', '1'], [2, '10', '1'], [2, '01', '1']]);
    expect(screen.queryByText('Jugada ya agregada')).toBeNull();
});

test('1020. agrega el palé que tiene cupo y muestra el reverso rechazado sin confirmación', async () => {
    vi.mocked(axios.post).mockImplementation(async (_url, payload: any) => ({ data: { available_minor: payload.numbers === '01-02' ? 0 : null } }));
    const user = await mount();
    await user.click(await screen.findByRole('button', { name: /^Sorteo 1/ }));
    await enterPlay(user, '1020.');
    await waitFor(() => expect(draftLines()).toHaveLength(1));
    expect(draftLines()[0]).toMatchObject({ numbers: '10-20', modality: 'pale', amount: '1' });
    const warning = await screen.findByRole('dialog');
    expect(within(warning).getByText(/01-02/)).toBeTruthy();
    expect(screen.queryByText('Jugada ya agregada')).toBeNull();
    const calls = vi.mocked(axios.post).mock.calls.filter(([, payload]: any) => payload.numbers === '01-02');
    expect(calls).toHaveLength(1);
    expect((calls[0][1] as any).pending.map((line: any) => line.numbers)).toEqual(['10-20']);
});

test('11. se agrega una sola vez y no duplica el monto', async () => {
    const user = await mount();
    await user.click(await screen.findByRole('button', { name: /^Sorteo 1/ }));
    await enterPlay(user, '11.');
    await waitFor(() => expect(draftLines()).toHaveLength(1));
    expect(draftLines()[0]).toMatchObject({ numbers: '11', amount: '1' });
});

test('una jugada existente pide sumar el monto y mantiene una fila por jugada', async () => {
    const user = await mount();
    await user.click(await screen.findByRole('button', { name: /^Sorteo 1/ }));
    await enterPlay(user, '10');
    await waitFor(() => expect(draftLines()).toHaveLength(1));
    await enterPlay(user, '10.');
    await screen.findByText('Jugada ya agregada');
    expect(draftLines()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Sí, sumar monto' }));
    await waitFor(() => expect(draftLines()).toHaveLength(2));
    expect(draftLines().map((line: any) => [line.numbers, line.amount])).toEqual([['10', '2.00'], ['01', '1']]);
});

test('los botones rápidos cambian la modalidad sin cerrar ni enviar Ligar números', async () => {
    const user = await mount();
    await user.click(await screen.findByRole('button', { name: /^Sorteo 1/ }));
    await enterPlay(user, '10.');
    await waitFor(() => expect(draftLines()).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: /Ligar números/ }));
    const dialog = await screen.findByRole('dialog');
    const group = within(dialog).getByRole('group', { name: 'Modalidad de combinaciones' });
    for (const mode of ['Quiniela', 'Tripleta', 'Palé']) {
        const control = within(group).getByRole('button', { name: mode, exact: true });
        await user.click(control);
        expect(control.getAttribute('aria-pressed')).toBe('true');
        expect(within(dialog).getByRole('button', { name: 'Agregar combinaciones' })).toBeTruthy();
        expect(draftLines()).toHaveLength(2);
    }
});

async function prepareRandom(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Aleatorio', exact: true }));
    const dialog = await screen.findByRole('dialog');
    for (const [mode, count, amount] of [['Quiniela', '3', '1'], ['Palé', '2', '2'], ['Tripleta', '1', '3']]) {
        const quantity = within(dialog).getByRole('spinbutton', { name: `Cantidad de ${mode}` });
        await user.clear(quantity); await user.type(quantity, count);
        const stake = within(dialog).getByRole('textbox', { name: `Monto de ${mode}` });
        await user.clear(stake); await user.type(stake, amount);
    }
    await user.click(within(dialog).getByRole('button', { name: 'Generar jugadas' }));
    await within(dialog).findByRole('button', { name: 'Agregar jugadas' });
    return dialog;
}

test('Ligar omite el sorteo incompatible, avisa y agrega en los demás sin alterar las jugadas previas', async () => {
    const user = await mount({ 2: ['quiniela'] });
    await screen.findByText('Caja abierta');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: /^Sorteo 1/ }));
    await user.click(screen.getByRole('button', { name: /^Sorteo 2/ }));
    for (const number of ['02', '11', '25']) await enterPlay(user, number);
    await waitFor(() => expect(draftLines()).toHaveLength(6));
    const previous = draftLines();
    await user.click(screen.getByRole('button', { name: /Ligar números/ }));
    const group = await screen.findByRole('group', { name: 'Modalidad de combinaciones' });
    await user.click(within(group).getByRole('button', { name: 'Tripleta', exact: true }));
    vi.mocked(axios.post).mockClear();
    await user.click(screen.getByRole('button', { name: 'Agregar combinaciones' }));
    await screen.findByText('Sorteos y jugadas omitidos');
    expect(screen.getByText('No admite Tripleta; sorteo omitido.')).toBeTruthy();
    expect(screen.getByText(/Se agregó 1 jugada/)).toBeTruthy();
    expect(draftLines().slice(0, 6)).toEqual(previous);
    expect(draftLines()[6]).toMatchObject({ draw_id: 1, modality: 'tripleta', numbers: '02-11-25', amount: '1' });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(vi.mocked(axios.post).mock.calls[0][1]).toMatchObject({ draw_id: 1, modality: 'tripleta' });
});

test('Ligar informa cuando ningún sorteo admite la modalidad y conserva el ticket', async () => {
    const user = await mount({ 1: ['quiniela'], 2: ['quiniela'] });
    await screen.findByText('Caja abierta');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: /^Sorteo 1/ }));
    await user.click(screen.getByRole('button', { name: /^Sorteo 2/ }));
    for (const number of ['02', '11']) await enterPlay(user, number);
    await waitFor(() => expect(draftLines()).toHaveLength(4));
    const previous = draftLines();
    await user.click(screen.getByRole('button', { name: /Ligar números/ }));
    await screen.findByRole('group', { name: 'Modalidad de combinaciones' });
    vi.mocked(axios.post).mockClear();
    await user.click(screen.getByRole('button', { name: 'Agregar combinaciones' }));
    await screen.findByText('Sorteos y jugadas omitidos');
    expect(screen.getAllByText('No admite Palé; sorteo omitido.')).toHaveLength(2);
    expect(screen.getByText(/No se agregaron nuevas jugadas/)).toBeTruthy();
    expect(draftLines()).toEqual(previous);
    expect(axios.post).not.toHaveBeenCalled();
});

test('Alt+A abre Aleatorio en la primera cantidad y respeta las modales abiertas', async () => {
    const user = await mount();
    await screen.findByText('Caja abierta');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('textbox', { name: 'Jugada', exact: true }));
    await user.keyboard('{Alt>}a{/Alt}');
    const quantity = await screen.findByRole('spinbutton', { name: 'Cantidad de Quiniela' });
    await waitFor(() => expect(document.activeElement).toBe(quantity));
    await user.clear(quantity); await user.type(quantity, '3');
    await user.keyboard('{Alt>}a{/Alt}');
    expect((quantity as HTMLInputElement).value).toBe('3');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Aleatorio', exact: true }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('spinbutton', { name: 'Cantidad de Quiniela' })));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: /Ligar números/ }));
    await screen.findByRole('group', { name: 'Modalidad de combinaciones' });
    await user.keyboard('{Alt>}a{/Alt}');
    expect(screen.queryByRole('spinbutton', { name: 'Cantidad de Quiniela' })).toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
});

test('Enter recorre las cantidades y montos, genera, acepta y devuelve el foco a Jugada', async () => {
    const user = await mount();
    await screen.findByText('Caja abierta');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(await screen.findByRole('button', { name: /^Sorteo 1/ }));
    await user.keyboard('{Alt>}a{/Alt}');
    const fields = [
        ['spinbutton', 'Cantidad de Quiniela', '1'], ['textbox', 'Monto de Quiniela', '2'],
        ['spinbutton', 'Cantidad de Palé', '1'], ['textbox', 'Monto de Palé', '3'],
        ['spinbutton', 'Cantidad de Tripleta', '1'], ['textbox', 'Monto de Tripleta', '4'],
    ];
    for (const [role, name, value] of fields) {
        const field = await screen.findByRole(role, { name });
        await waitFor(() => expect(document.activeElement).toBe(field));
        await user.clear(field); await user.type(field, value);
        await user.keyboard('{Enter}');
    }
    const accept = await screen.findByRole('button', { name: 'Agregar jugadas' });
    await waitFor(() => expect(document.activeElement).toBe(accept));
    expect(screen.getByText('Total: RD$9.00')).toBeTruthy();
    expect(draftLines()).toHaveLength(0);
    expect(axios.post).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(draftLines()).toHaveLength(3));
    expect(draftLines().map((line: any) => [line.modality, line.amount])).toEqual([['quiniela', '2'], ['pale', '3'], ['tripleta', '4']]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Jugada', exact: true })));
    expect(axios.post).toHaveBeenCalledTimes(3);
});

test('Enter omite el monto de las cantidades cero y genera al omitir la última modalidad', async () => {
    const user = await mount();
    await screen.findByText('Caja abierta');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(await screen.findByRole('button', { name: /^Sorteo 1/ }));
    await user.keyboard('{Alt>}a{/Alt}');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('spinbutton', { name: 'Cantidad de Quiniela' })));
    await user.keyboard('{Enter}');
    const pale = screen.getByRole('spinbutton', { name: 'Cantidad de Palé' });
    expect(document.activeElement).toBe(pale);
    await user.clear(pale); await user.type(pale, '1'); await user.keyboard('{Enter}');
    const amount = screen.getByRole('textbox', { name: 'Monto de Palé' });
    expect(document.activeElement).toBe(amount);
    await user.type(amount, '2'); await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByRole('spinbutton', { name: 'Cantidad de Tripleta' }));
    await user.keyboard('{Enter}');
    const accept = await screen.findByRole('button', { name: 'Agregar jugadas' });
    await waitFor(() => expect(document.activeElement).toBe(accept));
    expect(screen.getByText('Total: RD$2.00')).toBeTruthy();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(draftLines()).toHaveLength(1));
    expect(draftLines()[0]).toMatchObject({ modality: 'pale', amount: '2' });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Jugada', exact: true })));
});

test('Aleatorio muestra cantidades y total, agrega en varios sorteos y conserva las jugadas actuales', async () => {
    const user = await mount();
    await user.click(await screen.findByRole('button', { name: /^Sorteo 1/ }));
    await enterPlay(user, '10');
    await waitFor(() => expect(draftLines()).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: /^Sorteo 2/ }));
    const dialog = await prepareRandom(user);
    expect(within(dialog).getByText(/6 jugadas × 2 sorteos/)).toBeTruthy();
    expect(within(dialog).getByText('Total: RD$20.00')).toBeTruthy();
    expect(draftLines()).toHaveLength(1); // Generar solo muestra la vista previa.
    await user.click(within(dialog).getByRole('button', { name: 'Agregar jugadas' }));
    await waitFor(() => expect(draftLines()).toHaveLength(13));
    const result = draftLines();
    expect(result[0]).toMatchObject({ draw_id: 1, modality: 'quiniela', numbers: '10', amount: '1' });
    expect(new Set(result.map((line: any) => `${line.draw_id}:${line.modality}:${line.numbers}`)).size).toBe(13);
    expect(result.filter((line: any) => line.modality === 'pale').every((line: any) => line.amount === '2')).toBe(true);
});

test('Aleatorio agrega solo donde hay cupo, informa los rechazados y no duplica al pulsar dos veces', async () => {
    vi.mocked(axios.post).mockImplementation(async (_url, payload: any) => ({ data: { available_minor: payload.draw_id === 2 ? 0 : null, server_now: new Date().toISOString() } }));
    const user = await mount();
    await user.click(await screen.findByRole('button', { name: /^Sorteo 1/ }));
    await user.click(screen.getByRole('button', { name: /^Sorteo 2/ }));
    const dialog = await prepareRandom(user);
    await user.dblClick(within(dialog).getByRole('button', { name: 'Agregar jugadas' }));
    await waitFor(() => expect(draftLines()).toHaveLength(6));
    expect(draftLines().every((line: any) => line.draw_id === 1)).toBe(true);
    await screen.findByText('No se pudo agregar en estos sorteos');
    expect(vi.mocked(axios.post).mock.calls.filter(([url]) => url === '/lottery/availability')).toHaveLength(12);
});

test('cerrar Aleatorio sin agregar conserva el ticket y restaura el foco en Jugada', async () => {
    const user = await mount();
    await screen.findByRole('button', { name: /^Sorteo 1/ });
    await user.click(screen.getByRole('button', { name: 'Aleatorio' }));
    expect((screen.getByRole('button', { name: 'Generar jugadas' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('spinbutton', { name: 'Cantidad de Quiniela' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Jugada', exact: true })));
    expect(draftLines()).toHaveLength(0);
});

test('el aviso remoto de cierre muestra la modal obligatoria, impide vender y conserva las jugadas', async () => {
    const user = await mount();
    await user.click(await screen.findByRole('button', { name: /^Sorteo 1/ }));
    await enterPlay(user, '10');
    await waitFor(() => expect(draftLines()).toHaveLength(1));
    vi.mocked(axios.get).mockResolvedValue({ data: { current: null } });
    act(() => cashSocket.changed({ office_id: 1, branch_id: 1, session_id: 1, state: 'closed' }));
    await screen.findByRole('heading', { name: 'Abre la caja para vender' });
    await screen.findByText(/La caja de esta banca fue cerrada/);
    expect((document.querySelector('[data-sale-shortcut="F2"]') as HTMLButtonElement).disabled).toBe(true);
    expect(draftLines()).toHaveLength(1);
    expect(draftLines()[0].numbers).toBe('10');
});

test('el modo reporte oculta los indicadores de caja y permite vender; reevaluar la política conserva las jugadas', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { current: null, reconciliation_mode: 'report' } });
    const user = await mount();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await screen.findByRole('button', { name: /^Sorteo 1/ });
    expect(screen.queryByText('Cuadre por reporte')).toBeNull();
    expect(screen.queryByText('En vivo')).toBeNull();
    expect(screen.queryByTitle(/Avisos de caja/)).toBeNull();
    expect(screen.queryByText('Caja abierta')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abrir caja', exact: true })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Sorteo 1/ }));
    await enterPlay(user, '10');
    await waitFor(() => expect(draftLines()).toHaveLength(1));
    const sell = document.querySelector('[data-sale-shortcut="F2"]') as HTMLButtonElement;
    expect(sell.disabled).toBe(false);
    vi.mocked(axios.get).mockResolvedValue({ data: { current: null, reconciliation_mode: 'cash' } });
    await act(async () => { await clients[0].invalidateQueries({ queryKey: ['lottery','cash-status',1], exact: true }); });
    await screen.findByRole('heading', { name: 'Abre la caja para vender' });
    expect(sell.disabled).toBe(true);
    expect(draftLines()).toHaveLength(1);
    vi.mocked(axios.get).mockResolvedValue({ data: { current: null, reconciliation_mode: 'report' } });
    act(() => cashSocket.changed({ office_id: 1, branch_id: 1, session_id: null, state: 'configuration_changed' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('Cuadre por reporte')).toBeNull();
    expect(screen.queryByTitle(/Avisos de caja/)).toBeNull();
    expect(sell.disabled).toBe(false);
    expect(draftLines()).toHaveLength(1);
});

test('editar el monto reemplaza solo la fila elegida y descuenta del cupo las otras jugadas', async () => {
    const user = await mount();
    await screen.findByText('Caja abierta');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(await screen.findByRole('button', { name: /^Sorteo 1/ }));
    await user.click(screen.getByRole('button', { name: /^Sorteo 2/ }));
    await enterPlay(user, '10');
    await waitFor(() => expect(draftLines()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Editar monto de 10 · Sorteo 1' }));
    const amount = await screen.findByRole('textbox', { name: 'Nuevo monto (DOP)' });
    await user.clear(amount); await user.type(amount, '2.50');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(draftLines()[0].amount).toBe('2.50'));
    expect(draftLines()).toHaveLength(2);
    expect(draftLines()[1]).toMatchObject({ draw_id: 2, numbers: '10', amount: '1' });
    const request = vi.mocked(axios.post).mock.calls.at(-1)!;
    expect(request[0]).toBe('/lottery/availability');
    expect(request[1]).toMatchObject({ draw_id: 1, numbers: '10', amount: '2.50', pending: [{ draw_id: 2, numbers: '10', amount: '1' }] });
    const summary = screen.getByRole('group', { name: 'Resumen de venta' });
    expect(within(summary).getByText('2 jugadas')).toBeTruthy();
    expect(within(summary).getByText('RD$3.50')).toBeTruthy();
});

test('un monto inválido o sin cupo conserva la jugada y permite corregirla', async () => {
    const user = await mount();
    await screen.findByText('Caja abierta');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(await screen.findByRole('button', { name: /^Sorteo 1/ }));
    await enterPlay(user, '1020');
    await waitFor(() => expect(draftLines()).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Editar monto de 10-20 · Sorteo 1' }));
    const amount = await screen.findByRole('textbox', { name: 'Nuevo monto (DOP)' });
    const before = vi.mocked(axios.post).mock.calls.length;
    await user.clear(amount); await user.type(amount, '0'); await user.keyboard('{Enter}');
    await screen.findByText(/Indica un monto mayor que cero/);
    expect(axios.post).toHaveBeenCalledTimes(before);
    expect(draftLines()[0].amount).toBe('1');
    vi.mocked(axios.post).mockResolvedValue({ data: { available_minor: 150 } });
    await user.clear(amount); await user.type(amount, '2'); await user.keyboard('{Enter}');
    await screen.findByText(/El monto anterior se conserva/);
    expect(draftLines()[0].amount).toBe('1');
    vi.mocked(axios.post).mockResolvedValue({ data: { available_minor: 150 } });
    await user.clear(amount); await user.type(amount, '1.50'); await user.keyboard('{Enter}');
    await waitFor(() => expect(draftLines()[0].amount).toBe('1.50'));
    expect(draftLines()).toHaveLength(1);
});

test('cancelar la edición conserva los importes y devuelve el foco a Jugada', async () => {
    const user = await mount();
    await screen.findByText('Caja abierta');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(await screen.findByRole('button', { name: /^Sorteo 1/ }));
    await enterPlay(user, '102030');
    await waitFor(() => expect(draftLines()).toHaveLength(1));
    const edit = screen.getByRole('button', { name: 'Editar monto de 10-20-30 · Sorteo 1' });
    await waitFor(() => expect((edit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Editar monto de 10-20-30 · Sorteo 1' }));
    const amount = await screen.findByRole('textbox', { name: 'Nuevo monto (DOP)' });
    await user.clear(amount); await user.type(amount, '1000');
    expect((amount as HTMLInputElement).value).toBe('1,000');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Jugada', exact: true })));
    expect(draftLines()[0].amount).toBe('1');
});

test('la edición de un súper palé conserva ambos sorteos y maneja los errores de red', async () => {
    const original = { draw_id: 1, second_draw_id: 2, modality: 'super_pale', numbers: '10-20', amount: '5' };
    sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, activeId: 'draft', drafts: [{ id: 'draft', title: 'Ticket 1', selected: [], lines: [original], mode: 'quiniela', numbers: '', amount: '', discount: false, requestKey: 'key' }] }));
    const user = await mount();
    await screen.findByText('Caja abierta');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const edit = await screen.findByRole('button', { name: 'Editar monto de 10-20 · Sorteo 1 + Sorteo 2' });
    fireEvent.click(edit);
    const amount = await screen.findByRole('textbox', { name: 'Nuevo monto (DOP)' });
    vi.mocked(axios.post).mockRejectedValueOnce({ response: { data: { message: 'Sin conexión' } } });
    await user.clear(amount); await user.type(amount, '3'); await user.keyboard('{Enter}');
    await screen.findByText('Sin conexión');
    expect(draftLines()).toEqual([original]);
    vi.mocked(axios.post).mockResolvedValue({ data: { available_minor: null } });
    await user.click(screen.getByRole('button', { name: 'Guardar monto' }));
    await waitFor(() => expect(draftLines()[0].amount).toBe('3.00'));
    expect(vi.mocked(axios.post).mock.calls.at(-1)![1]).toMatchObject({ draw_id: 1, second_draw_id: 2, modality: 'super_pale', pending: [] });
});
