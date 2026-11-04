import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes, randomUUID, createPublicKey } from 'node:crypto';
import { JobQueue } from './jobs.mjs';
import { createAgentServer } from './server.mjs';
import { listPrinters, spoolRaw } from './platform.mjs';

const dataDir = process.env.LOTOENLACE_AGENT_HOME || join(process.env.LOCALAPPDATA || homedir(), 'LotoEnlace', 'PrintAgent');
const configPath = join(dataDir, 'config.json');
const command = process.argv[2] || 'start';
try {
  if (command === 'configure') {
    const argument = process.argv.find(v => v.startsWith('--app-url='));
    if (!argument) throw new Error('Indica --app-url=http://lotoenlace.test');
    const url = new URL(argument.slice('--app-url='.length));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('URL del sistema inválida.');
    const issuer = url.href.replace(/\/$/, '');
    const response = await fetch(issuer + '/printing-agent/public-key', { signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!response.ok) throw new Error('No se pudo obtener la clave pública. Prepara primero la firma en el servidor.');
    const remote = await response.json();
    if (remote.issuer !== issuer || createPublicKey(remote.public_key).asymmetricKeyType !== 'rsa') throw new Error('La clave pública no corresponde al sistema indicado.');
    let previous; try { previous = JSON.parse(await readFile(configPath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (previous && previous.issuer !== issuer) throw new Error('Este agente ya está vinculado a otro sistema. Utiliza otra carpeta LOTOENLACE_AGENT_HOME.');
    if (previous && previous.publicKey !== remote.public_key) throw new Error('La clave pública cambió. Revisa el servidor antes de volver a vincular el equipo.');
    const config = previous || { token: randomBytes(32).toString('hex'), deviceId: randomUUID(), issuer, publicKey: remote.public_key };
    await mkdir(dataDir, { recursive: true }); await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
    console.log('Agente vinculado. Pega esta clave en Ventas > Impresora (no la compartas):');
    console.log(config.token);
  } else if (command === 'start') {
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    const queue = new JobQueue({ config, ledgerPath: join(dataDir, 'jobs.json'), listPrinters, spoolRaw });
    const server = createAgentServer({ config, queue, listPrinters, onShutdown: () => server.close(() => { process.exitCode = 0; }) });
    server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? 'El agente ya está abierto en el puerto 18745.' : 'No se pudo iniciar el agente.'); process.exitCode = 1; });
    server.listen(18745, '127.0.0.1', () => console.log('LotoEnlace Print Agent listo en 127.0.0.1:18745.'));
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
  } else throw new Error('Comando válido: configure o start.');
} catch (e) {
  if (command === 'start') console.error(e.code === 'ENOENT' ? 'Falta config.json. Vuelve a ejecutar Instalar.bat.' : e instanceof SyntaxError ? 'config.json no contiene JSON válido. Revisa la configuración local.' : 'No se pudo iniciar el agente (' + String(e.code ?? e.name ?? 'ERROR').replace(/[^a-zA-Z0-9_]/g, '') + ').');
  else console.error(e.code === 'ENOENT' ? 'Configura primero el agente con npm run configure -- --app-url=URL_DEL_SISTEMA' : e.message);
  process.exitCode = 1;
}
