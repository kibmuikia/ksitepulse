import type {
  BatchMessage,
  ConsoleMessage,
  Health,
  KspMessage,
  LongTaskMessage,
  NavMessage,
  ResourceMessage,
  VitalMessage,
} from '@shared/types';
import { IssueClassifier } from './IssueClassifier';
import { TabStateManager } from './TabStateManager';
import { updateBadge } from './badge';
import { buildHar } from './har';

const LOG = (...args: unknown[]) => console.log('[ksp:bg]', ...args);

const tabStateManager = new TabStateManager();
const classifier = new IssueClassifier();

LOG('service worker started');

// Ports for live-push to open dashboard pages
const dashboardPorts = new Set<chrome.runtime.Port>();

// ── Tab lifecycle ─────────────────────────────────────────────────

chrome.webNavigation.onBeforeNavigate.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  LOG('nav:before', tabId, url);
  await tabStateManager.init(tabId, url);
  updateBadge(tabId, 'loading');
});

chrome.webNavigation.onCompleted.addListener(async ({ tabId, frameId }) => {
  if (frameId !== 0) return;
  LOG('nav:complete', tabId);
  await refreshBadge(tabId, 'nav:complete');
});

chrome.tabs.onRemoved.addListener((tabId) => {
  LOG('tab:removed', tabId);
  tabStateManager.remove(tabId);
});

// ── Network interception (observational — no blocking) ────────────

const pendingRequests = new Map<string, number>();

chrome.webRequest.onBeforeRequest.addListener(
  ({ requestId, url, type, method, tabId, timeStamp }) => {
    if (tabId < 0) return;
    pendingRequests.set(requestId, timeStamp);
    tabStateManager.addRequest(tabId, { requestId, url, type, method, timeStamp });
  },
  { urls: ['<all_urls>'] },
);

chrome.webRequest.onCompleted.addListener(
  async ({ requestId, tabId, statusCode, fromCache, timeStamp }) => {
    if (tabId < 0) return;
    const start = pendingRequests.get(requestId);
    pendingRequests.delete(requestId);
    await tabStateManager.completeRequest(tabId, requestId, {
      statusCode,
      fromCache,
      duration: start != null ? timeStamp - start : null,
    });
  },
  { urls: ['<all_urls>'] },
);

chrome.webRequest.onErrorOccurred.addListener(
  async ({ requestId, tabId, error }) => {
    if (tabId < 0) return;
    pendingRequests.delete(requestId);
    await tabStateManager.failRequest(tabId, requestId, error);
    await refreshBadge(tabId, 'webRequest:error');
  },
  { urls: ['<all_urls>'] },
);

// ── Message bus ───────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: KspMessage, sender, sendResponse) => {
  // Content scripts have sender.tab; popup/dashboard carry tabId in the message payload.
  const senderTabId = sender.tab?.id;
  const payloadTabId = (msg as Record<string, unknown>).tabId as number | undefined;

  if (msg.type === 'KSPULSE_GET_STATE') {
    // Async with sendResponse — must return true to keep channel open.
    (async () => {
      const tabId = payloadTabId ?? senderTabId;
      if (!tabId) {
        sendResponse(null);
        return;
      }

      let state = await tabStateManager.get(tabId);
      LOG('get_state', tabId, state ? 'found' : 'not found');

      // Auto-init tabs that were open before the extension was installed/reloaded
      if (!state) {
        try {
          const tab = await chrome.tabs.get(tabId);
          if (tab.url && !tab.url.startsWith('chrome://')) {
            LOG('get_state:auto-init', tabId, tab.url);
            await tabStateManager.init(tabId, tab.url);
            state = await tabStateManager.get(tabId);
          }
        } catch (e) {
          LOG('get_state:tabs.get failed', e);
        }
      }

      if (!state) {
        sendResponse(null);
        return;
      }

      const summary = {
        ...state,
        issues: classifier.classify(state),
        score: classifier.healthScore(state),
        health: classifier.overallHealth(state),
      };
      LOG(
        'get_state:respond',
        tabId,
        `health=${summary.health} score=${summary.score} reqs=${state.requests.length} console=${state.console.length}`,
      );
      // Keep badge in sync for tabs that were open before the extension loaded
      updateBadge(tabId, summary.health as Health);
      sendResponse(summary);
    })();
    return true; // keep channel open for async sendResponse
  }

  // Fire-and-forget messages — no sendResponse needed, channel can close immediately.
  (async () => {
    if (msg.type === 'KSPULSE_BATCH') {
      if (!senderTabId) {
        LOG('msg:batch — missing senderTabId, dropping');
        return;
      }
      const { items } = msg as unknown as BatchMessage;
      LOG('batch', senderTabId, items.length, 'items');
      for (const item of items) {
        await handleContentMessage(senderTabId, item);
      }
      await refreshBadge(senderTabId, 'batch');
      LOG('console:notify', senderTabId, 'ports:', dashboardPorts.size);
      notifyDashboards(senderTabId);
      return;
    }

    if (msg.type === 'KSPULSE_EXPORT') {
      const tabId = payloadTabId ?? senderTabId;
      if (!tabId) return;
      const state = await tabStateManager.get(tabId);
      if (!state) return;
      const har = buildHar(state);
      const json = JSON.stringify(har, null, 2);
      const url = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
      chrome.downloads.download({
        url,
        filename: `ksitepulse-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.har`,
        saveAs: false,
      });
    }
  })();
  return false;
});

