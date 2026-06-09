/**
 * Central configuration — edit here to tune all extension behavior.
 * User-overridable values are handled via userConfig.ts (chrome.storage.local).
 */
export const DEFAULTS = {
  // ── Performance thresholds (ms) ──────────────────────────────
  TTFB_WARN_MS: 800,
  TTFB_POOR_MS: 1800,
  LONG_TASK_MS: 50,
  LOAF_BLOCKING_MS: 50,

  // ── Storage caps ─────────────────────────────────────────────
  MAX_REQUESTS: 500,
  MAX_CONSOLE_ENTRIES: 200,
  MAX_LONG_TASKS: 100,

  // ── Content script batching ───────────────────────────────────
  CONTENT_BATCH_FLUSH_MS: 500,

  // ── Badge text (change to ASCII if Unicode renders poorly on Windows) ──
  BADGE_LOADING_TEXT: '…',
  BADGE_GOOD_TEXT: '✓',
  BADGE_WARN_TEXT: '!',
  BADGE_ERROR_TEXT: '✕',

  // ── Badge colors ──────────────────────────────────────────────
  BADGE_COLOR_LOADING: '#5A5A6E',
  BADGE_COLOR_GOOD: '#00C896',
  BADGE_COLOR_WARN: '#F5A623',
  BADGE_COLOR_ERROR: '#FF4D4F',

  // ── User preferences ──────────────────────────────────────────
  DEFAULT_THEME: 'auto' as 'auto' | 'light' | 'dark',
  DEFAULT_MODE: 'everyday' as 'everyday' | 'developer',
} as const;

export type DefaultsType = typeof DEFAULTS;
