interface VitalGaugeProps {
  name: string;
  value: string;
  rating: string;
}

const FILL_WIDTH: Record<string, string> = {
  good: '85%',
  'needs-improvement': '50%',
  poor: '20%',
};

function ratingToHealth(rating: string): string {
  if (rating === 'good') return 'good';
  if (rating === 'needs-improvement') return 'warning';
  return 'error';
}

export function VitalGauge({ name, value, rating }: VitalGaugeProps) {
  const health = ratingToHealth(rating);
  const color = `var(--health-${health})`;
  const fillWidth = FILL_WIDTH[rating] ?? '50%';

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {name}
        </span>
        <span
          style={{
            fontSize: 'var(--text-md)',
            fontWeight: 600,
            color,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </span>
      </div>
      <div class="vital-gauge">
        <div class="vital-gauge__fill" style={{ width: fillWidth, background: color }} />
      </div>
    </div>
  );
}
