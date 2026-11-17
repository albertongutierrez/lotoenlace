// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import SuperPairTargets from '../../resources/js/Pages/Lottery/SuperPairTargets';

afterEach(cleanup);

test('elegir una pareja necesita dos clics y descarta el primer sorteo si deja de estar disponible', () => {
    const onChange = vi.fn();
    const draws = [1,2,3].map(id=>({id, name:`Sorteo ${id}`}));
    const isEnabled = ([a,b]:[number,number])=>a!==b;
    const {rerender} = render(<SuperPairTargets draws={draws} pairs={[]} isEnabled={isEnabled} onChange={onChange} />);
    const picker = screen.getByRole('group',{name:'Seleccionar pareja de destino'});
    fireEvent.click(within(picker).getByRole('button',{name:'Sorteo 1'}));
    expect(onChange).not.toHaveBeenCalled();
    expect(within(picker).getByRole('button',{name:'Sorteo 1'}).getAttribute('aria-pressed')).toBe('true');
    rerender(<SuperPairTargets draws={draws.slice(1)} pairs={[]} isEnabled={isEnabled} onChange={onChange} />);
    fireEvent.click(within(picker).getByRole('button',{name:'Sorteo 2'}));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(within(picker).getByRole('button',{name:'Sorteo 3'}));
    expect(onChange).toHaveBeenCalledWith([[2,3]]);
    expect(within(picker).getByRole('button',{name:'Sorteo 2'}).getAttribute('aria-pressed')).toBe('false');
});
