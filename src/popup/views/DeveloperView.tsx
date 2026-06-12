import { Tooltip } from '@shared/components/Tooltip';
import { VITAL_TIPS } from '@shared/constants';
import type { TabSummary } from '@shared/types';
import { formatVital, ratingToHealth } from '../utils';

export function DeveloperView({ summary }: { summary: TabSummary | null }) {
  if (!summary) {
    return (
      <div
        style={{
          padding: 'var(--space-4)',
          color: 'var(--text-muted)',
          fontSize: 'var(--text-sm)',
        }}
      >
        No data yet. Navigate to a page.
      </div>
    );
  }

  const vitals = Object.entries(summary.vitals);
  const recentConsole = summary.console.slice(-5).reverse();

  return (
    <div
      style={{
        padding: 'var(--space-3)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      {/* Vitals grid */}
      {vitals.length > 0 && (
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}
        >
          {vitals.map(([name, v]) => (
            <Tooltip
              key={name}
              content={VITAL_TIPS[name] ?? `${name} — ${v.rating}`}
              position="bottom"
            >
              <div
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 'var(--space-2)',
                  textAlign: 'center',
                  width: '100%',
                  cursor: 'default',
                }}
              >
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-muted)',
                    marginBottom: 2,
                  }}
                >
                  {name}
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    color: `var(--health-${ratingToHealth(v.rating)})`,
                  }}
                >
                  {formatVital(name, v.value)}
                </div>
              </div>
            </Tooltip>
          ))}
        </div>
      )}

      {/* Request summary */}
      <Tooltip
        content="All network requests captured for this page. Failed = non-2xx HTTP responses or network errors."
        position="bottom"
      >
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-2)',
            width: '100%',
            cursor: 'default',
          }}
        >
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>
            REQUESTS
          </div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
            {summary.requests.length} total
            {summary.requests.filter((r) => r.status === 'failed').length > 0 && (
              <span style={{ color: 'var(--health-error)', marginLeft: 6 }}>
                · {summary.requests.filter((r) => r.status === 'failed').length} failed
              </span>
            )}
          </div>
        </div>
      </Tooltip>

      {/* Console preview */}
      {recentConsole.length > 0 && (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-2)',
          }}
        >
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>
            CONSOLE (last {recentConsole.length})
          </div>
          {recentConsole.map((entry, i) => (
            <Tooltip key={entry.id ?? i} content={entry.message} position="bottom">
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--space-1)',
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-mono)',
                  color: `var(--console-${entry.level === 'warn' ? 'warn' : entry.level === 'error' ? 'error' : 'log'})`,
                  lineHeight: 1.4,
                  minWidth: 0,
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  opacity: i > 0 ? 0.7 - i * 0.1 : 1,
                  width: '100%',
                  cursor: 'default',
                }}
              >
                <span style={{ flexShrink: 0 }}>
                  {entry.level === 'error' ? '✕' : entry.level === 'warn' ? '!' : '›'}
                </span>
                <span class="truncate">{entry.message}</span>
              </div>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}
