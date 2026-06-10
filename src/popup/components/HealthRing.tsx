import type { Health } from '@shared/types';

const RADIUS = 38;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface Props {
  score: number;
  health: Health;
}

export function HealthRing({ score, health }: Props) {
  const fill = Math.max(0, Math.min(100, score)) / 100;
  const offset = CIRCUMFERENCE * (1 - fill);
  const color = `var(--health-${health})`;
  const label = health === 'loading' ? '…' : String(score);
  const isLoading = health === 'loading' && score === 0;

  return (
    <svg
      width="88"
      height="88"
      viewBox="0 0 88 88"
      aria-label={isLoading ? 'Analyzing page health…' : `Health score ${score}`}
      role="img"
      style={{ flexShrink: 0 }}
    >
      {/* Track — pulses while loading */}
      <circle
        cx="44"
        cy="44"
        r={RADIUS}
        fill="none"
        stroke={color}
        stroke-width="7"
        class={isLoading ? 'ksp-ring-loading' : undefined}
        opacity="0.12"
      />
      {/* Score arc */}
      <circle
        cx="44"
        cy="44"
        r={RADIUS}
        fill="none"
        stroke={color}
        stroke-width="7"
        stroke-linecap="round"
        stroke-dasharray={CIRCUMFERENCE}
        stroke-dashoffset={offset}
        transform="rotate(-90 44 44)"
        style={{ transition: 'stroke-dashoffset var(--dur-slow) var(--ease-out)' }}
      />
      {/* Score label */}
      <text
        x="44"
        y="42"
        dominant-baseline="middle"
        text-anchor="middle"
        fill={color}
        font-size="20"
        font-weight="600"
        font-family="var(--font-ui)"
      >
        {label}
      </text>
      {/* Health / analyzing label */}
      <text
        x="44"
        y="58"
        dominant-baseline="middle"
        text-anchor="middle"
        fill={color}
        font-size="10"
        font-family="var(--font-ui)"
        opacity="0.7"
      >
        {isLoading ? 'analyzing' : health}
      </text>
    </svg>
  );
}
