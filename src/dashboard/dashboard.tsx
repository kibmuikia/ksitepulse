import { applyTheme, getUserConfig } from '@config/userConfig';
import type { ConsoleEntry, Health, Issue, RequestRecord, TabSummary, Theme } from '@shared/types';
import { render } from 'preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { HealthRing } from '../popup/components/HealthRing';
import '../styles/tokens.css';
import '../styles/base.css';

const LOG = (...args: unknown[]) => console.log('[ksp:dash]', ...args);

const REQ_PAGE_SIZE = 20;
const CON_PAGE_SIZE = 50;

interface CTab {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
}

// ── Method badge styles ────────────────────────────────────────────

const METHOD_STYLES: Record<string, { bg: string; color: string }> = {
  GET: { bg: 'rgba(0,200,150,0.15)', color: 'var(--health-good)' },
  POST: { bg: 'rgba(245,166,35,0.15)', color: 'var(--health-warning)' },
  PUT: { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' },
  PATCH: { bg: 'rgba(168,85,247,0.15)', color: '#c084fc' },
  DELETE: { bg: 'rgba(255,77,79,0.15)', color: 'var(--health-error)' },
};
const DEFAULT_METHOD_STYLE = { bg: 'rgba(74,74,98,0.2)', color: 'var(--text-muted)' };

// ── HTTP status display ────────────────────────────────────────────

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Not Allowed',
  422: 'Unprocessable',
  429: 'Too Many',
  500: 'Server Error',
  502: 'Bad Gateway',
  503: 'Unavailable',
  504: 'Timeout',
};

// ── Utilities ──────────────────────────────────────────────────────

function hostname(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function endpointPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search || '');
  } catch {
    return url;
  }
}

function methodStyle(method?: string) {
  return METHOD_STYLES[(method ?? '').toUpperCase()] ?? DEFAULT_METHOD_STYLE;
}

function reqDotColor(r: RequestRecord): string {
  if (r.status === 'failed') return 'var(--health-error)';
  if (!r.statusCode) return 'var(--text-muted)';
  if (r.statusCode >= 500) return 'var(--health-error)';
  if (r.statusCode >= 400) return 'var(--health-warning)';
  if (r.statusCode >= 300) return 'var(--health-warning)';
  return 'var(--health-good)';
}

function reqStatusLabel(r: RequestRecord): string {
  if (r.status === 'failed') return r.error?.replace('net::', '') ?? 'ERR';
  if (r.status === 'pending') return '…';
  const code = r.statusCode;
  if (!code) return '—';
  const text = STATUS_TEXT[code] ?? '';
  return text ? `${code} ${text}` : String(code);
}

// ── Dashboard ──────────────────────────────────────────────────────

