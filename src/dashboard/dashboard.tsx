import { render } from 'preact';
import { useEffect, useState, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { getUserConfig, applyTheme } from '@config/userConfig';
import type { TabSummary, Health, Issue, Theme, RequestRecord, ConsoleEntry } from '@shared/types';
import { HealthRing } from '../popup/components/HealthRing';
import '../styles/tokens.css';
import '../styles/base.css';

const LOG = (...args: unknown[]) => console.log('[ksp:dash]', ...args);

interface CTab {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
}

function hostname(url: string): string {
  try { return new URL(url).hostname || url; } catch { return url; }
}

function Dashboard() {
  const [tabs, setTabs] = useState<CTab[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [summary, setSummary] = useState<TabSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<Theme>('auto');

  // Refs so port listener always sees current values without re-registering
  const selectedIdRef = useRef<number | null>(null);
  const fetchRef = useRef<((id: number) => void) | null>(null);

  function doFetch(tabId: number) {
    LOG('fetch:start', tabId);
    selectedIdRef.current = tabId;
    setLoading(true);
    setSummary(null);
    chrome.runtime.sendMessage({ type: 'KSPULSE_GET_STATE', tabId }, (res: TabSummary | null) => {
      if (chrome.runtime.lastError) {
        LOG('error:', chrome.runtime.lastError.message);
        setLoading(false);
        return;
      }
      LOG('state', tabId, res ? `score=${res.score} health=${res.health}` : 'null');
      setSummary(res);
      setLoading(false);
    });
  }
  fetchRef.current = doFetch;

  function selectTab(id: number) {
    LOG('tab:select', id);
    setSelectedId(id);
    doFetch(id);
  }

  useEffect(() => {
    getUserConfig().then(cfg => { applyTheme(cfg.theme); setTheme(cfg.theme); });

    const port = chrome.runtime.connect({ name: 'ksp-dashboard' });
    LOG('port:connected ksp-dashboard');
    port.onMessage.addListener((msg: { type: string; tabId: number }) => {
      LOG('port:msg', msg.type, 'tabId:', msg.tabId, 'selected:', selectedIdRef.current);
      if (msg.type === 'KSPULSE_STATE_UPDATE' && msg.tabId === selectedIdRef.current) {
        LOG('live update → refresh', msg.tabId);
        fetchRef.current?.(msg.tabId);
      }
    });

    const myBase = chrome.runtime.getURL('');
    chrome.tabs.query({}, (allTabs) => {
      const visible = allTabs
        .filter(t => t.id && t.url && !t.url.startsWith('chrome://') && !t.url.startsWith(myBase))
        .map(t => ({ id: t.id!, url: t.url!, title: t.title || t.url!, favIconUrl: t.favIconUrl }));
      LOG('tabs:loaded', visible.length, 'inspectable tabs');
      setTabs(visible);

      const params = new URLSearchParams(location.search);
      const paramId = params.get('tabId') ? Number(params.get('tabId')) : null;
      const target = paramId ?? visible[0]?.id ?? null;
      LOG('tabs:auto-select', target, paramId ? '(from URL param)' : '(first tab)');
      if (target) {
        setSelectedId(target);
        doFetch(target);
      }
    });

    return () => port.disconnect();
  }, []);

  const health = (summary?.health ?? 'loading') as Health;
  const score = summary?.score ?? 0;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: 'var(--bg-base)', color: 'var(--text-primary)',
      fontFamily: 'var(--font-ui)', fontSize: 'var(--text-base)',
    }}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 var(--space-6)', height: 52,
        borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-lg)', letterSpacing: '-0.02em' }}>
          ksite<span style={{ color: 'var(--health-good)' }}>pulse</span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 'var(--text-sm)', marginLeft: 'var(--space-3)' }}>
            Dashboard
          </span>
        </span>
        <ThemeCycle current={theme} onChange={t => { applyTheme(t); setTheme(t); }} />
      </header>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <aside style={{
          width: 220, borderRight: '1px solid var(--border-subtle)',
          overflow: 'hidden auto', flexShrink: 0, paddingTop: 'var(--space-2)',
        }}>
          <div style={{
            padding: 'var(--space-2) var(--space-3) var(--space-2)',
            fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
            fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            Tabs ({tabs.length})
          </div>
          {tabs.length === 0 && (
            <div style={{ padding: 'var(--space-3)', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              No inspectable tabs
            </div>
          )}
          {tabs.map(tab => (
            <TabRow
              key={tab.id}
              tab={tab}
              active={tab.id === selectedId}
              onClick={() => selectTab(tab.id)}
            />
          ))}
        </aside>

        {/* Main */}
        <main style={{ flex: 1, overflow: 'hidden auto', padding: 'var(--space-6)' }}>
          {!selectedId ? (
            <Placeholder text="Select a tab to inspect" />
          ) : loading ? (
            <Placeholder text="Loading…" />
          ) : !summary ? (
            <Placeholder text="No data yet — navigate to a page in the selected tab." />
          ) : (
            <Content summary={summary} health={health} score={score} />
          )}
        </main>
      </div>
    </div>
  );
}

// ── Tab sidebar row ────────────────────────────────────────────────

function TabRow({ tab, active, onClick }: { tab: CTab; active: boolean; onClick: () => void }) {
  const host = hostname(tab.url);
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        width: '100%', padding: '8px var(--space-3)',
        background: active ? 'var(--bg-elevated)' : 'transparent',
        border: 'none', cursor: 'pointer', textAlign: 'left',
        borderLeft: `2px solid ${active ? 'var(--health-good)' : 'transparent'}`,
      }}
    >
      {tab.favIconUrl && (
        <img
          src={tab.favIconUrl} width={14} height={14}
          style={{ borderRadius: 2, flexShrink: 0 }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <div style={{ overflow: 'hidden', minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--text-sm)', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis',
          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: active ? 500 : 400,
        }}>
          {host}
        </div>
        {tab.title !== host && (
          <div style={{
            fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {tab.title}
          </div>
        )}
      </div>
    </button>
  );
}

// ── Main content ───────────────────────────────────────────────────

function Content({ summary, health, score }: { summary: TabSummary; health: Health; score: number }) {
  const issues = summary.issues ?? [];
  const vitals = Object.entries(summary.vitals);
  const failedReqs = summary.requests.filter(r => r.status === 'failed');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 900 }}>
      {/* Health + summary stats */}
      <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
          <HealthRing score={score} health={health} />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Health Score
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)', flex: 1 }}>
          <Stat label="Requests" value={String(summary.requests.length)} />
          <Stat label="Failed" value={String(failedReqs.length)} color={failedReqs.length > 0 ? 'var(--health-error)' : undefined} />
          <Stat label="Issues" value={String(issues.length)} color={issues.length > 0 ? 'var(--health-warning)' : undefined} />
          <Stat label="Long Tasks" value={String(summary.longTasks.length)} color={summary.longTasks.length > 2 ? 'var(--health-warning)' : undefined} />
        </div>
      </div>

      {/* Navigation timing */}
      {summary.nav && (
        <Section title="Navigation Timing">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--space-3)' }}>
            <Stat label="TTFB" value={fmtMs(summary.nav.ttfb)} />
            <Stat label="DCL" value={fmtMs(summary.nav.domContentLoaded)} />
            <Stat label="Load" value={fmtMs(summary.nav.loadComplete)} />
            <Stat label="Protocol" value={summary.nav.protocol || '—'} />
            <Stat label="Transfer" value={fmtBytes(summary.nav.transferSize)} />
          </div>
        </Section>
      )}

      {/* Web Vitals */}
      {vitals.length > 0 && (
        <Section title="Web Vitals">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 'var(--space-3)' }}>
            {vitals.map(([name, v]) => (
              <Stat key={name} label={name} value={fmtVital(name, v.value)} color={`var(--health-${ratingToHealth(v.rating)})`} />
            ))}
          </div>
        </Section>
      )}

      {/* Issues */}
      {issues.length > 0 ? (
        <Section title={`Issues (${issues.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {issues.map(issue => <IssueRow key={issue.id} issue={issue} />)}
          </div>
        </Section>
      ) : (
        <Section title="Issues">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: 'var(--space-3)', background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--health-good)',
            borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
          }}>
            <span style={{ color: 'var(--health-good)' }}>✓</span>
            No issues detected
          </div>
        </Section>
      )}

      {/* Requests */}
      <RequestsTable requests={summary.requests} />

      {/* Console */}
      {summary.console.length > 0 && (
        <ConsoleLog entries={summary.console} startTime={summary.startTime} />
      )}
    </div>
  );
}

// ── Requests table ─────────────────────────────────────────────────

function RequestsTable({ requests }: { requests: RequestRecord[] }) {
  const [failedOnly, setFailedOnly] = useState(false);
  const shown = (failedOnly ? requests.filter(r => r.status === 'failed') : requests)
    .slice().reverse().slice(0, 150);

  function statusColor(r: RequestRecord): string {
    if (r.status === 'failed') return 'var(--health-error)';
    if (!r.statusCode) return 'var(--text-muted)';
    if (r.statusCode >= 500) return 'var(--health-error)';
    if (r.statusCode >= 400) return 'var(--health-warning)';
    return 'var(--health-good)';
  }

  function statusLabel(r: RequestRecord): string {
    if (r.status === 'failed') return r.error?.replace('net::', '') ?? 'ERR';
    if (r.status === 'pending') return '…';
    return String(r.statusCode ?? '—');
  }

  return (
    <Section title={`Requests (${requests.length})`}>
      {/* Filter bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-2)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={failedOnly}
            onChange={e => setFailedOnly((e.target as HTMLInputElement).checked)}
            style={{ accentColor: 'var(--health-error)' }}
          />
          Failed only
        </label>
      </div>

      {shown.length === 0 ? (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', padding: 'var(--space-2) 0' }}>
          {failedOnly ? 'No failed requests.' : 'No requests recorded.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 70px 60px 60px', gap: 'var(--space-2)', padding: '0 var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>
            <span>STATUS</span><span>URL</span><span>TYPE</span><span style={{ textAlign: 'right' }}>DURATION</span><span style={{ textAlign: 'right' }}>SIZE</span>
          </div>
          {shown.map(r => (
            <div
              key={r.requestId}
              style={{
                display: 'grid', gridTemplateColumns: '52px 1fr 70px 60px 60px',
                gap: 'var(--space-2)', padding: 'var(--space-1) var(--space-2)',
                background: r.status === 'failed' ? 'rgba(255,77,79,0.04)' : 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: statusColor(r), fontFamily: 'var(--font-mono)' }}>
                {statusLabel(r)}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontFamily: 'var(--font-mono)' }}
                title={r.url}>
                {r.url.replace(/^https?:\/\//, '')}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{r.type}</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                {r.duration != null ? fmtMs(r.duration) : '—'}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                {r.transferSize ? fmtBytes(r.transferSize) : r.fromCache ? 'cache' : '—'}
              </span>
            </div>
          ))}
          {requests.length > 150 && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'center', paddingTop: 'var(--space-1)' }}>
              Showing 150 most recent of {requests.length}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

// ── Console log ────────────────────────────────────────────────────

function ConsoleLog({ entries, startTime }: { entries: ConsoleEntry[]; startTime: number }) {
  const [filter, setFilter] = useState<'all' | 'error' | 'warn'>('all');
  const filtered = filter === 'all' ? entries : entries.filter(e => e.level === filter);
  const shown = filtered.slice().reverse().slice(0, 200);

  const levelColor: Record<string, string> = {
    error: 'var(--console-error)',
    warn: 'var(--console-warn)',
    info: 'var(--console-info)',
    log: 'var(--console-log)',
  };

  const levelIcon: Record<string, string> = { error: '✗', warn: '!', info: 'i', log: '›' };
  const errorCount = entries.filter(e => e.level === 'error').length;
  const warnCount = entries.filter(e => e.level === 'warn').length;

  return (
    <Section title={`Console (${entries.length})`}>
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        {(['all', 'error', 'warn'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '2px 8px', borderRadius: 'var(--radius-sm)',
              border: `1px solid ${filter === f ? 'var(--border-default)' : 'var(--border-subtle)'}`,
              background: filter === f ? 'var(--bg-elevated)' : 'transparent',
              fontSize: 'var(--text-xs)', cursor: 'pointer',
              color: f === 'error' ? 'var(--console-error)' : f === 'warn' ? 'var(--console-warn)' : 'var(--text-secondary)',
              fontWeight: filter === f ? 600 : 400,
            }}
          >
            {f === 'all' ? `All (${entries.length})` : f === 'error' ? `Errors (${errorCount})` : `Warns (${warnCount})`}
          </button>
        ))}
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        {shown.map((entry, i) => {
          const relMs = entry.timestamp - startTime;
          const relSec = relMs > 0 ? `+${(relMs / 1000).toFixed(2)}s` : '';
          return (
            <div
              key={i}
              style={{
                display: 'grid', gridTemplateColumns: '16px 52px 1fr',
                gap: 'var(--space-2)', padding: '3px var(--space-3)',
                borderBottom: i < shown.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                alignItems: 'baseline',
              }}
            >
              <span style={{ fontSize: 'var(--text-xs)', color: levelColor[entry.level] ?? 'var(--text-muted)', fontWeight: 600 }}>
                {levelIcon[entry.level] ?? '·'}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {relSec}
              </span>
              <span style={{
                fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)',
                color: levelColor[entry.level] ?? 'var(--text-primary)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5,
              }}>
                {entry.message}
              </span>
            </div>
          );
        })}
        {filtered.length > 200 && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-2)' }}>
            Showing 200 most recent of {filtered.length}
          </div>
        )}
      </div>
    </Section>
  );
}

// ── Shared primitives ──────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <div>
      <div style={{
        fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600,
        letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 'var(--space-3)',
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)', padding: 'var(--space-3)',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: color ?? 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function IssueRow({ issue }: { issue: Issue }) {
  const sev = issue.severity;
  return (
    <div style={{
      display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-3)',
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)', alignItems: 'flex-start',
    }}>
      <span style={{
        padding: '2px 6px', borderRadius: 'var(--radius-sm)',
        fontSize: 'var(--text-xs)', fontWeight: 600, flexShrink: 0,
        textTransform: 'uppercase', letterSpacing: '0.04em',
        background: `var(--sev-${sev}-bg)`, color: `var(--sev-${sev})`,
      }}>
        {sev}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, marginBottom: 2 }}>{issue.title}</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{issue.detail}</div>
        {issue.action && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>
            {issue.action}
          </div>
        )}
      </div>
      {issue.count != null && issue.count > 1 && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>×{issue.count}</span>
      )}
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '50%', color: 'var(--text-muted)', fontSize: 'var(--text-sm)',
    }}>
      {text}
    </div>
  );
}

function ThemeCycle({ current, onChange }: { current: Theme; onChange: (t: Theme) => void }) {
  const cycle: Theme[] = ['auto', 'light', 'dark'];
  const icons: Record<Theme, string> = { auto: '◐', light: '○', dark: '●' };
  const next = () => onChange(cycle[(cycle.indexOf(current) + 1) % cycle.length]);
  return (
    <button
      onClick={next}
      title={`Theme: ${current}`}
      style={{
        background: 'none', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)', width: 28, height: 28,
        cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {icons[current]}
    </button>
  );
}

// ── Formatters ─────────────────────────────────────────────────────

function ratingToHealth(rating: string): string {
  if (rating === 'good') return 'good';
  if (rating === 'needs-improvement') return 'warning';
  return 'error';
}

function fmtVital(name: string, value: number): string {
  if (name === 'CLS') return value.toFixed(3);
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

function fmtBytes(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

render(<Dashboard />, document.getElementById('app')!);
