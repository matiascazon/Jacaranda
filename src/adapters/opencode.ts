import { opencodeGlobalConfigPath, agentsSkillsDir } from '../platform/paths.js';

/**
 * Adaptador OpenCode: paths de config global, target de skills y layout de
 * MCP. OpenCode usa ~/.config/opencode/ TAMBIEN en Windows, y skills de
 * ~/.agents/skills (Claude-compatible) o ~/.config/opencode/skills.
 * Se opta por ~/.agents/skills como fuente comun con Pi.
 */

export interface McpServerBlock {
  command: string[];
  environment?: Record<string, string>;
  type?: string;
  enabled?: boolean;
  [k: string]: unknown;
}

export function opencodeConfigPath(): string {
  return opencodeGlobalConfigPath();
}

/** Directorio de skills global que OpenCode lee y que Jacaranda enlaza. */
export function opencodeSkillTargets(): string[] {
  return [agentsSkillsDir()];
}

/**
 * Bloque MCP tal como lo espera opencode.json v1:
 * { "mcp": { "<server>": { "type": "local", "command": ["npx", "-y", ...], "enabled": true } } }
 * En opencode `command` es un ARRAY completo (ejecutable + args), no string.
 */
export function opencodeMcpBlock(serverId: string, command: string, args: string[], env?: Record<string, string>): Record<string, McpServerBlock> {
  const block: McpServerBlock = { type: 'local', command: [command, ...args], enabled: true };
  if (env) block.environment = env;
  return { [serverId]: block };
}