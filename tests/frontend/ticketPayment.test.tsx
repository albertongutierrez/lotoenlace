// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import TicketActionsModal from '../../resources/js/Pages/Lottery/TicketActionsModal';
import IssuedTicketModal from '../../resources/js/Pages/Lottery/IssuedTicketModal';
import Tickets from '../../resources/js/Pages/Lottery/Tickets';
import { savePrinterPreference } from '../../resources/js/lib/localPrinter';

vi.mock('axios',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('@/Components/LoadingSkeleton',()=>({default:()=> <div>Cargando</div>}));
vi.mock('@/Components/ui/data-table',()=>({DataTable:()=> <div>Jugadas del ticket</div>}));
vi.mock('../../resources/js/Pages/Lottery/shared',()=>({Shell:({children}:any)=><div>{children}</div>,panel:'panel',button:'button',secondary:'secondary',input:'input',money:(v:number)=>`RD$${(v/100).toFixed(2)}`,modes:{quiniela:'Quiniela'},drawName:(d:any)=>d.name}));
vi.mock('@inertiajs/react',()=>({usePage:()=>({url:'/lottery/tickets',props:{auth:{user:{id:1,permissions:['lottery.cancel']},activeBranchOffice:{id_hash:'bank'}}}}),router:{get:vi.fn()},Link:({children}:any)=><span>{children}</span>}));
vi.mock('@/lib/notify',()=>({notify:vi.fn()}));
const ticket={id:7,code:'ticket-uuid',reference:'T-000007',business_date:'2026-10-21',created_at:'2026-10-21T12:00:00Z',currency:'DOP',status:'sold',net_minor:100,gross_minor:100,discount_minor:0,print_settings:{show_qr:true},lines:[{draw_id:1,modality:'quiniela',numbers:'10',amount_minor:100,prize_minor:6000,paid_at:null}]};
const cancellableTicket={...ticket,cancellation:{allowed:true,reason:null,checked_at:'2026-10-22T12:00:00Z',expires_at:'2026-10-22T12:05:00Z'},lines:ticket.lines.map(l=>({...l,prize_minor:null}))};
const clients:QueryClient[]=[];
beforeAll(()=>{globalThis.ResizeObserver=class {observe(){} unobserve(){} disconnect(){}};HTMLElement.prototype.scrollIntoView=vi.fn();});
beforeEach(()=>{localStorage.clear();vi.mocked(axios.get).mockResolvedValue({data:ticket});vi.mocked(axios.post).mockReset();});
afterEach(()=>{cleanup();clients.forEach(c=>c.clear());clients.length=0;vi.unstubAllGlobals();});
function mountActions(){const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});clients.push(client);render(<QueryClientProvider client={client}><TicketActionsModal branchId={3} draws={[{id:1,name:'Quiniela LoteDom'}] as any} user={{id:1,permissions:['lottery.pay','lottery.sell','lottery.cancel']}} onClose={vi.fn()}/></QueryClientProvider>);}
async function choosePayment(){const user=userEvent.setup();mountActions();await user.type(await screen.findByRole('textbox',{name:'Número del ticket'}),'T-000007');await user.keyboard('{Enter}');await user.click(await screen.findByRole('button',{name:'Pagar premios pendientes'}));return user;}

test('paga por la ruta de Ventas con código y PIN mediante teclado',async()=>{
 vi.mocked(axios.post).mockResolvedValue({data:{message:'Premios pendientes pagados.'}});
 const user=await choosePayment();
 const pin=await screen.findByLabelText('PIN del ticket');
 await waitFor(()=>expect(document.activeElement).toBe(pin));
 expect((screen.getByRole('button',{name:'Sí, registrar pago'}) as HTMLButtonElement).disabled).toBe(true);
 await user.type(pin,'000042');await user.keyboard('{Enter}');
 await screen.findByText('Premios pendientes pagados.');
 expect(axios.post).toHaveBeenCalledTimes(1);
 expect(axios.post).toHaveBeenCalledWith('/lottery/sales/tickets/ticket-uuid/pay',{branch_id:3,pin:'000042'},{headers:{Accept:'application/json'}});
});

