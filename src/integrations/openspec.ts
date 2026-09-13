import { execOrThrow, exec } from '../platform/exec.js';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Integracion con OpenSpec. Delegacion (doctrina): Jacaranda no reinventa
 * OpenSpec; llama `openspec init` (no interactivo, --tools) y verifica con
 * `openspec validate`. No toca openspec/ ya generado por el usuario.
 */

export interface InitOpenSpecOptions {
  tools: Array<'opencode' | 'pi'>;
  cwd?: string;
}

export interface OpenSpecInitResult {
  ok: boolean;
  output: string;
  error?: string;
  projectInitialized: boolean;
}

export interface OpenSpecValidateResult {
  ok: boolean;
  output: string;
  error?: string;
}

/** True si hay un openspec/ (specs/ o project.md) en cwd. */
export function projectHasOpenSpec(cwd: string = process.cwd()): boolean {
  const root = path.join(cwd, 'openspec');
  return existsSync(path.join(cwd, 'openspec', 'project.md')) || existsSync(path.join(root, 'specs')) || existsSync(path.join(cwd, 'openspec', 'commands'));
}

/**
 * `openspec init --tools opencode,pi` no interactivo. Si el proyecto ya
 * tiene openspec/, lo dejamos y reportamos projectInitialized.
 */
export async function openspecInit(opts: InitOpenSpecOptions): Promise<OpenSpecInitResult> {
  const cwd = opts.cwd ?? process.cwd();
  if (projectHasOpenSpec(cwd)) {
    return { ok: true, output: 'openspec/ ya presente en el proyecto; se respeta ospec existente', projectInitialized: true };
  }
  const toolsArg = opts.tools.join(',');
  try {
    const res = await execOrThrow('openspec', ['init', '--tools', toolsArg], { cwd, timeoutMs: 60_000 });
    return { ok: true, output: res.stdout.trim() || res.stderr.trim(), projectInitialized: true };
  } catch (err) {
    return {
      ok: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
      projectInitialized: false,
    };
  }
}

/** Verifica que openspec exista y el proyecto valida (no modifica nada). */
export async function openspecValidate(cwd: string = process.cwd()): Promise<OpenSpecValidateResult> {
  try {
    const res = await execOrThrow('openspec', ['validate'], { cwd, timeoutMs: 60_000 });
    return { ok: true, output: res.stdout.trim() || res.stderr.trim() };
  } catch (err) {
    return { ok: false, output: '', error: err instanceof Error ? err.message : String(err) };
  }
}