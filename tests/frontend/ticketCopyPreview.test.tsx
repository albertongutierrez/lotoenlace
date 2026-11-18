// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import TicketCopyPreview from '../../resources/js/Pages/Lottery/TicketCopyPreview';

afterEach(cleanup);
const lines = [
    {draw_id:1, modality:'quiniela', numbers:'07', amount:'2.50'},
    {draw_id:2, modality:'quiniela', numbers:'07', amount:'2.50'},
    {draw_id:1, second_draw_id:2, modality:'super_pale', numbers:'10-20', amount:'3.00'},
];
const drawName = (id:number)=>`Sorteo completo ${id}`;

test('la copia a seleccionados presenta jugadas únicas sin nombres ni columna de sorteos', () => {
    render(<TicketCopyPreview lines={lines} mode="selected" currency="DOP" amounts={{}} drawName={drawName} />);
    const table = screen.getByRole('table',{name:'Detalle del ticket a copiar'});
    expect(within(table).queryByRole('columnheader',{name:'Sorteo'})).toBeNull();
    expect(table.textContent).not.toContain('Sorteo completo');
    expect(within(table).getAllByText('07')).toHaveLength(1);
    expect(within(table).getByText('10-20')).toBeTruthy();
    expect(screen.getByText('RD$5.50')).toBeTruthy();
});

test('la copia original presenta cada jugada con sus sorteos y el total completo', () => {
    render(<TicketCopyPreview lines={lines} mode="original" currency="DOP" amounts={{}} drawName={drawName} />);
    const table = screen.getByRole('table',{name:'Detalle del ticket a copiar'});
    expect(within(table).getByRole('columnheader',{name:'Sorteo'})).toBeTruthy();
    expect(within(table).getByText('Sorteo completo 1 + Sorteo completo 2')).toBeTruthy();
    expect(within(table).getAllByText('07')).toHaveLength(2);
    expect(screen.getByText('RD$8.00')).toBeTruthy();
});

test('la vista espera un monto válido cuando la misma jugada tiene precios distintos', () => {
    const source = [lines[0], {...lines[1],amount:'5.00'}];
    const {rerender} = render(<TicketCopyPreview lines={source} mode="selected" currency="DOP" amounts={{}} drawName={drawName} />);
    expect(screen.getByText('RD$2.50 / RD$5.00')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    rerender(<TicketCopyPreview lines={source} mode="selected" currency="DOP" amounts={{'0::quiniela:07':''}} drawName={drawName} />);
    expect(screen.getByText('—')).toBeTruthy();
    rerender(<TicketCopyPreview lines={source} mode="selected" currency="DOP" amounts={{'0::quiniela:07':'5.00'}} drawName={drawName} />);
    expect(screen.queryByText('—')).toBeNull();
    expect(screen.getAllByText('RD$5.00')).toHaveLength(2);
});