test('un PIN incorrecto mantiene la modal, borra el PIN y permite corregirlo sin duplicar',async()=>{
 vi.mocked(axios.post).mockRejectedValueOnce({response:{data:{errors:{pin:['El PIN no corresponde a este ticket.']}}}}).mockResolvedValueOnce({data:{message:'Premios pendientes pagados.'}});
 const user=await choosePayment();
 const pin=await screen.findByLabelText('PIN del ticket');
 await user.type(pin,'111111');await user.keyboard('{Enter}');
 await screen.findByRole('alert');
 expect(screen.getByText('Confirmar pago')).toBeTruthy();
 await waitFor(()=>{expect((pin as HTMLInputElement).value).toBe('');expect(document.activeElement).toBe(pin);});
 expect(axios.post).toHaveBeenCalledTimes(1);
 await user.type(pin,'000042');await user.keyboard('{Enter}');
 await screen.findByText('Premios pendientes pagados.');
 expect(axios.post).toHaveBeenCalledTimes(2);
});

test('Escape regresa de la confirmación y elimina el PIN sin registrar el pago',async()=>{
 const user=await choosePayment();
 await user.type(await screen.findByLabelText('PIN del ticket'),'000042');await user.keyboard('{Escape}');
 await user.click(await screen.findByRole('button',{name:'Pagar premios pendientes'}));
 expect((await screen.findByLabelText('PIN del ticket') as HTMLInputElement).value).toBe('');
 expect(axios.post).not.toHaveBeenCalled();
});

test('la impresión autorizada incluye el PIN y mantiene el QR sin incluir el PIN en él',async()=>{
 let authorize:(value:any)=>void=()=>{};
 vi.mocked(axios.post).mockImplementation(()=>new Promise(resolve=>{authorize=resolve;}));
 render(<IssuedTicketModal ticket={ticket} draws={[{id:1,name:'Quiniela LoteDom'}] as any} branch={{id:3,code:'001'}} currency="DOP" onClose={vi.fn()}/>);
 const frame=await screen.findByTitle('Ticket para impresión') as HTMLIFrameElement;
 // jsdom does not load srcDoc; insert the actual generated receipt before its load event.
 const receipt=frame.getAttribute('srcdoc')!;
 expect(receipt).toContain('Código QR del ticket');
 expect(receipt).not.toContain('000042');
 frame.contentDocument!.open();frame.contentDocument!.write(receipt);frame.contentDocument!.close();
 const print=vi.fn();frame.contentWindow!.print=print;frame.contentWindow!.focus=vi.fn();
 fireEvent.load(frame);
 await waitFor(()=>expect(axios.post).toHaveBeenCalledTimes(1));
 authorize({data:{ticket_pin:'000042',kind:'original',sequence:1,audit_number:8}});
 await waitFor(()=>expect(print).toHaveBeenCalledTimes(1));
 expect(frame.contentDocument!.getElementById('ticket-pin')?.textContent).toBe('PIN de cobro: 000042');
 expect(frame.contentDocument!.getElementById('print-audit')?.textContent).toContain('ORIGINAL');
 expect(frame.contentDocument!.querySelector('svg')?.textContent).not.toContain('000042');
 await screen.findByText('Impresión solicitada al navegador');
 expect((screen.getByRole('button',{name:'Impresión solicitada',exact:true}) as HTMLButtonElement).disabled).toBe(true);
});

