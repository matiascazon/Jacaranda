#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { runInit } from './commands/init.js';
import { runDoctor } from './commands/doctor.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export interface CliOptions {
  command: string;
  args: string[];
  flags: Record<string, string | boolean | string[] | undefined>;
  verbose: boolean;
  dryRun: boolean;
  yes: boolean;
  force: boolean;
}

export function readVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('package.json', pathToFileURL(ROOT)), 'utf8')) as {
    version?: string;
  };
  return pkg.version ?? '0.0.0';
}

/**
 * Parseo minimalista de argumentos estilo CLI: soporta --flag, --flag=value,
 * y --flag value para valores. No requiere dependencias.
 */
export function parseArgs(argv: string[]): { positional: string[]; flags: Record<string, string | boolean | string[]> } {
  const positional: string[] = [];
  const flags: Record<string, string | boolean | string[]> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        const key = arg.slice(2, eq);
        const value = arg.slice(eq + 1);
        pushFlag(flags, key, value);
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('-')) {
          pushFlag(flags, key, next);
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      flags[arg.slice(1)] = true;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function pushFlag(flags: Record<string, string | boolean | string[]>, key: string, value: string) {
  const existing = flags[key];
  if (Array.isArray(existing)) {
    existing.push(value);
  } else if (existing !== undefined) {
    flags[key] = [String(existing), value];
  } else {
    flags[key] = value;
  }
}

function usage(): string {
  return `jacaranda ${readVersion()} - bootstrapper portable de entornos de agentes de codigo

Uso:
  jacaranda init [--dry-run] [--yes] [--verbose] [--force]
  jacaranda doctor [--verbose]
  jacaranda --version | -v
  jacaranda --help | -h

Comandos:
  init      Detecta el entorno, instala lo faltante (con confirmacion) y configura
            agentes (opencode/pi), OpenSpec, Engram, Skills y MCP. Idempotente.
  doctor    Diagnostica el entorno y reporta el estado de cada herramienta.

Banderas:
  --dry-run  Imprime el plan sin ejecutar nada.
  --yes      Aprueba las instalaciones seguras sin preguntar.
  --force    Reintenta aunque haya conflictos marcados.
  --verbose  Muestra detalle de cada accion.
  -h, --help  Esta ayuda.
  -v, --version  Version.
`;
}

export async function main(argv: string[]): Promise<number> {
  const { positional, flags } = parseArgs(argv);
  const command = positional[0];
  const options: CliOptions = {
    command: command ?? '',
    args: positional.slice(1),
    flags,
    verbose: flags['verbose'] === true,
    dryRun: flags['dry-run'] === true,
    yes: flags['yes'] === true,
    force: flags['force'] === true,
  };

  if (flags['help'] as boolean | undefined) {
    process.stdout.write(usage());
    return 0;
  }
  if (flags['version'] as boolean | undefined) {
    process.stdout.write(`${readVersion()}\n`);
    return 0;
  }

  if (command === 'init') {
    return runInit(options);
  }
  if (command === 'doctor') {
    return runDoctor(options);
  }
  if (command === undefined) {
    process.stdout.write(usage());
    return 0;
  }
  process.stderr.write(`Comando desconocido: ${command}\n\n`);
  process.stderr.write(usage());
  return 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(`Error inesperado: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
      process.exitCode = 1;
    },
  );
}