// @vitest-environment jsdom
import React,{useState} from 'react';
import {afterEach,expect,test,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DateTimeSettings from '../../resources/js/Pages/Lottery/DateTimeSettings';
vi.mock('../../resources/js/Pages/Lottery/shared',()=>({input:'input',Field:({label,children}:any)=><label>{label}{children}</label>}));
afterEach(cleanup);
function Editor({branch=false,initial={}}:{branch?:boolean;initial?:any}){
    const [settings,setSettings]=useState(initial);
    return <><DateTimeSettings settings={settings} parent={{display_timezone:'Europe/Madrid',time_format:'24'}} branch={branch} timezones={[]} onChange={setSettings}/><output data-testid="settings">{JSON.stringify(settings)}</output></>;
}
test('permite elegir España y formato 24 para el consorcio',async()=>{
    HTMLElement.prototype.scrollIntoView=vi.fn();
    render(<Editor/>);const user=userEvent.setup();
    await user.click(screen.getByRole('combobox',{name:'Zona horaria de visualización'}));
    await user.click(await screen.findByRole('option',{name:'España · Madrid · Europe/Madrid'}));
    await user.click(screen.getByRole('combobox',{name:'Formato de hora'}));
    await user.click(await screen.findByRole('option',{name:'24 horas · 14:30'}));
    expect(JSON.parse(screen.getByTestId('settings').textContent!)).toEqual({display_timezone:'Europe/Madrid',time_format:'24'});
    expect(screen.getByText(/Los días operativos y filtros por fecha siguen en RD/)).toBeTruthy();
});
test('una banca personaliza ambos campos y puede volver a heredar sin borrar sus otros ajustes',async()=>{
    HTMLElement.prototype.scrollIntoView=vi.fn();
    render(<Editor branch initial={{display_timezone:'America/Santo_Domingo',time_format:'12',footer:'Gracias'}}/>);const user=userEvent.setup();
    await user.click(screen.getByRole('combobox',{name:'Zona horaria de visualización'}));
    await user.click(await screen.findByRole('option',{name:'Heredar del consorcio · Europe/Madrid'}));
    await user.click(screen.getByRole('combobox',{name:'Formato de hora'}));
    await user.click(await screen.findByRole('option',{name:'Heredar del consorcio · 24 horas'}));
    expect(JSON.parse(screen.getByTestId('settings').textContent!)).toEqual({footer:'Gracias'});
});
