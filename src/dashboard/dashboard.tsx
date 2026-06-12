import { applyTheme, getUserConfig } from '@config/userConfig';
import { FilterChips } from '@shared/components/FilterChips';
import { MetaBadge } from '@shared/components/MetaBadge';
import { PaginationBar } from '@shared/components/PaginationBar';
import { StatPill } from '@shared/components/StatPill';
import { Tooltip } from '@shared/components/Tooltip';
import { VitalGauge } from '@shared/components/VitalGauge';
import { VITAL_TIPS } from '@shared/constants';
import type { ConsoleEntry, Health, Issue, RequestRecord, TabSummary, Theme } from '@shared/types';
import { hostname } from '@shared/urlUtils';
import { render } from 'preact';
import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { HealthRing } from '../popup/components/HealthRing';
import { ConsoleBar } from './components/ConsoleBar';
import { EmptyTabState } from './components/EmptyTabState';
import { TabDrawer, fetchTabHealth } from './components/TabDrawer';
import type { CTabInfo, TabHealthEntry } from './components/TabDrawer';
import '../styles/tokens.css';
import '../styles/base.css';

const LOG = (...args: unknown[]) => console.log('[ksp:dash]', ...args);

const REQ_PAGE_SIZE = 20;

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
  const [tabs, setTabs] = useState<CTabInfo[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [summary, setSummary] = useState<TabSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [theme, setTheme] = useState<Theme>('auto');
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tabHealthMap, setTabHealthMap] = useState<Record<number, TabHealthEntry>>({});
  const [reloading, setReloading] = useState(false);

  const selectedTab = useMemo(
    () => tabs.find((t) => t.id === selectedId) ?? null,
    [tabs, selectedId],
  );

  const selectedIdRef = useRef<number | null>(null);
  const fetchRef = useRef<((id: number) => void) | null>(null);
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
    setDrawerOpen(false);
    doFetch(id);
  }

  const handleReload = useCallback(() => {
    if (!selectedId) return;
    setReloading(true);
    chrome.tabs.reload(selectedId, {}, () => {
      setTimeout(() => setReloading(false), 5000);
    });
  }, [selectedId]);

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
          status: t.status as 'loading' | 'complete' | undefined,
          active: t.active,
          pinned: t.pinned,
          incognito: t.incognito,
          audible: t.audible,
          muted: t.mutedInfo?.muted,
          discarded: t.discarded,
          index: t.index,
          windowId: t.windowId,
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

      fetchTabHealth(
        visible.map((t) => t.id),
        (tabId, entry) => setTabHealthMap((prev) => ({ ...prev, [tabId]: entry })),
      );
    });

    return () => {
      port.disconnect();
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

        {selectedTab ? <SiteIdentityPill tab={selectedTab} /> : <div style={{ flex: 1 }} />}

        <div
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}
        >
          {tabs.length > 1 && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-1)',
                padding: '5px var(--space-3)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: 'var(--text-xs)',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              All tabs
              <span
                style={{
                  background: 'var(--bg-elevated)',
                  borderRadius: 9,
                  padding: '1px 5px',
                  fontSize: 10,
                  color: 'var(--text-muted)',
                }}
              >
                {tabs.length}
              </span>
            </button>
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
      <main
        style={{
          flex: 1,
          overflow: 'hidden auto',
          padding: 'var(--space-6)',
          paddingBottom: 'calc(var(--console-bar-collapsed) + var(--space-4))',
          position: 'relative',
        }}
      >
        {refreshing && (
          <div
            style={{
              position: 'absolute',
              top: 0,
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
        {!selectedId ? (
          <Placeholder text="No tab selected" />
        ) : loading ? (
          <LoadingPlaceholder />
        ) : !summary ? (
          <EmptyTabState reloading={reloading} onReload={handleReload} />
        ) : (
          <Content
            summary={summary}
            onRequestClick={(r) => setDrawer({ kind: 'request', data: r })}
          />
        )}
      </main>

      {/* ── Console Bar ────────────────────────────────────────────── */}
      <ConsoleBar
        entries={summary?.console ?? []}
        startTime={summary?.startTime ?? 0}
        onEntryClick={(e) =>
          setDrawer({ kind: 'console', data: e, startTime: summary?.startTime ?? 0 })
        }
      />

      {/* ── Side Drawer ────────────────────────────────────────────── */}
      {drawer && <Drawer state={drawer} onClose={() => setDrawer(null)} />}

      {/* ── Tab Drawer ─────────────────────────────────────────────── */}
      {drawerOpen && (
        <TabDrawer
          tabs={tabs}
          selectedId={selectedId}
          healthMap={tabHealthMap}
          onSelectTab={selectTab}
          onGoToTab={(id) => chrome.tabs.update(id, { active: true })}
          onStartAnalysis={(id) => chrome.tabs.reload(id)}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}

// ── Site identity pill ─────────────────────────────────────────────

function SiteIdentityPill({ tab }: { tab: CTabInfo }) {
  const [hover, setHover] = useState(false);
  const host = hostname(tab.url);
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
      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, flexShrink: 0 }}>{host}</span>
      {/* Meta badges inline */}
      {tab.pinned && <MetaBadge type="pinned" />}
      {tab.incognito && <MetaBadge type="incognito" />}
      {tab.audible && <MetaBadge type="audible" />}
      {tab.muted && <MetaBadge type="muted" />}
      {tab.status === 'loading' && <MetaBadge type="loading" />}
      {tab.discarded && <MetaBadge type="discarded" />}
      {tab.title && tab.title !== host && (
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
              style={{
                fontWeight: 700,
                fontSize: 'var(--text-sm)',
                color: 'var(--text-primary)',
              }}
            >
              {host}
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
          {(tab.windowId != null || tab.index != null || tab.status || tab.discarded) && (
            <div
              style={{
                marginTop: 'var(--space-2)',
                paddingTop: 'var(--space-1)',
                borderTop: '1px solid var(--border-subtle)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
                display: 'flex',
                gap: 'var(--space-3)',
                flexWrap: 'wrap',
              }}
            >
              {tab.windowId != null && <span>Window {tab.windowId}</span>}
              {tab.index != null && <span>Tab #{tab.index}</span>}
              {tab.status && <span>Status: {tab.status}</span>}
              {tab.discarded && <span>Discarded</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Bento card ─────────────────────────────────────────────────────

function BentoCard({
  title,
  children,
  style,
  className,
}: {
  title: string;
  children: ComponentChildren;
  style?: Record<string, string>;
  className?: string;
}) {
  return (
    <div class={`glass-card bento-card${className ? ` ${className}` : ''}`} style={style}>
      <div class="bento-card__title">{title}</div>
      {children}
    </div>
  );
}

// ── Main content ───────────────────────────────────────────────────

function Content({
  summary,
  onRequestClick,
}: {
  summary: TabSummary;
  onRequestClick: (r: RequestRecord) => void;
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
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gridTemplateAreas:
          '"health health stats stats stats stats nav nav nav nav nav nav" ' +
          '"vitals vitals vitals vitals issues issues issues issues issues issues issues issues" ' +
          '"reqs reqs reqs reqs reqs reqs reqs reqs reqs reqs reqs reqs"',
        gap: 'var(--space-4)',
        maxWidth: 960,
        margin: '0 auto',
      }}
    >
      {/* Health ring */}
      <BentoCard
        title="Health"
        className="hover-lift"
        style={{ gridArea: 'health', display: 'flex', flexDirection: 'column' }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flex: 1,
            justifyContent: 'center',
          }}
        >
          <HealthRing score={score} health={health} />
        </div>
      </BentoCard>

      {/* Summary stats */}
      <BentoCard title="Summary" style={{ gridArea: 'stats' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 'var(--space-2)',
          }}
        >
          <StatPill label="Requests" value={String(summary.requests.length)} />
          <StatPill
            label="Failed"
            value={String(failedReqs.length)}
            color={failedReqs.length > 0 ? 'var(--health-error)' : undefined}
          />
          <StatPill
            label="Issues"
            value={String(issues.length)}
            color={issues.length > 0 ? 'var(--health-warning)' : undefined}
          />
          <StatPill
            label="Long Tasks"
            value={String(summary.longTasks.length)}
            color={summary.longTasks.length > 2 ? 'var(--health-warning)' : undefined}
          />
        </div>
      </BentoCard>

      {/* Navigation timing */}
      <BentoCard title="Navigation Timing" style={{ gridArea: 'nav' }}>
        {summary.nav ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 'var(--space-2)',
            }}
          >
            <StatPill label="TTFB" value={fmtMs(summary.nav.ttfb)} />
            <StatPill label="DCL" value={fmtMs(summary.nav.domContentLoaded)} />
            <StatPill label="Load" value={fmtMs(summary.nav.loadComplete)} />
            <StatPill label="Protocol" value={summary.nav.protocol || '—'} />
            <StatPill label="Transfer" value={fmtBytes(summary.nav.transferSize)} />
          </div>
        ) : (
          <div
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)',
              textAlign: 'center',
              padding: 'var(--space-4) 0',
            }}
          >
            No timing data yet
          </div>
        )}
      </BentoCard>

      {/* Web Vitals */}
      <BentoCard
        title="Web Vitals"
        className="hover-lift"
        style={{ gridArea: 'vitals', display: 'flex', flexDirection: 'column' }}
      >
        {vitals.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', flex: 1 }}>
            {vitals.map(([name, v]) => (
              <Tooltip key={name} content={VITAL_TIPS[name] ?? name} position="top">
                <VitalGauge name={name} value={fmtVital(name, v.value)} rating={v.rating} />
              </Tooltip>
            ))}
          </div>
        ) : (
          <div
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)',
              textAlign: 'center',
              padding: 'var(--space-4) 0',
            }}
          >
            No vitals captured yet
          </div>
        )}
      </BentoCard>

      {/* Issues */}
      <BentoCard title={`Issues (${issues.length})`} style={{ gridArea: 'issues' }}>
        {issues.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              overflow: 'hidden auto',
              maxHeight: 260,
            }}
          >
            {issues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </div>
        ) : (
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
        )}
      </BentoCard>

      {/* Requests — no glass, full width */}
      <div style={{ gridArea: 'reqs' }}>
        <RequestsTable requests={summary.requests} onRowClick={onRequestClick} />
      </div>
    </div>
  );
}

