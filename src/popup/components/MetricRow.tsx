import type { TabSummary } from '@shared/types';

interface Props {
  summary: TabSummary;
}

export function MetricRow({ summary }: Props) {
  const loadMs = summary.nav?.loadComplete;
  const loadLabel =
    loadMs != null ? (loadMs >= 1000 ? `${(loadMs / 1000).toFixed(1)}s` : `${loadMs}ms`) : '—';

  const totalReqs = summary.requests.length;
  const failedReqs = summary.requests.filter((r) => r.status === 'failed').length;
  const reqLabel = failedReqs > 0 ? `${totalReqs} (${failedReqs} failed)` : String(totalReqs);

  const proto = summary.nav?.protocol ?? '—';
  const secure = summary.url.startsWith('https');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-secondary)',
        flexWrap: 'wrap',
      }}
    >
      <span title="Page load time">{loadLabel} load</span>
      <Dot />
      <span
        title="Total requests"
        style={{ color: failedReqs > 0 ? 'var(--health-warning)' : undefined }}
      >
        {reqLabel} req
      </span>
      <Dot />
      <span
        title="Protocol"
        style={{ color: secure ? 'var(--health-good)' : 'var(--health-warning)' }}
      >
        {secure ? proto.toUpperCase() : 'HTTP'}
      </span>
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden style={{ opacity: 0.3 }}>
      ·
    </span>
  );
}
