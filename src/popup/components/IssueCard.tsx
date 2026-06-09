import type { Issue } from '@shared/types';

interface Props {
  issue: Issue;
}

const SEV_LABEL: Record<string, string> = {
  critical: 'critical', high: 'high', medium: 'medium', low: 'low',
};

export function IssueCard({ issue }: Props) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderLeft: `3px solid var(--sev-${issue.severity})`,
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-3)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <span style={{ fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', lineHeight: 1.3 }}>
          {issue.title}
        </span>
        <span style={{
          fontSize: 'var(--text-xs)',
          padding: '2px 6px',
          borderRadius: '3px',
          background: `var(--sev-${issue.severity}-bg)`,
          color: `var(--sev-${issue.severity})`,
          flexShrink: 0,
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {SEV_LABEL[issue.severity]}
        </span>
      </div>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
        {issue.detail}
      </p>
      {issue.action && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0, fontStyle: 'italic' }}>
          {issue.action}
        </p>
      )}
    </div>
  );
}