// ── Dashboard port connections (live push) ────────────────────────

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ksp-dashboard') return;
  LOG('dashboard:connected');
  dashboardPorts.add(port);
  port.onDisconnect.addListener(() => {
    LOG('dashboard:disconnected');
    dashboardPorts.delete(port);
  });
});

// ── Helpers ───────────────────────────────────────────────────────

async function handleContentMessage(tabId: number, msg: KspMessage): Promise<void> {
  switch (msg.type) {
    case 'KSPULSE_CONSOLE': {
      const m = msg as ConsoleMessage;
      LOG('console:add', tabId, m.level, m.message.slice(0, 80));
      await tabStateManager.addConsoleEntry(tabId, {
        id: `${tabId}-${Date.now()}-${Math.random()}`,
        level: m.level,
        category: m.category,
        message: m.message,
        timestamp: m.timestamp,
      });
      break;
    }
    case 'KSPULSE_VITAL': {
      const m = msg as VitalMessage;
      LOG('vital', tabId, m.name, m.value, m.rating);
      await tabStateManager.updateVital(tabId, m.name, m.value, m.rating);
      break;
    }
    case 'KSPULSE_NAV': {
      const m = msg as NavMessage;
      LOG('nav timing', tabId, 'ttfb:', m.ttfb);
      await tabStateManager.updateNav(tabId, {
        ttfb: m.ttfb,
        domContentLoaded: m.domContentLoaded,
        loadComplete: m.loadComplete,
        protocol: m.protocol,
        transferSize: m.transferSize,
      });
      break;
    }
    case 'KSPULSE_RESOURCE': {
      await tabStateManager.updateResourceTiming(tabId, msg as ResourceMessage);
      break;
    }
    case 'KSPULSE_LONG_TASK': {
      const m = msg as LongTaskMessage;
      LOG('long task', tabId, `${m.duration}ms`);
      await tabStateManager.addLongTask(tabId, {
        duration: m.duration,
        blockingDuration: m.blockingDuration,
        startTime: m.startTime,
        entryType: m.entryType,
      });
      break;
    }
  }
}

async function refreshBadge(tabId: number, _from: string): Promise<void> {
  const state = await tabStateManager.get(tabId);
  if (!state) return;
  // Always recompute health from current data — don't branch on stored state.health
  // (init sets it to 'loading' which would otherwise keep it stuck there forever)
  const health = classifier.overallHealth(state);
  await tabStateManager.setHealth(tabId, health);
  updateBadge(tabId, health);
}

function notifyDashboards(tabId: number): void {
  LOG('port:push', { tabId, ports: dashboardPorts.size });
  for (const port of dashboardPorts) {
    try {
      port.postMessage({ type: 'KSPULSE_STATE_UPDATE', tabId });
    } catch {
      /* port disconnected */
    }
  }
}
