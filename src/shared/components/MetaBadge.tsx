export type MetaBadgeType = 'pinned' | 'incognito' | 'audible' | 'muted' | 'loading' | 'discarded';

const BADGE_CONFIG: Record<MetaBadgeType, { glyph: string; label: string }> = {
  pinned: { glyph: '📌', label: 'Pinned tab' },
  incognito: { glyph: '🕵', label: 'Incognito window' },
  audible: { glyph: '🔊', label: 'Playing audio' },
  muted: { glyph: '🔇', label: 'Audio muted' },
  loading: { glyph: '⟳', label: 'Loading' },
  discarded: { glyph: '💤', label: 'Discarded (suspended)' },
};

export function MetaBadge({ type }: { type: MetaBadgeType }) {
  const cfg = BADGE_CONFIG[type];
  return (
    <span
      title={cfg.label}
      aria-label={cfg.label}
      style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1, flexShrink: 0 }}
    >
      {cfg.glyph}
    </span>
  );
}
