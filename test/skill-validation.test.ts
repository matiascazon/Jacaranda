import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  validateSkill,
  validateSkillDir,
  listSkills,
  parseFrontmatter,
} from '../src/core/skill-validation.js';

test('validateSkill: skill valido', () => {
  const md = `---
name: git-release
description: Create consistent releases
license: MIT
metadata:
  audience: maintainers
---

# Body
- thing
`;
  const v = validateSkill('git-release', md);
  assert.equal(v.ok, true);
  assert.deepEqual(v.errors, []);
  assert.equal(v.name, 'git-release');
  assert.equal(v.metadata?.audience, 'maintainers');
});

test('validateSkill: falta nombre/description', () => {
  const v = validateSkill('foo', '---\nlicense: MIT\n---\nbody');
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('name')));
  assert.ok(v.errors.some((e) => e.includes('description')));
});

test('validateSkill: name invalido (uppercase / doble guion / espacio)', () => {
  for (const bad of ['Foo-Bar', 'foo--bar', 'foo bar', '-foo', 'foo-', 'FOO']) {
    const md = `---\nname: ${bad}\ndescription: x\n---\n`;
    const v = validateSkill(bad, md);
    assert.equal(v.ok, false, `name "${bad}" debe ser invalido`);
    assert.ok(v.errors.some((e) => e.includes('invalido') || e.includes('regex')), `errors de ${bad}: ${v.errors}`);
  }
});

test('validateSkill: name debe coincidir con el directorio', () => {
  const md = `---\nname: other-name\ndescription: x\n---\n`;
  const v = validateSkill('dir-name', md);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('!= directorio')));
});

test('validateSkill: nombre de 64 chars valido, 65 invalido', () => {
  const max = 'a'.repeat(64);
  assert.equal(validateSkill(max, `---\nname: ${max}\ndescription: x\n---\n`).ok, true);
  const over = 'a'.repeat(65);
  assert.equal(validateSkill(over, `---\nname: ${over}\ndescription: x\n---\n`).ok, false);
});

test('parseFrontmatter: description multi-linea con >- se aplana', () => {
  const md = `---
name: x
description: >-
  varias
  lineas juntas
metadata:
  a: "1"
  b: '2'
---
# body
`;
  const { fm } = parseFrontmatter(md);
  assert.equal(fm.description, 'varias lineas juntas');
  assert.deepEqual(fm.metadata, { a: '1', b: '2' });
  assert.equal('license' in fm, false, 'ausente en bloque => sin clave');
});

test('validateSkillDir y listSkills sobre arbol real', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jaca-skills-'));
  const good = path.join(root, 'git-release');
  const bad = path.join(root, 'Bad--Name');
  mkdirSync(good);
  mkdirSync(bad);
  writeFileSync(path.join(good, 'SKILL.md'), '---\nname: git-release\ndescription: ok\n---\nbody');
  writeFileSync(path.join(bad, 'SKILL.md'), '---\nname: Bad--Name\ndescription: nope\n---\n');

  assert.deepEqual(listSkills(root), ['Bad--Name', 'git-release']);
  assert.equal(validateSkillDir(good)?.ok, true);
  const badV = validateSkillDir(bad);
  assert.equal(badV?.ok, false);

  rmSync(root, { recursive: true, force: true });
});