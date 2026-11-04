// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import IssuedTicketModal from '../../resources/js/Pages/Lottery/IssuedTicketModal';
import PrinterSettingsModal from '../../resources/js/Pages/Lottery/PrinterSettingsModal';
import { agentConnection, printerPreference, savePrinterPreference } from '../../resources/js/lib/localPrinter';

vi.mock('axios',()=>({default:{post:vi.fn()}}));
vi.mock('@/Components/LoadingSkeleton',()=>({default:()=> <div>Cargando</div>}));
vi.mock('../../resources/js/Pages/Lottery/shared',()=>({button:'button',secondary:'secondary',input:'input',money:(v:number)=>`RD$${(v/100).toFixed(2)}`,modes:{quiniela:'Quiniela'}}));
const deviceId='3c193c42-716f-421d-9e9d-c75f80c15bd7';
const ticket={code:'ticket-uuid',reference:'T-000001',created_at:'2026-10-21T12:00:00Z',currency:'DOP',net_minor:100,gross_minor:100,discount_minor:0,lines:[{draw_id:1,modality:'quiniela',numbers:'10',amount_minor:100}]};
beforeAll(()=>{globalThis.ResizeObserver=class {observe(){} unobserve(){} disconnect(){}};HTMLElement.prototype.scrollIntoView=vi.fn();});
beforeEach(()=>{localStorage.clear();vi.mocked(axios.post).mockReset().mockImplementation(async url=>({data:String(url).endsWith('/print')?{authorization:{payload:'signed-payload',signature:'signature'}}:{}}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function configure(){savePrinterPreference(3,{mode:'local',printer:'Térmica USB',profile:'epson',paper_width:80,cut:true},{token:'local-secret',deviceId});}
async function mountReceipt(){render(<IssuedTicketModal ticket={ticket} draws={[{id:1,name:'Quiniela LoteDom'}] as any} branch={{id:3,code:'001'}} currency="DOP" onClose={vi.fn()}/>);const frame=await screen.findByTitle('Ticket para impresión') as HTMLIFrameElement;const print=vi.fn();frame.contentWindow!.print=print;fireEvent.load(frame);return {frame,print};}
const success=()=>({ok:true,json:async()=>({status:'submitted',spool_job_id:7})});

test('imprime por el agente con una autorización del servidor sin abrir el diálogo del navegador',async()=>{
 configure();const fetcher=vi.fn().mockResolvedValue(success());vi.stubGlobal('fetch',fetcher);
 const {print}=await mountReceipt();
 await screen.findByText('Enviado a Térmica USB.');
 expect(print).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledTimes(1);
 const [url,options]=fetcher.mock.calls[0];expect(url).toBe('http://127.0.0.1:18745/jobs');
 expect(JSON.parse(options.body)).toEqual({authorization:{payload:'signed-payload',signature:'signature'}});
 const request=vi.mocked(axios.post).mock.calls.find(([url])=>String(url).endsWith('/print'))!;
 expect(request[1]).toMatchObject({transport:'local',device_id:deviceId,printer:'Térmica USB',paper_width:80,feed_lines:2});
 expect(vi.mocked(axios.post).mock.calls.find(([url])=>String(url).endsWith('/print-status'))?.[1]).toMatchObject({status:'submitted',spool_job_id:7});
});

test('una respuesta perdida conserva el mismo intento al reintentar y nunca cambia a impresión de navegador',async()=>{
 configure();const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValue(success());vi.stubGlobal('fetch',fetcher);
 const user=userEvent.setup();const {print}=await mountReceipt();
 await screen.findByRole('alert');
 expect(print).not.toHaveBeenCalled();
 await user.click(screen.getByRole('button',{name:'Imprimir',exact:true}));
 await screen.findByText('Enviado a Térmica USB.');
 const attempts=vi.mocked(axios.post).mock.calls.filter(([url])=>String(url).endsWith('/print'));
 expect(attempts).toHaveLength(2);expect((attempts[0][1] as any).attempt_key).toBe((attempts[1][1] as any).attempt_key);
 expect(print).not.toHaveBeenCalled();
});

test('detecta impresoras por combobox y guarda solo la selección de esta banca',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({issuer:window.location.origin,device_id:deviceId,printers:[{name:'Térmica USB',driver:'Generic',virtual:false,offline:false},{name:'Microsoft Print to PDF',virtual:true,offline:false}]})});vi.stubGlobal('fetch',fetcher);
 const user=userEvent.setup();const close=vi.fn();render(<PrinterSettingsModal branchId={3} onClose={close}/>);
 await user.click(screen.getByRole('button',{name:'Mostrar opciones'}));
 await user.click(await screen.findByRole('option',{name:'Agente local · impresión térmica directa'}));
 expect(screen.getByRole('link',{name:'Descargar paquete completo (.zip)'}).getAttribute('href')).toBe('/lottery/print-agent/download');
 await user.type(screen.getByLabelText('Clave de conexión local'),'local-secret');
 await user.click(screen.getByRole('button',{name:'Detectar impresoras'}));
 await screen.findByText('Agente conectado · 2 impresoras detectadas');
 await user.click(screen.getAllByRole('button',{name:'Mostrar opciones'})[1]);
 expect((await screen.findByRole('option',{name:'Microsoft Print to PDF · Virtual'})).getAttribute('aria-disabled')).toBe('true');
 await user.click(screen.getByRole('option',{name:'Térmica USB'}));
 const feed=screen.getByLabelText('Líneas en blanco al final del ticket');
 await user.clear(feed);await user.type(feed,'0');
 await user.click(screen.getByRole('button',{name:'Guardar impresora'}));
 await waitFor(()=>expect(close).toHaveBeenCalled());
 expect(printerPreference(3).printer).toBe('Térmica USB');expect(printerPreference(4).mode).toBe('browser');
 expect(printerPreference(3).feed_lines).toBe(0);expect(printerPreference(4).feed_lines).toBe(2);
 expect(agentConnection()?.deviceId).toBe(deviceId);
});

test('cambiar expresamente de impresora genera una autorización nueva para ese destino',async()=>{
 configure();const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValue(success());vi.stubGlobal('fetch',fetcher);
 const user=userEvent.setup();await mountReceipt();await screen.findByRole('alert');
 savePrinterPreference(3,{mode:'local',printer:'Otra térmica',profile:'epson',paper_width:58,cut:false,feed_lines:4});
 await user.click(screen.getByRole('button',{name:'Imprimir',exact:true}));
 await screen.findByText('Enviado a Otra térmica.');
 const attempts=vi.mocked(axios.post).mock.calls.filter(([url])=>String(url).endsWith('/print'));
 expect((attempts[0][1] as any).attempt_key).not.toBe((attempts[1][1] as any).attempt_key);
 expect(attempts[1][1]).toMatchObject({printer:'Otra térmica',paper_width:58,feed_lines:4});
});

test('muestra el envío pendiente, bloquea dobles clics y exige una acción explícita para otra copia',async()=>{
 configure();let finish:(value:any)=>void=()=>{};
 const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue(success());vi.stubGlobal('fetch',fetcher);
 const user=userEvent.setup();const {frame}=await mountReceipt();
 await screen.findByText('Enviando a Térmica USB…');
 const sending=screen.getByRole('button',{name:'Enviando…'});
 expect((sending as HTMLButtonElement).disabled).toBe(true);
 await user.dblClick(sending);fireEvent.load(frame);expect(fetcher).toHaveBeenCalledTimes(1);
 finish(success());
 await screen.findByText('Ticket enviado a imprimir');
 const sentButton=screen.getByRole('button',{name:'Enviado a imprimir'});
 expect((sentButton as HTMLButtonElement).disabled).toBe(true);
 await user.dblClick(sentButton);expect(fetcher).toHaveBeenCalledTimes(1);
 expect(screen.getByText(/Trabajo #7/)).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'Imprimir otra copia',exact:true}));
 expect(fetcher).toHaveBeenCalledTimes(1);
 await user.click(screen.getByRole('button',{name:'Cancelar',exact:true}));
 expect(fetcher).toHaveBeenCalledTimes(1);
 await user.click(screen.getByRole('button',{name:'Imprimir otra copia',exact:true}));
 await user.click(screen.getByRole('button',{name:'Sí, imprimir otra copia'}));
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 const requests=vi.mocked(axios.post).mock.calls.filter(([url])=>String(url).endsWith('/print'));
 expect((requests[0][1] as any).attempt_key).not.toBe((requests[1][1] as any).attempt_key);
});

test('confirma el envío aunque la actualización de auditoría esté pendiente y distingue la configuración',async()=>{
 configure();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(success()));
 let finishAudit:(value:any)=>void=()=>{};
 vi.mocked(axios.post).mockImplementation(async url=>String(url).endsWith('/print-status') ? new Promise(resolve=>{finishAudit=resolve;}) : {data:{authorization:{payload:'signed-payload',signature:'signature'}}});
 await mountReceipt();await screen.findByText('Ticket enviado a imprimir');
 expect(screen.queryByText('Enviando a Térmica USB…')).toBeNull();
 expect((screen.getByRole('button',{name:'Enviado a imprimir'}) as HTMLButtonElement).disabled).toBe(true);
 expect(screen.getByRole('button',{name:'Configurar impresora'}).getAttribute('title')).toContain('Elegir impresora');
 finishAudit({data:{}});
 await waitFor(()=>expect((screen.getByRole('button',{name:'Configurar impresora'}) as HTMLButtonElement).disabled).toBe(false));
});
