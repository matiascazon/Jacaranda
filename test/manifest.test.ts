import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const testHome = mkdtempSync(path.join(tmpdir(), 'jacaranda-manifest-'));
process.env['JACARANDA_HOME'] = testHome;

import {
  emptyManifest,
  loadManifest,
  saveManifest,
  addWrittenFile,
  registerTool,
  markToolDetected,
  createBackup,
  listBackups,
  sha256,
} from '../src/core/manifest.js';

test('emptyManifest tiene estructura valida', () => {
  const m = emptyManifest();
  assert.equal(m.schemaVersion, 1);
  assert.deepEqual(Object.keys(m.tools), []);
  assert.deepEqual(m.established, []);
  assert.deepEqual(m.backups, []);
});

test('save/load preserve estado', () => {
  const m = emptyManifest();
  registerTool(m, 'opencode', '1.2.3');
  saveManifest(m);
  const loaded = loadManifest();
  assert.equal(loaded.tools['opencode']?.version, '1.2.3');
  assert.equal(loaded.tools['opencode']?.installed, true);
});

test('markToolDetected no marca instalado', () => {
  const m = emptyManifest();
  markToolDetected(m, 'engram', '0.5.0');
  assert.equal(m.tools['engram']?.detected, true);
  assert.equal(m.tools['engram']?.installed, false);
});

test('addWrittenFile registra checksum y es idempotente por path', () => {
  const file = path.join(testHome, 'opencode.json');
  writeFileSync(file, '{"a":1}');
  const m = emptyManifest();
  addWrittenFile(m, file, 'registrado', 'opencode');
  const checksum1 = m.established[0]?.files?.[0]?.checksum;
  addWrittenFile(m, file, 'actualizado', 'opencode');
  const checksum2 = m.established[0]?.files?.[0]?.checksum;
  assert.equal(checksum1, checksum2);
  assert.equal(Object.keys(m.tools ?? {}).length, 0);
});

test('createBackup copia y registra en manifest', () => {
  const file = path.join(testHome, 'config.json');
  writeFileSync(file, '{"original":true}');
  const m = emptyManifest();
  const backup = createBackup(m, file);
  assert.ok(backup, 'backup debe existir');
  assert.ok(existsSync(file), 'original intacto');
  assert.equal(readFileSync(backup, 'utf8'), '{"original":true}');
  assert.equal(listBackups(m).length, 1);
  assert.equal(listBackups(m)[0]?.original, file);
});

test('sha256 de archivos', () => {
  const file = path.join(testHome, 'hash.txt');
  writeFileSync(file, 'abc');
  assert.equal(sha256(file), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256(path.join(testHome, 'no-existe.txt')), null);
});

test('loadManifest tolera archivo corrupto', () => {
  mkdirSync(testHome, { recursive: true });
  const manifestPath = path.join(testHome, 'state.json');
  writeFileSync(manifestPath, '{corrupto');
  const m = loadManifest();
  assert.equal(m.schemaVersion, 1);
});

test('loadManifest tolera version vieja de schema', () => {
  const manifestPath = path.join(testHome, 'state.json');
  writeFileSync(manifestPath, JSON.stringify({ schemaVersion: 0, tools: { pi: { version: '9' } } }));
  const m = loadManifest();
  assert.equal(m.schemaVersion, 1);
  assert.equal(m.tools['pi']?.version, '9');
});