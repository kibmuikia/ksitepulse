import { applyTheme, getUserConfig } from '@config/userConfig';
import { Tooltip } from '@shared/components/Tooltip';
import { VITAL_TIPS } from '@shared/constants';
import type { ConsoleEntry, Health, Issue, RequestRecord, TabSummary, Theme } from '@shared/types';
import { render } from 'preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
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

type DrawerState =
  | { kind: 'request'; data: RequestRecord }
  | { kind: 'console'; data: ConsoleEntry; startTime: number }
  | null;

// ── Method badge styles ────────────────────────────────────────────

const METHOD_STYLES: Record<string, { bg: string; color: string }> = {
  GET: { bg: 'rgba(0,200,150,0.15)', color: 'var(--health-good)' },
  POST: { bg: 'rgba(245,166,35,0.15)', color: 'var(--health-warning)' },
  PUT: { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' },
  PATCH: { bg: 'rgba(168,85,247,0.15)', color: '#c084fc' },
  DELETE: { bg: 'rgba(255,77,79,0.15)', color: 'var(--health-error)' },
};
const DEFAULT_METHOD_STYLE = { bg: 'rgba(74,74,98,0.2)', color: 'var(--text-muted)' };

// ── Console level badge styles ─────────────────────────────────────

const LEVEL_STYLES: Record<string, { bg: string; color: string }> = {
  error: { bg: 'rgba(255,77,79,0.15)', color: 'var(--console-error, var(--health-error))' },
  warn: { bg: 'rgba(245,166,35,0.15)', color: 'var(--console-warn, var(--health-warning))' },
  info: { bg: 'rgba(96,165,250,0.15)', color: 'var(--console-info, #60a5fa)' },
  log: { bg: 'rgba(74,74,98,0.2)', color: 'var(--console-log, var(--text-secondary))' },
};
const DEFAULT_LEVEL_STYLE = { bg: 'rgba(74,74,98,0.2)', color: 'var(--text-muted)' };

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

function levelStyle(level: string) {
  return LEVEL_STYLES[level.toLowerCase()] ?? DEFAULT_LEVEL_STYLE;
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
  const [refreshing, setRefreshing] = useState(false);
  const [theme, setTheme] = useState<Theme>('auto');
  const [switchOpen, setSwitchOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const switchRef = useRef<HTMLDivElement>(null);

  const selectedTab = useMemo(
    () => tabs.find((t) => t.id === selectedId) ?? null,
    [tabs, selectedId],
  );
  const otherTabs = useMemo(() => tabs.filter((t) => t.id !== selectedId), [tabs, selectedId]);

  const selectedIdRef = useRef<number | null>(null);
  const fetchRef = useRef<((id: number) => void) | null>(null);
  // Tracks whether we have content so doFetch can decide full-load vs quiet refresh
  const hasSummaryRef = useRef(false);

  function doFetch(tabId: number) {
    LOG('fetch:start', tabId);
    selectedIdRef.current = tabId;
    if (hasSummaryRef.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    chrome.runtime.sendMessage({ type: 'KSPULSE_GET_STATE', tabId }, (res: TabSummary | null) => {
      if (chrome.runtime.lastError) {
        LOG('error:', chrome.runtime.lastError.message);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      LOG('state', tabId, res ? `score=${res.score} health=${res.health}` : 'null');
      hasSummaryRef.current = res !== null;
      setSummary(res);
      setLoading(false);
      setRefreshing(false);
    });
  }
  fetchRef.current = doFetch;

  function selectTab(id: number) {
    LOG('tab:select', id);
    hasSummaryRef.current = false;
    setSummary(null);
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
    chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }, (allTabs) => {
      const visible = allTabs
        .filter((t) => t.id && t.url && !t.url.startsWith(myBase))
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
      if (switchRef.current && !switchRef.current.contains(e.target as Node)) setSwitchOpen(false);
    }
    document.addEventListener('mousedown', handleDocClick);
    return () => {
      port.disconnect();
      document.removeEventListener('mousedown', handleDocClick);
    };
  }, []);

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

        {/* Site identity pill with hover tooltip */}
        {selectedTab ? <SiteIdentityPill tab={selectedTab} /> : <div style={{ flex: 1 }} />}

        {/* Right controls */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}
        >
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
          <div style={{ position: 'relative' }}>
            {refreshing && (
              <div
                style={{
                  position: 'absolute',
                  top: -24,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: 'var(--health-good)',
                  opacity: 0.5,
                  animation: 'ksp-ring-pulse 1.2s ease-in-out infinite',
                  zIndex: 10,
                }}
              />
            )}
            <Content
              summary={summary}
              onRequestClick={(r) => setDrawer({ kind: 'request', data: r })}
              onConsoleClick={(e, t) => setDrawer({ kind: 'console', data: e, startTime: t })}
            />
          </div>
        )}
      </main>

      {/* ── Side Drawer ────────────────────────────────────────────── */}
      {drawer && <Drawer state={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}

// ── Site identity pill ─────────────────────────────────────────────

function SiteIdentityPill({ tab }: { tab: CTab }) {
  const [hover, setHover] = useState(false);
  return (
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
        position: 'relative',
        cursor: 'default',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
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
      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, flexShrink: 0 }}>
        {hostname(tab.url)}
      </span>
      {tab.title && tab.title !== hostname(tab.url) && (
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
            {tab.title}
          </span>
        </>
      )}
      {hover && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            minWidth: 300,
            maxWidth: 500,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            padding: 'var(--space-3)',
            zIndex: 200,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              marginBottom: 'var(--space-2)',
            }}
          >
            {tab.favIconUrl && (
              <img
                src={tab.favIconUrl}
                alt=""
                width={16}
                height={16}
                style={{ borderRadius: 3, flexShrink: 0 }}
              />
            )}
            <span
              style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}
            >
              {hostname(tab.url)}
            </span>
          </div>
          {tab.title && (
            <div
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                marginBottom: 'var(--space-2)',
                lineHeight: 1.5,
                wordBreak: 'break-word',
              }}
            >
              {tab.title}
            </div>
          )}
          <div
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              wordBreak: 'break-all',
              lineHeight: 1.5,
              paddingTop: 'var(--space-1)',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            {tab.url}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main content ───────────────────────────────────────────────────

