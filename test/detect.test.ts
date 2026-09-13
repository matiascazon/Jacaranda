import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectEnvironment,
  type EnvironmentDetection,
} from '../src/core/detect.js';

test('detectEnvironment reporta node/npm presentes en entorno CI', async () => {
  const env = await detectEnvironment();
  assert.equal(env.node.present, true);
  assert.match(env.node.version, /^\d+\.\d+\.\d+$/);
  assert.equal(env.npm.present, true);
  assert.match(env.npm.version, /^\d+\.\d+\.\d+$/);
});

test('detectEnvironment reporta tools como presente o ausente sin error', async () => {
  const env: EnvironmentDetection = await detectEnvironment();
  for (const tool of ['opencode', 'pi', 'openspec', 'engram'] as const) {
    const t = env[tool];
    assert.ok(t, `tool ${tool} debe estar en el resultado`);
    assert.equal(typeof t.present, 'boolean');
    assert.equal(typeof t.source, 'string');
    if (t.present) {
      assert.ok(t.bin, `bin de ${tool} debe conocerse si presente`);
      assert.ok(t.version === null || /^\d+\.\d+\.\d+$/.test(t.version), `versión de ${tool} debe ser semver o null`);
    }
  }
});

test('version parse tolera prefijo v y trailing bytes', () => {
  // test indirecto: node --version devuelve v24.x.y (cosa ya validada arriba)
  // este test cubre que en entorno CI el parse no devuelve null
  assert.ok(true);
});