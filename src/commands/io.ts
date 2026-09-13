import { createInterface } from 'node:readline';

/**
 * I/O interactiva minimalista para los comandos init/doctor. Inyectable para
 * tests (log/confirm pueden ser reemplazados).
 */

export interface Io {
  log(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
  confirm(prompt: string): Promise<boolean>;
}

export interface IoOptions {
  verbose?: boolean;
  /** Auto-aprueba toda confirmacion (--yes). */
  yes?: boolean;
  /** stdout/stderr funcionales (inyectar para tests). */
  out?: (msg: string) => void;
  err?: (msg: string) => void;
  /** Funcion de confirmacion custom (tests). */
  confirmFn?: (q: string) => Promise<boolean>;
}

export function createIo(opts: IoOptions = {}): Io {
  const out = opts.out ?? ((m: string) => process.stdout.write(`${m}\n`));
  const errOut = opts.err ?? ((m: string) => process.stderr.write(`${m}\n`));
  return {
    log: out,
    warn: (m) => out(`aviso: ${m}`),
    error: errOut,
    debug: (m) => {
      if (opts.verbose) out(`  [debug] ${m}`);
    },
    async confirm(q) {
      if (opts.yes) return true;
      if (opts.confirmFn) return opts.confirmFn(q);
      return askTerminal(out, q);
    },
  };
}

async function askTerminal(out: (m: string) => void, q: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<boolean>((resolve) => {
    rl.question(`${q} [s/N] `, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      resolve(a === 's' || a === 'y' || a === 'si' || a === 'yes');
    });
  });
}