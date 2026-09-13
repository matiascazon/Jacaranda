import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  parseJsonc,
  stripComments,
  stripTrailingCommas,
  readJsonFile,
  writeJsonAtomic,
  mergeDeep,
  diffValue,
  looksLikeJsonc,
  isJsonFile,
} from '../src/core/config-edit.js';

const tempDir = () => mkdtempSync(path.join(tmpdir(), 'jacaranda-json-'));

test('stripComments conserva strings y quita // y /* */', () => {
  const src = `{
  // comentario de linea
  "a": "// no es comentario",
  "b": 1 /* bloque */ , /** otro */ "c": "/* tampoco */"
}`;
  const clean = stripComments(src);
  assert.ok(!clean.includes('comentario de linea'));
  assert.ok(!clean.includes('/* bloque'));
  assert.ok(clean.includes('"// no es comentario"'));
  assert.ok(clean.includes('"/* tampoco */"'));
});

test('stripTrailingCommas quita comas finales', () => {
  assert.equal(stripTrailingCommas('{"a":1,}'), '{"a":1}');
  assert.equal(stripTrailingCommas('[1,2,]'), '[1,2]');
  // No toca comas que no son trailing
  assert.equal(stripTrailingCommas('{"a":1,"b":2}'), '{"a":1,"b":2}');
});

test('parseJsonc para json puro y jsonc', () => {
  assert.deepEqual(parseJsonc('{"a":1,"b":[1,2,]}'), { a: 1, b: [1, 2] });
  const jsonc = `{
    // nota
    "server": { "command": "npx", /* comet */ "args": ["-y", "engram"], }
  }`;
  const parsed = parseJsonc(jsonc);
  assert.deepEqual(parsed, { server: { command: 'npx', args: ['-y', 'engram'] } });
});

test('looksLikeJsonc detecta comentarios y trailing commas', () => {
  assert.equal(looksLikeJsonc('{"a":1,}'), true);
  assert.equal(looksLikeJsonc('{"a":1}'), false);
  assert.equal(looksLikeJsonc('// x\n{"a":1}'), true);
});

test('readJsonFile y writeJsonAtomic roundtrip', () => {
  const dir = tempDir();
  const file = path.join(dir, 'conf.json');
  writeFileSync(file, '{"mcp":{"srv":{"args":["x"],}}}');
  assert.deepEqual(readJsonFile(file), { mcp: { srv: { args: ['x'] } } });
  writeJsonAtomic(file, { mcp: { srv: { args: ['y'] } } });
  assert.equal(readFileSync(file, 'utf8').trim(), JSON.stringify({ mcp: { srv: { args: ['y'] } } }, null, 2));
  assert.ok(!existsSync(`${file}.tmp`), 'no quedan tmp files');
  rmSync(dir, { recursive: true, force: true });
});

test('isJsonFile valida o rechaza', () => {
  const dir = tempDir();
  const good = path.join(dir, 'good.json');
  const bad = path.join(dir, 'bad.json');
  writeFileSync(good, '{"ok":1}');
  writeFileSync(bad, '{nope');
  assert.equal(isJsonFile(good), true);
  assert.equal(isJsonFile(bad), false);
  assert.equal(isJsonFile(path.join(dir, 'missing.json')), false);
  rmSync(dir, { recursive: true, force: true });
});

test('mergeDeep combina objetos sin mutar y reemplaza arrays/esc alares', () => {
  const base = { a: { x: 1, y: 2 }, list: [1, 2], keep: true };
  const patch = { a: { y: 3, z: 4 }, list: [9] };
  const out = mergeDeep(base, patch) as Record<string, unknown>;
  assert.deepEqual(out, { a: { x: 1, y: 3, z: 4 }, list: [9], keep: true });
  assert.deepEqual(base, { a: { x: 1, y: 2 }, list: [1, 2], keep: true }, 'base intacta');
  // patch con objectos, quieres reemplazo profundo; con undefined no toca
  const withUndef = mergeDeep({ a: 1 }, { a: undefined });
  assert.deepEqual(withUndef, { a: 1 });
});

test('diffValue reporta added/removed/changed', () => {
  const onlyDiff = diffValue({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 });
  assert.ok(onlyDiff.some((d) => d.type === 'changed' && d.path === 'b'));
  assert.ok(onlyDiff.some((d) => d.type === 'added' && d.path === 'c' && d.value === 4));
  const removed = diffValue({ a: 1, b: 2 }, { a: 1 });
  assert.ok(removed.some((d) => d.type === 'removed' && d.path === 'b'));
  assert.deepEqual(diffValue({ a: 1 }, { a: 1 }), []);
  assert.deepEqual(diffValue(5, 5), []);
});

test('diffValue con paths anidados y arrays', () => {
  const changes = diffValue({ mcp: { s: { args: ['a'] } } }, { mcp: { s: { args: ['b'] } } });
  assert.ok(changes.some((d) => d.type === 'changed' && d.path === 'mcp.s.args[0]'));
  // arrays identicos no generan changes
  assert.deepEqual(diffValue({ arr: [1, 2] }, { arr: [1, 2] }), []);
  // arrays de distinta longitud => changed en el array
  const len = diffValue({ arr: [1] }, { arr: [1, 2] });
  assert.ok(len.some((d) => d.type === 'changed' && d.path === 'arr'));
});