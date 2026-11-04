import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { JobQueue, verifyAuthorization } from '../src/jobs.mjs';
import { renderReceipt } from '../src/receipt.mjs';
import { groupReceiptLines } from '../src/receipt-layout.mjs';
import jsQR from 'jsqr';
import { createAgentServer } from '../src/server.mjs';

const pair = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const config = { issuer: 'https://loto.example', publicKey: pair.publicKey, token: 'local-test-token', deviceId: randomUUID() };
function job(overrides={}) { return { version:1, id:randomUUID(), issuer:config.issuer, issued_at:Math.floor(Date.now()/1000), expires_at:Math.floor(Date.now()/1000)+120, audit_id:1, audit_number:1, target:{device_id:config.deviceId,printer:'Térmica USB',profile:'epson',paper_width:80,cut:true}, receipt:{reference:'T-000001',code:randomUUID(),branch:'001',date:'21/10/2026 11:00 AM',pin:'000042',currency:'DOP',lines:[{draw:'Quiniela LoteDom con nombre completo',numbers:'10',modality:'quiniela',amount_minor:100}],gross_minor:100,discount_minor:0,net_minor:100,received_minor:200,change_minor:100,show_qr:true,footer:'Gracias por su compra',kind:'original',sequence:1}, ...overrides }; }
function sign(data) { const json=Buffer.from(JSON.stringify(data));return {payload:json.toString('base64'),signature:createSign('RSA-SHA256').update(json).end().sign(pair.privateKey,'base64')}; }
const listPrinters = async()=>[{name:'Térmica USB',offline:false,virtual:false},{name:'Microsoft Print to PDF',virtual:true}];
async function queue(t,spoolRaw,options={}) { const dir=await mkdtemp(join(tmpdir(),'loto-agent-'));t.after(()=>rm(dir,{recursive:true,force:true}));const ledgerPath=join(dir,'jobs.json');return new JobQueue({config,ledgerPath,listPrinters,spoolRaw,...options}); }

test('solo admite firmas vigentes del sistema y del equipo de destino',()=>{
 const data=job();assert.equal(verifyAuthorization(sign(data),config).receipt.pin,'000042');
 const envelope=sign(data);envelope.payload=Buffer.from(JSON.stringify({...data,receipt:{...data.receipt,net_minor:1}})).toString('base64');
 assert.throws(()=>verifyAuthorization(envelope,config),/firma/);
 assert.throws(()=>verifyAuthorization(sign(job({expires_at:1})),config),/venció/);
 assert.throws(()=>verifyAuthorization(sign(job({issuer:'https://otro.example'})),config),/equipo/);
 assert.throws(()=>verifyAuthorization(sign(job({target:{...data.target,device_id:randomUUID()}})),config),/equipo/);
});

test('una ráfaga de reintentos y reiniciar el agente no duplican la impresión ni guardan el PIN',async t=>{
 let count=0;const q=await queue(t,async()=>{count++;await new Promise(r=>setTimeout(r,10));return {spool_job_id:55};});
 const data=job(),auth=sign(data);
 const results=await Promise.all(Array.from({length:6},()=>q.submit(auth)));
 assert.equal(count,1);assert.ok(results.every(r=>r.spool_job_id===55));
 const restarted=new JobQueue({config,ledgerPath:q.ledgerPath,listPrinters,spoolRaw:async()=>{throw Error('No debe volver a enviar');}});
 assert.equal((await restarted.submit(sign({...data,issued_at:data.issued_at+1,expires_at:data.expires_at+1}))).status,'submitted');
 const ledger=await readFile(q.ledgerPath,'utf8');assert.ok(!ledger.includes('000042'));assert.ok(!ledger.includes(data.receipt.code));
});

test('un envío incierto queda bloqueado incluso después de reiniciar',async t=>{
 let count=0;const q=await queue(t,async()=>{count++;throw Error('Se perdió la respuesta de Windows');});const auth=sign(job());
 await assert.rejects(q.submit(auth),e=>e.state==='unknown');
 await assert.rejects(q.submit(auth),e=>e.state==='unknown');assert.equal(count,1);
 const restarted=new JobQueue({config,ledgerPath:q.ledgerPath,listPrinters,spoolRaw:async()=>{count++;}});
 await assert.rejects(restarted.submit(auth),e=>e.state==='unknown');assert.equal(count,1);
});

