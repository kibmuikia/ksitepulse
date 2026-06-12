interface StatPillProps {
  label: string;
  value: string;
  color?: string;
}

export function StatPill({ label, value, color }: StatPillProps) {
  return (
    <div class="stat-pill">
      <div class="stat-pill__label">{label}</div>
      <div class="stat-pill__value" style={{ color: color ?? 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}
