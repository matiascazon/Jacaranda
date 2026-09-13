import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const testHome = mkdtempSync(path.join(tmpdir(), 'jacaranda-skills-'));
const testAgents = path.join(testHome, 'agents', 'skills');
process.env['JACARANDA_HOME'] = testHome;
process.env['JACARANDA_AGENTS_SKILLS'] = testAgents;

import {
  ensureSkills,
  materializeBundledSkill,
  linkSkillToAgents,
  listLocalSkills,
  localSkillDir,
  agentSkillLinkPath,
} from '../src/core/skills.js';
import { jacarandaSkillsDir } from '../src/platform/paths.js';

test('materializeBundledSkill copia openspec-sdd del bundle y valida', async () => {
  const key = await ensureSkills(['openspec-sdd']);
  const r = key[0] ?? { error: 'no result' } as never;
  assert.equal(r.materialized, true);
  assert.equal(r.valid, true);
  assert.equal(r.error, undefined);
  assert.equal(existsSync(path.join(jacarandaSkillsDir(), 'openspec-sdd', 'SKILL.md')), true);
  const content = readFileSync(path.join(jacarandaSkillsDir(), 'openspec-sdd', 'SKILL.md'), 'utf8');
  assert.match(content, /^---\r?\nname: openspec-sdd/m);
});

test('listLocalSkills detecta skills materializados', () => {
  const locals = listLocalSkills();
  assert.ok(locals.includes('openspec-sdd'));
});

test('linkSkillToAgents crea enlace junction/symlink hacia ~/.agents/skills', () => {
  const target = agentSkillLinkPath('openspec-sdd');
  const r = linkSkillToAgents('openspec-sdd');
  assert.equal(r.error, undefined);
  assert.equal(r.linked, true);
  assert.ok(existsSync(target), 'target debe existir');
  assert.ok(lstatSync(target).isSymbolicLink(), 'debe ser un link (junction o symlink)');
  assert.equal(readFileSync(path.join(target, 'SKILL.md'), 'utf8').includes('openspec-sdd'), true);
});

test('linkSkillToAgents idempotente: ya enlazado no falla', () => {
  const r = linkSkillToAgents('openspec-sdd');
  assert.equal(r.error, undefined);
  assert.equal(r.linked, true);
});

test('materialize no pisa skill local editado', () => {
  const id = 'local-edit';
  const dir = localSkillDir(id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: local-edit\ndescription: editado por usuario\n---\n');

  const r = materializeBundledSkill(id);
  assert.equal(r.materialized, false, 'no se materializa algo que no esta en bundle');
  assert.equal(existsSync(path.join(dir, 'SKILL.md')), true);
  assert.equal(readFileSync(path.join(dir, 'SKILL.md'), 'utf8').includes('editado por usuario'), true);
});

test('ensureSkills encadena materialize + link sin duplicar reporte', async () => {
  const results = await ensureSkills(['engram-memory']);
  assert.equal(results.length, 1);
  const r = results[0] ?? { error: 'nada' } as never;
  assert.equal(r.materialized, true);
  assert.equal(r.linked, true);
  assert.ok(existsSync(agentSkillLinkPath('engram-memory')));
});

test('linkSkillToAgents falla si falta el skill local', () => {
  const r = linkSkillToAgents('no-existe');
  assert.ok(r.error, 'debe reportar error');
  assert.equal(r.linked, false);
});