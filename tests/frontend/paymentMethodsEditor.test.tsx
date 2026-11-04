// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentMethodsEditor from '../../resources/js/Pages/Lottery/PaymentMethodsEditor';

vi.mock('@/Pages/Lottery/shared', () => ({ input: '', secondary: '' }));
beforeAll(() => {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const paypal = 'custom_0123456789ab';
function Harness({ branch = false, disabled = false, initial = {} }: any) {
    const [settings, setSettings] = useState(initial);
    return <><PaymentMethodsEditor settings={settings} parent={{ payment_methods: ['cash', paypal], payment_method_labels: { [paypal]: 'PayPal' }, payment_reference_required: { [paypal]: true } }} branch={branch} disabled={disabled} onChange={setSettings} /><output data-testid="settings">{JSON.stringify(settings)}</output></>;
}
const settings = () => JSON.parse(screen.getByTestId('settings').textContent!);

test('agrega medios con nombre propio, evita duplicados y permite deshabilitar sin borrar la definición', async () => {
    // Local HTTP sites may expose getRandomValues without randomUUID.
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const user = userEvent.setup();
    render(<Harness initial={{ payment_methods: ['cash'] }} />);
    await user.type(screen.getByLabelText('Nuevo medio de cobro'), 'Cash App{Enter}');
    const saved = settings();
    const key = Object.keys(saved.payment_method_labels).find(key => key !== paypal)!;
    expect(key).toMatch(/^custom_[a-f0-9]{12}$/);
    expect(saved.payment_methods).toContain(key);
    expect(saved.payment_method_labels[key]).toBe('Cash App');
    await user.click(screen.getByRole('checkbox', { name: 'Referencia obligatoria para Cash App' }));
    expect(settings().payment_reference_required[key]).toBe(true);
    expect((screen.getByLabelText('Nuevo medio de cobro') as HTMLInputElement).value).toBe('');
    await user.click(screen.getByRole('checkbox', { name: 'Habilitar Cash App' }));
    expect(settings().payment_methods).not.toContain(key);
    expect(settings().payment_method_labels[key]).toBe('Cash App');
    expect(settings().payment_reference_required[key]).toBe(true);
    await user.type(screen.getByLabelText('Nuevo medio de cobro'), ' paypal ');
    await user.click(screen.getByRole('button', { name: 'Agregar medio' }));
    expect(screen.getByRole('alert').textContent).toContain('Ya existe');
    expect(Object.keys(settings().payment_method_labels)).toHaveLength(2);
});

test('una banca hereda medios y solo los modifica al elegir configuración independiente', async () => {
    const user = userEvent.setup();
    render(<Harness branch />);
    expect((screen.getByLabelText('Nuevo medio de cobro') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Habilitar PayPal' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Referencia obligatoria para PayPal' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Referencia obligatoria para PayPal' }) as HTMLInputElement).disabled).toBe(true);
    await user.click(screen.getByRole('combobox', { name: 'Configuración de medios de cobro' }));
    await user.click(await screen.findByRole('option', { name: 'Configuración independiente de esta banca' }));
    expect(settings().payment_method_labels[paypal]).toBe('PayPal');
    expect(settings().payment_reference_required[paypal]).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: 'Referencia obligatoria para PayPal' }));
    expect(settings().payment_reference_required[paypal]).toBe(false);
    await user.clear(screen.getByLabelText(`Nombre del medio ${paypal}`));
    await user.type(screen.getByLabelText(`Nombre del medio ${paypal}`), 'PayPal Banca');
    expect(settings().payment_method_labels[paypal]).toBe('PayPal Banca');
    await user.click(screen.getByRole('combobox', { name: 'Configuración de medios de cobro' }));
    await user.click(await screen.findByRole('option', { name: 'Heredar del consorcio' }));
    expect(settings()).toEqual({});
    expect(screen.getByRole('checkbox', { name: 'Habilitar PayPal' })).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: 'Referencia obligatoria para PayPal' }) as HTMLInputElement).checked).toBe(true);
});

test('sin permiso no permite agregar ni cambiar medios', async () => {
    const user = userEvent.setup();
    render(<Harness disabled />);
    await user.type(screen.getByLabelText('Nuevo medio de cobro'), 'Cash App');
    await user.click(screen.getByRole('checkbox', { name: 'Habilitar Efectivo' }));
    await user.click(screen.getByRole('checkbox', { name: 'Referencia obligatoria para Efectivo' }));
    expect(settings()).toEqual({});
    expect(screen.getByText(/Requiere el permiso/)).toBeTruthy();
});
