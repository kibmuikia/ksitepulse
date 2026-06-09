import type { ConsoleMessage } from '@shared/types';
import type { MessageBatcher } from './MessageBatcher';

export function installErrorCapture(batcher: MessageBatcher): void {
  window.addEventListener('error', ({ message, filename, lineno, colno }) => {
    const entry: ConsoleMessage = {
      type: 'KSPULSE_CONSOLE',
      level: 'error',
      category: 'RUNTIME_ERROR',
      message: `${message} (${filename}:${lineno}:${colno})`,
      timestamp: Date.now(),
    };
    batcher.enqueue(entry);
  }, { passive: true });

  window.addEventListener('unhandledrejection', ({ reason }) => {
    const msg = (reason as Error)?.message ?? String(reason);
    const entry: ConsoleMessage = {
      type: 'KSPULSE_CONSOLE',
      level: 'error',
      category: 'UNHANDLED_PROMISE',
      message: msg,
      timestamp: Date.now(),
    };
    batcher.enqueue(entry);
  }, { passive: true });
}
