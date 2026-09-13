import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opencodeConfigPath, opencodeSkillTargets, opencodeMcpBlock } from '../src/adapters/opencode.js';
import { piAgentDir, piMcpPath, piSkillTargets, piMcpBlock } from '../src/adapters/pi.js';

test('opencode: config path global ~/.config/opencode/opencode.json', () => {
  const p = opencodeConfigPath();
  assert.match(p, /opencode\.json$/);
  assert.ok(!p.includes('AppData'), 'opencode no usa %APPDATA% ni en windows');
});

test('opencode: skill targets incluye ~/.agents/skills', () => {
  const targets = opencodeSkillTargets();
  assert.ok(targets.length >= 1);
  assert.ok(targets[0]!.endsWith('.agents' + '\\skills') || targets[0]!.endsWith('.agents/skills'));
});

test('opencode: mcp block con type local, command array y enabled', () => {
  const block = opencodeMcpBlock('engram', 'npx', ['-y', 'engram-mcp'], { A: '1' });
  assert.deepEqual(block, {
    engram: { type: 'local', command: ['npx', '-y', 'engram-mcp'], enabled: true, environment: { A: '1' } },
  });
  const noArgs = opencodeMcpBlock('x', 'cmd', []);
  assert.deepEqual(noArgs.x, { type: 'local', command: ['cmd'], enabled: true });
});

test('pi: agent dir respeta override PI_CODING_AGENT_DIR', () => {
  const prev = process.env['PI_CODING_AGENT_DIR'];
  process.env['PI_CODING_AGENT_DIR'] = 'C:/tmp/pi-config';
  const dir = piAgentDir();
  process.env['PI_CODING_AGENT_DIR'] = prev === undefined ? '' : prev;
  assert.equal(dir.replace(/\\/g, '/'), 'C:/tmp/pi-config');
});

test('pi: mcp path termina en mcp.json', () => {
  const p = piMcpPath();
  assert.ok(p.endsWith('mcp.json'));
});

test('pi: skill targets incluye ~/.agents/skills', () => {
  assert.ok(piSkillTargets().length >= 1);
});

test('pi: mcp block con estructura mcpServers', () => {
  const block = piMcpBlock('engram', 'npx', ['-y', 'engram-mcp']);
  assert.deepEqual(block.engram, { command: 'npx', args: ['-y', 'engram-mcp'] });
});