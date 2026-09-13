import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const testHome = mkdtempSync(path.join(tmpdir(), 'jacaranda-safe-'));
process.env['JACARANDA_HOME'] = testHome;
process.env['JACARANDA_AGENTS_SKILLS'] = path.join(testHome, 'agents-skills');
const opencodeConfig = path.join(testHome, 'opencode.json');

import { ensureMcpBlockInFile } from '../src/commands/init.js';
import { runInit } from '../src/commands/init.js';
import { loadManifest, saveManifest } from '../src/core/manifest.js';
import { createIo } from '../src/commands/io.js';

function dryRunOptions() {
  return {
    command: 'init',
    args: [],
    flags: { 'dry-run': true },
    verbose: false,
    dryRun: true,
    yes: false,
    force: false,
  };
}

test('idempotencia: aplicar config 3 veces produce el mismo archivo', async () => {
  writeFileSync(opencodeConfig, '{"model":"x","mcp":{"existing":{"type":"local","command":"echo"}}}');
  const io = createIo({ yes: true });
  for (let i = 0; i < 3; i++) {
    const manifest = loadManifest();
    const ok = await ensureMcpBlockInFile(opencodeConfig, 'opencode', 'engram', 'npx', ['-y', 'engram-mcp'], undefined, {} as never, io, manifest);
    assert.equal(ok, true, `iteracion ${i + 1}`);
  }
  const content = readFileSync(opencodeConfig, 'utf8');
  const parsed = JSON.parse(content) as { mcp?: Record<string, unknown> };
  assert.ok(parsed.mcp?.['engram'], 'engram presente');
  assert.ok(parsed.mcp?.existing, 'no pisa servers existentes');

  // Solo 1 backup (primera iteracion) porque las demas no cambian el archivo.
  const backupsDir = path.join(testHome, 'backups');
  if (existsSync(backupsDir)) {
    const runs = readdirSync(backupsDir).filter((d) => readdirSync(path.join(backupsDir, d)).includes('opencode.json'));
    assert.equal(runs.length, 1, 'solo la primera corrida hace backup');
  }
});

test('idempotencia: runInit dry-run 3 veces no crea manifest ni skills', async () => {
  for (let i = 0; i < 3; i++) {
    const code = await runInit(dryRunOptions());
    assert.equal(code, 0);
  }
  assert.equal(existsSync(path.join(testHome, 'state.json')), false, 'sin manifest tras dry-run');
  assert.equal(existsSync(path.join(testHome, 'skills')), false, 'sin skills tras dry-run');
  assert.equal(existsSync(path.join(testHome, 'init.lock')), false, 'lock liberado');
});

test('dry-run no escribe ningun config de MCP', async () => {
  const target = path.join(testHome, 'opencode-new.json');
  // Simulamos la guarda de MCP con dry-run flags: ensureMcpBlockInFile recibe
  // options; si dryRun, no debe escribir.
  const io = createIo({ yes: true });
  const manifest = loadManifest();
  const opts = { dryRun: true } as never;
  const ok = await ensureMcpBlockInFile(target, 'opencode', 'engram', 'npx', ['-y', 'engram-mcp'], undefined, opts, io, manifest);
  assert.equal(ok, false, 'dry-run no aplica configs');
  assert.equal(existsSync(target), false);
});

test('mcp-config: backup previo se graba en manifest y checksum registrado', async () => {
  const configFile = path.join(testHome, 'opencode-track.json');
  writeFileSync(configFile, '{"a":1}');
  const io = createIo({ yes: true });
  const manifest = loadManifest();
  await ensureMcpBlockInFile(configFile, 'opencode', 'engram', 'npx', ['-y', 'engram-mcp'], undefined, {} as never, io, manifest);
  saveManifest(manifest);
  const saved = loadManifest();
  assert.equal(saved.backups.length, 1, 'backup registrado en manifest');
  const est = saved.established.find((e) => e.tool === 'opencode');
  assert.ok(est && est.files, 'archivo registrado en established');
  // doctor detectaria drift si el usuario edita el config
  writeFileSync(configFile, '{"a":2,"mcp":{"engram":{}}}');
  const { sha256 } = await import('../src/core/manifest.js');
  const fresh = loadManifest();
  const recorded = fresh.established.find((e) => e.tool === 'opencode')?.files?.[0];
  assert.ok(recorded);
  assert.notEqual(sha256(configFile), recorded.checksum, 'checksum distinto tras edicion');
});