function Content({
  summary,
  onRequestClick,
  onConsoleClick,
}: {
  summary: TabSummary;
  onRequestClick: (r: RequestRecord) => void;
  onConsoleClick: (e: ConsoleEntry, startTime: number) => void;
}) {
  const health = (summary.health ?? 'loading') as Health;
  const score = summary.score ?? 0;
  const issues = summary.issues ?? [];
  const vitals = Object.entries(summary.vitals);
  const failedReqs = useMemo(
    () => summary.requests.filter((r) => r.status === 'failed'),
    [summary.requests],
  );

  return (
    <div
      class="fade-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        maxWidth: 960,
        margin: '0 auto',
      }}
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
              <Tooltip key={name} content={VITAL_TIPS[name] ?? name} position="bottom">
                <Stat
                  label={name}
                  value={fmtVital(name, v.value)}
                  color={`var(--health-${ratingToHealth(v.rating)})`}
                />
              </Tooltip>
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

      <RequestsTable requests={summary.requests} onRowClick={onRequestClick} />

      <ConsoleLog
        entries={summary.console}
        startTime={summary.startTime}
        onRowClick={(e) => onConsoleClick(e, summary.startTime)}
      />
    </div>
  );
}

// ── Filter chip ────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
  color,
}: { label: string; active: boolean; onClick: () => void; color?: string }) {
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

function RequestsTable({
  requests,
  onRowClick,
}: { requests: RequestRecord[]; onRowClick: (r: RequestRecord) => void }) {
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);
  // const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  function applyFilter<T>(setter: (v: T) => void, v: T) {
    setter(v);
    setPage(1);
  }

  const filtered = useMemo(() => {
    return requests
      .slice()
      .reverse()
      .filter((r) => {
        if (search && !r.url.toLowerCase().includes(search.toLowerCase())) return false;
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
  }, [requests, search, methodFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / REQ_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * REQ_PAGE_SIZE;
  const shown = filtered.slice(start, start + REQ_PAGE_SIZE);

  return (
    <Section title={`Requests (${requests.length})`}>
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
          {shown.map((r, i) => {
            const ms = methodStyle(r.method);
            const methodLabel = (r.method ?? r.type).toUpperCase().slice(0, 7);
            // const isHovered = hoveredIdx === i;
            // onMouseEnter={() => setHoveredIdx(i)}
            // onMouseLeave={() => setHoveredIdx(null)}
            return (
              <button
                key={r.requestId}
                type="button"
                class="row-hover"
                onClick={() => onRowClick(r)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1fr 150px 88px 72px',
                  padding: 'var(--space-2) var(--space-4)',
                  border: 'none',
                  borderBottom: i < shown.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  alignItems: 'center',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  background: r.status === 'failed' ? 'rgba(255,77,79,0.035)' : 'transparent',
                  transition: 'background 80ms',
                  fontFamily: 'inherit',
                }}
              >
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
              </button>
            );
          })}
        </div>
      )}

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

function ConsoleLog({
  entries,
  startTime,
  onRowClick,
}: { entries: ConsoleEntry[]; startTime: number; onRowClick: (e: ConsoleEntry) => void }) {
  const [filter, setFilter] = useState<'all' | 'error' | 'warn'>('all');
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => (filter === 'all' ? entries : entries.filter((e) => e.level === filter)),
    [entries, filter],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / CON_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * CON_PAGE_SIZE;
  const shown = useMemo(
    () =>
      filtered
        .slice()
        .reverse()
        .slice(start, start + CON_PAGE_SIZE),
    [filtered, start],
  );

  const [errorCount, warnCount] = useMemo(
    () => [
      entries.filter((e) => e.level === 'error').length,
      entries.filter((e) => e.level === 'warn').length,
    ],
    [entries],
  );

  return (
    <Section title={entries.length === 0 ? 'Console' : `Console (${entries.length})`}>
      {entries.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-3)',
          }}
        >
          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
            {(['all', 'error', 'warn'] as const).map((f) => (
              <FilterChip
                key={f}
                label={
                  f === 'all'
                    ? `All (${entries.length})`
                    : f === 'error'
                      ? `Errors (${errorCount})`
                      : `Warns (${warnCount})`
                }
                active={filter === f}
                onClick={() => {
                  setFilter(f);
                  setPage(1);
                }}
                color={
                  f === 'error'
                    ? 'var(--health-error)'
                    : f === 'warn'
                      ? 'var(--health-warning)'
                      : undefined
                }
              />
            ))}
          </div>
          {filtered.length > CON_PAGE_SIZE && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {start + 1}–{Math.min(start + CON_PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <div
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
            padding: 'var(--space-5) 0',
            textAlign: 'center',
          }}
        >
          {entries.length === 0 ? 'No console output captured yet.' : 'No matching entries.'}
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
              gridTemplateColumns: '68px 68px 100px 1fr',
              padding: 'var(--space-2) var(--space-4)',
              borderBottom: '1px solid var(--border-subtle)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              fontWeight: 600,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
            }}
          >
            <span>Level</span>
            <span>Time</span>
            <span>Category</span>
            <span>Message</span>
          </div>
          {/* Table rows */}
          {shown.map((entry, i) => {
            const ls = levelStyle(entry.level);
            const relMs = entry.timestamp - startTime;
            const relStr = relMs > 0 ? `+${(relMs / 1000).toFixed(2)}s` : '';
            return (
              <button
                key={entry.id}
                type="button"
                class="row-hover"
                onClick={() => onRowClick(entry)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '68px 68px 100px 1fr',
                  padding: 'var(--space-2) var(--space-4)',
                  border: 'none',
                  borderBottom: i < shown.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  alignItems: 'center',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  background:
                    entry.level === 'error'
                      ? 'rgba(255,77,79,0.035)'
                      : entry.level === 'warn'
                        ? 'rgba(245,166,35,0.03)'
                        : 'transparent',
                  transition: 'background 80ms',
                  fontFamily: 'inherit',
                }}
              >
                <span>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 6px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.02em',
                      textTransform: 'uppercase',
                      background: ls.bg,
                      color: ls.color,
                    }}
                  >
                    {entry.level.slice(0, 4)}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {relStr}
                </span>
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    paddingRight: 'var(--space-2)',
                  }}
                >
                  {entry.category || '—'}
                </span>
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-mono)',
                    color: ls.color,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {entry.message}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {filtered.length > CON_PAGE_SIZE && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 'var(--space-2)',
          }}
        >
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {start + 1}–{Math.min(start + CON_PAGE_SIZE, filtered.length)} of {filtered.length}
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

