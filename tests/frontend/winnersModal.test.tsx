// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import WinnersModal from '../../resources/js/Pages/Lottery/WinnersModal';

vi.mock('axios',()=>({default:{get:vi.fn()}}));
vi.mock('@/Components/LoadingSkeleton',()=>({default:()=> <div>Cargando</div>}));
vi.mock('../../resources/js/Pages/Lottery/shared',()=>({button:'button',secondary:'secondary',input:'input',money:(v:number)=>`RD$${(v/100).toFixed(2)}`,modes:{quiniela:'Quiniela'},drawName:(d:any)=>d.name}));
const draws=[{id:1,name:'Quiniela LoteDom completa'}] as any;
const ticket={id:10,code:'ticket-winner-uuid',reference:'T-000010',business_date:'2026-10-21',currency:'DOP',lines:[{id:1,draw_id:1,numbers:'10',modality:'quiniela',prize_minor:7500,paid_at:null}]};
const response=(data:any[]= [ticket])=>({data:{tickets:{data,total:data.length,last_page:1}}});
const clients:QueryClient[]=[];
beforeAll(()=>{globalThis.ResizeObserver=class {observe(){} unobserve(){} disconnect(){}};HTMLElement.prototype.scrollIntoView=vi.fn();});
beforeEach(()=>{vi.mocked(axios.get).mockReset().mockResolvedValue(response());});
afterEach(()=>{cleanup();clients.forEach(c=>c.clear());clients.length=0;});
function mount(){
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);
 const view=(tick:number)=><QueryClientProvider client={client}><div data-tick={tick}><WinnersModal show userId={1} branchId={3} draws={draws} onClose={vi.fn()}/></div></QueryClientProvider>;
 const result=render(view(0));return {...result,client,tick:(n:number)=>result.rerender(view(n))};
}

test('Ver premios permanece abierto y conserva el foco durante las actualizaciones de Ventas',async()=>{
 const user=userEvent.setup();const app=mount();
 const summary=await screen.findByText('Ver premios');
 await user.click(summary);
 expect(summary.closest('details')?.open).toBe(true);
 summary.focus();
 for(let tick=1;tick<=3;tick++) {
  app.tick(tick);
  const current=screen.getByText('Ver premios');
  expect(current.closest('details')?.open).toBe(true);
  expect(document.activeElement).toBe(current);
 }
 expect(screen.getByText('Quiniela LoteDom completa')).toBeTruthy();
 await user.click(screen.getByText('Ver premios'));
 expect(screen.getByText('Ver premios').closest('details')?.open).toBe(false);
});

test('actualizar premios conserva el detalle abierto y muestra el estado de pago actualizado',async()=>{
 const user=userEvent.setup();mount();
 await user.click(await screen.findByText('Ver premios'));
 vi.mocked(axios.get).mockResolvedValue(response([{...ticket,lines:[{...ticket.lines[0],prize_minor:9000,paid_at:'2026-10-21T23:00:00Z'}]}]));
 await user.click(screen.getByRole('button',{name:'Actualizar ganadores'}));
 await waitFor(()=>expect(screen.getByText('RD$90.00 · Pagado')).toBeTruthy());
 expect(screen.getByText('Ver premios').closest('details')?.open).toBe(true);
});

test('al llegar otro ganador el detalle permanece en su ticket, aunque cambie el orden',async()=>{
 const user=userEvent.setup();mount();
 await user.click(await screen.findByText('Ver premios'));
 const newer={...ticket,id:11,code:'newer-ticket',reference:'T-000011',lines:[{...ticket.lines[0],id:2,numbers:'20'}]};
 vi.mocked(axios.get).mockResolvedValue(response([newer,ticket]));
 await user.click(screen.getByRole('button',{name:'Actualizar ganadores'}));
 await screen.findByText('T-000011');
 const original=screen.getByText('T-000010').closest('tr')!;
 const added=screen.getByText('T-000011').closest('tr')!;
 expect(original.querySelector('details')?.open).toBe(true);
 expect(added.querySelector('details')?.open).toBe(false);
});
