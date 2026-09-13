import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, lstatSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { linkDir, linkStatus, unlinkIfLink, copyDirSync } from '../src/platform/links.js';
import { exec } from '../src/platform/exec.js';

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'jacaranda-test-'));
}

test('links: linkDir crea enlace y apunta al origen', () => {
  const root = tempDir();
  const source = path.join(root, 'src-folder');
  const target = path.join(root, 'link-folder');
  mkdirSync(source);
  writeFileSync(path.join(source, 'a.txt'), 'hola');

  const result = linkDir(source, target);
  assert.equal(result.created, true);
  assert.ok(['junction', 'symlink', 'copy'].includes(result.kind));
  assert.ok(lstatSync(target).isSymbolicLink(), 'target debe ser un symbolic link');
  assert.equal(readFileSync(path.join(target, 'a.txt'), 'utf8'), 'hola');

  // Idempotente: re-correr con el mismo origen no recrea ni falla.
  const again = linkDir(source, target);
  assert.equal(again.created, false);
  assert.equal(again.replaced, false);

  rmSync(root, { recursive: true, force: true });
});

test('links: linkDir no pisa un directorio real con contenido', () => {
  const root = tempDir();
  const source = path.join(root, 'src-folder');
  const target = path.join(root, 'real-folder');
  mkdirSync(source);
  mkdirSync(target);
  writeFileSync(path.join(target, 'keep.txt'), 'no tocar');

  const result = linkDir(source, target);
  assert.ok(result.error, 'debe fallar con error');
  assert.equal(readFileSync(path.join(target, 'keep.txt'), 'utf8'), 'no tocar');

  rmSync(root, { recursive: true, force: true });
});

test('links: linkDir reemplaza un enlace que apunta a otro lado', () => {
  const root = tempDir();
  const sourceA = path.join(root, 'a');
  const sourceB = path.join(root, 'b');
  const link = path.join(root, 'link');
  mkdirSync(sourceA);
  mkdirSync(sourceB);
  writeFileSync(path.join(sourceA, 'marker.txt'), 'link a A');
  writeFileSync(path.join(sourceB, 'marker.txt'), 'link a B');

  const r1 = linkDir(sourceA, link);
  assert.equal(r1.created, true);
  assert.equal(readFileSync(path.join(link, 'marker.txt'), 'utf8'), 'link a A');

  const r2 = linkDir(sourceB, link);
  assert.equal(r2.replaced, true);
  assert.equal(readFileSync(path.join(link, 'marker.txt'), 'utf8'), 'link a B');

  rmSync(root, { recursive: true, force: true });
});

test('links: linkStatus detecta enlace correcto, otro y roto', () => {
  const root = tempDir();
  const source = path.join(root, 'src');
  mkdirSync(source);
  const good = path.join(root, 'good');
  const wrong = path.join(root, 'wrong');
  const other = path.join(root, 'other-src');
  mkdirSync(other);

  linkDir(source, good);
  linkDir(other, wrong);

  assert.equal(linkStatus(good, source).resolved, true);
  assert.equal(linkStatus(good, source).broken, false);
  assert.equal(linkStatus(wrong, source).resolved, false);
  assert.equal(linkStatus(wrong, source).broken, true);

  // Directorio real no es un link.
  const real = path.join(root, 'real');
  mkdirSync(real);
  assert.equal(linkStatus(real, source).link, false);

  rmSync(root, { recursive: true, force: true });
});

test('links: unlinkIfLink solo remueve enlaces', () => {
  const root = tempDir();
  const source = path.join(root, 'src');
  mkdirSync(source);
  const link = path.join(root, 'link');
  linkDir(source, link);
  assert.equal(unlinkIfLink(link), true);
  assert.equal(existsSync(link), false);

  const real = path.join(root, 'real');
  mkdirSync(real);
  assert.equal(unlinkIfLink(real), false);
  assert.equal(existsSync(real), true);

  rmSync(root, { recursive: true, force: true });
});

test('links: unlinkIfLink remueve un enlace colgante (dangling)', () => {
  const root = tempDir();
  const dangling = path.join(root, 'dangling');
  // junction/symlink cuyo target NO existe
  symlinkSync(path.join(root, 'no-existe'), dangling, 'junction');
  assert.equal(existsSync(dangling), false, 'existsSync es false en colgante');
  assert.equal(unlinkIfLink(dangling), true);
  assert.equal(lstatSync(path.join(root)).isSymbolicLink(), false);
  rmSync(root, { recursive: true, force: true });
});

test('links: copyDirSync copia recursivo', () => {
  const root = tempDir();
  const source = path.join(root, 'src');
  mkdirSync(path.join(source, 'nested'), { recursive: true });
  writeFileSync(path.join(source, 'nested', 'f.txt'), 'x');
  const target = path.join(root, 'dst');
  copyDirSync(source, target);
  assert.equal(readFileSync(path.join(target, 'nested', 'f.txt'), 'utf8'), 'x');
  rmSync(root, { recursive: true, force: true });
});

test('exec: comando inexistente devuelve exitCode 127 sin lanzar', async () => {
  const res = await exec('jacaranda-comando-inexistente-xyz', []);
  assert.equal(res.exitCode, 127);
});

test('exec: comando con salida y exit code', async () => {
  const res = await exec(process.execPath, ['-e', 'console.log("ok-salida")']);
  assert.equal(res.exitCode, 0);
  assert.match(res.stdout.trim(), /ok-salida/);
});

test('exec: exit code no cero en stderr', async () => {
  const res = await exec(process.execPath, ['-e', 'process.stderr.write("boom"); process.exit(3)']);
  assert.equal(res.exitCode, 3);
  assert.match(res.stderr, /boom/);
});