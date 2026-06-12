import { FilterChips } from '@shared/components/FilterChips';
import { PaginationBar } from '@shared/components/PaginationBar';
import type { ConsoleEntry } from '@shared/types';
import { useEffect, useMemo, useState } from 'preact/hooks';

const CON_PAGE_SIZE = 50;

const LEVEL_STYLES: Record<string, { bg: string; color: string }> = {
  error: { bg: 'rgba(255,77,79,0.15)', color: 'var(--console-error, var(--health-error))' },
  warn: { bg: 'rgba(245,166,35,0.15)', color: 'var(--console-warn, var(--health-warning))' },
  info: { bg: 'rgba(96,165,250,0.15)', color: 'var(--console-info, #60a5fa)' },
  log: { bg: 'rgba(74,74,98,0.2)', color: 'var(--console-log, var(--text-secondary))' },
};
const DEFAULT_LEVEL_STYLE = { bg: 'rgba(74,74,98,0.2)', color: 'var(--text-muted)' };

function levelStyle(level: string) {
  return LEVEL_STYLES[level.toLowerCase()] ?? DEFAULT_LEVEL_STYLE;
}

interface ConsoleBarProps {
  entries: ConsoleEntry[];
  startTime: number;
  onEntryClick: (e: ConsoleEntry) => void;
}

export function ConsoleBar({ entries, startTime, onEntryClick }: ConsoleBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<'all' | 'error' | 'warn' | 'info' | 'log'>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === '`') {
        e.preventDefault();
        setExpanded((v) => !v);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const [errorCount, warnCount, infoCount, logCount] = useMemo(
    () => [
      entries.filter((e) => e.level === 'error').length,
      entries.filter((e) => e.level === 'warn').length,
      entries.filter((e) => e.level === 'info').length,
      entries.filter((e) => e.level === 'log' || e.level === 'debug').length,
    ],
    [entries],
  );

  const filtered = useMemo(() => {
    if (filter === 'all') return entries;
    if (filter === 'log') return entries.filter((e) => e.level === 'log' || e.level === 'debug');
    return entries.filter((e) => e.level === filter);
  }, [entries, filter]);

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

  const lastEntry = useMemo(() => [...entries].reverse()[0] ?? null, [entries]);

  const filterOptions = [
    { label: `All (${entries.length})`, value: 'all' },
    { label: `Errors (${errorCount})`, value: 'error', color: 'var(--health-error)' },
    { label: `Warns (${warnCount})`, value: 'warn', color: 'var(--health-warning)' },
    { label: `Info (${infoCount})`, value: 'info', color: 'var(--console-info, #60a5fa)' },
    { label: `Log (${logCount})`, value: 'log' },
  ];

  return (
    <div class={`console-bar console-bar--${expanded ? 'expanded' : 'collapsed'}`}>
      {/* Handle */}
      <button
        type="button"
        class="console-bar__handle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span
          style={{
            fontSize: 9,
            color: 'var(--text-muted)',
            display: 'inline-block',
            transform: expanded ? 'rotate(0deg)' : 'rotate(180deg)',
            transition: 'transform 150ms var(--ease-out)',
          }}
        >
          ▲
        </span>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          Console
        </span>
        {errorCount > 0 && (
          <span
            style={{
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,77,79,0.15)',
              color: 'var(--health-error)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
            }}
          >
            {errorCount} err
          </span>
        )}
        {warnCount > 0 && (
          <span
            style={{
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(245,166,35,0.15)',
              color: 'var(--health-warning)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
            }}
          >
            {warnCount} warn
          </span>
        )}
        {errorCount === 0 && warnCount === 0 && entries.length > 0 && (
          <span
            style={{
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-muted)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
            }}
          >
            {entries.length}
          </span>
        )}
        {!expanded && lastEntry && (
          <span
            class="truncate"
            style={{
              flex: 1,
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
              color: levelStyle(lastEntry.level).color,
            }}
          >
            {lastEntry.message}
          </span>
        )}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {expanded && (
            <FilterChips
              options={filterOptions}
              value={filter}
              onChange={(v) => {
                setFilter(v as typeof filter);
                setPage(1);
              }}
            />
          )}
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              opacity: 0.5,
              flexShrink: 0,
            }}
            title="Toggle console (backtick)"
          >
            `
          </span>
        </div>
      </button>

      {/* Body — always rendered; parent height + overflow clips when collapsed */}
      <div class="console-bar__body">
        {shown.length === 0 ? (
          <div
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)',
              padding: 'var(--space-5)',
              textAlign: 'center',
            }}
          >
            {entries.length === 0 ? 'No console output captured yet.' : 'No matching entries.'}
          </div>
        ) : (
          <>
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
                flexShrink: 0,
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
                  onClick={() => onEntryClick(entry)}
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
            {filtered.length > CON_PAGE_SIZE && (
              <div style={{ padding: '0 var(--space-4) var(--space-2)' }}>
                <PaginationBar
                  page={safePage}
                  totalPages={totalPages}
                  start={start}
                  pageSize={CON_PAGE_SIZE}
                  total={filtered.length}
                  onPageChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
