import { piConfigDir, piSettingsPath, agentsSkillsDir } from '../platform/paths.js';

/**
 * Adaptador Pi: rutas de config global (~/.pi/agent), MCP (~/.pi/agent/mcp.json),
 * settings y skills globales (~/.pi/agent/skills y ~/.agents/skills).
 * Enlaces via PI_CODING_AGENT_DIR si el usuario lo sobreescribe.
 */

export interface PiMcpServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  [k: string]: unknown;
}

/** Directorio raiz de config global de pi (~/.pi/agent o $PI_CODING_AGENT_DIR). */
export function piAgentDir(): string {
  return piConfigDir();
}

export function piSettings(): string {
  return piSettingsPath();
}

/** Archivo MCP global de pi. */
export function piMcpPath(): string {
  return `${piConfigDir()}${process.platform === 'win32' ? '\\' : '/'}mcp.json`;
}

/** Dirs de skills globales que pi lee (el comun con opencode es ~/.agents/skills). */
export function piSkillTargets(): string[] {
  return [agentsSkillsDir()];
}

/**
 * Bloque MCP de pi: { "mcpServers": { "<server>": { "command": "npx", "args": [...] } } }.
 * Los servidores soportan "type": "http"|"sse"|"command", default "command".
 */
export function piMcpBlock(serverId: string, command: string, args: string[], env?: Record<string, string>): Record<string, PiMcpServer> {
  const block: PiMcpServer = { command };
  if (args.length > 0) block.args = args;
  if (env) block.env = env;
  return { [serverId]: block };
}