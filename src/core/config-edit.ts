import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';

/**
 * Utilidades de edicion de configs JSON/JSONC con atomizacion (tmp+rename)
 * y diff. Jacaranda NUNCA reescribe un JSON si el cambio es vacio, y antes
 * de tocar un archivo existente siempre se crea un backup via core/manifest.
 */

/** True si el texto parece JSONC (tiene comentarios o trailing commas). */
export function looksLikeJsonc(text: string): boolean {
  return /\/\/|\/\*|\*\/|,\s*[}\]]/m.test(text);
}

/**
 * Parser JSONC minimo: quita comentarios de linea/bloque y trailing commas
 * respetando strings, y delega a JSON.parse.
 */
export function parseJsonc(text: string): unknown {
  const cleaned = stripComments(stripTrailingCommas(text));
  return JSON.parse(cleaned);
}

export function stripTrailingCommas(text: string): string {
  // Trailing commas dentro de objetos/arrays: `,\s*([}\]])` -> `$1`
  const out = text.replace(/,\s*([}\]])/g, '$1');
  return out;
}

export function stripComments(text: string): string {
  let result = '';
  let i = 0;
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1] ?? '';
    if (inLineComment) {
      if (c === '\n') {
        inLineComment = false;
        result += c;
      }
      i++;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inString) {
      result += c;
      if (c === '\\') {
        result += next;
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i++;
      continue;
    }
    if (c === '"') {
      inString = true;
      result += c;
      i++;
      continue;
    }
    if (c === '/' && next === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }
    result += c;
    i++;
  }
  return result;
}

export function readJsonFile(file: string): unknown {
  return parseJsonc(readFileSync(file, 'utf8'));
}

/** Escribe JSON atomico: escribe a tmp en el mismo dir y renombra. */
export function writeJsonAtomic(file: string, data: unknown): void {
  const dir = path.dirname(file);
  mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  try {
    renameSync(tmp, file);
  } catch (err) {
    // Windows: rename falla si el destino existe; borramos y reintentamos.
    try {
      renameSync(tmp, `${file}.old`);
      renameSync(`${file}.old`, file);
    } catch (err2) {
      throw new Error(`no se pudo escribir ${file}: ${err instanceof Error ? err.message : String(err)} / ${err2 instanceof Error ? err2.message : String(err2)}`);
    }
  }
}

/** True si el archivo es JSON (existe y parsea). */
export function isJsonFile(file: string): boolean {
  if (!existsSync(file)) return false;
  try {
    readJsonFile(file);
    return true;
  } catch {
    return false;
  }
}

export type DiffChange =
  | { type: 'added'; path: string; value: unknown }
  | { type: 'removed'; path: string; value: unknown }
  | { type: 'changed'; path: string; from: unknown; to: unknown };

/**
 * Diff entre dos valores. pathPrefix se usa para reportar rutas como
 * "mcp.myServer.command". Solo diffs de valores escalares/objetos planos.
 */
export function diffValue(from: unknown, to: unknown, currentPath = ''): DiffChange[] {
  if (Object.is(from, to)) return [];
  const bothObjects = isPlainObject(from) && isPlainObject(to);
  const bothArrays = Array.isArray(from) && Array.isArray(to);
  if (bothObjects) {
    const fromObj = from as Record<string, unknown>;
    const toObj = to as Record<string, unknown>;
    const changes: DiffChange[] = [];
    for (const key of Object.keys(toObj)) {
      const sub = currentPath ? `${currentPath}.${key}` : key;
      if (!(key in fromObj)) {
        changes.push({ type: 'added', path: sub, value: toObj[key] });
      } else {
        changes.push(...diffValue(fromObj[key], toObj[key], sub));
      }
    }
    for (const key of Object.keys(fromObj)) {
      if (!(key in toObj)) {
        const sub = currentPath ? `${currentPath}.${key}` : key;
        changes.push({ type: 'removed', path: sub, value: fromObj[key] });
      }
    }
    return changes;
  }
  if (bothArrays) {
    const fromArr = from as unknown[];
    const toArr = to as unknown[];
    if (fromArr.length !== toArr.length) {
      return [{ type: 'changed', path: currentPath || '<root>', from, to }];
    }
    const changes: DiffChange[] = [];
    for (let i = 0; i < fromArr.length; i++) {
      changes.push(...diffValue(fromArr[i], toArr[i], `${currentPath || '<root>'}[${i}]`));
    }
    return changes;
  }
  return [{ type: 'changed', path: currentPath || '<root>', from, to }];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Merge profundo: devuelve un nuevo valor con el patch aplicado sobre base.
 * No muta ninguno de los dos. Las claves string de patch reemplazan por
 * clave; para arrays se reemplaza el array completo.
 */
export function mergeDeep(base: unknown, patch: unknown): unknown {
  if (isPlainObject(base) && isPlainObject(patch)) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(patch)) {
      out[key] = mergeDeep((base as Record<string, unknown>)[key], value);
    }
    return out;
  }
  if (patch === undefined) return base;
  return patch;
}