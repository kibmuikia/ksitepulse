import { PATTERNS } from '@shared/patterns';
import type { ConsoleMessage } from '@shared/types';
import type { MessageBatcher } from './MessageBatcher';

const LEVELS = ['log', 'warn', 'error', 'info', 'debug'] as const;
type Level = typeof LEVELS[number];

function classify(msg: string, level: Level): string {
  for (const [name, regex] of Object.entries(PATTERNS)) {
    if (regex.test(msg)) return name;
  }
  return level === 'error' ? 'GENERAL_ERROR' : 'INFO';
}

function tryStringify(val: unknown): string {
  if (typeof val === 'string') return val;
  try { return JSON.stringify(val) ?? String(val); }
  catch { return '[circular]'; }
}

export function installConsoleProxy(batcher: MessageBatcher): void {
  const handler: ProxyHandler<Console> = {
    get(target, prop: string) {
      const original = Reflect.get(target, prop) as unknown;
      if (!(LEVELS as readonly string[]).includes(prop) || typeof original !== 'function') {
        return original;
      }
      return function (...args: unknown[]) {
        (original as (...a: unknown[]) => void).apply(target, args);
        const message = args.map(tryStringify).join(' ');
        const entry: ConsoleMessage = {
          type: 'KSPULSE_CONSOLE',
          level: prop,
          category: classify(message, prop as Level),
          message,
          timestamp: Date.now(),
        };
        batcher.enqueue(entry);
      };
    },
  };

  try {
    window.console = new Proxy(window.console, handler);
  } catch {
    // Frozen console: wrap methods individually where writable
    for (const level of LEVELS) {
      const original = console[level].bind(console);
      try {
        (console as unknown as Record<string, unknown>)[level] = (...args: unknown[]) => {
          original(...args);
          const message = args.map(tryStringify).join(' ');
          batcher.enqueue({
            type: 'KSPULSE_CONSOLE',
            level,
            category: classify(message, level),
            message,
            timestamp: Date.now(),
          });
        };
      } catch { /* level is read-only, skip */ }
    }
  }
}