test('anular desde ventas exige PIN, permite corregirlo y confirma con Enter',async()=>{
 vi.mocked(axios.get).mockResolvedValue({data:cancellableTicket});
 vi.mocked(axios.post).mockRejectedValueOnce({response:{data:{errors:{pin:['El PIN no corresponde a este ticket.']}}}}).mockResolvedValueOnce({data:{message:'Ticket anulado.'}});
 const user=userEvent.setup();mountActions();
 await user.type(await screen.findByRole('textbox',{name:'Número del ticket'}),'T-000007');await user.keyboard('{Enter}');
 await user.click(await screen.findByRole('button',{name:'Anular ticket',exact:true}));
 const pin=await screen.findByLabelText('PIN del ticket');
 await waitFor(()=>expect(document.activeElement).toBe(pin));
 expect((screen.getByRole('button',{name:'Sí, anular ticket'}) as HTMLButtonElement).disabled).toBe(true);
 await user.type(pin,'111111');await user.keyboard('{Enter}');
 await screen.findByRole('alert');
 expect(screen.getByText('Anular ticket',{selector:'h2'})).toBeTruthy();
 await waitFor(()=>{expect((pin as HTMLInputElement).value).toBe('');expect(document.activeElement).toBe(pin);});
 await user.type(pin,'000042');await user.keyboard('{Enter}');
 await screen.findByText('Ticket anulado.');
 expect(axios.post).toHaveBeenCalledTimes(2);
 expect(axios.post).toHaveBeenLastCalledWith('/lottery/tickets/ticket-uuid/cancel',{branch_id:3,pin:'000042'},{headers:{Accept:'application/json'}});
});

test('Escape borra el PIN de anulación y regresa al ticket sin anularlo',async()=>{
 vi.mocked(axios.get).mockResolvedValue({data:cancellableTicket});
 const user=userEvent.setup();mountActions();
 await user.type(await screen.findByRole('textbox',{name:'Número del ticket'}),'T-000007');await user.keyboard('{Enter}');
 await user.click(await screen.findByRole('button',{name:'Anular ticket',exact:true}));
 await user.type(await screen.findByLabelText('PIN del ticket'),'000042');await user.keyboard('{Escape}');
 await user.click(await screen.findByRole('button',{name:'Anular ticket',exact:true}));
 expect((await screen.findByLabelText('PIN del ticket') as HTMLInputElement).value).toBe('');
 expect(axios.post).not.toHaveBeenCalled();
});

test('el listado de tickets también exige PIN para anular desde el menú',async()=>{
 const listing={tickets:{data:[cancellableTicket],links:[]},currency:'DOP'};
 vi.mocked(axios.get).mockResolvedValue({data:listing});vi.mocked(axios.post).mockResolvedValue({data:{message:'Ticket anulado.'}});
 const user=userEvent.setup();const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});clients.push(client);
 render(<QueryClientProvider client={client}><Tickets tickets={listing.tickets} currency="DOP"/></QueryClientProvider>);
 await user.click(await screen.findByRole('button',{name:'Acciones de T-000007'}));
 await user.click(await screen.findByRole('menuitem',{name:'Anular ticket',exact:true}));
 const pin=await screen.findByLabelText('PIN del ticket');
 expect((screen.getByRole('button',{name:'Sí, anular ticket'}) as HTMLButtonElement).disabled).toBe(true);
 await user.type(pin,'000042');await user.keyboard('{Escape}');
 expect(axios.post).not.toHaveBeenCalled();
 await user.click(await screen.findByRole('button',{name:'Acciones de T-000007'}));
 await user.click(await screen.findByRole('menuitem',{name:'Anular ticket',exact:true}));
 const newPin=await screen.findByLabelText('PIN del ticket');expect((newPin as HTMLInputElement).value).toBe('');
 await user.type(newPin,'000042');await user.keyboard('{Enter}');
 await waitFor(()=>expect(axios.post).toHaveBeenCalledWith('/lottery/tickets/ticket-uuid/cancel',{pin:'000042'},{headers:{Accept:'application/json'}}));
});

