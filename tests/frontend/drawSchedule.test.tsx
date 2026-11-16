import { expect, test } from 'vitest';
import { drawLocalDate, drawTime, drawWindow } from '../../resources/js/lib/drawSchedule';
import type { Draw } from '../../resources/js/Pages/Lottery/shared';

test.each(['America/New_York', 'America/Port-au-Prince'])('las 21:00 de %s cambian su equivalencia en RD según la fecha', timezone => {
    expect(new Date(drawTime('2026-01-15', '21:00', timezone)).toISOString()).toBe('2026-01-16T02:00:00.000Z');
    expect(new Date(drawTime('2026-07-15', '21:00', timezone)).toISOString()).toBe('2026-07-16T01:00:00.000Z');
    expect(new Date(drawTime('2026-01-15', '21:00')).toISOString()).toBe('2026-01-16T01:00:00.000Z');
});

test('el calendario y las suspensiones pertenecen a la zona del sorteo al cruzar medianoche RD', () => {
    const draw: Draw = { id:1, lottery_id:1, name:'NY Noche', timezone:'America/New_York', active:true, weekdays:[1], modalities:['quiniela'], opens_at:'00:00:00', closes_at:'23:30:00', draws_at:'23:35:00' };
    const now = new Date('2026-11-17T04:15:00Z');
    expect(drawLocalDate(now)).toBe('2026-11-17');
    const window = drawWindow(draw, now);
    expect(window.date).toBe('2026-11-16');
    expect(window.eligible).toBe(true);
    expect(window.close).toBe(new Date('2026-11-17T04:30:00Z').getTime());
    expect(drawWindow({...draw, exceptions:{'2026-11-16':{closed:true}}}, now).eligible).toBe(false);
    expect(drawWindow({...draw, exceptions:{'2026-11-17':{closed:true}}}, now).eligible).toBe(true);
});
