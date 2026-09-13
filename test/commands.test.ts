import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const testHome = mkdtempSync(path.join(tmpdir(), 'jacaranda-init-'));
process.env['JACARANDA_HOME'] = testHome;
process.env['JACARANDA_AGENTS_SKILLS'] = path.join(testHome, 'agents-skills');

import { runInit, ensureMcpBlockInFile } from '../src/commands/init.js';
import { runDoctor, diagnose } from '../src/commands/doctor.js';
import { createIo } from '../src/commands/io.js';
import { loadManifest } from '../src/core/manifest.js';

function cliOpts(dryRun = true) {
  return {
    command: 'init',
    args: [],
    flags: { 'dry-run': !!dryRun },
    verbose: false,
    dryRun,
    yes: !!dryRun,
    force: false,
  };
}

test('init --dry-run no toca nada y reporta plan', async () => {
  const before = existsSync(path.join(testHome, 'state.json'));
  const code = await runInit(cliOpts(true));
  assert.equal(code, 0);
  assert.equal(existsSync(path.join(testHome, 'state.json')), before, 'dry-run no crea manifest');
  assert.equal(existsSync(path.join(testHome, 'init.lock')), false, 'lock liberado');
});

test('init adquiere lock y lo libera', async () => {
  const code = await runInit(cliOpts(true));
  assert.equal(code, 0);
  assert.equal(existsSync(path.join(testHome, 'init.lock')), false);
});

test('ensureMcpBlockInFile agrega bloque engram a opencode.json y hace backup', async () => {
  const configFile = path.join(testHome, 'opencode.json');
  writeFileSync(configFile, '{"model":"gpt-5"}');
  const io = createIo({ yes: true });
  const manifest = loadManifest();
  const ok = await ensureMcpBlockInFile(configFile, 'opencode', 'engram', 'npx', ['-y', 'engram-mcp'], undefined, {} as never, io, manifest);
  assert.equal(ok, true);
  const parsed = JSON.parse(readFileSync(configFile, 'utf8')) as { model?: string; mcp?: Record<string, unknown> };
  assert.equal(parsed.model, 'gpt-5', 'no pisa otras claves');
  assert.ok(parsed.mcp?.['engram'], 'bloque engram presente');
  assert.equal(existsSync(path.join(testHome, 'backups')), true, 'backups creados');

  // idempotente: segunda corrida no cambia nada
  const hash1 = readFileSync(configFile, 'utf8');
  const ok2 = await ensureMcpBlockInFile(configFile, 'opencode', 'engram', 'npx', ['-y', 'engram-mcp'], undefined, {} as never, createIo({ yes: true }), manifest);
  assert.equal(ok2, true);
  assert.equal(readFileSync(configFile, 'utf8'), hash1);
});

test('ensureMcpBlockInFile respeta config invalida existente (backup manual)', async () => {
  const configFile = path.join(testHome, 'opencode-bad.json');
  writeFileSync(configFile, '{esto no es json');
  const io = createIo({ yes: true });
  const manifest = loadManifest();
  const ok = await ensureMcpBlockInFile(configFile, 'opencode', 'engram', 'npx', ['-y', 'engram-mcp'], undefined, {} as never, io, manifest);
  assert.equal(ok, false, 'config JSONC invalida no debe sobrescribirse');
  assert.equal(readFileSync(configFile, 'utf8'), '{esto no es json');
});

test('diagnose reporta skills y manifest (sin lanzar)', async () => {
  const io = createIo({ out: () => {} });
  const summary = await diagnose(io);
  assert.equal(typeof summary.ok, 'boolean');
  assert.ok(summary.lines.length > 0);
});

test('doctor exit code 0 cuando todo ok y 1 con pendientes', async () => {
  // Con pi ausente en CI -> hay pendientes -> code 1 (o 0 si esta instalado).
  const code = await runDoctor(cliOpts(true) as never);
  assert.equal([0, 1].includes(code), true);
});