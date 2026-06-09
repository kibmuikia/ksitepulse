import { DEFAULTS } from '@config/defaults';
import type { LongTaskMessage, NavMessage, ResourceMessage, VitalMessage } from '@shared/types';
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';
import type { MessageBatcher } from './MessageBatcher';

export function installPerformanceObservers(batcher: MessageBatcher): void {
  // ── Web Vitals (INP replaces FID in web-vitals v5) ──────────────
  const reportVital = (metric: {
    name: string;
    value: number;
    rating: 'good' | 'needs-improvement' | 'poor';
  }) => {
    const msg: VitalMessage = {
      type: 'KSPULSE_VITAL',
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
    };
    batcher.enqueue(msg);
  };

  onLCP(reportVital, { reportAllChanges: false });
  onCLS(reportVital, { reportAllChanges: false });
  onINP(reportVital, { reportAllChanges: false });
  onFCP(reportVital);
  onTTFB(reportVital);

  // ── Navigation timing ─────────────────────────────────────────────
  const navObserver = new PerformanceObserver((list) => {
    const nav = list.getEntries()[0] as PerformanceNavigationTiming;
    if (!nav) return;
    const msg: NavMessage = {
      type: 'KSPULSE_NAV',
      ttfb: Math.round(nav.responseStart - nav.requestStart),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
      loadComplete: Math.round(nav.loadEventEnd - nav.startTime),
      protocol: nav.nextHopProtocol,
      transferSize: nav.transferSize,
    };
    batcher.enqueue(msg);
  });
  try {
    navObserver.observe({ type: 'navigation', buffered: true });
  } catch {
    /* unavailable */
  }

  // ── Resource timing ───────────────────────────────────────────────
  const resourceObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
      const msg: ResourceMessage = {
        type: 'KSPULSE_RESOURCE',
        name: entry.name,
        initiatorType: entry.initiatorType,
        duration: Math.round(entry.duration),
        transferSize: entry.transferSize,
        deliveryType:
          'deliveryType' in entry
            ? (entry as unknown as { deliveryType: string }).deliveryType
            : entry.transferSize === 0
              ? 'cache'
              : 'network',
        nextHopProtocol: entry.nextHopProtocol,
        timestamp: Date.now(),
      };
      batcher.enqueue(msg);
    }
  });
  try {
    resourceObserver.observe({ type: 'resource', buffered: true });
  } catch {
    /* unavailable */
  }

  // ── Long Animation Frames (Chrome 123+) — primary ─────────────────
  let loafInstalled = false;
  try {
    const loafObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const loaf = entry as PerformanceEntry & { blockingDuration?: number };
        const blocking = loaf.blockingDuration ?? entry.duration;
        if (blocking < DEFAULTS.LOAF_BLOCKING_MS) continue;
        const msg: LongTaskMessage = {
          type: 'KSPULSE_LONG_TASK',
          duration: Math.round(entry.duration),
          blockingDuration: Math.round(blocking),
          startTime: Math.round(entry.startTime),
          entryType: 'long-animation-frame',
        };
        batcher.enqueue(msg);
      }
    });
    loafObserver.observe({ type: 'long-animation-frame', buffered: true });
    loafInstalled = true;
  } catch {
    /* Chrome < 123 */
  }

  // ── Long Tasks (Chrome 58+) — fallback ────────────────────────────
  if (!loafInstalled) {
    try {
      const ltObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration < DEFAULTS.LONG_TASK_MS) continue;
          const msg: LongTaskMessage = {
            type: 'KSPULSE_LONG_TASK',
            duration: Math.round(entry.duration),
            blockingDuration: Math.round(entry.duration),
            startTime: Math.round(entry.startTime),
            entryType: 'longtask',
          };
          batcher.enqueue(msg);
        }
      });
      ltObserver.observe({ type: 'longtask', buffered: true });
    } catch {
      /* unavailable in cross-origin iframes */
    }
  }
}
