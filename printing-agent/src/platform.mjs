import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../scripts/windows-printer.ps1', import.meta.url));
function powershell(input, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let error = ''; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { error += data; });
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut || code !== 0) return reject(new Error(timedOut ? 'La cola de impresión no respondió.' : 'Windows no pudo completar la operación de impresión.'));
      try { resolve(JSON.parse(output.replace(/^\uFEFF/, '').trim())); } catch { reject(new Error('Respuesta de impresoras no válida.')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(input));
  });
}
export async function listPrinters() {
  if (process.platform !== 'win32') throw new Error('Esta versión del agente requiere Windows.');
  const printers = await powershell({ action: 'list' });
  return Array.isArray(printers) ? printers : [];
}
export async function spoolRaw(printer, bytes, title) {
  if (process.platform !== 'win32') throw new Error('Esta versión del agente requiere Windows.');
  return powershell({ action: 'print', printer, data: bytes.toString('base64'), title }, 30000);
}
