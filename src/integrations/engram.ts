import { execOrThrow, exec } from '../platform/exec.js';
import type { Manifest } from '../core/manifest.js';

/**
 * Integracion con Engram. Regla de la doctrina: Jacaranda NUNCA escribe
 * configs de MCP de engram directamente; delega en `engram setup <agent>`
 * (el CLI oficial conoce el formato correcto por agente). El fallback MCP
 * aqui solo verifica/repara cadenas de arranque cuando engram no esta.
 */

export type AgentSlug = string;

export interface EngramSetupResult {
  agent: AgentSlug;
  ok: boolean;
  output: string;
  error?: string;
}

export interface VerifyEngramResult {
  present: boolean;
  version: string | null;
  bin: string | null;
  error?: string;
}

export function verifyEngram(): Promise<VerifyEngramResult> {
  return exec('engram', ['--version']).then((res) => {
    if (res.exitCode !== 0) {
      return { present: false, version: null, bin: null, error: `engram --version fallo: ${res.stderr.trim() || res.stdout.trim()}` };
    }
    const m = res.stdout.match(/v?(\d+\.\d+\.\d+)/);
    return { present: true, version: m ? m[1] : null, bin: null };
  });
}

/**
 * Delegacion a `engram setup <agent>`. Antes verifica que el agente este
 * instalado (engram no puede configurar un binario ausente).
 */
export async function setupEngramForAgent(agent: AgentSlug, _manifest?: Manifest): Promise<EngramSetupResult> {
  const bin = await exec(agent, ['--version']);
  if (bin.exitCode !== 0) {
    return { agent, ok: false, output: '', error: `agente ${agent} no esta instalado; correr init primero` };
  }
  try {
    const res = await execOrThrow('engram', ['setup', agent], { timeoutMs: 60_000 });
    return { agent, ok: true, output: res.stdout.trim() || res.stderr.trim() };
  } catch (err) {
    return {
      agent,
      ok: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Fallback MCP solo cuando engram no este instalado: reporta la config
 * deseada para que el usuario la aplique en opencode/pi (JSONC valido).
 * Usa el formato opencode (command como array, enabled) y el bloque pi
 * correspondiente segun el agente.
 * Nunca pisa configs existentes.
 */
export function mcpFallbackBlock(serverId: string, command: string, args: string[], env?: Record<string, string>): unknown {
  return {
    [`mcp.${serverId}`]: {
      type: 'local',
      command: [command, ...args],
      enabled: true,
      ...(env ? { environment: env } : {}),
    },
    [`mcpServers.${serverId}`]: {
      command,
      args,
      ...(env ? { env } : {}),
    },
  };
}