import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
for (const scenario of ['parse', 'release', 'existing', 'install', 'bad-hash', 'startup']) {
  test(`instalador Windows: ${scenario}`, { skip: process.platform !== 'win32' }, async t => {
    const scratch = await mkdtemp(join(tmpdir(), 'loto-installer-test-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    const script = fileURLToPath(new URL('./installer.test.ps1', import.meta.url));
    const runtime = fileURLToPath(new URL('../scripts/runtime.ps1', import.meta.url));
    const { stdout } = await execute('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Scenario', scenario, '-Scratch', scratch, '-RuntimeScript', runtime], { windowsHide: true, timeout: 30000 });
    assert.ok(stdout.includes(`OK: ${scenario}`));
  });
}


test('el lanzador Windows inicia PowerShell oculto y admite rutas con espacios', { skip: process.platform !== 'win32' }, async t => {
  const scratch = await mkdtemp(join(tmpdir(), 'loto launcher test '));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  await mkdir(join(scratch, 'scripts'));
  await copyFile(fileURLToPath(new URL('../Iniciar.vbs', import.meta.url)), join(scratch, 'Iniciar.vbs'));
  await writeFile(join(scratch, 'scripts', 'start.ps1'), `
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class TestConsole { [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow(); [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr handle); }'
$visible = [TestConsole]::IsWindowVisible([TestConsole]::GetConsoleWindow())
$apartment = [System.Threading.Thread]::CurrentThread.ApartmentState
Set-Content -LiteralPath (Join-Path $PSScriptRoot 'started.txt') -Value "$visible/$apartment"
`);
  await execute(join(process.env.SystemRoot, 'System32', 'wscript.exe'), ['//B', '//NoLogo', join(scratch, 'Iniciar.vbs')], { windowsHide: true, timeout: 10000 });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const result = await readFile(join(scratch, 'scripts', 'started.txt'), 'utf8').catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return '';
    });
    if (result.trim()) { assert.equal(result.trim(), 'False/STA'); return; }
    await delay(100);
  }
  assert.fail('El lanzador no inicio el script de prueba');
});

test('bandeja Windows: icono y menu se construyen sin abrir ventanas durante la prueba', {skip:process.platform!=='win32'}, async()=>{
 const scratch=await mkdtemp(join(tmpdir(),'loto-tray-test-'));
 const script=fileURLToPath(new URL('../scripts/start.ps1',import.meta.url));
 try {
  const {stdout}=await execute('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',script,'-ValidateOnly'],{windowsHide:true,timeout:30000,env:{...process.env,LOTOENLACE_AGENT_HOME:scratch}});
  assert.ok(stdout.includes('OK: tray-ui'));
 } finally { await rm(scratch,{recursive:true,force:true}); }
});
