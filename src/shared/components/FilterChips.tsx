export interface FilterChipOption {
  label: string;
  value: string;
  color?: string;
}

interface FilterChipsProps {
  options: ReadonlyArray<FilterChipOption>;
  value: string;
  onChange: (v: string) => void;
}

export function FilterChips({ options, value, onChange }: FilterChipsProps) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
      {options.map((opt) => (
        <FilterChip
          key={opt.value}
          label={opt.label}
          active={value === opt.value}
          color={opt.color}
          onClick={() => onChange(opt.value)}
        />
      ))}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '3px 9px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${active && color ? color : active ? 'var(--border-default)' : 'var(--border-subtle)'}`,
        background: active
          ? color
            ? `color-mix(in srgb, ${color} 15%, transparent)`
            : 'var(--bg-elevated)'
          : 'transparent',
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--font-mono)',
        color: active ? (color ?? 'var(--text-primary)') : 'var(--text-muted)',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        letterSpacing: '0.02em',
      }}
    >
      {label}
    </button>
  );
}
