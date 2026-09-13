import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { jacarandaManifestPath, jacarandaHome, jacarandaBackupsDir } from '../platform/paths.js';

/**
 * Manifest de Jacaranda ~/.jacaranda/state.json.
 *
 * Es la unica fuente de verdad sobre lo que Jacaranda hizo. Permite que
 * `init` sea idempotente y que `doctor` detecte configuraciones modificadas
 * fuera de banda (el checksum del archivo ya no coincide con lo escrito).
 */

export type ToolId = 'opencode' | 'pi' | 'openspec' | 'engram';

export interface WrittenFile {
  path: string;
  checksum: string;
  message: string;
}

export interface Established {
  tool: ToolId;
  kind: 'installed' | 'configured' | 'linked' | 'backed-up';
  detail?: string;
  files?: WrittenFile[];
  createdAt: string;
  updatedAt: string;
}

export interface BackupEntry {
  id: string;
  original: string;
  backup: string;
  createdAt: string;
}

export interface Manifest {
  schemaVersion: 1;
  jacarandaVersion: string | null;
  toolchains: {
    node: { version: string; detected: boolean };
    npm: { version: string; detected: boolean };
  };
  tools: Partial<Record<ToolId, { version: string; installed: boolean; detected: boolean }>>;
  established: Established[];
  backups: BackupEntry[];
  createdAt: string;
  updatedAt: string;
}

const schema = 1;

export function emptyManifest(): Manifest {
  return {
    schemaVersion: schema,
    jacarandaVersion: null,
    toolchains: {
      node: { version: '', detected: false },
      npm: { version: '', detected: false },
    },
    tools: {},
    established: [],
    backups: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Lee el manifest; si no existe o esta corrupto devuelve uno vacio. */
export function loadManifest(): Manifest {
  const manifestPath = jacarandaManifestPath();
  if (!existsSync(manifestPath)) return emptyManifest();
  try {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as Partial<Manifest>;
    const base = emptyManifest();
    return {
      ...base,
      ...raw,
      schemaVersion: schema,
      toolchains: { ...base.toolchains, ...(raw.toolchains ?? {}) },
      tools: { ...(raw.tools ?? {}) },
      established: Array.isArray(raw.established) ? raw.established : [],
      backups: Array.isArray(raw.backups) ? raw.backups : [],
    };
  } catch {
    // Manifest corrupto: no lo tiramos, doctor puede reportarlo.
    return emptyManifest();
  }
}

export function saveManifest(manifest: Manifest): void {
  manifest.updatedAt = new Date().toISOString();
  mkdirSync(path.dirname(jacarandaManifestPath()), { recursive: true });
  const target = jacarandaManifestPath();
  const tmp = `${target}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  renameSync(tmp, target);
}

export function sha256(file: string): string | null {
  try {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Registra un archivo escrito por Jacaranda (con checksum) para poder
 * detectar modificaciones posteriores del usuario.
 */
export function addWrittenFile(manifest: Manifest, file: string, message: string, tool: ToolId): void {
  const checksum = sha256(file);
  if (!checksum) return;
  const entry = manifest.established.find((e) => e.tool === tool);
  const record: WrittenFile = { path: file, checksum, message };
  if (entry) {
    entry.files = entry.files ?? [];
    const idx = entry.files.findIndex((f) => f.path === file);
    if (idx >= 0) entry.files[idx] = record;
    else entry.files.push(record);
    entry.updatedAt = new Date().toISOString();
  } else {
    manifest.established.push({
      tool,
      kind: 'configured',
      files: [record],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  manifest.updatedAt = new Date().toISOString();
}

export function registerTool(manifest: Manifest, tool: ToolId, version: string): void {
  manifest.tools[tool] = { version, installed: true, detected: true };
  manifest.updatedAt = new Date().toISOString();
}

export function markToolDetected(manifest: Manifest, tool: ToolId, version: string): void {
  const existing = manifest.tools[tool];
  manifest.tools[tool] = {
    version,
    installed: existing?.installed ?? false,
    detected: true,
  };
  manifest.updatedAt = new Date().toISOString();
}

export function hasEstablished(manifest: Manifest, tool: ToolId, f: (e: Established) => boolean): boolean {
  return manifest.established.some((e) => e.tool === tool && f(e));
}

/**
 * Crea un backup con timestamp de un archivo en ~/.jacaranda/backups/<ts>/.
 * Devuelve la ruta del backup o null si el archivo no existe.
 */
export function createBackup(manifest: Manifest, file: string): string | null {
  if (!existsSync(file)) return null;
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(jacarandaBackupsDir(), id);
  mkdirSync(dir, { recursive: true });
  const backupPath = path.join(dir, path.basename(file));
  copyFileSync(file, backupPath);
  // El original permanece intacto hasta que la accion lo sobrescriba.
  manifest.backups.push({
    id,
    original: file,
    backup: backupPath,
    createdAt: new Date().toISOString(),
  });
  manifest.updatedAt = new Date().toISOString();
  return backupPath;
}

/** Lista backups existentes (para debug / futuros restore). */
export function listBackups(manifest: Manifest): BackupEntry[] {
  return manifest.backups;
}

export function manifestDir(): string {
  return jacarandaHome();
}