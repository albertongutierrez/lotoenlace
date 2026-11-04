// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import Reports from '../../resources/js/Pages/Lottery/Reports';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@inertiajs/react', () => ({ usePage: () => ({ url: '/lottery/reports?report=reconciliation&period=custom&from=2026-10-19&to=2026-10-20&branch_id=1&view=detail&operation=refund', props: { auth: { user: { id: 1, permissions: [] } } } }), Head: () => null }));
vi.mock('@/Layouts/AuthenticatedLayout', () => ({ default: ({ children }: any) => <main>{children}</main> }));
vi.mock('@/Components/ComboboxSelect', () => ({ default: (props: any) => <select {...props} /> }));
vi.mock('@/Components/ReportPdfModal', () => ({ default: ({ url, autoPrint }: any) => <div role="dialog" data-url={url} data-print={String(autoPrint)}>PDF</div> }));
vi.mock('@/Components/ui/data-table', () => ({ DataTable: () => <div>Listado</div> }));
const data = { available: [{ key: 'reconciliation', label: 'Cuadre por período' }], report: 'reconciliation', office: { id: 1, name: 'Prueba' }, currency: 'DOP',
    banks: [{ id: 1, code: 'REPORTE', reconciliation_mode: 'report' }, { id: 2, code: 'CAJA', reconciliation_mode: 'cash' }], draws: [],
    from: '2026-10-19', to: '2026-10-20', totals: {}, rows: { data: [] }, columns: [] };
let client: QueryClient;
beforeEach(() => { client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); vi.mocked(axios.get).mockReset().mockResolvedValue({ data }); });
afterEach(() => { cleanup(); client.clear(); });
function mount() { render(<QueryClientProvider client={client}><Reports {...data}/></QueryClientProvider>); return userEvent.setup(); }

test('el cuadre ofrece solo bancas por reporte y exporta los filtros consultados, sin aplicar cambios pendientes', async () => {
    const user = mount();
    expect(screen.queryByRole('option', { name: 'CAJA' })).toBeNull();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Período' }), 'today');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Ver PDF' }) as HTMLButtonElement).disabled).toBe(false));
    await user.click(screen.getByRole('button', { name: 'Ver PDF' }));
    const url = new URL(screen.getByRole('dialog').getAttribute('data-url')!, 'http://lotoenlace.test');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ report: 'reconciliation', branch_id: '1', period: 'custom', from: '2026-10-19', to: '2026-10-20', view: 'detail', operation: 'refund', format: 'pdf', office_id: '1' });
});

test('Imprimir abre la vista PDF dentro de la página con los mismos filtros y solicita impresión', async () => {
    const user = mount();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Imprimir' }) as HTMLButtonElement).disabled).toBe(false));
    await user.click(screen.getByRole('button', { name: 'Imprimir' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('data-print')).toBe('true');
    expect(dialog.getAttribute('data-url')).toContain('operation=refund');
    expect(dialog.getAttribute('data-url')).toContain('view=detail');
});
