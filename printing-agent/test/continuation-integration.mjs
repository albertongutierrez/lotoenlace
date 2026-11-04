// Invoked by LotteryEngineTest with a real Laravel-signed print authorization.
// Only the Windows spool boundary is replaced: no physical printer is touched.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JobQueue, verifyAuthorization } from '../src/jobs.mjs';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const { authorization, publicKey, expected } = JSON.parse(input);
const payload = JSON.parse(Buffer.from(authorization.payload, 'base64'));
// Laravel freezes its test clock; use that same instant for signature expiry.
Date.now = () => payload.issued_at * 1000;
const config = { issuer: expected.issuer, deviceId: expected.deviceId, publicKey };
const job = verifyAuthorization(authorization, config);
assert.equal(job.receipt.document_type, 'continuation');
assert.equal(job.receipt.code, expected.code);
assert.equal(job.receipt.pin, expected.newPin);
assert.notEqual(job.receipt.pin, expected.oldPin);
assert.equal(job.receipt.paid_minor, 60000);
assert.equal(job.receipt.net_minor, 400);
assert.equal(job.receipt.lines.length, 1);
assert.equal(job.receipt.lines[0].draw, expected.pendingDraw);
assert.equal(job.receipt.lines[0].numbers, '20');

const directory = await mkdtemp(join(tmpdir(), 'loto-continuation-integration-'));
try {
  let sends = 0;
  let captured;
  const options = {
    config, ledgerPath: join(directory, 'jobs.json'),
    listPrinters: async () => [{ name: job.target.printer, virtual: false, offline: false }],
    spoolRaw: async (printer, bytes) => {
      sends++;
      captured = { printer, bytes };
      return { spool_job_id: 17 };
    },
  };
  const queue = new JobQueue(options);
  const results = await Promise.all(Array.from({ length: 3 }, () => queue.submit(authorization)));
  assert.ok(results.every(result => result.status === 'submitted' && result.spool_job_id === 17));
  const restarted = new JobQueue(options);
  assert.equal((await restarted.submit(authorization)).spool_job_id, 17);
  assert.equal(sends, 1);
  assert.equal(captured.printer, job.target.printer);
  // Inspect all ticket text before the QR raster, avoiding binary false matches.
  const rasterAt = captured.bytes.indexOf(Buffer.from([0x1d, 0x76, 0x30, 48]));
  const text = captured.bytes.subarray(0, rasterAt < 0 ? captured.bytes.length : rasterAt).toString('latin1');
  assert.ok(text.includes('TICKET DE CONTINUACION'), 'Continuation header');
  assert.ok(text.includes(`PIN de cobro: ${expected.newPin}`), 'New PIN');
  assert.ok(!text.includes(`PIN de cobro: ${expected.oldPin}`), 'Retired PIN excluded');
  assert.ok(text.includes(expected.pendingDraw), 'Pending draw printed');
  assert.ok(!text.includes(expected.paidDraw), 'Paid draw excluded');
  assert.equal((text.match(/20 +RD\$4\.00/g) ?? []).length, 1, 'Pending wager printed exactly once');
  assert.ok(!/10 +RD\$/.test(text), 'Paid wager excluded');
  assert.ok(text.includes('TOTAL PENDIENTE'), 'Pending total');
  assert.ok(/Premio pagado +RD\$600\.00/.test(text), 'Payment summary');
  const ledger = await readFile(options.ledgerPath, 'utf8');
  assert.ok(!ledger.includes(expected.newPin));
  // Optional manual paper verification; contains synthetic test data only.
  if (process.env.LOTO_CONTINUATION_SAMPLE_PATH) {
    await writeFile(process.env.LOTO_CONTINUATION_SAMPLE_PATH, input, { mode: 0o600 });
  }
  process.stdout.write(JSON.stringify({ status: 'submitted', sends, pending_lines: 1, retries_deduplicated: true }));
} finally {
  await rm(directory, { recursive: true, force: true });
}
