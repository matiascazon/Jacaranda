import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPlan, standardDesiredState, toolPresent, type Action, type DesiredState } from '../src/core/plan.js';
import { emptyManifest } from '../src/core/manifest.js';
import { detectEnvironment, type EnvironmentDetection } from '../src/core/detect.js';

function fakeEnv(present: Array<'opencode' | 'pi' | 'openspec' | 'engram'>): EnvironmentDetection {
  const mk = (id: 'opencode' | 'pi' | 'openspec' | 'engram') => ({
    id,
    present: present.includes(id),
    version: present.includes(id) ? '1.0.0' : null,
    bin: present.includes(id) ? `/usr/bin/${id}` : null,
    source: present.includes(id) ? ('path' as const) : ('absent' as const),
  });
  return {
    node: { version: '22.0.0', present: true },
    npm: { version: '10.0.0', present: true },
    opencode: mk('opencode'),
    pi: mk('pi'),
    openspec: mk('openspec'),
    engram: mk('engram'),
  };
}

function installActions(actions: Action[]): Action[] {
  return actions.filter((a) => a.kind === 'instalar-tool' || a.kind === 'instalar-engram');
}

test('plan: entorno vacio genera instalaciones y configuracion', () => {
  const env = fakeEnv([]);
  const plan = buildPlan(env, emptyManifest());
  const installs = installActions(plan.actions);
  assert.deepEqual(
    installs.map((a) => a.tool).sort(),
    ['engram', 'opencode', 'openspec', 'pi'],
  );
  const opencode = installs.find((a) => a.tool === 'opencode');
  assert.equal(opencode?.npmPackage, 'opencode-ai');
  const pi = installs.find((a) => a.tool === 'pi');
  assert.equal(pi?.npmPackage, '@earendil-works/pi-coding-agent');
  const engram = installs.find((a) => a.kind === 'instalar-engram');
  assert.ok(engram, 'engram se instala asistido');
  assert.ok(!toolPresent(env, 'opencode'));
});

test('plan: sin engram no hay setup-engram ni config', () => {
  const env = fakeEnv(['opencode']);
  const plan = buildPlan(env, emptyManifest());
  assert.ok(!plan.actions.some((a) => a.kind === 'setup-engram'));
});

test('plan: con engram y opencode, setup-engram para agentes presentes', () => {
  const env = fakeEnv(['opencode', 'pi', 'engram']);
  const plan = buildPlan(env, emptyManifest());
  const setups = plan.actions.filter((a) => a.kind === 'setup-engram');
  assert.equal(setups.length, 2);
  assert.deepEqual(setups.map((a) => a.agents).flat().sort(), ['opencode', 'pi']);
  assert.ok(!plan.actions.some((a) => a.kind === 'instalar-tool' && (a.tool === 'opencode' || a.tool === 'pi' || a.tool === 'engram')));
});

test('plan: skills y mcp siempre planeados', () => {
  const env = fakeEnv(['opencode', 'pi', 'openspec', 'engram']);
  const plan = buildPlan(env, emptyManifest());
  const skills = plan.actions.filter((a) => a.kind === 'link-skills');
  assert.ok(skills.some((a) => a.skill === 'openspec-sdd'));
  assert.ok(skills.some((a) => a.skill === 'engram-memory'));
  const mcp = plan.actions.filter((a) => a.kind === 'mcp-config');
  assert.ok(mcp.some((a) => a.id === 'mcp-engram'));
});

test('plan: instalar-tool no pisa herramientas presentes', () => {
  const env = fakeEnv(['opencode', 'openspec']);
  const plan = buildPlan(env, emptyManifest());
  const installs = installActions(plan.actions);
  assert.deepEqual(installs.map((a) => a.tool).sort(), ['engram', 'pi']);
});

test('plan: accion instalar-tool tiene npmPackage correcto por tool', () => {
  const desired: DesiredState = {
    ...standardDesiredState(),
    tools: [{ id: 'openspec', npm: '@fission-ai/openspec' }],
  };
  const env = fakeEnv([]);
  const plan = buildPlan(env, emptyManifest(), desired);
  const install = installActions(plan.actions).find((a) => a.tool === 'openspec');
  assert.equal(install?.npmPackage, '@fission-ai/openspec');
});

test('plan: integracion con deteccion real (entorno CI)', async () => {
  const env = await detectEnvironment();
  const plan = buildPlan(env, emptyManifest());
  assert.equal(Array.isArray(plan.actions), true);
  assert.equal(Array.isArray(plan.gaps), true);
  // no lanza y da un conjunto razonable de acciones
  assert.ok(plan.actions.length >= 4);
});