// ── Requests table ─────────────────────────────────────────────────

type MethodFilter = 'ALL' | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OTHER';
type StatusFilter = 'ALL' | '2xx' | '3xx' | '4xx' | '5xx' | 'failed';

const KNOWN_METHODS: MethodFilter[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const METHOD_FILTER_OPTIONS = (
  ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OTHER'] as MethodFilter[]
).map((m) => ({
  label: m,
  value: m,
  color: m !== 'ALL' && m !== 'OTHER' ? METHOD_STYLES[m]?.color : undefined,
}));

const STATUS_FILTER_OPTIONS = (['ALL', '2xx', '3xx', '4xx', '5xx', 'failed'] as StatusFilter[]).map(
  (s) => ({
    label: s === 'failed' ? 'Failed' : s,
    value: s,
    color:
      s === '5xx' || s === 'failed'
        ? 'var(--health-error)'
        : s === '4xx'
          ? 'var(--health-warning)'
          : s === '2xx'
            ? 'var(--health-good)'
            : undefined,
  }),
);

function RequestsTable({
  requests,
  onRowClick,
}: {
  requests: RequestRecord[];
  onRowClick: (r: RequestRecord) => void;
}) {
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);

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
          <FilterChips
            options={METHOD_FILTER_OPTIONS}
            value={methodFilter}
            onChange={(v) => applyFilter(setMethodFilter, v as MethodFilter)}
          />
          <FilterChips
            options={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onChange={(v) => applyFilter(setStatusFilter, v as StatusFilter)}
          />
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
        <PaginationBar
          page={safePage}
          totalPages={totalPages}
          start={start}
          pageSize={REQ_PAGE_SIZE}
          total={filtered.length}
          onPageChange={setPage}
        />
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
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
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
}: {
  data: ConsoleEntry;
  startTime: number;
}) {
  const LEVEL_STYLES: Record<string, { bg: string; color: string }> = {
    error: { bg: 'rgba(255,77,79,0.15)', color: 'var(--console-error, var(--health-error))' },
    warn: { bg: 'rgba(245,166,35,0.15)', color: 'var(--console-warn, var(--health-warning))' },
    info: { bg: 'rgba(96,165,250,0.15)', color: 'var(--console-info, #60a5fa)' },
    log: { bg: 'rgba(74,74,98,0.2)', color: 'var(--console-log, var(--text-secondary))' },
  };
  const ls = LEVEL_STYLES[entry.level.toLowerCase()] ?? {
    bg: 'rgba(74,74,98,0.2)',
    color: 'var(--text-muted)',
  };
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
