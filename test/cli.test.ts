import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, readVersion } from '../src/cli.js';

test('parseArgs: positional y flags', () => {
  const { positional, flags } = parseArgs(['init', '--dry-run', '--yes', '--verbose']);
  assert.deepEqual(positional, ['init']);
  assert.equal(flags['dry-run'], true);
  assert.equal(flags['yes'], true);
  assert.equal(flags['verbose'], true);
});

test('parseArgs: --flag=value', () => {
  const { flags } = parseArgs(['doctor', '--format=json']);
  assert.equal(flags['format'], 'json');
});

test('parseArgs: --flag value', () => {
  const { flags } = parseArgs(['init', '--tools', 'opencode,pi']);
  assert.equal(flags['tools'], 'opencode,pi');
});

test('parseArgs: repetida acumula array', () => {
  const { flags } = parseArgs(['init', '--tool', 'a', '--tool', 'b']);
  assert.deepEqual(flags['tool'], ['a', 'b']);
});

test('readVersion: retorna version semver', () => {
  assert.match(readVersion(), /^\d+\.\d+\.\d+$/);
});