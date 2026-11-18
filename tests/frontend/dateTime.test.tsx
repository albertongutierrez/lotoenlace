import {afterEach,expect,test} from 'vitest';
import {defaultDateTimePreferences,formatDateTime,formatTime,formatLocalTime,getDateTimePreferences,normalizeDateTimePreferences,setDateTimeFromPage,setDateTimePreferences} from '../../resources/js/lib/dateTime';
import {drawWindow} from '../../resources/js/lib/drawSchedule';

afterEach(()=>setDateTimePreferences());
test('Madrid usa su horario de invierno/verano y el formato 24 no muestra medianoche como 24:00',()=>{
    setDateTimePreferences({display_timezone:'Europe/Madrid',time_format:'24'});
    expect(formatTime('2026-01-15T16:30:00Z')).toBe('17:30');
    expect(formatTime('2026-07-15T16:30:00Z')).toBe('18:30');
    expect(formatTime('2026-01-15T23:00:00Z')).toBe('00:00');
    expect(formatDateTime('2026-01-16T03:30:00Z')).toContain('16/01/2026');
    setDateTimePreferences({display_timezone:'America/Santo_Domingo',time_format:'12'});
    expect(formatTime('2026-01-16T03:30:00Z')).toMatch(/11:30\s*p\.?\s*m\.?/i);
});
test('cambiar la visualización nunca cambia el calendario de un sorteo ni sus cierres',()=>{
    const draw={id:1,lottery_id:1,name:'NY',timezone:'America/New_York',active:true,weekdays:[4],modalities:['quiniela'],opens_at:'00:00:00',closes_at:'23:30:00',draws_at:'23:35:00'};
    const instant=new Date('2026-01-16T04:15:00Z');
    const before=drawWindow(draw,instant);
    setDateTimePreferences({display_timezone:'Europe/Madrid',time_format:'24'});
    expect(drawWindow(draw,instant)).toEqual(before);
    expect(before.date).toBe('2026-01-15');
    expect(formatLocalTime('21:30:00')).toBe('21:30');
    setDateTimePreferences({time_format:'12'});
    expect(formatLocalTime('21:30:00')).toMatch(/09:30\s*p\.?\s*m\.?/i);
});
test('cada cambio de banca actualiza su preferencia y cerrar sesión retira la del consorcio anterior',()=>{
    setDateTimeFromPage({props:{auth:{activeBranchOffice:{display_timezone:'Europe/Madrid',time_format:'24'}}}});
    expect(getDateTimePreferences()).toEqual({display_timezone:'Europe/Madrid',time_format:'24'});
    setDateTimeFromPage({props:{auth:{activeBranchOffice:{display_timezone:'America/Santo_Domingo',time_format:'12'}}}});
    expect(getDateTimePreferences()).toEqual(defaultDateTimePreferences);
    setDateTimePreferences({display_timezone:'Europe/Madrid',time_format:'24'});
    setDateTimeFromPage({props:{auth:null}});
    expect(getDateTimePreferences()).toEqual(defaultDateTimePreferences);
    expect(normalizeDateTimePreferences({display_timezone:'UTC+1',time_format:'invalid' as any})).toEqual(defaultDateTimePreferences);
});
