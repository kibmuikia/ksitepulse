import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getUserConfig, applyTheme } from '@config/userConfig';
import type { TabSummary, Mode, Theme } from '@shared/types';
import { HealthRing } from './components/HealthRing';
import { IssueCard } from './components/IssueCard';
import { MetricRow } from './components/MetricRow';
import { ThemeToggle } from './components/ThemeToggle';
import { ModeToggle } from './components/ModeToggle';
import '../styles/tokens.css';
import '../styles/base.css';

const LOG = (...args: unknown[]) => console.log('[ksp:popup]', ...args);

function Popup() {
  const [summary, setSummary] = useState<TabSummary | null>(null);
  const [mode, setMode] = useState<Mode>('everyday');
  const [theme, setTheme] = useState<Theme>('auto');
  const [loading, setLoading] = useState(true);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const config = await getUserConfig();
      applyTheme(config.theme);
      setTheme(config.theme);
      setMode(config.mode);

      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        LOG('active tab:', tab?.id, tab?.url);
        if (!tab?.id) {
          LOG('no active tab id, aborting');
          setLoading(false);
          return;
        }
        setActiveTabId(tab.id);
        LOG('sending KSPULSE_GET_STATE for tab', tab.id);
        chrome.runtime.sendMessage(
          { type: 'KSPULSE_GET_STATE', tabId: tab.id },
          (res: TabSummary | null) => {
            if (chrome.runtime.lastError) {
              LOG('sendMessage error:', chrome.runtime.lastError.message);
              setLoading(false);
              return;
            }
            LOG('got response:', res ? `health=${res.health} score=${res.score} requests=${res.requests?.length}` : 'null');
            setSummary(res);
            setLoading(false);
          },
        );
      });
    })();
  }, []);

  function refreshPage() {
    if (!activeTabId) return;
    LOG('refresh tab', activeTabId);
    chrome.tabs.reload(activeTabId);
    window.close();
  }

  function openDashboard() {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      const base = chrome.runtime.getURL('src/dashboard/dashboard.html');
      const url = tab?.id ? `${base}?tabId=${tab.id}` : base;
      chrome.tabs.create({ url });
    });
  }

  const health = summary?.health ?? 'loading';
  const score = summary?.score ?? 0;

  return (
    <div class="popup-root">
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px var(--space-4)',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: 'var(--text-md)', letterSpacing: '-0.01em' }}>
          ksite<span style={{ color: 'var(--health-good)' }}>pulse</span>
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
          <button
            onClick={refreshPage}
            disabled={!activeTabId}
            title="Reload page"
            style={{
              background: 'none',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              width: 26, height: 26,
              cursor: activeTabId ? 'pointer' : 'default',
              color: 'var(--text-secondary)',
              fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: activeTabId ? 1 : 0.4,
            }}
          >
            ↻
          </button>
          <ThemeToggle current={theme} />
          <ModeToggle current={mode} onChange={setMode} />
        </div>
      </header>

      {/* Body */}
      <main style={{ flex: 1, overflow: 'hidden auto' }}>
        {loading ? (
          <div style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Analyzing page…
          </div>
        ) : mode === 'everyday' ? (
          <EverydayView summary={summary} health={health} score={score} />
        ) : (
          <DeveloperView summary={summary} />
        )}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-subtle)',
        padding: '8px var(--space-4)',
        flexShrink: 0,
      }}>
        <button
          onClick={openDashboard}
          style={{
            width: '100%',
            padding: '6px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-secondary)',
            fontSize: 'var(--text-xs)',
            fontWeight: 500,
            transition: `background var(--dur) var(--ease-out)`,
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)')}
        >
          View full report →
        </button>
      </footer>
    </div>
  );
}

function EverydayView({ summary, health, score }: { summary: TabSummary | null; health: string; score: number }) {
  const issues = summary?.issues ?? [];

  return (
    <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* HealthRing + metrics */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
        <HealthRing score={score} health={health as import('@shared/types').Health} />
        {summary && <MetricRow summary={summary} />}
      </div>

      {/* Issues */}
      {issues.length === 0 ? (
        <div style={{
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
        }}>
          <span style={{ color: 'var(--health-good)' }}>✓</span>
          No issues detected
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {issues.slice(0, 4).map(issue => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
          {issues.length > 4 && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'center' }}>
              +{issues.length - 4} more issues in full report
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DeveloperView({ summary }: { summary: TabSummary | null }) {
  if (!summary) {
    return (
      <div style={{ padding: 'var(--space-4)', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        No data yet. Navigate to a page.
      </div>
    );
  }

  const vitals = Object.entries(summary.vitals);
  const recentConsole = summary.console.slice(-5).reverse();

  return (
    <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {/* Vitals grid */}
      {vitals.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
          {vitals.map(([name, v]) => (
            <div key={name} style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-2)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 2 }}>{name}</div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: `var(--health-${ratingToHealth(v.rating)})` }}>
                {formatVital(name, v.value)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Request summary */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2)' }}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>REQUESTS</div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
          {summary.requests.length} total
          {summary.requests.filter(r => r.status === 'failed').length > 0 && (
            <span style={{ color: 'var(--health-error)', marginLeft: 6 }}>
              · {summary.requests.filter(r => r.status === 'failed').length} failed
            </span>
          )}
        </div>
      </div>

      {/* Console preview */}
      {recentConsole.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>CONSOLE</div>
          {recentConsole.map((entry, i) => (
            <div key={i} style={{
              display: 'flex',
              gap: 'var(--space-1)',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
              color: `var(--console-${entry.level === 'warn' ? 'warn' : entry.level === 'error' ? 'error' : 'log'})`,
              lineHeight: 1.4,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              opacity: i > 0 ? 0.7 - i * 0.1 : 1,
            }}>
              <span style={{ flexShrink: 0 }}>{entry.level === 'error' ? '✕' : entry.level === 'warn' ? '!' : '›'}</span>
              <span class="truncate">{entry.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ratingToHealth(rating: string): string {
  if (rating === 'good') return 'good';
  if (rating === 'needs-improvement') return 'warning';
  return 'error';
}

function formatVital(name: string, value: number): string {
  if (name === 'CLS') return value.toFixed(2);
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

render(<Popup />, document.getElementById('app')!);
