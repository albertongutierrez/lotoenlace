// @vitest-environment jsdom
import React from 'react';
import { expect, test, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import { DrawEditor } from '../../resources/js/Pages/Lottery/CatalogForms';
vi.mock('axios', () => ({default:{post:vi.fn()}}));

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
