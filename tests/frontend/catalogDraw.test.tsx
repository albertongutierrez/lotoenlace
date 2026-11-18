// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import { DrawEditor, LotteryEditor } from '../../resources/js/Pages/Lottery/CatalogForms';
vi.mock('axios', () => ({default:{post:vi.fn()}}));
afterEach(()=>{cleanup();vi.mocked(axios.post).mockClear();});

test('el editor de sorteo guarda su abreviatura y zona horaria con los horarios locales', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const client = new QueryClient({defaultOptions:{mutations:{retry:false}}});
    const done = vi.fn();
    vi.mocked(axios.post).mockResolvedValue({data:{message:'Sorteo guardado.'}});
    try {
        render(<QueryClientProvider client={client}><DrawEditor lottery={{id:1,name:'Lotería',active:true}} onClose={done} /></QueryClientProvider>);
        const user = userEvent.setup();
        await user.type(screen.getByLabelText('Nombre del sorteo'),'Sorteo Nueva York');
        await user.type(screen.getByLabelText('Abreviatura'),'NY N');
        await user.click(screen.getByRole('combobox',{name:'Zona horaria del sorteo'}));
        await user.click(await screen.findByRole('option',{name:/Estados Unidos · Nueva York/}));
        expect(screen.getByText(/Equivalencia en RD para hoy/)).toBeTruthy();
        await user.click(screen.getByRole('button',{name:'Guardar sorteo',exact:true}));
        await waitFor(()=>expect(axios.post).toHaveBeenCalledWith('/lottery/catalog/draws',expect.objectContaining({name:'Sorteo Nueva York',abbreviation:'NY N',timezone:'America/New_York',opens_at:'06:00',closes_at:'12:00'})));
        await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));
    } finally { cleanup(); client.clear(); }
});

test('la lotería guarda su zona y los sorteos nuevos heredan sin convertirla en una personalización', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const client = new QueryClient({defaultOptions:{mutations:{retry:false}}});
    vi.mocked(axios.post).mockResolvedValue({data:{message:'Guardado.'}});
    const user = userEvent.setup();
    try {
        const view=render(<QueryClientProvider client={client}><LotteryEditor lottery={{id:1,name:'Lotería NY',active:true}} onClose={vi.fn()} /></QueryClientProvider>);
        await user.click(screen.getByRole('combobox',{name:'Zona horaria de la lotería'}));
        await user.click(await screen.findByRole('option',{name:/Estados Unidos · Nueva York/}));
        await user.click(screen.getByRole('button',{name:'Guardar lotería',exact:true}));
        await waitFor(()=>expect(axios.post).toHaveBeenLastCalledWith('/lottery/catalog/lotteries',expect.objectContaining({timezone:'America/New_York'})));
        view.unmount();
        render(<QueryClientProvider client={client}><DrawEditor lottery={{id:1,name:'Lotería NY',active:true,timezone:'America/New_York'}} onClose={vi.fn()} /></QueryClientProvider>);
        expect((screen.getByRole('combobox',{name:'Zona horaria del sorteo'}) as HTMLInputElement).value).toBe('Heredar de la lotería · America/New_York');
        expect(screen.getByText('Heredada de la lotería · America/New_York')).toBeTruthy();
        await user.type(screen.getByLabelText('Nombre del sorteo'),'NY heredado');
        await user.click(screen.getByRole('button',{name:'Guardar sorteo',exact:true}));
        await waitFor(()=>expect(axios.post).toHaveBeenLastCalledWith('/lottery/catalog/draws',expect.objectContaining({timezone:null})));
    } finally {cleanup();client.clear();}
});

test('editar un sorteo heredado mantiene la herencia y una zona propia se puede quitar', async () => {
    const client=new QueryClient({defaultOptions:{mutations:{retry:false}}});
    vi.mocked(axios.post).mockResolvedValue({data:{message:'Guardado.'}});
    const lottery={id:1,name:'NY',active:true,timezone:'America/New_York'};
    const draw={id:1,lottery_id:1,name:'Noche',timezone:'America/New_York',timezone_override:null,opens_at:'06:00:00',closes_at:'21:00:00',draws_at:'21:05:00',weekdays:[1],modalities:['quiniela'],active:true};
    try {
        const user=userEvent.setup();
        render(<QueryClientProvider client={client}><DrawEditor lottery={lottery} draw={draw} onClose={vi.fn()} /></QueryClientProvider>);
        await user.click(screen.getByRole('button',{name:'Guardar sorteo',exact:true}));
        await waitFor(()=>expect(axios.post).toHaveBeenLastCalledWith('/lottery/catalog/draws',expect.objectContaining({timezone:null})));
        await user.click(screen.getByRole('combobox',{name:'Zona horaria del sorteo'}));
        await user.click(await screen.findByRole('option',{name:/Estados Unidos · Chicago/}));
        expect(screen.getByText('Zona propia · America/Chicago')).toBeTruthy();
        await user.click(screen.getByRole('button',{name:'Heredar de la lotería',exact:true}));
        expect(screen.getByText('Heredada de la lotería · America/New_York')).toBeTruthy();
        await user.click(screen.getByRole('button',{name:'Guardar sorteo',exact:true}));
        await waitFor(()=>expect(axios.post).toHaveBeenLastCalledWith('/lottery/catalog/draws',expect.objectContaining({timezone:null})));
    } finally {cleanup();client.clear();}
});