test('pagar abre e imprime su comprobante; un fallo de impresión se reintenta sin pagar de nuevo',async()=>{
 const receipt={document_type:'payout',payment_id:41,payment_reference:'P-000041',reference:ticket.reference,code:ticket.code,branch:'001',branch_name:'Banca Centro',paid_by:'Cajero Demo',currency:'DOP',created_at:'2026-10-22T12:00:00Z',net_minor:7500,gross_minor:7500,discount_minor:0,print_settings:{company_name:'Empresa Demo',branch_name:'Banca Centro',show_qr:false},lines:[{draw:'Sorteo histórico',draw_id:1,modality:'quiniela',numbers:'10',amount_minor:7500}]};
 savePrinterPreference(3,{mode:'local',printer:'Térmica USB',profile:'epson',paper_width:80,cut:true},{token:'local-test',deviceId:'3c193c42-716f-421d-9e9d-c75f80c15bd7'});
 vi.mocked(axios.post).mockImplementation(async url=>({data:String(url).endsWith('/pay')?{message:'Premios pendientes pagados.',payment_receipt:receipt}:String(url).endsWith('/print')?{authorization:{payload:'signed-payout',signature:'signature'}}:{}}));
 const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValue({ok:true,json:async()=>({status:'submitted',spool_job_id:7})});vi.stubGlobal('fetch',fetcher);
 const user=await choosePayment();await user.type(await screen.findByLabelText('PIN del ticket'),'000042');await user.keyboard('{Enter}');
 await screen.findByText('Premio pagado');
 const frame=await screen.findByTitle('Ticket para impresión') as HTMLIFrameElement;
 expect(frame.getAttribute('srcdoc')).toContain('COMPROBANTE DE PAGO');expect(frame.getAttribute('srcdoc')).not.toContain('ticket-pin');
 const browserPrint=vi.fn();frame.contentWindow!.print=browserPrint;fireEvent.load(frame);
 await screen.findByRole('alert');expect(screen.getByText(/El pago quedó registrado/)).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'Imprimir',exact:true}));await screen.findByText('Comprobante enviado a imprimir');
 expect(browserPrint).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledTimes(2);
 const pays=vi.mocked(axios.post).mock.calls.filter(([url])=>String(url).endsWith('/pay'));expect(pays).toHaveLength(1);
 const prints=vi.mocked(axios.post).mock.calls.filter(([url])=>String(url).endsWith('/print'));expect(prints).toHaveLength(2);
 expect(prints[0][1]).toMatchObject({document_type:'payout',payment_id:41});expect(prints[0][1]).not.toHaveProperty('pin');
 expect((prints[0][1] as any).attempt_key).toBe((prints[1][1] as any).attempt_key);
});

test('el comprobante de pago también abre la impresión del navegador sin solicitar ni imprimir el PIN',async()=>{
 const receipt={document_type:'payout',payment_id:41,payment_reference:'P-000041',reference:ticket.reference,code:ticket.code,created_at:'2026-10-22T12:00:00Z',paid_by:'Cajero Demo',currency:'DOP',net_minor:7500,gross_minor:7500,discount_minor:0,lines:[{draw:'Sorteo histórico',draw_id:1,modality:'quiniela',numbers:'10',amount_minor:7500}]};
 let authorize:(value:any)=>void=()=>{};
 vi.mocked(axios.post).mockImplementation(()=>new Promise(resolve=>{authorize=resolve;}));
 render(<IssuedTicketModal ticket={receipt} draws={[]} branch={{id:3,code:'001'}} currency="DOP" onClose={vi.fn()}/>);
 const frame=await screen.findByTitle('Ticket para impresión') as HTMLIFrameElement;
 frame.contentDocument!.open();frame.contentDocument!.write(frame.getAttribute('srcdoc')!);frame.contentDocument!.close();
 const print=vi.fn();frame.contentWindow!.print=print;frame.contentWindow!.focus=vi.fn();fireEvent.load(frame);
 await waitFor(()=>expect(axios.post).toHaveBeenCalledTimes(1));authorize({data:{kind:'original',sequence:1,audit_number:8}});
 await waitFor(()=>expect(print).toHaveBeenCalledTimes(1));
 expect(frame.contentDocument!.getElementById('ticket-pin')).toBeNull();expect(frame.contentDocument!.body.textContent).toContain('Total pagado: RD$75.00');
 expect(frame.contentDocument!.getElementById('print-audit')?.textContent).toContain('ORIGINAL');
 expect(vi.mocked(axios.post).mock.calls[0][1]).toMatchObject({document_type:'payout',payment_id:41});
});

