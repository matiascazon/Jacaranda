import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Rutas canonicas de Jacaranda y de los agentes, por plataforma.
 * Todas las rutas globales de Jacaranda viven bajo JACARANDA_HOME
 * (default: ~/.jacaranda). se puede sobreescribir con la env var
 * JACARANDA_HOME para testing o instalaciones portables.
 */

function expandHome(p: string): string {
  return p === '~' ? homedir() : p.startsWith('~/') ? path.join(homedir(), p.slice(2)) : p;
}

export function jacarandaHome(): string {
  const env = process.env['JACARANDA_HOME'];
  return path.resolve(env && env.length > 0 ? expandHome(env) : path.join(homedir(), '.jacaranda'));
}

export function jacarandaSkillsDir(): string {
  return path.join(jacarandaHome(), 'skills');
}

export function jacarandaManifestPath(): string {
  return path.join(jacarandaHome(), 'state.json');
}

export function jacarandaBackupsDir(): string {
  return path.join(jacarandaHome(), 'backups');
}

export function jacarandaLockPath(): string {
  return path.join(jacarandaHome(), 'init.lock');
}

/**
 * Directorio global de skills de agente agnosticador. OpenCode y Pi lo
 * leen por defecto; Claude/Codex usan sus propios directorios, que se
 * agregan en sus adapters. Override con JACARANDA_AGENTS_SKILLS (tests).
 */
export function agentsSkillsDir(): string {
  const env = process.env['JACARANDA_AGENTS_SKILLS'];
  return path.resolve(env && env.length > 0 ? env : path.join(homedir(), '.agents', 'skills'));
}

/**
 * OpenCode usa ~/.config/opencode TAMBIEN en Windows (no %APPDATA%).
 * Confirmado contra la documentacion oficial de setup de Engram.
 */
export function opencodeConfigDir(): string {
  const xdg = process.env['XDG_CONFIG_HOME'];
  return path.resolve(xdg && xdg.length > 0 ? path.join(xdg, 'opencode') : path.join(homedir(), '.config', 'opencode'));
}

export function opencodeGlobalConfigPath(): string {
  return path.join(opencodeConfigDir(), 'opencode.json');
}

export function opencodePluginsDir(): string {
  return path.join(opencodeConfigDir(), 'plugins');
}

/**
 * Directorio global de config de Pi. Pi usa ~/.pi/agent/ (override con
 * PI_CODING_AGENT_DIR). settings.json vive en ~/.pi/ y el override de MCP
 * en ~/.pi/agent/mcp.json.
 */
export function piConfigDir(): string {
  const env = process.env['PI_CODING_AGENT_DIR'];
  return env && env.length > 0 ? path.resolve(env) : path.join(homedir(), '.pi', 'agent');
}

export function piSettingsPath(): string {
  return path.join(homedir(), '.pi', 'settings.json');
}

/** Ruta al repo del kit si estamos corriendo desde un checkout (dev). */
export function kitRoot(): string {
  return path.resolve(fileURLToPath(new URL('../../', import.meta.url)), '..');
}