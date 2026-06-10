import type { TabSummary } from '@shared/types';
import { HealthRing } from '../components/HealthRing';
import { IssueCard } from '../components/IssueCard';
import { MetricRow } from '../components/MetricRow';

interface EverydayViewProps {
  summary: TabSummary | null;
  health: string;
  score: number;
}

export function EverydayView({ summary, health, score }: EverydayViewProps) {
  const issues = summary?.issues ?? [];

  return (
    <div
      style={{
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-2)',
        }}
      >
        <HealthRing score={score} health={health as import('@shared/types').Health} />
        {summary && <MetricRow summary={summary} />}
      </div>

      {issues.length === 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-3)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderLeft: '3px solid var(--health-good)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
          }}
        >
          <span style={{ color: 'var(--health-good)' }}>✓</span>
          No issues detected
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {issues.slice(0, 4).map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
          {issues.length > 4 && (
            <p
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
                textAlign: 'center',
              }}
            >
              +{issues.length - 4} more issues in full report
            </p>
          )}
        </div>
      )}
    </div>
  );
}
