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

export type TabHealthEntry = { health: Health; score: number };

export interface TabDrawerProps {
  tabs: CTabInfo[];
  selectedId: number | null;
  healthMap: Record<number, TabHealthEntry>;
  onSelectTab: (id: number) => void;
  onClose: () => void;
}

export function TabDrawer({ tabs, selectedId, healthMap, onSelectTab, onClose }: TabDrawerProps) {
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
      <div
        class="tab-drawer-panel"
        style={{ transform: visible ? 'translateX(0)' : 'translateX(100%)' }}
        role="dialog"
        aria-modal="true"
        aria-label="All open tabs"
      >
        <div class="tab-drawer-header">
          <span class="tab-drawer-title">Open tabs ({tabs.length})</span>
          <button type="button" class="tab-drawer-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div class="tab-drawer-list" role="list">
          {tabs.map((tab, i) => (
            <TabDrawerItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === selectedId}
              health={healthMap[tab.id] ?? null}
              index={i}
              onClick={() => onSelectTab(tab.id)}
            />
          ))}
        </div>
      </div>
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
    chunk.forEach((tabId) => {
      chrome.runtime.sendMessage({ type: 'KSPULSE_GET_STATE', tabId }, (res: TabSummary | null) => {
        if (chrome.runtime.lastError || !res) return;
        onResult(tabId, { health: res.health, score: res.score });
      });
    });
  }
}

// ── TabDrawerItem ──────────────────────────────────────────────────────────────

interface TabDrawerItemProps {
  tab: CTabInfo;
  isActive: boolean;
  health: TabHealthEntry | null;
  index: number;
  onClick: () => void;
}

const TabDrawerItem = memo(function TabDrawerItem({
  tab,
  isActive,
  health,
  index,
  onClick,
}: TabDrawerItemProps) {
  const isPending = !health || health.health === 'loading';
  const healthVar = health ? `var(--health-${health.health})` : 'var(--health-loading)';
  const host = hostname(tab.url);

  return (
    <button
      type="button"
      role="listitem"
      onClick={onClick}
      class={`tab-drawer-item${isActive ? ' tab-drawer-item--active' : ''}`}
      style={{ animationDelay: `${index * 30}ms` }}
      aria-current={isActive ? 'true' : undefined}
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

      {/* Right: active chip + health dot + score */}
      <div class="tab-drawer-item-meta">
        {isActive && <span class="tab-drawer-item-active-chip">Active</span>}
        <span
          class={`tab-drawer-item-dot${isPending ? ' tab-drawer-item-dot--pulse' : ''}`}
          style={{ background: healthVar }}
          aria-hidden="true"
        />
        {health && health.health !== 'loading' && (
          <span class="tab-drawer-item-score" style={{ color: healthVar }}>
            {health.score}
          </span>
        )}
      </div>
    </button>
  );
});