test('rechaza sustituir contenido y no manda a impresoras virtuales o inexistentes',async t=>{
 let count=0;const q=await queue(t,async()=>{count++;return {spool_job_id:1};});const data=job();
 await q.submit(sign(data));
 await assert.rejects(q.submit(sign({...data,receipt:{...data.receipt,pin:'123456'}})),/otro contenido/);
 for (const name of ['Microsoft Print to PDF','No existe']) await assert.rejects(q.submit(sign(job({target:{...data.target,printer:name}}))),/impresora térmica/);
 assert.equal(count,1);
});

function qrPixels(bytes, profile) {
 const rows=[];let width;
 if(profile==='epson') {
  const at=bytes.indexOf(Buffer.from([0x1d,0x76,0x30,48]));assert.ok(at>=0);
  width=bytes.readUInt16LE(at+4)*8;const height=bytes.readUInt16LE(at+6);
  for(let y=0;y<height;y++) rows.push(bytes.subarray(at+8+y*width/8,at+8+(y+1)*width/8));
 } else {
  let at=bytes.indexOf(Buffer.from([0x1b,0x30]))+2;
  while(bytes[at]===0x1b&&bytes[at+1]===0x6b) {
   const stride=bytes.readUInt16LE(at+2);width=stride*8;
   for(let y=0;y<24;y++) rows.push(bytes.subarray(at+4+y*stride,at+4+(y+1)*stride));
   at+=4+stride*24+1;
  }
  assert.ok(rows.length);
 }
 const rgba=new Uint8ClampedArray(width*rows.length*4).fill(255);
 rows.forEach((row,y)=>{for(let x=0;x<width;x++) if(row[x>>3]&(0x80>>(x%8))) {const i=(y*width+x)*4;rgba[i]=rgba[i+1]=rgba[i+2]=0;}});
 return {rgba,width,height:rows.length};
}

test('el QR rasterizado se puede leer sin imprimir comandos QR como texto en Epson y Star',async()=>{
 for(const profile of ['epson','star']) for(const width of [58,80]) {
  const data=job();data.target.profile=profile;data.target.paper_width=width;const bytes=await renderReceipt(data);
  assert.ok(bytes.length>300);assert.ok(bytes.includes(Buffer.from('000042')));assert.ok(bytes.includes(Buffer.from('T-000001')));
  assert.ok(!bytes.includes(Buffer.from([0x1d,0x28,0x6b,0x04,0x00,0x31,0x41,0x32,0x00])));
  const image=qrPixels(bytes,profile);assert.equal(jsQR(image.rgba,image.width,image.height)?.data,data.receipt.code);
  assert.ok(bytes.includes(Buffer.from('RD$1.00')));assert.ok(bytes.includes(Buffer.from('RD$2.00')));
  data.receipt.show_qr=false;const without=await renderReceipt(data);assert.ok(without.length<bytes.length/2);
 }
});

test('agrupa repeticiones por sus sorteos exactos, sin mezclar montos, modalidades ni pares',()=>{
 const line=(draw_id,numbers='10',amount_minor=100,modality='quiniela',second_draw_id=null)=>({draw_id,second_draw_id,draw:`Sorteo ${draw_id}${second_draw_id?` + ${second_draw_id}`:''}`,numbers,amount_minor,modality});
 const lines=[line(1),line(1,'20'),line(2),line(3),line(3,'20',200),line(1,'10',100,'pale'),line(1,'10',100,'super_pale',2)];
 const groups=groupReceiptLines(lines);
 assert.deepEqual(groups[0].draws.map(d=>d.name),['Sorteo 1','Sorteo 2','Sorteo 3']);assert.equal(groups[0].lines.length,1);
 assert.deepEqual(groups[1].draws.map(d=>d.name),['Sorteo 1']);assert.deepEqual(groups[1].lines.map(l=>l.modality),['quiniela','pale']);
 assert.equal(groups[2].lines[0].amount_minor,200);assert.equal(groups[3].draws[0].name,'Sorteo 1 + 2');
 const expanded=groups.flatMap(g=>g.draws.flatMap(d=>g.lines.map(l=>[d.key,l.modality,l.numbers,l.amount_minor].join('|')))).sort();
 assert.deepEqual(expanded,lines.map(l=>[JSON.stringify([l.draw_id,l.second_draw_id]),l.modality,l.numbers,l.amount_minor].join('|')).sort());
 assert.equal(groupReceiptLines([line(1),line(1)])[0].lines.length,2);
});

