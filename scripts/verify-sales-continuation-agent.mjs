// Verify the exact document fingerprints accepted by the real agent; never sends a job.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { renderReceipt } from '../printing-agent/src/receipt.mjs';
const state = join(process.env.LOCALAPPDATA, 'LotoEnlace', 'PrintAgent');
const ledger = JSON.parse(await readFile(join(state, 'jobs.json'), 'utf8'));
const fixture = JSON.parse(await readFile('storage/framework/testing/sales-continuation-printed-jobs.json', 'utf8'));
const verified = [];
for (const item of fixture.jobs) {
  const job = JSON.parse(Buffer.from(item.authorization.payload, 'base64'));
  const id = createHash('sha256').update(job.issuer + ':' + job.id).digest('hex');
  const fingerprint = createHash('sha256').update(JSON.stringify([job.audit_id, job.target, job.receipt])).digest('hex');
  assert.equal(ledger[id]?.fingerprint, fingerprint, 'Must match the actual document sent by the Sales screen');
  assert.equal(ledger[id].status, 'submitted');
  assert.equal(ledger[id].spool_job_id, item.delivery.spool_job_id);
  assert.equal(job.target.paper_width, 58);
  assert.equal(job.target.printer, 'Generic3');
  assert.equal(job.receipt.lines.length, 1);
  const bytes = await renderReceipt(job);
  const qrAt = bytes.indexOf(Buffer.from([0x1d,0x76,0x30,48]));
  const text = bytes.subarray(0, qrAt < 0 ? bytes.length : qrAt).toString('latin1');
  if (job.receipt.document_type === 'continuation') {
    assert.notEqual(job.receipt.pin, fixture.old_pin);
    assert.equal(job.receipt.lines[0].numbers, '20');
    assert.equal(job.receipt.lines[0].draw, 'Prueba pendiente 58mm');
    assert.ok(text.includes(`PIN de cobro: ${job.receipt.pin}`));
    assert.ok(!text.includes(`PIN de cobro: ${fixture.old_pin}`));
    assert.ok(!text.includes('Prueba ganador 58mm'));
    assert.ok(/20 +RD\$1\.00/.test(text));
  } else {
    assert.equal(job.receipt.document_type, 'payout');
    assert.equal(job.receipt.net_minor, 6000);
    assert.equal(job.receipt.lines[0].numbers, '10');
    assert.equal(job.receipt.pin, undefined);
    assert.ok(text.includes('COMPROBANTE DE PAGO'));
    assert.ok(!text.includes('PIN de cobro:'));
  }
  verified.push({ document: job.receipt.document_type, paper_width: 58, spool_job_id: ledger[id].spool_job_id, actual_fingerprint_verified: true });
}
assert.equal(verified.length, 2);
await writeFile('storage/app/sales-continuation-agent-verification.json', JSON.stringify(verified, null, 2));
console.log(JSON.stringify(verified, null, 2));
