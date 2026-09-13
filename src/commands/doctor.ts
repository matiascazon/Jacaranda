import type { CliOptions } from '../cli.js';
import { createIo, type Io } from './io.js';
import { detectEnvironment } from '../core/detect.js';
import { loadManifest, sha256, listBackups } from '../core/manifest.js';
import { listLocalSkills, agentSkillLinkPath, linkStatus } from '../core/skills.js';
import { existsSync } from 'node:fs';
import { agentsSkillsDir, jacarandaHome } from '../platform/paths.js';

/**
 * jacaranda doctor: diagnostica el entorno sin modificar nada. Reporta
 * herramientas, configs, skills y el estado del manifest/backups.
 */

export interface DoctorSummary {
  ok: boolean;
  lines: string[];
}

export async function runDoctor(options: CliOptions): Promise<number> {
  const io = createIo({ verbose: options.verbose });
  const summary = await diagnose(io);
  for (const line of summary.lines) io.log(line);
  return summary.ok ? 0 : 1;
}

export async function diagnose(io: Io): Promise<DoctorSummary> {
  const env = await detectEnvironment();
  const manifest = loadManifest();
  const lines: string[] = [];
  let ok = true;

  const check = (label: string, detail: string, good: boolean) => {
    lines.push(`  ${good ? 'ok ' : '!!'} ${label}: ${detail}`);
    if (!good) ok = false;
  };

  lines.push('Entorno:');
  check('node', env.node.present ? env.node.version : 'ausente (requerido >= 20)', env.node.present);
  check('npm', env.npm.present ? env.npm.version : 'ausente', env.npm.present);

  lines.push('Herramientas:');
  for (const t of ['opencode', 'pi', 'openspec', 'engram'] as const) {
    const d = env[t];
    check(t, d.present ? `${d.version ?? 'version?'} (${d.bin ?? '?'})` : 'no instalado', d.present);
  }

  lines.push('Skills:');
  const locals = listLocalSkills();
  if (locals.length === 0) {
    lines.push('  -- no hay skills en ~/.jacaranda/skills (configuras con jacaranda init)');
  } else {
    for (const id of locals) {
      const st = linkStatus(agentSkillLinkPath(id), `${jacarandaHome()}/skills/${id}`);
      if (st.link && st.resolved) {
        lines.push(`  ok ${id}: enlazada a ~/.agents/skills`);
      } else if (st.link && st.broken) {
        lines.push(`  !! ${id}: enlace roto en ~/.agents/skills (reparar con jacaranda init)`);
        ok = false;
      } else {
        lines.push(`  -- ${id}: no enlazada (falta jacaranda init)`);
      }
    }
  }
  const ag = agentsSkillsDir();
  if (existsSync(ag)) lines.push(`  directorio agente: ${ag}`);

  lines.push('Manifest:');
  check('state.json', `${jacarandaHome()}/state.json`, existsSync(`${jacarandaHome()}/state.json`));
  const registered = Object.entries(manifest.tools);
  if (registered.length > 0) {
    for (const [tool, info] of registered) {
      lines.push(`  ${tool}: v${info.version} ${info.installed ? '(instalado)' : '(detectado)'}`);
    }
  }
  const backups = listBackups(manifest);
  if (backups.length > 0) lines.push(`  backups: ${backups.length} entrada(s) en ~/.jacaranda/backups`);
  if (manifest.jacarandaVersion) lines.push(`  jacaranda manifest version: ${manifest.jacarandaVersion}`);

  // Verificar configs registradas estan intactas (no modificadas por el usuario).
  const drifts: string[] = [];
  for (const est of manifest.established) {
    for (const file of est.files ?? []) {
      if (!existsSync(file.path)) drifts.push(`${file.path} (borrado)`);
      else if (sha256(file.path) !== file.checksum) drifts.push(`${file.path} (modificado fuera de Jacaranda)`);
    }
  }
  if (drifts.length > 0) {
    lines.push('Configs modificadas fuera de banda:');
    for (const d of drifts) {
      lines.push(`  !! ${d}`);
      ok = false;
    }
  }

  if (ok) lines.push('\nEstado general: OK.');
  else lines.push('\nEstado general: hay pendientes. Corre jacaranda init.');
  return { ok, lines };
}