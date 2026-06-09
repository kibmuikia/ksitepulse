import { DEFAULTS } from '@config/defaults';
import type { BatchMessage, KspMessage } from '@shared/types';

/**
 * Batches outgoing messages from the content script and flushes them
 * as a single KSPULSE_BATCH every CONTENT_BATCH_FLUSH_MS.
 * Prevents message bus saturation on pages with many resources.
 */
export class MessageBatcher {
  private queue: KspMessage[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  enqueue(msg: KspMessage): void {
    this.queue.push(msg);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), DEFAULTS.CONTENT_BATCH_FLUSH_MS);
    }
  }

  private flush(): void {
    if (this.queue.length === 0) return;
    const batch: BatchMessage = { type: 'KSPULSE_BATCH', items: this.queue };
    this.queue = [];
    this.timer = null;
    try {
      chrome.runtime.sendMessage(batch);
    } catch {
      // Extension context may be invalidated after navigation — safe to ignore
    }
  }
}
