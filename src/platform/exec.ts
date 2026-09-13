import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { platform } from 'node:os';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  error?: Error;
}

export interface ExecOptions {
  timeoutMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Captura salida de la consola aunque el proceso falle (default true). */
  noThrow?: boolean;
}

const DEFAULT_TIMEOUT = 30_000;

/** Extensiones a probar para resolver un binario en Windows (PATHEXT). */
const WINDOWS_EXTS = ['.exe', '.cmd', '.bat', '.ps1'];

function isWin(): boolean {
  return platform() === 'win32';
}

function pathEnv(): string[] {
  const raw = process.env['PATH'] ?? process.env['Path'] ?? '';
  return raw.split(isWin() ? ';' : ':').filter((s) => s.length > 0);
}

export function isPathLike(command: string): boolean {
  return command.includes('/') || command.includes('\\') || (isWin() && /^[a-zA-Z]:/.test(command));
}

/**
 * Resuelve un comando a una ruta ejecutable en PATH. En Windows prueba
 * PATHEXT para encontrar npm.cmd etc. Si el comando ya es una ruta, la
 * devuelve tal cual si existe.
 */
export function resolveCommand(command: string): string | null {
  if (isPathLike(command)) {
    return existsSync(command) ? command : null;
  }
  for (const dir of pathEnv()) {
    const base = path.join(dir, command);
    if (isWin()) {
      // En Windows el binario real suele ser .cmd/.exe (npm.cmd, opencode.cmd).
      // Preferimos esas variantes antes que el shim sin extension.
      for (const ext of WINDOWS_EXTS) {
        const candidate = `${base}${ext}`;
        if (existsSync(candidate)) return candidate;
      }
    }
    if (existsSync(base)) return base;
  }
  return null;
}

function toCmdLine(program: string, args: string[]): string {
  const quote = (part: string) => {
    if (part.length === 0 || /\s/.test(part) || part.includes('"')) {
      return `"${part.replace(/"/g, '\\"')}"`;
    }
    return part;
  };
  const inner = [quote(program), ...args.map(quote)].join(' ');
  // cmd /d /s /c quita las comillas externas de la linea completa y ejecuta
  // el resto verbatim; sin el wrapper extra, "C:\Program Files\..." se rompe.
  return `"${inner}"`;
}

/**
 * Ejecuta un comando con resolucion en PATH y captura stdout/stderr.
 * No lanza excepcion: devuelve un ExecResult. Instalaciones fallidas y
 * comandos inexistentes se reportan en exitCode/error.
 */
export function exec(
  command: string,
  args: string[] = [],
  options: ExecOptions = {},
): Promise<ExecResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
  const resolved = resolveCommand(command);

  return new Promise((resolve) => {
    if (resolved === null) {
      resolve({
        stdout: '',
        stderr: `${command}: comando no encontrado en PATH`,
        exitCode: 127,
        timedOut: false,
      });
      return;
    }

    const isCmdScript = isWin() && /\.(cmd|bat)$/i.test(resolved);
    // En Windows los scripts .cmd/.bat corren bajo cmd.exe; construimos la
    // linea con comillas explicitas en vez de shell:true (que no escapa y
    // rompe con espacios en la ruta, ej. "C:\\Program Files\\nodejs\\npm.cmd").
    const spawnSpec = isCmdScript
      ? { file: process.env['ComSpec'] ?? 'cmd.exe', args: ['/d', '/s', '/c', toCmdLine(resolved, args)], verbatim: true }
      : { file: resolved, args, verbatim: false };

    const child = spawn(spawnSpec.file, spawnSpec.args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      windowsHide: true,
      windowsVerbatimArguments: spawnSpec.verbatim,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: null, timedOut, error: err });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, timedOut });
    });
  });
}

/** Run y lanza si exitCode != 0 (usado por cores de integracion). */
export async function execOrThrow(
  command: string,
  args: string[] = [],
  options: ExecOptions = {},
): Promise<ExecResult> {
  const result = await exec(command, args, options);
  if (result.exitCode !== 0 || result.timedOut) {
    const code = result.exitCode === null ? 'ENOENT' : `exit=${result.exitCode}${result.timedOut ? ', timeout' : ''}`;
    throw new Error(`\`${command} ${args.join(' ')}\` fallo (${code}): ${result.stderr.trim() || result.stdout.trim()}`);
  }
  return result;
}