function Dashboard() {
  const [tabs, setTabs] = useState<CTab[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [summary, setSummary] = useState<TabSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<Theme>('auto');
  const [switchOpen, setSwitchOpen] = useState(false);
  const switchRef = useRef<HTMLDivElement>(null);

  const selectedTab = tabs.find((t) => t.id === selectedId) ?? null;
  const otherTabs = tabs.filter((t) => t.id !== selectedId);

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
    getUserConfig().then((cfg) => {
      applyTheme(cfg.theme);
      setTheme(cfg.theme);
    });

    const port = chrome.runtime.connect({ name: 'ksp-dashboard' });
    LOG('port:connected ksp-dashboard');
    port.onMessage.addListener((msg: { type: string; tabId: number }) => {
      if (msg.type === 'KSPULSE_STATE_UPDATE' && msg.tabId === selectedIdRef.current) {
        fetchRef.current?.(msg.tabId);
      }
    });

    const myBase = chrome.runtime.getURL('');
    chrome.tabs.query({}, (allTabs) => {
      const visible = allTabs
        .filter((t) => t.id && t.url && !t.url.startsWith('chrome://') && !t.url.startsWith(myBase))
        .map((t) => ({
          id: t.id!,
          url: t.url!,
          title: t.title || t.url!,
          favIconUrl: t.favIconUrl,
        }));
      LOG('tabs:loaded', visible.length);
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

    function handleDocClick(e: MouseEvent) {
      if (switchRef.current && !switchRef.current.contains(e.target as Node)) {
        setSwitchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleDocClick);

    return () => {
      port.disconnect();
      document.removeEventListener('mousedown', handleDocClick);
    };
  }, []);

  const health = (summary?.health ?? 'loading') as Health;
  const score = summary?.score ?? 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--bg-base)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--text-base)',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: '0 var(--space-6)',
          height: 52,
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <span
          style={{
            fontWeight: 700,
            fontSize: 'var(--text-lg)',
            letterSpacing: '-0.02em',
            flexShrink: 0,
          }}
        >
          ksite<span style={{ color: 'var(--health-good)' }}>pulse</span>
        </span>

        {/* Current site identity pill */}
        {selectedTab ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              flex: 1,
              minWidth: 0,
              padding: '5px var(--space-3)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            {selectedTab.favIconUrl && (
              <img
                src={selectedTab.favIconUrl}
                alt=""
                aria-hidden="true"
                width={14}
                height={14}
                style={{ borderRadius: 2, flexShrink: 0 }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, flexShrink: 0 }}>
              {hostname(selectedTab.url)}
            </span>
            {selectedTab.title && selectedTab.title !== hostname(selectedTab.url) && (
              <>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>—</span>
                <span
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {selectedTab.title}
                </span>
              </>
            )}
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )}

        {/* Right controls */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}
        >
          {/* Switch tab dropdown */}
          {otherTabs.length > 0 && (
            <div ref={switchRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setSwitchOpen((o) => !o)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-1)',
                  padding: '5px var(--space-3)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  background: switchOpen ? 'var(--bg-elevated)' : 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 500,
                }}
              >
                Other tabs
                <span style={{ fontSize: 9, opacity: 0.6 }}>{switchOpen ? '▲' : '▼'}</span>
              </button>
              {switchOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    width: 280,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    zIndex: 100,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '6px var(--space-3)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-muted)',
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    Open tabs ({otherTabs.length})
                  </div>
                  <div style={{ maxHeight: 320, overflow: 'hidden auto' }}>
                    {otherTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          selectTab(tab.id);
                          setSwitchOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                          width: '100%',
                          padding: '9px var(--space-3)',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: '1px solid var(--border-subtle)',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        {tab.favIconUrl && (
                          <img
                            src={tab.favIconUrl}
                            alt=""
                            aria-hidden="true"
                            width={14}
                            height={14}
                            style={{ borderRadius: 2, flexShrink: 0 }}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 'var(--text-xs)',
                              fontWeight: 500,
                              color: 'var(--text-primary)',
                              overflow: 'hidden',
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {hostname(tab.url)}
                          </div>
                          {tab.title !== hostname(tab.url) && (
                            <div
                              style={{
                                fontSize: 'var(--text-xs)',
                                color: 'var(--text-muted)',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {tab.title}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <ThemeCycle
            current={theme}
            onChange={(t) => {
              applyTheme(t);
              setTheme(t);
            }}
          />
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflow: 'hidden auto', padding: 'var(--space-6)' }}>
        {!selectedId ? (
          <Placeholder text="No tab selected" />
        ) : loading ? (
          <LoadingPlaceholder />
        ) : !summary ? (
          <Placeholder text="No data yet — navigate to a page in this tab." />
        ) : (
          <Content summary={summary} health={health} score={score} />
        )}
      </main>
    </div>
  );
}

// ── Main content ───────────────────────────────────────────────────

function Content({
  summary,
  health,
  score,
}: { summary: TabSummary; health: Health; score: number }) {
  const issues = summary.issues ?? [];
  const vitals = Object.entries(summary.vitals);
  const failedReqs = summary.requests.filter((r) => r.status === 'failed');

  return (
    <div
      class="fade-in"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 960 }}
    >
      {/* Health + summary stats */}
      <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'flex-start' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flexShrink: 0,
          }}
        >
          <HealthRing score={score} health={health} />
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Health Score
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 'var(--space-3)',
            flex: 1,
          }}
        >
          <Stat label="Requests" value={String(summary.requests.length)} />
          <Stat
            label="Failed"
            value={String(failedReqs.length)}
            color={failedReqs.length > 0 ? 'var(--health-error)' : undefined}
          />
          <Stat
            label="Issues"
            value={String(issues.length)}
            color={issues.length > 0 ? 'var(--health-warning)' : undefined}
          />
          <Stat
            label="Long Tasks"
            value={String(summary.longTasks.length)}
            color={summary.longTasks.length > 2 ? 'var(--health-warning)' : undefined}
          />
        </div>
      </div>

      {/* Navigation timing */}
      {summary.nav && (
        <Section title="Navigation Timing">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 'var(--space-3)',
            }}
          >
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: 'var(--space-3)',
            }}
          >
            {vitals.map(([name, v]) => (
              <Stat
                key={name}
                label={name}
                value={fmtVital(name, v.value)}
                color={`var(--health-${ratingToHealth(v.rating)})`}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Issues */}
      {issues.length > 0 ? (
        <Section title={`Issues (${issues.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {issues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </div>
        </Section>
      ) : (
        <Section title="Issues">
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
        </Section>
      )}

      <RequestsTable requests={summary.requests} />

      {summary.console.length > 0 && (
        <ConsoleLog entries={summary.console} startTime={summary.startTime} />
      )}
    </div>
  );
}

// ── Filter chip ────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '3px 9px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${active && color ? color : active ? 'var(--border-default)' : 'var(--border-subtle)'}`,
        background: active
          ? color
            ? `color-mix(in srgb, ${color} 15%, transparent)`
            : 'var(--bg-elevated)'
          : 'transparent',
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--font-mono)',
        color: active ? (color ?? 'var(--text-primary)') : 'var(--text-muted)',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        letterSpacing: '0.02em',
      }}
    >
      {label}
    </button>
  );
}

