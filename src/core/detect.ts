import { exec, resolveCommand } from '../platform/exec.js';

/**
 * Deteccion de herramientas en el entorno. No instala nada: solo reporta
 * que existe, que version, y como se detecto.
 */

export type ToolId = 'opencode' | 'pi' | 'openspec' | 'engram';

export interface ToolDetection {
  id: ToolId;
  present: boolean;
  version: string | null;
  bin: string | null;
  source: 'path' | 'absent';
  error?: string;
}

export interface EnvironmentDetection {
  node: { version: string; present: boolean };
  npm: { version: string; present: boolean };
  opencode: ToolDetection;
  pi: ToolDetection;
  openspec: ToolDetection;
  engram: ToolDetection;
}

function cleanVersion(raw: string): string | null {
  const m = raw.split(/\r?\n/)[0]?.match(/v?(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

async function probe(id: ToolId, command: string): Promise<ToolDetection> {
  const bin = resolveCommand(command);
  if (!bin) return { id, present: false, version: null, bin: null, source: 'absent' };
  try {
    const res = await exec(bin, ['--version']);
    const version = cleanVersion(res.stdout || res.stderr);
    if (res.exitCode === 0) {
      return { id, present: true, version, bin, source: 'path' };
    }
    return {
      id,
      present: true,
      version,
      bin,
      source: 'path',
      error: res.stderr.trim() || `exit ${res.exitCode}`,
    };
  } catch (err) {
    return { id, present: false, version: null, bin: null, source: 'absent', error: err instanceof Error ? err.message : String(err) };
  }
}

async function probeNode(command: string): Promise<{ version: string; present: boolean }> {
  const bin = resolveCommand(command);
  if (!bin) return { version: '', present: false };
  const res = await exec(bin, ['--version']);
  return { version: cleanVersion(res.stdout || res.stderr) ?? '', present: res.exitCode === 0 };
}

export async function detectEnvironment(): Promise<EnvironmentDetection> {
  const node = await probeNode('node');
  const npm = await probeNode('npm');

  return {
    node,
    npm,
    opencode: await probe('opencode', 'opencode'),
    pi: await probe('pi', 'pi'),
    openspec: await probe('openspec', 'openspec'),
    engram: await probe('engram', 'engram'),
  };
}