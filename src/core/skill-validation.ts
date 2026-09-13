import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Validacion de skills: estructura <name>/SKILL.md con frontmatter YAML
 * compatible con opencode/pi. Solo los campos name/description/license/
 * compatibility/metadata son reconocidos; desconocidos se ignoran.
 */

export interface SkillValidation {
  id: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
  name?: string;
  description?: string;
  license?: string;
  metadata?: Record<string, string>;
}

export interface Frontmatter {
  name?: string;
  description?: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  [k: string]: unknown;
}

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_NAME = 64;
const MAX_DESC = 1024;

/** Lista de dirs de skills en una ruta raiz (deteccion de <name>/SKILL.md). */
export function listSkills(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const dir = path.join(root, entry);
    if (statSync(dir).isDirectory() && existsSync(path.join(dir, 'SKILL.md'))) {
      out.push(entry);
    }
  }
  return out.sort();
}

/** Extrae el frontmatter YAML (bloque === ===) y devuelve campos clave. */
export function parseFrontmatter(md: string): { fm: Frontmatter; body: string } {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { fm: {}, body: md };
  const block = match[1];
  const fm: Frontmatter = {};
  const lines = block.split(/\r?\n/);

  // Pasada principal: claves simples y aperturas de block scalar (|, >-).
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const raw = m[2].trim();
    if (raw === '|' || raw === '>-' || raw === '>') {
      // Block scalar: juntas las lineas siguientes hacia la indentacion.
      const collected: string[] = [];
      let j = i + 1;
      while (j < lines.length && /^\s+/.test(lines[j])) {
        collected.push(lines[j].trim());
        j++;
      }
      fm[key] = raw.startsWith('>') ? collected.join(' ') : collected.join('\n');
      i = j - 1;
      continue;
    }
    fm[key] = raw === '' ? true : unquote(raw);
  }

  // metadata como bloque anidado ("metadata:" + keys con 2+ espacios).
  const metaIdx = lines.findIndex((l) => /^metadata:\s*$/.test(l.trim()));
  if (metaIdx >= 0) {
    const meta: Record<string, string> = {};
    for (const l of lines.slice(metaIdx + 1)) {
      const m = l.match(/^\s{2,}([a-zA-Z_-]+):\s*(.*)$/);
      if (m) meta[m[1]] = unquote(m[2]);
    }
    if (Object.keys(meta).length > 0) fm.metadata = meta;
  }
  return { fm, body: md.slice(match[0].length) };
}

function unquote(s: string): string {
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s.trim();
}

export function validateSkill(id: string, md: string): SkillValidation {
  const out: SkillValidation = { id, ok: true, errors: [], warnings: [] };
  const { fm } = parseFrontmatter(md);

  const name = typeof fm.name === 'string' ? fm.name : undefined;
  const description = typeof fm.description === 'string' ? fm.description : undefined;
  const license = typeof fm.license === 'string' ? fm.license : undefined;

  if (!name) out.errors.push('falta frontmatter "name"');
  else if (name.length > MAX_NAME) out.errors.push(`"name" excede ${MAX_NAME} caracteres`);
  else if (!NAME_RE.test(name)) out.errors.push(`"name" invalido (regex: ${NAME_RE.source})`);
  else if (name !== id) out.errors.push(`"name" (${name}) != directorio (${id})`);

  if (!description) out.errors.push('falta frontmatter "description"');
  else if (description.length > MAX_DESC) out.errors.push(`"description" excede ${MAX_DESC} caracteres`);

  if (license) out.warnings.push('license declarada en frontmatter');

  const fmKeys = Object.keys(fm).filter((k) => !['name', 'description', 'license', 'compatibility', 'metadata'].includes(k));
  if (fmKeys.length > 0) out.warnings.push(`frontmatter desconocido (ignorado): ${fmKeys.join(', ')}`);

  if (out.errors.length > 0) out.ok = false;
  if (name) out.name = name;
  if (description) out.description = description;
  if (license) out.license = license;
  if (typeof fm.metadata === 'object' && fm.metadata !== null) {
    out.metadata = fm.metadata as Record<string, string>;
  }
  return out;
}

export function validateSkillDir(dir: string): SkillValidation | null {
  const id = path.basename(dir);
  const file = path.join(dir, 'SKILL.md');
  if (!existsSync(file)) return null;
  return validateSkill(id, readFileSync(file, 'utf8'));
}