test.each(['pagado', 'publicado', 'vencido'])('oculta Anular en ventas y en el menú del listado cuando el ticket está %s',async reason=>{
 const blocked={...cancellableTicket,cancellation:{...cancellableTicket.cancellation,allowed:false,reason},lines:reason==='pagado'?ticket.lines.map(l=>({...l,paid_at:'2026-10-22T12:00:00Z'})):cancellableTicket.lines};
 vi.mocked(axios.get).mockResolvedValue({data:blocked});
 const user=userEvent.setup();mountActions();
 await user.type(await screen.findByRole('textbox',{name:'Número del ticket'}),'T-000007');await user.keyboard('{Enter}');
 await screen.findByText('Jugadas del ticket');
 expect(screen.queryByRole('button',{name:'Anular ticket',exact:true})).toBeNull();
 cleanup();
 const listing={tickets:{data:[blocked],links:[]},currency:'DOP'};
 vi.mocked(axios.get).mockResolvedValue({data:listing});
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);
 render(<QueryClientProvider client={client}><Tickets tickets={listing.tickets} currency="DOP"/></QueryClientProvider>);
 await user.click(await screen.findByRole('button',{name:'Acciones de T-000007'}));
 await screen.findByRole('menuitem',{name:'Ver jugadas y premios'});
 expect(screen.queryByRole('menuitem',{name:'Anular ticket',exact:true})).toBeNull();expect(axios.post).not.toHaveBeenCalled();
});

test('un pago parcial imprime la continuación pendiente con el nuevo PIN, sin las jugadas pagadas',async()=>{
 const continuation={document_type:'continuation',payment_id:41,payment_reference:'P-000041',reference:ticket.reference,code:ticket.code,branch:'001',branch_name:'Banca Centro',currency:'DOP',created_at:'2026-10-22T12:00:00Z',paid_minor:7500,net_minor:400,gross_minor:400,discount_minor:0,print_settings:{show_qr:true},lines:[{draw:'Sorteo pendiente',draw_id:2,modality:'quiniela',numbers:'20',amount_minor:400}]};
 let authorize:(value:any)=>void=()=>{};
 vi.mocked(axios.post).mockImplementation(async url=>String(url).endsWith('/pay')?{data:{message:'Premios pagados.',payment_receipt:{...continuation,document_type:'payout',net_minor:7500},continuation_ticket:continuation}}:new Promise(resolve=>{authorize=resolve;}));
 const user=await choosePayment();await user.type(await screen.findByLabelText('PIN del ticket'),'000042');await user.keyboard('{Enter}');
 await screen.findByText('Premio pagado');
 const payoutFrame=await screen.findByTitle('Ticket para impresión') as HTMLIFrameElement;
 payoutFrame.contentDocument!.open();payoutFrame.contentDocument!.write(payoutFrame.getAttribute('srcdoc')!);payoutFrame.contentDocument!.close();
 const payoutPrint=vi.fn();payoutFrame.contentWindow!.print=payoutPrint;payoutFrame.contentWindow!.focus=vi.fn();fireEvent.load(payoutFrame);
 await waitFor(()=>expect(vi.mocked(axios.post).mock.calls.filter(([url])=>String(url).endsWith('/print'))).toHaveLength(1));
 authorize({data:{kind:'original',sequence:1,audit_number:7}});
 await waitFor(()=>expect(payoutPrint).toHaveBeenCalledTimes(1));
 await screen.findByText('Ticket de sorteos pendientes');
 const frame=await screen.findByTitle('Ticket para impresión') as HTMLIFrameElement;
 expect(frame.getAttribute('srcdoc')).toContain('TICKET DE CONTINUACIÓN');
 frame.contentDocument!.open();frame.contentDocument!.write(frame.getAttribute('srcdoc')!);frame.contentDocument!.close();
 const print=vi.fn();frame.contentWindow!.print=print;frame.contentWindow!.focus=vi.fn();fireEvent.load(frame);
 await waitFor(()=>expect(vi.mocked(axios.post).mock.calls.filter(([url])=>String(url).endsWith('/print'))).toHaveLength(2));
 authorize({data:{ticket_pin:'001234',kind:'original',sequence:1,audit_number:8,continuation_ticket:continuation}});
 await waitFor(()=>expect(print).toHaveBeenCalledTimes(1));
 expect(frame.contentDocument!.getElementById('ticket-pin')?.textContent).toBe('PIN de cobro: 001234');
 expect(frame.contentDocument!.body.textContent).not.toContain('000042');
 expect([...frame.contentDocument!.querySelectorAll('table td:first-child')].map(x=>x.textContent)).toEqual(['20']);
 expect(frame.contentDocument!.body.textContent).toContain('Premio pagado en esta entrega: RD$75.00');
 expect(frame.contentDocument!.querySelector('svg')).toBeTruthy();
 const request=vi.mocked(axios.post).mock.calls.filter(([url])=>String(url).endsWith('/print'))[1];
 expect(request[1]).toMatchObject({document_type:'continuation',payment_id:41});
});

