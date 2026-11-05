// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import BranchOverrides from '../../resources/js/Pages/Lottery/BranchOverrides';

vi.mock('@/Components/Modal', () => ({ default: ({ show, children }: any) => show ? <div role="dialog">{children}</div> : null }));
afterEach(cleanup);

const parent = { footer: 'Pie del consorcio', show_qr: true, payment_methods: ['cash'], reconciliation_mode: 'cash', general_rules: { quiniela: { commission_bps: 1000, payouts: { 1: 60 } } } };
function Editor({ initial, permissions }: { initial: any; permissions?: string[] }) {
    const [settings, setSettings] = useState(initial);
    return <><BranchOverrides settings={settings} parent={parent} draws={[]} currency="DOP" disabled={false} can={permission => !permissions || permissions.includes(permission)} errors={{}} onChange={setSettings} /><output data-testid="settings">{JSON.stringify(settings)}</output></>;
}

test('muestra las excepciones y permite quitar una conservando las demás', () => {
    render(<Editor initial={{ footer: 'Pie propio', show_qr: false }} />);
    expect(screen.getByText('Pie propio')).toBeTruthy();
    expect(screen.getByText('Pie del consorcio')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Heredar Pie del ticket' }));
    expect(JSON.parse(screen.getByTestId('settings').textContent!)).toEqual({ show_qr: false });
    expect(screen.queryByText('Pie propio')).toBeNull();
});

test('respeta los permisos de medios de cobro y forma de cuadre al heredar', () => {
    render(<Editor initial={{ payment_methods: ['transfer'], reconciliation_mode: 'report', footer: 'Pie propio' }} permissions={['lottery.settings']} />);
    expect((screen.getByRole('button', { name: 'Heredar Medios de cobro y referencias' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Heredar Forma de cuadre' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Heredar todo del consorcio' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Heredar Pie del ticket' }) as HTMLButtonElement).disabled).toBe(false);
});

test('puede restablecer toda la banca después de confirmar', () => {
    render(<Editor initial={{ footer: 'Pie propio', rules: { '1:quiniela': { commission_bps: 0 } } }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Heredar todo del consorcio' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Heredar todo', exact: true }));
    expect(JSON.parse(screen.getByTestId('settings').textContent!)).toEqual({});
    expect(screen.getByText('Esta banca hereda toda su configuración del consorcio.')).toBeTruthy();
});
