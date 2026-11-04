import { createHash, createVerify } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { renderReceipt } from './receipt.mjs';

export class AgentError extends Error { constructor(status, message, state) { super(message); this.status = status; this.state = state; } }
export function verifyAuthorization(envelope, config, now = Date.now()) {
  if (typeof envelope?.payload !== 'string' || envelope.payload.length > 700000 || typeof envelope.signature !== 'string') throw new AgentError(400, 'Falta la autorización del sistema.');
  const bytes = Buffer.from(envelope.payload, 'base64');
  if (!createVerify('RSA-SHA256').update(bytes).end().verify(config.publicKey, envelope.signature, 'base64')) throw new AgentError(403, 'La firma del ticket no es válida.');
  let job; try { job = JSON.parse(bytes.toString('utf8')); } catch { throw new AgentError(400, 'Autorización inválida.'); }
  if (job.version !== 1 || job.issuer !== config.issuer || job.target?.device_id !== config.deviceId || !/^[0-9a-f-]{36}$/i.test(job.id ?? '')) throw new AgentError(403, 'El ticket no está autorizado para este equipo.');
  const time = Math.floor(now / 1000);
  if (!Number.isSafeInteger(job.expires_at) || !Number.isSafeInteger(job.issued_at) || job.expires_at <= time || job.issued_at > time + 30 || job.expires_at - job.issued_at > 120) throw new AgentError(403, 'La autorización de impresión venció. Vuelve a intentarlo desde el sistema.');
  return job;
}

export class JobQueue {
  constructor({ config, ledgerPath, listPrinters, spoolRaw, render = renderReceipt }) {
    Object.assign(this, { config, ledgerPath, listPrinters, spoolRaw, render }); this.tail = Promise.resolve(); this.pending = 0;
  }
  submit(envelope) {
    this.pending++;
    const run = this.tail.then(() => this.dispatch(envelope));
    const tracked = run.finally(() => { this.pending--; });
    this.tail = tracked.catch(() => {}); return tracked;
  }
  isBusy() { return this.pending > 0; }
  async readLedger() {
    try { return JSON.parse(await readFile(this.ledgerPath, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return {}; throw new AgentError(503, 'No se puede leer el registro local. No se enviará otra copia.'); }
  }
  async persist(ledger) {
    await mkdir(dirname(this.ledgerPath), { recursive: true });
    await writeFile(this.ledgerPath + '.tmp', JSON.stringify(ledger), { mode: 0o600 });
    await rename(this.ledgerPath + '.tmp', this.ledgerPath);
  }
  async dispatch(envelope) {
    const job = verifyAuthorization(envelope, this.config);
    const id = createHash('sha256').update(job.issuer + ':' + job.id).digest('hex');
    const fingerprint = createHash('sha256').update(JSON.stringify([job.audit_id, job.target, job.receipt])).digest('hex');
    const ledger = await this.readLedger(); const previous = ledger[id];
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new AgentError(409, 'El intento ya se usó con otro contenido.');
      if (previous.status === 'submitted') return previous;
      throw new AgentError(409, 'No se puede confirmar la copia anterior. Revisa la impresora antes de autorizar otra copia.', 'unknown');
    }
    const printers = await this.listPrinters();
    const printer = printers.find(p => p.name === job.target.printer);
    if (!printer || printer.virtual || printer.offline) throw new AgentError(422, 'Selecciona una impresora térmica instalada y disponible.');
    const bytes = await this.render(job);
    // Persist before dispatch. A crash or uncertain spool result must never trigger an automatic second copy.
    ledger[id] = { id: job.id, fingerprint, status: 'dispatching', printer: printer.name, device_id: this.config.deviceId, at: new Date().toISOString() };
    await this.persist(ledger);
    try {
      const result = await this.spoolRaw(printer.name, bytes, `LotoEnlace ${job.receipt.reference} - ${job.audit_number}`);
      ledger[id] = { ...ledger[id], status: 'submitted', spool_job_id: result.spool_job_id };
      await this.persist(ledger);
      return ledger[id];
    } catch {
      ledger[id] = { ...ledger[id], status: 'unknown' };
      await this.persist(ledger);
      throw new AgentError(409, 'Windows no confirmó el envío. Revisa la cola y el papel antes de autorizar otra copia.', 'unknown');
    }
  }
}