test.each([58,80] as const)('al pagar imprime automáticamente comprobante y continuación en %imm sin cobrar de nuevo',async width=>{
 const common={payment_id:41,payment_reference:'P-000041',reference:ticket.reference,code:ticket.code,branch:'001',branch_name:'Banca Centro',currency:'DOP',created_at:'2026-10-22T12:00:00Z',discount_minor:0,print_settings:{show_qr:false}};
 const continuation={...common,document_type:'continuation',paid_minor:7500,net_minor:400,gross_minor:400,lines:[{draw:'Sorteo pendiente',draw_id:2,modality:'quiniela',numbers:'20',amount_minor:400}]};
 const payout={...common,document_type:'payout',net_minor:7500,gross_minor:7500,paid_by:'Cajero Demo',lines:[{draw:'Sorteo ganador',draw_id:1,modality:'quiniela',numbers:'10',amount_minor:7500}]};
 savePrinterPreference(3,{mode:'local',printer:'Térmica USB',profile:'epson',paper_width:width,cut:true},{token:'local-test',deviceId:'3c193c42-716f-421d-9e9d-c75f80c15bd7'});
 vi.mocked(axios.post).mockImplementation(async url=>({data:String(url).endsWith('/pay')?{payment_receipt:payout,continuation_ticket:continuation}:String(url).endsWith('/print')?{authorization:{payload:'signed',signature:'signature'}}:{}}));
 let finishFirst:(value:any)=>void=()=>{};
 const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finishFirst=resolve;})).mockResolvedValue({ok:true,json:async()=>({status:'submitted',spool_job_id:18})});vi.stubGlobal('fetch',fetcher);
 const user=await choosePayment();await user.type(await screen.findByLabelText('PIN del ticket'),'000042');await user.keyboard('{Enter}');
 await screen.findByText('Premio pagado');
 const frame=await screen.findByTitle('Ticket para impresión') as HTMLIFrameElement;
 expect(frame.getAttribute('srcdoc')).toContain('COMPROBANTE DE PAGO');
 expect(frame.getAttribute('srcdoc')).not.toContain('ticket-pin');
 fireEvent.load(frame);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
 finishFirst({ok:true,json:async()=>({status:'submitted',spool_job_id:17})});
 await screen.findByText('Ticket de sorteos pendientes');
 expect(screen.getByText(/Comprobante de pago: enviado a imprimir/)).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Imprimir comprobante de pago',exact:true})).toBeNull();
 const continuationFrame=await screen.findByTitle('Ticket para impresión') as HTMLIFrameElement;
 expect(continuationFrame).not.toBe(frame);
 expect(continuationFrame.getAttribute('srcdoc')).toContain('TICKET DE CONTINUACIÓN');
 fireEvent.load(continuationFrame);
 await screen.findByText('Ticket enviado a imprimir');
 fireEvent.load(continuationFrame);
 const calls=vi.mocked(axios.post).mock.calls;
 expect(calls.filter(([url])=>String(url).endsWith('/pay'))).toHaveLength(1);
 const prints=calls.filter(([url])=>String(url).endsWith('/print'));
 expect(prints).toHaveLength(2);
 expect(prints[0][1]).toMatchObject({document_type:'payout',payment_id:41,paper_width:width,trigger:'automatic'});
 expect(prints[1][1]).toMatchObject({document_type:'continuation',payment_id:41,paper_width:width,trigger:'automatic'});
 expect((prints[0][1] as any).attempt_key).not.toBe((prints[1][1] as any).attempt_key);
 expect(fetcher).toHaveBeenCalledTimes(2);
});

