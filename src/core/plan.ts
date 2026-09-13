import type { EnvironmentDetection, ToolId } from './detect.js';
import type { Manifest } from './manifest.js';

/**
 * Planificador: estado deseado vs. estado actual (deteccion + manifest)
 * => lista ordenada de acciones idempotentes. Las acciones son datos puros;
 * la ejecucion la hace commands/init respetando prompts/dry-run.
 *
 * Orden de dos pasadas:
 *   1) instalar/asegurar tools (opencode, pi, openspec, engram)
 *   2) configurar (engram setup por agente, openspec init, skills, mcp)
 */

export type ToolKey = ToolId;

export interface ToolDesired {
  id: ToolKey;
  /** Paquete npm global para instalar el tool; ausente si no aplica. */
  npm?: string;
  /** Instala via mecanismo asistido propio (engram binary), no npm. */
  assistedInstall?: boolean;
}

export interface SkillDesired {
  id: string;
  /** La skill viene del bundle del kit (skills/) o ya es local del repo. */
  bundled?: boolean;
}

export interface MCPDesired {
  id: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface DesiredState {
  tools: ToolDesired[];
  skills: SkillDesired[];
  mcp: MCPDesired[];
}

export type ActionKind =
  | 'instalar-tool'
  | 'instalar-engram'
  | 'setup-engram'
  | 'init-openspec'
  | 'link-skills'
  | 'mcp-config';

export interface Action {
  kind: ActionKind;
  id: string;
  title: string;
  detail?: string;
  // campos dependientes de kind
  tool?: ToolKey;
  npmPackage?: string;
  agents?: Array<'opencode' | 'pi'>;
  skill?: string;
  // resultado en ejecucion (reporte post)
  status?: 'pendiente' | 'ok' | 'skipped' | 'fail';
  message?: string;
}

export interface Plan {
  actions: Action[];
  desired: DesiredState;
  gaps: string[];
}

export function standardDesiredState(): DesiredState {
  return {
    tools: [
      { id: 'opencode', npm: 'opencode-ai' },
      { id: 'pi', npm: '@earendil-works/pi-coding-agent' },
      { id: 'openspec', npm: '@fission-ai/openspec' },
      { id: 'engram', assistedInstall: true },
    ],
    skills: [{ id: 'openspec-sdd', bundled: true }, { id: 'engram-memory', bundled: true }],
    mcp: [
      {
        id: 'engram',
        command: 'npx',
        args: ['-y', 'engram-mcp', '--config', 'path/to/config.json'],
      },
    ],
  };
}

export function toolPresent(env: EnvironmentDetection, id: ToolId): boolean {
  switch (id) {
    case 'opencode':
      return env.opencode.present;
    case 'pi':
      return env.pi.present;
    case 'openspec':
      return env.openspec.present;
    case 'engram':
      return env.engram.present;
  }
}

export function buildPlan(env: EnvironmentDetection, _manifest: Manifest, desired: DesiredState = standardDesiredState()): Plan {
  const actions: Action[] = [];
  const gaps: string[] = [];
  const agents: Array<'opencode' | 'pi'> = ['opencode', 'pi'];

  // ---- Pasada 1: tools ----------------------------------------------------
  for (const tool of desired.tools) {
    if (toolPresent(env, tool.id)) continue;
    if (tool.npm) {
      actions.push({
        kind: 'instalar-tool',
        id: `install-${tool.id}`,
        title: `Instalar ${tool.id} (npm global)`,
        tool: tool.id,
        npmPackage: tool.npm,
        detail: `npm install -g ${tool.npm}`,
      });
    } else if (tool.assistedInstall) {
      actions.push({
        kind: 'instalar-engram',
        id: 'install-engram',
        title: 'Instalar Engram (binario asistido)',
        tool: 'engram',
        detail: 'instalacion asistida: brew (mac/linux) o binario release de GitHub (windows).',
      });
    }
    gaps.push(tool.id);
  }

  // ---- Pasada 2: configuracion -------------------------------------------
  // engram setup por agente: requiere engram instalado y el agente presente.
  if (toolPresent(env, 'engram')) {
    for (const agent of agents) {
      if (!toolPresent(env, agent)) continue;
      actions.push({
        kind: 'setup-engram',
        id: `engram-${agent}`,
        title: `Engram: setup MCP para ${agent}`,
        tool: 'engram',
        agents: [agent],
        detail: `engram setup ${agent} (delegado al CLI oficial de Engram).`,
      });
    }
  }

  // openspec init solo si openspec presente y sin project.yaml gestionado por Jacaranda.
  if (toolPresent(env, 'openspec')) {
    actions.push({
      kind: 'init-openspec',
      id: 'init-openspec',
      title: 'Inicializar OpenSpec: agent setup',
      detail: 'openspec init --tools opencode,pi (delegado; respeta proyecto OpenSpec existente).',
    });
  }

  // Skills: materializar el bundle en ~/.jacaranda/skills y enlazar a ~/.agents/skills.
  for (const skill of desired.skills) {
    actions.push({
      kind: 'link-skills',
      id: `link-${skill.id}`,
      title: `Skill ${skill.id}: materializar y enlazar`,
      skill: skill.id,
      agents,
      detail: `${skill.bundled ? 'bundled' : 'local'} -> ~/.agents/skills/${skill.id}`,
    });
  }

  // MCP: verificar/patchear configs de opencode y pi; engram setup suele
  // crearlos, pero la accion valida y repara si falta bloque.
  for (const mcp of desired.mcp) {
    actions.push({
      kind: 'mcp-config',
      id: `mcp-${mcp.id}`,
      title: `Verificar/instalar MCP ${mcp.id} en opencode y pi`,
      detail: `${mcp.command} ${mcp.args.join(' ')}`,
    });
  }

  // Acciones unicas para no repetir warnings MCP-server si no hay configs.
  const unique = new Map<string, Action>();
  for (const action of actions) unique.set(action.id, action);
  return { actions: [...unique.values()], desired, gaps };
}