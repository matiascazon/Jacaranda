import type { CliOptions } from '../cli.js';
import { createIo, type Io } from './io.js';
import { detectEnvironment, type EnvironmentDetection } from '../core/detect.js';
import { buildPlan, standardDesiredState, type Action, type Plan } from '../core/plan.js';
import { emptyManifest, loadManifest, saveManifest, registerTool, markToolDetected, createBackup, addWrittenFile, type Manifest } from '../core/manifest.js';
import { execOrThrow } from '../platform/exec.js';
import { ensureSkills, type EnsureSkillOptions } from '../core/skills.js';
import { setupEngramForAgent } from '../integrations/engram.js';
import { openspecInit } from '../integrations/openspec.js';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { jacarandaHome, jacarandaLockPath } from '../platform/paths.js';
import { readJsonFile, writeJsonAtomic, mergeDeep, diffValue } from '../core/config-edit.js';
import { opencodeConfigPath, opencodeMcpBlock } from '../adapters/opencode.js';
import { piMcpPath, piMcpBlock } from '../adapters/pi.js';

export interface InitResult {
  exited: boolean;
  code: number;
}

/**
 * jacaranda init: orquesta la instalacion/configuracion del entorno.
 * Idempotente: solo ejecuta acciones que faltan (deteccion + manifest).
 * --dry-run/--yes/--verbose/--force modifican el comportamiento.
 */

export async function runInit(options: CliOptions): Promise<number> {
  const io = createIo({ verbose: options.verbose, yes: options.yes });
  if (options.dryRun) {
    io.log('Modo --dry-run: se muestra el plan sin ejecutar nada.');
  }

  // Lock exlcusivo simple contra corridas concurrentes.
  if (!acquireLock(io)) {
    io.error('Otro jacaranda init ya esta en curso (init.lock existe).');
    return 1;
  }
  try {
    return await run(options, io);
  } finally {
    releaseLock();
  }
}

async function run(options: CliOptions, io: Io): Promise<number> {
  io.log('Detectando entorno...');
  const env: EnvironmentDetection = await detectEnvironment();
  if (!env.node.present) {
    io.error('Jacaranda requiere Node.js >= 20. Instala Node y reintenta.');
    return 1;
  }
  if (env.node.version && Number.parseInt(env.node.version.split('.')[0] ?? '0', 10) < 20) {
    io.error(`Node ${env.node.version} detectado; se requiere >= 20 (OpenSpec lo exige). Actualiza Node.`);
    return 1;
  }

  let manifest = loadManifest();
  manifest = {
    ...manifest,
    toolchains: {
      node: { version: env.node.version, detected: env.node.present },
      npm: { version: env.npm.version, detected: env.npm.present },
    },
  };
  if (env.opencode.present) markToolDetected(manifest, 'opencode', env.opencode.version ?? '');
  if (env.pi.present) markToolDetected(manifest, 'pi', env.pi.version ?? '');
  if (env.openspec.present) markToolDetected(manifest, 'openspec', env.openspec.version ?? '');
  if (env.engram.present) markToolDetected(manifest, 'engram', env.engram.version ?? '');

  io.log(
    `entorno: node ${env.node.version || '?'} | npm ${env.npm.version || '?'} | ` +
      `opencode ${env.opencode.present ? env.opencode.version ?? '?' : 'ausente'} | ` +
      `pi ${env.pi.present ? env.pi.version ?? '?' : 'ausente'} | ` +
      `openspec ${env.openspec.present ? env.openspec.version ?? '?' : 'ausente'} | ` +
      `engram ${env.engram.present ? env.engram.version ?? '?' : 'ausente'}`,
  );

  const plan: Plan = buildPlan(env, manifest, standardDesiredState());
  if (plan.gaps.length > 0) {
    io.log(`Pendientes de instalar: ${plan.gaps.join(', ')}`);
  }

  if (options.dryRun) {
    io.log('\nPlan de accion (dry-run):');
    for (const action of plan.actions) {
      io.log(`  - [${action.kind}] ${action.title}${action.detail ? `\n      ${action.detail}` : ''}`);
    }
    io.log('\nNo se ejecuto ninguna accion (--dry-run).');
    return 0;
  }

  io.log('\nEjecutando plan:');
  let failures = 0;
  for (const action of plan.actions) {
    const result = await executeAction(action, env, manifest, options, io);
    if (result === 'skip') {
      io.log(`  - ${action.title}: omitido`);
    } else if (result === 'ok') {
      io.log(`  - ${action.title}: OK`);
      action.status = 'ok';
    } else {
      io.log(`  - ${action.title}: FALLO (${result})`);
      action.status = 'fail';
      failures++;
    }
  }

  saveManifest(manifest);

  if (failures === 0) {
    io.log('\nEntorno configurado. Abre un proyecto y prueba: opencode / pi.');
    return 0;
  }
  io.warn(`${failures} accion(es) no completaron. Revisa los mensajes y corre jacaranda doctor.`);
  return 1;
}