test('imprime nombres completos antes de modalidades ordenadas y respeta el espacio final sin avances ocultos',async()=>{
 for(const profile of ['epson','star']) for(const cut of [false,true]) {
  const data=job();Object.assign(data.target,{profile,cut,feed_lines:0});data.receipt.show_qr=false;
  data.receipt.lines=[1,2].flatMap(draw_id=>['super_pale','tripleta','pale','quiniela'].map((modality,i)=>({draw_id,draw:`Sorteo completo ${draw_id}`,modality,numbers:`${i+5}9`,amount_minor:100})));
  const zero=await renderReceipt(data),text=zero.toString('latin1');
  assert.equal(text.split('Sorteo completo 1').length,2);assert.equal(text.split('Sorteo completo 2').length,2);
  assert.ok(text.indexOf('Sorteo completo 2')<text.indexOf('Quiniela'));
  for(const n of ['59','69','79','89']) assert.equal(text.split(n).length,2);
  data.target.feed_lines=7;const seven=await renderReceipt(data);
  const end=zero.indexOf(Buffer.from('Control 1\n'))+'Control 1\n'.length;
  assert.equal(seven.length-zero.length,7);assert.deepEqual(seven.subarray(end,end+7),Buffer.alloc(7,10));
  assert.deepEqual(seven.subarray(end+7),zero.subarray(end));assert.ok(!zero.subarray(end).includes(0x0b));
  data.target.feed_lines=16;await assert.rejects(renderReceipt(data),/Espacio final/);
 }
});

test('las copias de prueba y anuladas se identifican en el papel',async()=>{
 const data=job();data.receipt.test_reprint=true;data.receipt.status='cancelled';data.receipt.show_qr=false;
 const bytes=await renderReceipt(data);
 assert.ok(bytes.includes(Buffer.from('PRUEBA - SIN VALIDEZ')));assert.ok(bytes.includes(Buffer.from('TICKET ANULADO')));
});

test('encabeza con empresa y banca, separa el PIN y omite importes que no aplican',async()=>{
 for (const profile of ['epson','star']) for (const width of [58,80]) for (const withExtras of [false,true]) {
  const data=job();Object.assign(data.target,{profile,paper_width:width});
  Object.assign(data.receipt,{company_name:'Empresa Demo',branch_name:'Banca Centro',show_qr:false,discount_minor:withExtras?25:0,change_minor:withExtras?100:0});
  const bytes=await renderReceipt(data);
  assert.ok(bytes.includes(Buffer.from('Empresa Demo')));assert.ok(bytes.includes(Buffer.from('Banca: Banca Centro')));assert.ok(!bytes.includes(Buffer.from('LotoEnlace')));
  assert.ok(bytes.indexOf(Buffer.from('Empresa Demo'))<bytes.indexOf(Buffer.from('Banca: Banca Centro')));
  const gap=bytes.subarray(bytes.indexOf(Buffer.from('PIN de cobro:')),bytes.indexOf(Buffer.from('Quiniela LoteDom')));
  assert.equal([...gap].filter(byte=>byte===10).length,2);
  assert.ok(!bytes.includes(Buffer.from('Apostado')));assert.equal(bytes.includes(Buffer.from('Descuento')),withExtras);assert.equal(bytes.includes(Buffer.from('Devolu')),withExtras);
  assert.ok(bytes.includes(Buffer.from('TOTAL')));assert.ok(bytes.includes(Buffer.from('Recibido')));
 }
});

test('los medios de cobro se identifican en 58 y 80 mm sin presentar efectivo recibido para transferencias',async()=>{
 for (const width of [58,80]) for (const method of ['cash','transfer','card','deposit']) {
  const data=job();Object.assign(data.target,{paper_width:width});
  Object.assign(data.receipt,{payment_method:method,show_qr:false,change_minor:0});
  const bytes=await renderReceipt(data);
  assert.ok(bytes.includes(Buffer.from('Cobro:')));
  assert.equal(bytes.includes(Buffer.from('Recibido')),method==='cash');
 }
});

test('imprime nombres de cobro personalizados en ambos perfiles y anchos sin efectivo recibido',async()=>{
 for (const profile of ['epson','star']) for (const width of [58,80]) {
  const data=job();Object.assign(data.target,{profile,paper_width:width});
  Object.assign(data.receipt,{payment_method:'custom_0123456789ab',payment_method_label:'PayPal',show_qr:false,change_minor:0});
  const bytes=await renderReceipt(data);
  assert.ok(bytes.includes(Buffer.from('Cobro: PayPal')));
  assert.ok(!bytes.includes(Buffer.from('custom_')));
  assert.ok(!bytes.includes(Buffer.from('Recibido')));
 }
});

