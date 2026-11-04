import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { AgentError } from './jobs.mjs';

const sameToken = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new AgentError(415, 'Se requiere JSON.');
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 800000) throw new AgentError(413, 'Solicitud demasiado grande.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AgentError(400, 'JSON inválido.'); }
}
export function createAgentServer({ config, queue, listPrinters, onShutdown }) {
  const origin = new URL(config.issuer).origin;
  let stopping = false;
  return createServer({ requestTimeout: 35000, headersTimeout: 10000 }, async (req, res) => {
    const reply = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
    try {
      // Host and Origin checks also prevent DNS rebinding and cross-site requests to localhost.
      const port = res.socket.localPort;
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host) || req.headers.origin !== origin) throw new AgentError(403, 'Origen no autorizado.');
      res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
        res.setHeader('Access-Control-Max-Age', '600'); res.writeHead(204); res.end(); return;
      }
      if (!sameToken(req.headers.authorization, `Bearer ${config.token}`)) throw new AgentError(401, 'La clave de conexión no es correcta.');
      if (req.method === 'GET' && req.url === '/health') return reply(200, { service: 'LotoEnlace Print Agent', version: '1.2.3', device_id: config.deviceId, issuer: config.issuer, pid: process.pid, busy: queue.isBusy?.() ?? false, status: stopping ? 'stopping' : 'running', controls: true });
      if (req.method === 'GET' && req.url === '/printers') return reply(200, { printers: await listPrinters(), device_id: config.deviceId, issuer: config.issuer });
      if (req.method === 'POST' && req.url === '/control/stop') {
        await readJson(req);
        if (!onShutdown) throw new AgentError(501, 'El control del servicio no está disponible.');
        if (queue.isBusy?.()) throw new AgentError(409, 'Hay una impresión en curso. Espera a que termine antes de detener el agente.');
        if (!stopping) { stopping = true; setTimeout(onShutdown, 50); }
        return reply(200, { status: 'stopping' });
      }
      if (req.method === 'POST' && req.url === '/jobs') {
        if (stopping) throw new AgentError(503, 'El agente se está deteniendo.');
        return reply(200, await queue.submit((await readJson(req)).authorization));
      }
      throw new AgentError(404, 'Opción no disponible.');
    } catch (e) { reply(e.status ?? 503, { message: e.status ? e.message : 'El agente no pudo completar la operación.', status: e.state ?? 'failed' }); }
  });
}