type ActionOutcome = 'ok' | 'skip' | string;

async function executeAction(action: Action, env: EnvironmentDetection, manifest: Manifest, options: CliOptions, io: Io): Promise<ActionOutcome> {
  switch (action.kind) {
    case 'instalar-tool': {
      const pkg = action.npmPackage;
      if (!pkg) return 'sin paquete npm';
      if (!(await confirmInstall(io, `Instalar ${action.tool} (npm global): ${pkg}?`, options.yes))) return 'skip (no aprobado)';
      try {
        await execOrThrow('npm', ['install', '-g', pkg], { timeoutMs: 180_000 });
        if (action.tool) registerTool(manifest, action.tool, 'instalado');
        return 'ok';
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    }

    case 'instalar-engram': {
      // Engram se instala asistido por plataforma; ninguno de los canales es
      // npm. Mostramos la guia y esperamos confirmacion del comando.
      if (env.engram.present) return 'skip (ya instalado)';
      const guide = engramInstallGuide();
      if (!(await confirmInstall(io, `Instalar Engram? ${guide.command}`, options.yes))) return 'skip (no aprobado)';
      try {
        await execOrThrow(guide.command, guide.args, { timeoutMs: 180_000 });
        return 'ok';
      } catch (err) {
        return `fallo instalacion asistida: ${err instanceof Error ? err.message : String(err)} (instalalo manualmente)`;
      }
    }

    case 'setup-engram': {
      const agent = action.agents?.[0] ?? 'opencode';
      if (!env.engram.present) return 'skip (engram ausente)';
      if (agent === 'opencode' && !env.opencode.present) return 'skip (opencode ausente)';
      if (agent === 'pi' && !env.pi.present) return 'skip (pi ausente)';
      const res = await setupEngramForAgent(agent, manifest);
      return res.ok ? 'ok' : `fallo engram setup: ${res.error ?? '?'}`;
    }

    case 'init-openspec': {
      const res = await openspecInit({ tools: ['opencode', 'pi'] });
      return res.ok ? 'ok' : `fallo openspec init: ${res.error ?? '?'}`;
    }

    case 'link-skills': {
      const ids = (action.skill ? [action.skill] : []).filter(Boolean);
      if (ids.length === 0) return 'sin skill';
      const opts: EnsureSkillOptions = { force: options.force };
      const results = await ensureSkills(ids, opts);
      const failed = results.filter((r) => r.error && !r.linked);
      if (failed.length > 0) return `skill invalida: ${failed.map((f) => f.error).join('; ')}`;
      return 'ok';
    }

    case 'mcp-config': {
      return ensureMcpBlocks(manifest, options, io);
    }

    default:
      return 'accion desconocida';
  }
}

/**
 * Verifica que el bloque MCP de engram este en opencode.json y pi mcp.json.
 * Solo escribe si falta; antes hace backup y registra en manifest.
 */
async function ensureMcpBlocks(manifest: Manifest, options: CliOptions, io: Io): Promise<ActionOutcome> {
  const servers = [
    {
      id: 'engram',
      command: 'npx',
      args: ['-y', 'engram-mcp'],
      env: undefined as Record<string, string> | undefined,
    },
  ];
  let failures = 0;
  for (const server of servers) {
    for (const target of [{ kind: 'opencode', file: opencodeConfigPath() }, { kind: 'pi', file: piMcpPath() }]) {
      const changed = await ensureMcpBlockInFile(target.file, target.kind as 'opencode' | 'pi', server.id, server.command, server.args, server.env, options, io, manifest);
      if (!changed) failures++;
    }
  }
  return failures === 0 ? 'ok' : 'algun MCP no se escribio';
}

/** Exportado para tests: asegura el bloque MCP en un archivo sin pisar el resto. */
export async function ensureMcpBlockInFile(
  file: string,
  kind: 'opencode' | 'pi',
  serverId: string,
  command: string,
  args: string[],
  _env: Record<string, string> | undefined,
  options: CliOptions,
  io: Io,
  manifest: Manifest,
): Promise<boolean> {
  if (options.dryRun) {
    io.debug(`[dry-run] MCP ${serverId} se agregaria a ${file}`);
    return false;
  }
  const block = kind === 'opencode' ? opencodeMcpBlock(serverId, command, args) : piMcpBlock(serverId, command, args);
  const key = kind === 'opencode' ? 'mcp' : 'mcpServers';

  let current: unknown = {};
  if (existsSync(file)) {
    try {
      current = readJsonFile(file);
    } catch (err) {
      io.debug(`config ${file} no parsea como JSONC: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  const patch = { [key]: block };
  const merged = mergeDeep(current, patch);
  const diff = diffValue(current, merged);
  if (diff.length === 0) {
    io.debug(`MCP ${serverId} ya en ${file}`);
    // Re-baseline: opencode/pi pueden reformatear el archivo (agregar $schema,
    // reordenar claves) => re-registra el digerido actual para que doctor no
    // lo marque como modificado fuera de banda para siempre.
    addWrittenFile(manifest, file, `MCP ${serverId} (${kind})`, kind === 'opencode' ? 'opencode' : 'pi');
    return true;
  }

  // Backup antes de tocar el archivo del usuario.
  createBackup(manifest, file);
  writeJsonAtomic(file, merged);
  addWrittenFile(manifest, file, `MCP ${serverId} (${kind})`, kind === 'opencode' ? 'opencode' : 'pi');
  io.log(`  MCP ${serverId} agregado a ${file} (backup en ~/.jacaranda/backups)`);
  return true;
}

function engramInstallGuide(): { command: string; args: string[] } {
  const plat = process.platform;
  if (plat === 'win32') {
    return { command: 'winget', args: ['install', 'Gentleman-Programming.engram'] };
  }
  if (plat === 'darwin') {
    return { command: 'brew', args: ['install', 'engram'] };
  }
  return { command: 'curl', args: ['-fsSL', 'https://get.engram.dev', '|', 'sh'] };
}

async function confirmInstall(io: Io, q: string, yes: boolean): Promise<boolean> {
  if (yes) return true;
  return io.confirm(q);
}

function acquireLock(io: Io): boolean {
  try {
    if (existsSync(jacarandaLockPath())) {
      io.warn('init.lock ya existe (otra corrida?). Si no es el caso, borralo manualmente.');
      return false;
    }
    mkdirSync(jacarandaHome(), { recursive: true });
    const lock = `${process.pid}\n${new Date().toISOString()}\n`;
    writeFileSync(jacarandaLockPath(), lock, 'utf8');
    return true;
  } catch (err) {
    io.error(`no se pudo crear lock: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

function releaseLock(): void {
  try {
    if (existsSync(jacarandaLockPath())) rmSync(jacarandaLockPath(), { force: true });
  } catch {
    // best-effort
  }
}