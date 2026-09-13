import { existsSync, mkdirSync, readdirSync, statSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { jacarandaSkillsDir, agentsSkillsDir, kitRoot } from '../platform/paths.js';
import { linkDir, linkStatus, copyDirSync, unlinkIfLink } from '../platform/links.js';
export { linkStatus };
import { validateSkillDir, validateSkill } from './skill-validation.js';

/**
 * Gestion de skills de Jacaranda.
 *
 * Fuente unica: ~/.jacaranda/skills/<nombre>/SKILL.md.
 *   - bundled: se copian desde el paquete npm (skills/ en kitRoot).
 *   - locales: viven directamente en ~/.jacaranda/skills.
 * Distribucion: enlace a ~/.agents/skills/<nombre>, que opencode y pi leen
 * por convencion (skills/ del agente). En Windows se usa junction (sin admin).
 */

export interface EnsureSkillOptions {
  force?: boolean;
  /** no tocar skills existentes que ya apuntan al origen correcto */
  noRebuild?: boolean;
}

export interface SkillResult {
  id: string;
  kind: 'bundled' | 'local';
  source: string;
  target: string;
  materialized: boolean; // se copio del bundle
  linkedAs?: string; // junction | symlink | copy
  linked: boolean;
  error?: string;
  valid: boolean;
  validationErrors: string[];
}

export function bundledSkillsDir(): string {
  return path.join(kitRoot(), 'skills');
}

function bundledSkillDir(id: string): string {
  return path.join(bundledSkillsDir(), id);
}

export function localSkillDir(id: string): string {
  return path.join(jacarandaSkillsDir(), id);
}

export function agentSkillLinkPath(id: string): string {
  return path.join(agentsSkillsDir(), id);
}

/**
 * Garantiza que ~/.agents/skills exista como directorio real. Si el path es
 * un junction/symlink (apuntando a otro kit, o colgante: target borrado) lo
 * reemplaza por un directorio real, porque los skills se enlazan DENTRO de
 * el y un mkdir recursivo atraviesa el enlace (fallaria ENOENT si colgara).
 */
export function ensureAgentsSkillsRoot(): string {
  const dir = agentsSkillsDir();
  try {
    mkdirSync(dir, { recursive: true });
  } catch (err) {
    // Enlace existente que no resuelve: reemplazalo por un dir real.
    unlinkIfLink(dir);
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Lista de skills disponibles en ~/.jacaranda/skills (local). */
export function listLocalSkills(): string[] {
  if (!existsSync(jacarandaSkillsDir())) return [];
  return readdirSync(jacarandaSkillsDir())
    .filter((e) => statSync(path.join(jacarandaSkillsDir(), e)).isDirectory() && existsSync(path.join(jacarandaSkillsDir(), e, 'SKILL.md')))
    .sort();
}

/**
 * Materializa un skill bundled del paquete hacia ~/.jacaranda/skills.
 * Nunca pisa un skill local existente (el usuario pudo editarlo): si existe,
 * lo deja y reporta materialized=false. Con force, lo reemplaza.
 */
export function materializeBundledSkill(id: string, opts: EnsureSkillOptions = {}): SkillResult {
  const source = bundledSkillDir(id);
  const target = localSkillDir(id);
  const result: SkillResult = {
    id,
    kind: 'bundled',
    source,
    target,
    materialized: false,
    linked: false,
    valid: false,
    validationErrors: [],
  };

  if (!existsSync(path.join(source, 'SKILL.md'))) {
    result.error = `skill bundled no existe en el paquete: ${source}`;
    return result;
  }
  const validation = validateSkill(id, readFileSync(path.join(source, 'SKILL.md'), 'utf8'));
  result.valid = validation.ok;
  result.validationErrors = validation.errors;
  if (!validation.ok) {
    result.error = `skill bundled invalido: ${validation.errors.join('; ')}`;
    return result;
  }

  if (existsSync(target)) {
    if (!opts.force) {
      // Ya hay skill local (quizas editado): no pisotear.
      const existing = validateSkillDir(target);
      result.valid = existing?.ok ?? false;
      result.validationErrors = existing?.errors ?? [];
      result.error = result.valid ? undefined : `skill local existente con errores: ${(existing?.errors ?? []).join('; ')}`;
      return result;
    }
    rmSync(target, { recursive: true, force: true });
  }
  copyDirSync(source, target);
  result.materialized = true;
  const check = validateSkillDir(target);
  result.valid = check?.ok ?? false;
  result.validationErrors = check?.errors ?? [];
  if (!result.valid) result.error = `skill materializado invalido: ${result.validationErrors.join('; ')}`;
  return result;
}

/**
 * Enlaza un skill de ~/.jacaranda/skills hacia ~/.agents/skills con
 * junction/symlink (y copia como fallback). Devuelve el resultado de la
 * operacion sin lanzar.
 */
export function linkSkillToAgents(id: string, opts: EnsureSkillOptions = {}): SkillResult {
  const source = localSkillDir(id);
  const target = agentSkillLinkPath(id);
  const result: SkillResult = {
    id,
    kind: 'local',
    source,
    target,
    materialized: false,
    linked: false,
    valid: false,
    validationErrors: [],
  };
  if (!existsSync(path.join(source, 'SKILL.md'))) {
    result.error = `skill local no existe: ${source} (correr materialize primero)`;
    return result;
  }

  const before = linkStatus(target, source);
  // Si ya apunta al origen correcto, ok sin trabajo.
  if (before.exists && before.link && before.resolved) {
    result.linked = true;
    result.valid = true;
    return result;
  }

  // Si el destino es un dir real (con contenido), no lo pisamos.
  const lr = linkDir(source, target);
  result.linked = lr.created || (before.exists && before.link);
  result.linkedAs = lr.error ? undefined : determineKind(target, source);
  if (lr.error) {
    result.error = lr.error;
  } else {
    result.valid = true;
  }
  return result;
}

function determineKind(target: string, source: string): string {
  const st = linkStatus(target, source);
  if (st.link) {
    // junction vs symlink no se distingue facil; tomamos link
    return 'link';
  }
  return 'copy';
}

/** Encadena materializar + enlazar para una lista de skills. */
export function ensureSkills(ids: string[], opts: EnsureSkillOptions = {}): Promise<SkillResult[]> {
  const results: SkillResult[] = [];
  ensureAgentsSkillsRoot();
  for (const id of ids) {
    const mat = materializeBundledSkill(id, opts);
    const lr = linkSkillToAgents(id, opts);
    results.push({
      ...lr,
      materialized: mat.materialized,
      kind: mat.kind,
      validationErrors: mat.error ? mat.validationErrors : lr.validationErrors,
      valid: mat.materialized ? mat.valid : lr.valid,
      error: mat.error ?? lr.error,
    });
  }
  return Promise.resolve(results);
}