// ── Requests table ─────────────────────────────────────────────────

type MethodFilter = 'ALL' | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OTHER';
type StatusFilter = 'ALL' | '2xx' | '3xx' | '4xx' | '5xx' | 'failed';

const KNOWN_METHODS: MethodFilter[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function RequestsTable({ requests }: { requests: RequestRecord[] }) {
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);

  function applyFilter<T>(setter: (v: T) => void, v: T) {
    setter(v);
    setPage(1);
  }

  const filtered = requests
    .slice()
    .reverse()
    .filter((r) => {
      if (search) {
        if (!r.url.toLowerCase().includes(search.toLowerCase())) return false;
      }
      if (methodFilter !== 'ALL') {
        const m = (r.method ?? '').toUpperCase();
        if (methodFilter === 'OTHER') {
          if (KNOWN_METHODS.includes(m as MethodFilter)) return false;
        } else {
          if (m !== methodFilter) return false;
        }
      }
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'failed') return r.status === 'failed';
        const code = r.statusCode ?? 0;
        if (statusFilter === '2xx') return code >= 200 && code < 300;
        if (statusFilter === '3xx') return code >= 300 && code < 400;
        if (statusFilter === '4xx') return code >= 400 && code < 500;
        if (statusFilter === '5xx') return code >= 500;
      }
      return true;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / REQ_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * REQ_PAGE_SIZE;
  const shown = filtered.slice(start, start + REQ_PAGE_SIZE);

  return (
    <Section title={`Requests (${requests.length})`}>
      {/* Filter controls */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-3)',
        }}
      >
        <input
          type="text"
          placeholder="Filter by URL…"
          value={search}
          onInput={(e) => applyFilter(setSearch, (e.target as HTMLInputElement).value)}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            padding: '6px var(--space-3)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            outline: 'none',
            width: '100%',
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
          }}
        >
          <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
            {(['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OTHER'] as MethodFilter[]).map(
              (m) => (
                <FilterChip
                  key={m}
                  label={m}
                  active={methodFilter === m}
                  onClick={() => applyFilter(setMethodFilter, m)}
                  color={m !== 'ALL' && m !== 'OTHER' ? METHOD_STYLES[m]?.color : undefined}
                />
              ),
            )}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
            {(['ALL', '2xx', '3xx', '4xx', '5xx', 'failed'] as StatusFilter[]).map((s) => (
              <FilterChip
                key={s}
                label={s === 'failed' ? 'Failed' : s}
                active={statusFilter === s}
                onClick={() => applyFilter(setStatusFilter, s)}
                color={
                  s === '5xx' || s === 'failed'
                    ? 'var(--health-error)'
                    : s === '4xx'
                      ? 'var(--health-warning)'
                      : s === '2xx'
                        ? 'var(--health-good)'
                        : undefined
                }
              />
            ))}
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <div
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
            padding: 'var(--space-5) 0',
            textAlign: 'center',
          }}
        >
          No matching requests.
        </div>
      ) : (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '90px 1fr 150px 88px 72px',
              padding: 'var(--space-2) var(--space-4)',
              borderBottom: '1px solid var(--border-subtle)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              fontWeight: 600,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
            }}
          >
            <span>Method</span>
            <span>Endpoint</span>
            <span>Status</span>
            <span style={{ textAlign: 'right' }}>Duration</span>
            <span style={{ textAlign: 'right' }}>Size</span>
          </div>

          {/* Table rows */}
          {shown.map((r, i) => {
            const ms = methodStyle(r.method);
            const methodLabel = (r.method ?? r.type).toUpperCase().slice(0, 7);
            return (
              <div
                key={r.requestId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1fr 150px 88px 72px',
                  padding: 'var(--space-2) var(--space-4)',
                  borderBottom: i < shown.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  alignItems: 'center',
                  background: r.status === 'failed' ? 'rgba(255,77,79,0.035)' : 'transparent',
                }}
              >
                {/* Method badge */}
                <span>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 7px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.03em',
                      background: ms.bg,
                      color: ms.color,
                    }}
                  >
                    {methodLabel}
                  </span>
                </span>

                {/* Endpoint path */}
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    paddingRight: 'var(--space-3)',
                  }}
                  title={r.url}
                >
                  {endpointPath(r.url)}
                </span>

                {/* Status dot + label */}
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: reqDotColor(r),
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {reqStatusLabel(r)}
                  </span>
                </span>

                {/* Duration */}
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                    textAlign: 'right',
                  }}
                >
                  {r.duration != null ? fmtMs(r.duration) : '—'}
                </span>

                {/* Size */}
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                    textAlign: 'right',
                  }}
                >
                  {r.transferSize ? fmtBytes(r.transferSize) : r.fromCache ? 'cache' : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {filtered.length > REQ_PAGE_SIZE && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 'var(--space-2)',
          }}
        >
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {start + 1}–{Math.min(start + REQ_PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
            <PaginationBtn
              label="← Prev"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            />
            <span
              style={{
                padding: '3px var(--space-2)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {safePage} / {totalPages}
            </span>
            <PaginationBtn
              label="Next →"
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
            />
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Console log ────────────────────────────────────────────────────

function ConsoleLog({ entries, startTime }: { entries: ConsoleEntry[]; startTime: number }) {
  const [filter, setFilter] = useState<'all' | 'error' | 'warn'>('all');
  const [page, setPage] = useState(1);

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.level === filter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / CON_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * CON_PAGE_SIZE;
  const shown = filtered
    .slice()
    .reverse()
    .slice(start, start + CON_PAGE_SIZE);

  const levelColor: Record<string, string> = {
    error: 'var(--console-error)',
    warn: 'var(--console-warn)',
    info: 'var(--console-info)',
    log: 'var(--console-log)',
  };
  const levelIcon: Record<string, string> = { error: '✗', warn: '!', info: 'i', log: '›' };
  const errorCount = entries.filter((e) => e.level === 'error').length;
  const warnCount = entries.filter((e) => e.level === 'warn').length;

  return (
    <Section title={`Console (${entries.length})`}>
      {/* Filter chips */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-2)',
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
          {(['all', 'error', 'warn'] as const).map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => {
                setFilter(f);
                setPage(1);
              }}
              style={{
                padding: '3px 9px',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${filter === f ? 'var(--border-default)' : 'var(--border-subtle)'}`,
                background: filter === f ? 'var(--bg-elevated)' : 'transparent',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
                color:
                  f === 'error'
                    ? 'var(--console-error)'
                    : f === 'warn'
                      ? 'var(--console-warn)'
                      : filter === f
                        ? 'var(--text-primary)'
                        : 'var(--text-muted)',
                fontWeight: filter === f ? 600 : 400,
              }}
            >
              {f === 'all'
                ? `All (${entries.length})`
                : f === 'error'
                  ? `Errors (${errorCount})`
                  : `Warns (${warnCount})`}
            </button>
          ))}
        </div>
        {filtered.length > CON_PAGE_SIZE && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {start + 1}–{Math.min(start + CON_PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
        )}
      </div>

      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}
      >
        {shown.map((entry, i) => {
          const relMs = entry.timestamp - startTime;
          const relSec = relMs > 0 ? `+${(relMs / 1000).toFixed(2)}s` : '';
          return (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '16px 52px 1fr',
                gap: 'var(--space-2)',
                padding: '3px var(--space-3)',
                borderBottom: i < shown.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                alignItems: 'baseline',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: levelColor[entry.level] ?? 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                {levelIcon[entry.level] ?? '·'}
              </span>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {relSec}
              </span>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-mono)',
                  color: levelColor[entry.level] ?? 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  lineHeight: 1.5,
                }}
              >
                {entry.message}
              </span>
            </div>
          );
        })}
      </div>

      {/* Console pagination */}
      {filtered.length > CON_PAGE_SIZE && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--space-1)',
            marginTop: 'var(--space-2)',
          }}
        >
          <PaginationBtn
            label="← Prev"
            disabled={safePage <= 1}
            onClick={() => setPage(safePage - 1)}
          />
          <span
            style={{
              padding: '3px var(--space-2)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {safePage} / {totalPages}
          </span>
          <PaginationBtn
            label="Next →"
            disabled={safePage >= totalPages}
            onClick={() => setPage(safePage + 1)}
          />
        </div>
      )}
    </Section>
  );
}

// ── Shared primitives ──────────────────────────────────────────────

function PaginationBtn({
  label,
  disabled,
  onClick,
}: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '3px 10px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-default)',
        background: 'var(--bg-surface)',
        color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
        fontSize: 'var(--text-xs)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <div>
      <div
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          marginBottom: 'var(--space-3)',
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 'var(--text-lg)',
          fontWeight: 600,
          color: color ?? 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function IssueRow({ issue }: { issue: Issue }) {
  const sev = issue.severity;
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        alignItems: 'flex-start',
      }}
    >
      <span
        style={{
          padding: '2px 6px',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          flexShrink: 0,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          background: `var(--sev-${sev}-bg)`,
          color: `var(--sev-${sev})`,
        }}
      >
        {sev}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, marginBottom: 2 }}>
          {issue.title}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          {issue.detail}
        </div>
        {issue.action && (
          <div
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              marginTop: 4,
              fontStyle: 'italic',
            }}
          >
            {issue.action}
          </div>
        )}
      </div>
      {issue.count != null && issue.count > 1 && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
          ×{issue.count}
        </span>
      )}
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '50%',
        color: 'var(--text-muted)',
        fontSize: 'var(--text-sm)',
      }}
    >
      {text}
    </div>
  );
}

function LoadingPlaceholder() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '50%',
        gap: 'var(--space-3)',
      }}
    >
      <div class="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading…</span>
    </div>
  );
}

function ThemeCycle({ current, onChange }: { current: Theme; onChange: (t: Theme) => void }) {
  const cycle: Theme[] = ['auto', 'light', 'dark'];
  const icons: Record<Theme, string> = { auto: '◐', light: '○', dark: '●' };
  const next = () => onChange(cycle[(cycle.indexOf(current) + 1) % cycle.length]);
  return (
    <button
      type="button"
      onClick={next}
      title={`Theme: ${current}`}
      style={{
        background: 'none',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        width: 28,
        height: 28,
        cursor: 'pointer',
        color: 'var(--text-secondary)',
        fontSize: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
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
