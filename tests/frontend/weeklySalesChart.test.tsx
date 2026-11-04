// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import WeeklySalesChart, { WeeklySales } from '../../resources/js/Components/WeeklySalesChart';

afterEach(cleanup);
const money = (minor: number) => 'RD$'+(minor/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const week: WeeklySales = {from:'2026-10-16',to:'2026-10-22',today:'2026-10-22',net_minor:7100,tickets:5,
    series:[0,100,0,2000,0,2000,3000].map((net_minor,index)=>({date:`2026-10-${16+index}`,net_minor,tickets:net_minor ? 1 : 0}))};

test('muestra siete días consecutivos, sus montos y los días sin ventas con cero',()=>{
    render(<WeeklySalesChart week={week} money={money}/>);
    expect(screen.getByRole('heading',{name:'Ventas de los últimos 7 días'})).toBeTruthy();
    const days=screen.getAllByRole('listitem');
    expect(days).toHaveLength(7);
    expect(days[0].getAttribute('aria-label')).toContain('16 de octubre');
    expect(days[0].getAttribute('aria-label')).toContain('RD$0.00');
    expect(days[6].getAttribute('aria-label')).toContain('22 de octubre');
    expect(days[6].getAttribute('aria-label')).toContain('RD$30.00');
    expect(screen.getByText('Subida de 50% contra ayer.')).toBeTruthy();
});

test('no inventa porcentajes cuando no hubo ventas el día anterior',()=>{
    const emptyPrevious={...week,series:week.series.map((day,index)=>index===5 ? {...day,net_minor:0} : day)};
    render(<WeeklySalesChart week={emptyPrevious} money={money}/>);
    expect(screen.getByText('Venta del último día: RD$30.00. El día anterior no hubo ventas.')).toBeTruthy();
    expect(screen.queryByText(/Infinity|NaN/)).toBeNull();
});

test('el descenso del último día usa solo los dos últimos días de la serie',()=>{
    const decline={...week,to:'2026-10-21',series:week.series.map((day,index)=>index===6 ? {...day,net_minor:1000} : day)};
    render(<WeeklySalesChart week={decline} money={money}/>);
    expect(screen.getByText('Bajada de 50% contra el día anterior.')).toBeTruthy();
});