// ── Side Drawer ────────────────────────────────────────────────────

function Drawer({ state, onClose }: { state: NonNullable<DrawerState>; onClose: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = state.kind === 'request' ? 'Request Details' : 'Console Entry';

  return (
    <>
      {/* Backdrop */}
      <div
        role="button"
        tabIndex={-1}
        aria-label="Close panel"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          zIndex: 300,
          opacity: visible ? 1 : 0,
          transition: 'opacity 200ms ease',
        }}
      />
      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: 440,
          background: 'var(--bg-elevated)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.35)',
          zIndex: 301,
          display: 'flex',
          flexDirection: 'column',
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 var(--space-4)',
            height: 52,
            borderBottom: '1px solid var(--border-subtle)',
            flexShrink: 0,
          }}
        >
          <span
            style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}
          >
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid transparent',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: 20,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        {/* Drawer body */}
        <div style={{ flex: 1, overflow: 'hidden auto', padding: 'var(--space-4)' }}>
          {state.kind === 'request' ? (
            <RequestDrawerContent data={state.data} />
          ) : (
            <ConsoleDrawerContent data={state.data} startTime={state.startTime} />
          )}
        </div>
      </div>
    </>
  );
}

function DrawerField({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <div
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function RequestDrawerContent({ data: r }: { data: RequestRecord }) {
  const ms = methodStyle(r.method);
  return (
    <div>
      {/* Full URL block */}
      <div
        style={{
          padding: 'var(--space-3)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-secondary)',
          wordBreak: 'break-all',
          lineHeight: 1.6,
          marginBottom: 'var(--space-4)',
        }}
      >
        {r.url}
      </div>

      <DrawerField label="Method">
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            background: ms.bg,
            color: ms.color,
          }}
        >
          {(r.method ?? r.type).toUpperCase()}
        </span>
      </DrawerField>

      <DrawerField label="Status">
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: reqDotColor(r),
              flexShrink: 0,
              display: 'inline-block',
            }}
          />
          {reqStatusLabel(r)}
        </span>
      </DrawerField>

      <DrawerField label="Duration">
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-primary)',
          }}
        >
          {r.duration != null ? fmtMs(r.duration) : '—'}
        </span>
      </DrawerField>

      <DrawerField label="Transfer Size">
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-primary)',
          }}
        >
          {r.transferSize ? fmtBytes(r.transferSize) : '—'}
        </span>
      </DrawerField>

      <DrawerField label="Source">
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
          }}
        >
          {r.fromCache ? 'Cache' : 'Network'}
        </span>
      </DrawerField>

      <DrawerField label="Resource Type">
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
            textTransform: 'capitalize',
          }}
        >
          {r.type || '—'}
        </span>
      </DrawerField>

      {r.error && (
        <DrawerField label="Error">
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: 'var(--health-error)',
              wordBreak: 'break-word',
            }}
          >
            {r.error}
          </span>
        </DrawerField>
      )}

      <DrawerField label="Request ID">
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
          }}
        >
          {r.requestId}
        </span>
      </DrawerField>
    </div>
  );
}

function ConsoleDrawerContent({
  data: entry,
  startTime,
}: { data: ConsoleEntry; startTime: number }) {
  const ls = levelStyle(entry.level);
  const relMs = entry.timestamp - startTime;
  const relStr = relMs > 0 ? `+${(relMs / 1000).toFixed(3)}s` : 'before load';

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            background: ls.bg,
            color: ls.color,
          }}
        >
          {entry.level}
        </span>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {relStr} after page load
        </span>
      </div>

      <DrawerField label="Category">
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
          }}
        >
          {entry.category || '—'}
        </span>
      </DrawerField>

      <DrawerField label="Message">
        <pre
          style={{
            margin: 0,
            padding: 'var(--space-3)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: ls.color,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            lineHeight: 1.6,
          }}
        >
          {entry.message}
        </pre>
      </DrawerField>

      <DrawerField label="Timestamp">
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
          }}
        >
          {new Date(entry.timestamp).toLocaleTimeString()}
        </span>
      </DrawerField>
    </div>
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