test('si falla la continuación conserva el comprobante enviado y reintenta solo lo pendiente',async()=>{
 const common={payment_id:41,payment_reference:'P-000041',reference:ticket.reference,code:ticket.code,branch:'001',currency:'DOP',created_at:'2026-10-22T12:00:00Z',discount_minor:0,print_settings:{show_qr:false}};
 const payout={...common,document_type:'payout',net_minor:7500,gross_minor:7500,lines:[{draw:'Ganador',draw_id:1,modality:'quiniela',numbers:'10',amount_minor:7500}]};
 const continuation={...common,document_type:'continuation',paid_minor:7500,net_minor:400,gross_minor:400,lines:[{draw:'Pendiente',draw_id:2,modality:'quiniela',numbers:'20',amount_minor:400}]};
 savePrinterPreference(3,{mode:'local',printer:'Térmica USB',profile:'epson',paper_width:58,cut:true},{token:'local-test',deviceId:'3c193c42-716f-421d-9e9d-c75f80c15bd7'});
 vi.mocked(axios.post).mockImplementation(async url=>({data:String(url).endsWith('/pay')?{payment_receipt:payout,continuation_ticket:continuation}:String(url).endsWith('/print')?{authorization:{payload:'signed',signature:'signature'}}:{}}));
 let finish:(value:any)=>void=()=>{};
 const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({status:'submitted',spool_job_id:17})}).mockRejectedValueOnce(new TypeError('network')).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));vi.stubGlobal('fetch',fetcher);
 const user=await choosePayment();await user.type(await screen.findByLabelText('PIN del ticket'),'000042');await user.keyboard('{Enter}');
 fireEvent.load(await screen.findByTitle('Ticket para impresión'));
 await screen.findByText('Ticket de sorteos pendientes');
 fireEvent.load(await screen.findByTitle('Ticket para impresión'));
 await screen.findByRole('alert');
 expect(screen.getByText(/Comprobante de pago: enviado a imprimir/)).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'Imprimir',exact:true}));
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(3));
 expect((screen.getByRole('button',{name:'Cerrar',exact:true}) as HTMLButtonElement).disabled).toBe(true);
 finish({ok:true,json:async()=>({status:'submitted',spool_job_id:18})});
 await screen.findByText('Ticket enviado a imprimir');
 const calls=vi.mocked(axios.post).mock.calls;
 expect(calls.filter(([url])=>String(url).endsWith('/pay'))).toHaveLength(1);
 const prints=calls.filter(([url])=>String(url).endsWith('/print'));
 expect(prints.map(([,body])=>(body as any).document_type)).toEqual(['payout','continuation','continuation']);
 expect((prints[1][1] as any).attempt_key).toBe((prints[2][1] as any).attempt_key);
 expect(screen.queryByRole('button',{name:'Imprimir comprobante de pago',exact:true})).toBeNull();
});
