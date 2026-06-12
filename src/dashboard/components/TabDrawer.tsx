import type { Health, TabSummary } from '@shared/types';
import { hostname } from '@shared/urlUtils';
import { memo } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';

export interface CTabInfo {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
}

export type TabHealthEntry = { health: Health; score: number; analysed: boolean };

export interface TabDrawerProps {
  tabs: CTabInfo[];
  selectedId: number | null;
  healthMap: Record<number, TabHealthEntry>;
  onSelectTab: (id: number) => void;
  onGoToTab: (id: number) => void;
  onStartAnalysis: (id: number) => void;
  onClose: () => void;
}

export function TabDrawer({
  tabs,
  selectedId,
  healthMap,
  onSelectTab,
  onGoToTab,
  onStartAnalysis,
  onClose,
}: TabDrawerProps) {
  const [visible, setVisible] = useState(false);

  // Trigger transition after first paint
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        class="tab-drawer-backdrop"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={onClose}
        role="button"
        tabIndex={-1}
        aria-label="Close tab list"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      />

      {/* Panel */}
      <dialog
        class="tab-drawer-panel"
        style={{ transform: visible ? 'translateX(0)' : 'translateX(100%)' }}
        aria-modal="true"
        aria-label="All open tabs"
        open
      >
        <div class="tab-drawer-header">
          <span class="tab-drawer-title">Open tabs ({tabs.length})</span>
          <button type="button" class="tab-drawer-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <ul class="tab-drawer-list">
          {tabs.map((tab, i) => (
            <TabDrawerItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === selectedId}
              health={healthMap[tab.id] ?? null}
              index={i}
              onClick={() => onSelectTab(tab.id)}
              onGoToTab={() => onGoToTab(tab.id)}
              onStartAnalysis={() => onStartAnalysis(tab.id)}
            />
          ))}
        </ul>
      </dialog>
    </>
  );
}

// ── Fetch helper used by parent to populate healthMap ──────────────────────────

/**
 * Fetches health+score for a batch of tab IDs and calls onResult for each.
 * Processes in chunks of `batchSize` to avoid flooding the background worker.
 */
export function fetchTabHealth(
  tabIds: number[],
  onResult: (tabId: number, entry: TabHealthEntry) => void,
  batchSize = 8,
): void {
  for (let i = 0; i < tabIds.length; i += batchSize) {
    const chunk = tabIds.slice(i, i + batchSize);
    for (const tabId of chunk) {
      chrome.runtime.sendMessage({ type: 'KSPULSE_GET_STATE', tabId }, (res: TabSummary | null) => {
        if (chrome.runtime.lastError || !res) return;
        const analysed =
          res.requests.length > 0 || Object.keys(res.vitals).length > 0 || res.nav !== null;
        onResult(tabId, { health: res.health, score: res.score, analysed });
      });
    }
  }
}

// ── TabDrawerItem ──────────────────────────────────────────────────────────────

interface TabDrawerItemProps {
  tab: CTabInfo;
  isActive: boolean;
  health: TabHealthEntry | null;
  index: number;
  onClick: () => void;
  onGoToTab: () => void;
  onStartAnalysis: () => void;
}

const TabDrawerItem = memo<TabDrawerItemProps>(function TabDrawerItem({
  tab,
  isActive,
  health,
  index,
  onClick,
  onGoToTab,
  onStartAnalysis,
}: TabDrawerItemProps) {
  const [expanded, setExpanded] = useState(false);
  const isPending = !health || health.health === 'loading';
  const isUnanalysed = health !== null && health.health !== 'loading' && !health.analysed;
  const healthVar = health?.analysed ? `var(--health-${health.health})` : 'var(--health-loading)';
  const host = hostname(tab.url);

  const handleClick = () => {
    if (isUnanalysed) {
      setExpanded((v) => !v);
    } else {
      onClick();
    }
  };

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        class={`tab-drawer-item${isActive ? ' tab-drawer-item--active' : ''}${isUnanalysed ? ' tab-drawer-item--unanalysed' : ''}`}
        style={{ animationDelay: `${index * 30}ms` }}
        aria-current={isActive ? 'true' : undefined}
        aria-expanded={isUnanalysed ? expanded : undefined}
      >
        {/* Left: favicon + text */}
        <div class="tab-drawer-item-identity">
          {tab.favIconUrl ? (
            <img
              src={tab.favIconUrl}
              alt=""
              aria-hidden="true"
              width={14}
              height={14}
              class="tab-drawer-item-favicon"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div class="tab-drawer-item-favicon-placeholder" aria-hidden="true" />
          )}
          <div class="tab-drawer-item-text">
            <span class="tab-drawer-item-host">{host}</span>
            {tab.title && tab.title !== host && (
              <span class="tab-drawer-item-title">{tab.title}</span>
            )}
          </div>
        </div>

        {/* Right: active chip + health dot + score OR unanalysed badge */}
        <div class="tab-drawer-item-meta">
          {isActive && <span class="tab-drawer-item-active-chip">Active</span>}
          {isUnanalysed ? (
            <span class="tab-drawer-item-unanalysed-badge">—</span>
          ) : (
            <>
              <span
                class={`tab-drawer-item-dot${isPending ? ' tab-drawer-item-dot--pulse' : ''}`}
                style={{ background: healthVar }}
                aria-hidden="true"
              />
              {health && health.health !== 'loading' && health.analysed && (
                <span class="tab-drawer-item-score" style={{ color: healthVar }}>
                  {health.score}
                </span>
              )}
            </>
          )}
        </div>
      </button>

      {/* Expanded actions for unanalysed tabs */}
      {isUnanalysed && expanded && (
        <div class="tab-drawer-item-actions">
          <button
            type="button"
            class="tab-drawer-action-btn tab-drawer-action-btn--secondary"
            onClick={(e) => {
              e.stopPropagation();
              onGoToTab();
            }}
          >
            <span class="tab-drawer-action-icon" aria-hidden="true">
              ↗
            </span>
            Go to tab
          </button>
          <button
            type="button"
            class="tab-drawer-action-btn tab-drawer-action-btn--primary"
            onClick={(e) => {
              e.stopPropagation();
              onStartAnalysis();
            }}
          >
            <span class="tab-drawer-action-icon" aria-hidden="true">
              ▷
            </span>
            Start analysis
          </button>
        </div>
      )}
    </li>
  );
});
