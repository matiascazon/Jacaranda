import { existsSync, lstatSync, readlinkSync, rmSync, symlinkSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { platform } from 'node:os';

export type LinkKind = 'junction' | 'symlink' | 'copy';

export interface LinkResult {
  kind: LinkKind;
  created: boolean;
  replaced: boolean;
  broken: boolean;
  error?: string;
}

function isWin(): boolean {
  return platform() === 'win32';
}

/** Copia recursiva minima (sin seguir symlinks) para fallback copy. */
export function copyDirSync(source: string, target: string): void {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dst = path.join(target, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      copyDirSync(src, dst);
    } else if (entry.isFile()) {
      copyFileSync(src, dst);
    }
  }
}

function isSymbolicLink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

export function linkTarget(p: string): string | null {
  try {
    return readlinkSync(p);
  } catch {
    return null;
  }
}

/**
 * Crea un enlace `target` apuntando a `source`, o copia si los enlaces no
 * estan disponibles. En Windows unjunction (sin admin). Reemplaza un link
 * existente roto/apuntando a otra parte, pero NUNCA un directorio real
 * con contenido, ni un archivo real.
 */
export function linkDir(source: string, target: string, opts: { preferCopy?: boolean } = {}): LinkResult {
  const result: LinkResult = { kind: 'copy', created: false, replaced: false, broken: false };

  if (!existsSync(source)) {
    result.error = `origen inexistente: ${source}`;
    return result;
  }

  const parent = path.dirname(target);
  mkdirSync(parent, { recursive: true });

  // Si ya hay un directorio real con contenido, no lo tocamos.
  if (existsSync(target)) {
    const stat = lstatSync(target);
    if (!stat.isSymbolicLink()) {
      result.error = `destino existe y no es un enlace (no se toca): ${target}`;
      return result;
    }
    const current = linkTarget(target);
    const resolved = current !== null && path.resolve(path.dirname(target), current) === path.resolve(source);
    if (resolved) {
      result.replaced = false;
      result.broken = false;
      result.created = false;
      result.kind = linkKindOf(target);
      return result; // ya apunta al origen correcto
    }
    rmSync(target, { recursive: true, force: true });
    result.replaced = true;
  }

  if (!opts.preferCopy && isWin()) {
    try {
      symlinkSync(source, target, 'junction');
      result.kind = 'junction';
      result.created = true;
      return result;
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
    }
  } else if (!opts.preferCopy) {
    try {
      symlinkSync(source, target, 'dir');
      result.kind = 'symlink';
      result.created = true;
      return result;
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
    }
  }

  // Fallback: copia fisica.
  try {
    copyDirSync(source, target);
    result.kind = 'copy';
    result.created = true;
    result.error = undefined;
    return result;
  } catch (err) {
    result.error = `${result.error ?? ''}; copia fallo: ${err instanceof Error ? err.message : String(err)}`.trim();
    return result;
  }
}

function linkKindOf(p: string): LinkKind {
  return isWin() ? 'junction' : 'symlink';
}

/**
 * Elimina un enlace (no contenido real), incluidos los colgantes (dangling:
 * apuntan a un target inexistente, donde existsSync da false). Devuelve true
 * si habia un enlace y se elimino; false en cualquier otro caso.
 */
export function unlinkIfLink(target: string): boolean {
  try {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) {
      rmSync(target, { recursive: true, force: true });
      return true;
    }
  } catch {
    // no existe (o no legible): nada que eliminar
  }
  return false;
}

/**
 * Reporta si `target` es un enlace apuntando a `source` (resolviendo relativo).
 * Un enlace roto devuelve broken: true y resolved: false.
 */
export function linkStatus(target: string, source: string): { exists: boolean; link: boolean; resolved: boolean; broken: boolean } {
  let stat;
  try {
    stat = lstatSync(target);
  } catch {
    return { exists: false, link: false, resolved: false, broken: false };
  }
  if (!stat.isSymbolicLink()) return { exists: true, link: false, resolved: false, broken: false };
  const current = linkTarget(target);
  const resolved = current !== null && path.resolve(path.dirname(target), current) === path.resolve(source);
  const sourceExists = existsSync(source);
  const broken = !sourceExists || !resolved;
  return { exists: true, link: true, resolved, broken };
}