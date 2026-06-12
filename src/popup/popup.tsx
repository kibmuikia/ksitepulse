import { applyTheme, getUserConfig } from '@config/userConfig';
import type { Mode, TabSummary, Theme } from '@shared/types';
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ModeToggle } from './components/ModeToggle';
import { ThemeToggle } from './components/ThemeToggle';
import { DeveloperView } from './views/DeveloperView';
import { EverydayView } from './views/EverydayView';
import '../styles/tokens.css';
import '../styles/base.css';

const LOG = (...args: unknown[]) => console.log('[ksp:popup]', ...args);

function Popup() {
  const [summary, setSummary] = useState<TabSummary | null>(null);
  const [mode, setMode] = useState<Mode>('everyday');
  const [theme, setTheme] = useState<Theme>('auto');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(false);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  async function fetchState(tabId: number, quiet = false) {
    if (quiet) setRefreshing(true);
    else setLoading(true);

    chrome.runtime.sendMessage({ type: 'KSPULSE_GET_STATE', tabId }, (res: TabSummary | null) => {
      if (chrome.runtime.lastError) {
        LOG('sendMessage error:', chrome.runtime.lastError.message);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      LOG(
        'got response:',
        res ? `health=${res.health} score=${res.score} requests=${res.requests?.length}` : 'null',
      );
      setSummary(res);
      setLoading(false);
      setRefreshing(false);
    });
  }

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
        fetchState(tab.id);
      });
    })();
  }, []);

  // Live port connection — connect when live=true, disconnect on cleanup or toggle off.
  useEffect(() => {
    if (!live || !activeTabId) return;

    const port = chrome.runtime.connect({ name: 'ksp-dashboard' });
    portRef.current = port;
    LOG('live:connected');

    port.onMessage.addListener((msg: { type: string; tabId: number }) => {
      if (msg.type === 'KSPULSE_STATE_UPDATE' && msg.tabId === activeTabId) {
        LOG('live:update received');
        fetchState(activeTabId, true);
      }
    });

    port.onDisconnect.addListener(() => {
      LOG('live:disconnected');
      portRef.current = null;
    });

    return () => {
      port.disconnect();
      portRef.current = null;
      LOG('live:cleanup');
    };
  }, [live, activeTabId]);

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
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px var(--space-4)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 'var(--text-md)', letterSpacing: '-0.01em' }}>
          ksite<span style={{ color: 'var(--health-good)' }}>pulse</span>
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-1)', alignItems: 'center' }}>
          {/* Live toggle */}
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            disabled={!activeTabId}
            title={live ? 'Live updates on — click to disable' : 'Enable live updates'}
            style={{
              background: live ? 'rgba(0,200,150,0.12)' : 'none',
              border: `1px solid ${live ? 'var(--health-good)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius-sm)',
              height: 26,
              padding: '0 6px',
              cursor: activeTabId ? 'pointer' : 'default',
              color: live ? 'var(--health-good)' : 'var(--text-secondary)',
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              opacity: activeTabId ? 1 : 0.4,
              letterSpacing: '0.02em',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: live ? 'var(--health-good)' : 'var(--text-muted)',
                display: 'inline-block',
                animation: live ? 'ksp-ring-pulse 1.6s ease-in-out infinite' : undefined,
              }}
            />
            LIVE
          </button>
          {/* Page reload */}
          <button
            type="button"
            onClick={refreshPage}
            disabled={!activeTabId}
            title="Reload page"
            style={{
              background: 'none',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              width: 26,
              height: 26,
              cursor: activeTabId ? 'pointer' : 'default',
              color: 'var(--text-secondary)',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: activeTabId ? 1 : 0.4,
            }}
          >
            ↻
          </button>
          <ThemeToggle current={theme} />
          <ModeToggle current={mode} onChange={setMode} />
        </div>
        {/* Quiet refresh bar */}
        {refreshing && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 2,
              background: 'var(--health-good)',
              animation: 'ksp-ring-pulse 1.6s ease-in-out infinite',
            }}
          />
        )}
      </header>

      {/* Body */}
      <main style={{ flex: 1, overflow: 'hidden auto' }}>
        {loading ? (
          <div
            style={{
              padding: 'var(--space-5)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}
          >
            <div class="spinner" />
            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              Analyzing page…
            </span>
          </div>
        ) : mode === 'everyday' ? (
          <EverydayView summary={summary} health={health} score={score} />
        ) : (
          <DeveloperView summary={summary} />
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '8px var(--space-4)',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
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
            transition: 'background var(--dur) var(--ease-out)',
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)')
          }
        >
          View full report →
        </button>
      </footer>
    </div>
  );
}

render(<Popup />, document.getElementById('app')!);