test('imprime comprobantes de premios pagados sin PIN ni datos de cobro de venta',async()=>{
 for (const profile of ['epson','star']) for (const width of [58,80]) {
  const data=job();Object.assign(data.target,{profile,paper_width:width});
  Object.assign(data.receipt,{document_type:'payout',payment_reference:'P-000041',paid_by:'Cajero Demo',company_name:'Empresa Demo',show_qr:false,net_minor:7500,gross_minor:7500,received_minor:null,change_minor:null,lines:[{draw:'Sorteo completo',modality:'quiniela',numbers:'10',amount_minor:7500}]});
  delete data.receipt.pin;
  const bytes=await renderReceipt(data);
  for(const value of ['COMPROBANTE DE PAGO','P-000041','T-000001','Cajero Demo','TOTAL PAGADO','RD$75.00','Sorteo completo']) assert.ok(bytes.includes(Buffer.from(value)));
  assert.ok(!bytes.includes(Buffer.from('PIN')));assert.ok(!bytes.includes(Buffer.from('Recibido')));
  data.receipt.net_minor=7600;await assert.rejects(renderReceipt(data),/Pago inválido/);
 }
});

test('la continuación imprime solo sus jugadas pendientes y el PIN renovado sin cobrar otra venta',async()=>{
 for (const profile of ['epson','star']) {
  const data=job();data.target.profile=profile;
  Object.assign(data.receipt,{document_type:'continuation',payment_reference:'P-000041',paid_minor:7500,pin:'001234',show_qr:false,net_minor:400,gross_minor:400,received_minor:null,change_minor:null,lines:[{draw:'Sorteo pendiente',modality:'quiniela',numbers:'20',amount_minor:400}]});
  const bytes=await renderReceipt(data);
  for(const value of ['TICKET DE CONTINUACION','SORTEOS PENDIENTES','001234','TOTAL PENDIENTE','RD$4.00','RD$75.00','NO ES UNA NUEVA VENTA','PIN anterior invalidado']) assert.ok(bytes.includes(Buffer.from(value)));
  assert.ok(!bytes.includes(Buffer.from('000042')));assert.ok(!bytes.includes(Buffer.from('Recibido')));
 }
});

test('la API limita origen, host, clave y tamaño, y responde al permiso de red local',async t=>{
 const q=await queue(t,async()=>({spool_job_id:4}));const server=createAgentServer({config,queue:q,listPrinters});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const url=`http://127.0.0.1:${server.address().port}`;
 const headers={Origin:config.issuer,Authorization:`Bearer ${config.token}`};
 assert.equal((await fetch(url+'/health',{headers})).status,200);
 assert.equal((await fetch(url+'/printers',{headers})).status,200);
 assert.equal((await fetch(url+'/health',{headers:{...headers,Origin:'https://evil.example'}})).status,403);
 assert.equal((await fetch(url+'/health',{headers:{...headers,Authorization:'Bearer wrong'}})).status,401);
 const preflight=await fetch(url+'/jobs',{method:'OPTIONS',headers:{Origin:config.issuer,'Access-Control-Request-Private-Network':'true'}});
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Private-Network'),'true');
 const printed=await fetch(url+'/jobs',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({authorization:sign(job())})});
 assert.equal(printed.status,200);assert.equal((await printed.json()).status,'submitted');
 const large=await fetch(url+'/jobs',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({data:'a'.repeat(800001)})});assert.equal(large.status,413);
});


test('los controles requieren autenticar y nunca detienen una impresion activa',async t=>{
 let release,started;const spooling=new Promise(r=>{started=r});let shutdowns=0;
 const q=await queue(t,async()=>{started();await new Promise(r=>{release=r});return {spool_job_id:11};});
 const server=createAgentServer({config,queue:q,listPrinters,onShutdown:()=>{shutdowns++;}});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const url=`http://127.0.0.1:${server.address().port}`;
 const headers={Origin:config.issuer,Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'};
 assert.equal((await fetch(url+'/control/stop',{method:'POST',headers:{...headers,Authorization:'Bearer invalid'},body:'{}'})).status,401);
 const printing=q.submit(sign(job()));await spooling;
 const busy=await (await fetch(url+'/health',{headers})).json();assert.equal(busy.busy,true);assert.equal(busy.controls,true);
 assert.equal((await fetch(url+'/control/stop',{method:'POST',headers,body:'{}'})).status,409);assert.equal(shutdowns,0);
 release();await printing;
 assert.equal((await fetch(url+'/control/stop',{method:'POST',headers,body:'{}'})).status,200);
 assert.equal((await fetch(url+'/jobs',{method:'POST',headers,body:JSON.stringify({authorization:sign(job())})})).status,503);
 await new Promise(r=>setTimeout(r,80));assert.equal(shutdowns,1);
 assert.equal((await (await fetch(url+'/health',{headers})).json()).status,'stopping');
});
