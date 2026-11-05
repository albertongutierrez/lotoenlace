// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import TariffRulesEditor from '../../resources/js/Pages/Lottery/TariffRulesEditor';
import type { Draw } from '../../resources/js/Pages/Lottery/shared';

vi.mock('@/Components/ComboboxSelect', () => ({ default: (props: any) => <select {...props} /> }));
vi.mock('@/Components/Modal', () => ({ default: ({ show, children }: any) => show ? <div role="dialog">{children}</div> : null }));
afterEach(cleanup);

const draw = { id: 1, name: 'Sorteo A', lottery: { name: 'Lotería' }, modalities: ['quiniela', 'pale', 'tripleta', 'super_pale'], result_count: 3 } as Draw;
const parent = { general_rules: { quiniela: { payouts: { 1: 60, 2: 10, 3: 5 }, commission_bps: 1000 } }, rules: { '1:quiniela': { payouts: { 1: 65 } } } };

function Editor({ initial = {}, draws = [draw], branch = true }: { initial?: any; draws?: Draw[]; branch?: boolean }) {
    const [settings, setSettings] = useState(initial);
    return <><TariffRulesEditor settings={settings} parent={branch ? parent : {}} draws={draws} branch={branch} onChange={setSettings} /><output data-testid="settings">{JSON.stringify(settings)}</output></>;
}

test('permite una comisión y premios generales propios de cada modalidad', () => {
    render(<Editor />);
    expect((screen.getByRole('spinbutton', { name: 'Premio 1 de Quiniela' }) as HTMLInputElement).value).toBe('60');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Comisión de Quiniela' }), { target: { value: '12.5' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Premio 1 de Quiniela' }), { target: { value: '75' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Premio 1-2 de Palé' }), { target: { value: '1200' } });
    const settings = JSON.parse(screen.getByTestId('settings').textContent!);
    expect(settings.general_rules.quiniela).toEqual({ commission_bps: 1250, payouts: { 1: 75, 2: 10, 3: 5 } });
    expect(settings.general_rules.pale.payouts).toEqual({ '1-2': 1200 });
    expect(settings.rules).toBeUndefined();
});

test('una excepción del sorteo tiene prioridad y puede volver a heredar', () => {
    render(<Editor initial={{ general_rules: { quiniela: { payouts: { 1: 70 } } }, rules: { '1:quiniela': { payouts: { 1: 80 } }, '1:pale': { commission_bps: 500 } } }} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Alcance de comisiones y premios' }), { target: { value: 'draw' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Sorteo para comisiones y premios' }), { target: { value: '1' } });
    expect((screen.getByRole('spinbutton', { name: 'Premio 1 de Quiniela' }) as HTMLInputElement).value).toBe('80');
    fireEvent.click(screen.getAllByRole('button', { name: 'Usar valores heredados' })[0]);
    expect((screen.getByRole('spinbutton', { name: 'Premio 1 de Quiniela' }) as HTMLInputElement).value).toBe('70');
    const settings = JSON.parse(screen.getByTestId('settings').textContent!);
    expect(settings.rules).toEqual({ '1:pale': { commission_bps: 500 } });
});

test('usar la general elimina únicamente las excepciones de la modalidad elegida', () => {
    render(<Editor initial={{ rules: { '1:quiniela': { commission_bps: 500 }, '2:quiniela': { payouts: { 1: 80 } }, '1:pale': { payouts: { '1-2': 1200 } } } }} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Usar general en todos los sorteos' })[0]);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Usar general', exact: true }));
    expect(JSON.parse(screen.getByTestId('settings').textContent!).rules).toEqual({ '1:pale': { payouts: { '1-2': 1200 } } });
    expect(screen.queryByRole('dialog')).toBeNull();
});

test('un sorteo de un número presenta únicamente su primer premio de quiniela', () => {
    render(<Editor draws={[{ ...draw, name: 'El Quemaito Mayor', result_count: 1, modalities: ['quiniela', 'super_pale'] }]} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Alcance de comisiones y premios' }), { target: { value: 'draw' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Sorteo para comisiones y premios' }), { target: { value: '1' } });
    expect(screen.getByRole('spinbutton', { name: 'Premio 1 de Quiniela' })).toBeTruthy();
    expect(screen.queryByRole('spinbutton', { name: 'Premio 2 de Quiniela' })).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: 'Premio 1-2 de Palé' })).toBeNull();
});

test('el consorcio puede borrar su personalización global conservando la excepción de un sorteo', () => {
    const exception = { '1:quiniela': { payouts: { 1: 80 } } };
    render(<Editor branch={false} initial={{ general_rules: parent.general_rules, rules: exception }} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Borrar personalización global' })[0]);
    const settings = JSON.parse(screen.getByTestId('settings').textContent!);
    expect(settings.general_rules).toBeUndefined();
    expect(settings.rules).toEqual(exception);
    expect((screen.getByRole('spinbutton', { name: 'Premio 1 de Quiniela' }) as HTMLInputElement).value).toBe('');
    expect((screen.getAllByRole('button', { name: 'Borrar personalización global' })[0] as HTMLButtonElement).disabled).toBe(true);
});

test('heredar en la banca elimina la global propia y muestra de nuevo los valores del consorcio', () => {
    render(<Editor initial={{ general_rules: { quiniela: { payouts: { 1: 75 }, commission_bps: 1500 } } }} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Heredar del consorcio' })[0]);
    expect(JSON.parse(screen.getByTestId('settings').textContent!).general_rules).toBeUndefined();
    expect((screen.getByRole('spinbutton', { name: 'Premio 1 de Quiniela' }) as HTMLInputElement).value).toBe('60');
    expect((screen.getByRole('spinbutton', { name: 'Comisión de Quiniela' }) as HTMLInputElement).placeholder).toBe('10');
});
