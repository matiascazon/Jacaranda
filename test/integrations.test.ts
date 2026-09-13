import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { setupEngramForAgent, mcpFallbackBlock, verifyEngram } from '../src/integrations/engram.js';
import { projectHasOpenSpec, openspecInit, openspecValidate } from '../src/integrations/openspec.js';
import { exec, resolveCommand } from '../src/platform/exec.js';

test('engram: setupEngramForAgent con agente ausente reporta error claro', async () => {
  const res = await setupEngramForAgent('agente-que-no-existe-xyz');
  assert.equal(res.ok, false);
  assert.match(res.error ?? '', /no est/);
});

test('engram: mcpFallbackBlock produce bloque JSONC local', () => {
  const block = mcpFallbackBlock('engram', 'npx', ['-y', 'engram-mcp'], { ENGRAM_PROJECT: 'demo' }) as Record<string, unknown>;
  const inner = (block['mcp.engram'] ?? {}) as Record<string, unknown>;
  assert.equal(inner.type, 'local');
  assert.deepEqual(inner.command, ['npx', '-y', 'engram-mcp']);
  assert.equal(inner.enabled, true);
  assert.deepEqual(inner.environment, { ENGRAM_PROJECT: 'demo' });
});

test('engram: verifyEngram reporta ausente sin lanzar', async () => {
  const r = await verifyEngram();
  assert.equal(typeof r.present, 'boolean');
  assert.equal(r.error === undefined || r.error === null, r.present || true);
});

test('openspec: projectHasOpenSpec detecta openspec/ real', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jaca-ospec-'));
  assert.equal(projectHasOpenSpec(root), false);
  mkdirSync(path.join(root, 'openspec', 'specs'), { recursive: true });
  writeFileSync(path.join(root, 'openspec', 'project.md'), '# proj');
  assert.equal(projectHasOpenSpec(root), true);
  rmSync(root, { recursive: true, force: true });
});

test('openspec: init respeta openspec existente', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jaca-ospec2-'));
  mkdirSync(path.join(root, 'openspec'), { recursive: true });
  writeFileSync(path.join(root, 'openspec', 'project.md'), '# ya existe');
  const res = await openspecInit({ tools: ['opencode', 'pi'], cwd: root });
  assert.equal(res.ok, true);
  assert.equal(res.projectInitialized, true);
  assert.match(res.output, /ya presente/);
  rmSync(root, { recursive: true, force: true });
});

test('openspec: init con openspec ausente falla con error si binario no existe', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jaca-ospec3-'));
  // si openspec no esta en PATH, debe fallar limpio; si esta, necesita red/permisos.
  const hasOpenspec = resolveCommand('openspec') !== null;
  const res = await openspecInit({ tools: ['opencode', 'pi'], cwd: root });
  if (!hasOpenspec) {
    assert.equal(res.ok, false);
    assert.ok(res.error);
  } else {
    // presente: no afirmamos resultado (puede requerir red), solo que no lanza.
    assert.equal(typeof res.ok, 'boolean');
  }
  rmSync(root, { recursive: true, force: true });
});

test('openspec: openspecValidate en dir sin proyecto no lanza', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jaca-ospec4-'));
  const res = await openspecValidate(root);
  assert.equal(typeof res.ok, 'boolean');
  rmSync(root, { recursive: true, force: true });
});

test('detection real de binarios disponibles (contexto CI)', async () => {
  const opencode = resolveCommand('opencode');
  const npm = resolveCommand('npm');
  assert.ok(npm, 'npm existe en CI');
  if (opencode) {
    const r = await exec(opencode, ['--version']);
    assert.equal(r.exitCode, 0);
  }
});