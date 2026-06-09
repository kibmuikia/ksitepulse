
import { TabStateManager } from "./TabStateManager";
import { IssueClassifier } from "./IssueClassifier";
import { updateBadge } from "./badge";
import { buildHar } from "./har";
import type {
  BatchMessage,
  ConsoleMessage,
  VitalMessage,
  NavMessage,
  ResourceMessage,
  LongTaskMessage,
  KspMessage,
} from "@shared/types";

const tabStateManager = new TabStateManager();
const classifier = new IssueClassifier();

// Ports for live-push to open dashboard pages
const dashboardPorts = new Set<chrome.runtime.Port>();

// ── Tab lifecycle ─────────────────────────────────────────────────

chrome.webNavigation.onBeforeNavigate.addListener(
  async ({ tabId, frameId, url }) => {
    if (frameId !== 0) return;
    await tabStateManager.init(tabId, url);
    updateBadge(tabId, "loading");
  },
);

chrome.webNavigation.onCompleted.addListener(async ({ tabId, frameId }) => {
  if (frameId !== 0) return;
  await refreshBadge(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStateManager.remove(tabId);
});

// ── Network interception (observational — no blocking) ────────────

const pendingRequests = new Map<string, number>();

chrome.webRequest.onBeforeRequest.addListener(
  ({ requestId, url, type, tabId, timeStamp }) => {
    if (tabId < 0) return;
    pendingRequests.set(requestId, timeStamp);
    tabStateManager.addRequest(tabId, { requestId, url, type, timeStamp });
  },
  { urls: ["<all_urls>"] },
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
    await refreshBadge(tabId);
  },
  { urls: ["<all_urls>"] },
);

chrome.webRequest.onErrorOccurred.addListener(
  async ({ requestId, tabId, error }) => {
    if (tabId < 0) return;
    pendingRequests.delete(requestId);
    await tabStateManager.failRequest(tabId, requestId, error);
    await refreshBadge(tabId);
  },
  { urls: ["<all_urls>"] },
);

// ── Message bus ───────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (msg: KspMessage, sender, sendResponse) => {
    const tabId = sender.tab?.id;
    if (!tabId) return;

    (async () => {
      if (msg.type === "KSPULSE_BATCH") {
        const { items } = msg as unknown as BatchMessage;
        for (const item of items) {
          await handleContentMessage(tabId, item);
        }
        await refreshBadge(tabId);
        notifyDashboards(tabId);
        return;
      }

      if (msg.type === "KSPULSE_GET_STATE") {
        const state = await tabStateManager.get(tabId);
        if (!state) {
          sendResponse(null);
          return;
        }
        sendResponse({
          ...state,
          issues: classifier.classify(state),
          score: classifier.healthScore(state),
        });
        return;
      }

      if (msg.type === "KSPULSE_EXPORT") {
        const state = await tabStateManager.get(tabId);
        if (!state) return;
        const har = buildHar(state);
        const json = JSON.stringify(har, null, 2);
        const url = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
        chrome.downloads.download({
          url,
          filename: `ksitepulse-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.har`,
          saveAs: false,
        });
        return;
      }
    })();

    return true; // keep channel open for async sendResponse
  },
);

// ── Dashboard port connections (live push) ────────────────────────

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ksp-dashboard") return;
  dashboardPorts.add(port);
  port.onDisconnect.addListener(() => dashboardPorts.delete(port));
});

// ── Helpers ───────────────────────────────────────────────────────

async function handleContentMessage(
  tabId: number,
  msg: KspMessage,
): Promise<void> {
  switch (msg.type) {
    case "KSPULSE_CONSOLE": {
      const m = msg as ConsoleMessage;
      await tabStateManager.addConsoleEntry(tabId, {
        level: m.level,
        category: m.category,
        message: m.message,
        timestamp: m.timestamp,
      });
      break;
    }
    case "KSPULSE_VITAL": {
      const m = msg as VitalMessage;
      await tabStateManager.updateVital(tabId, m.name, m.value, m.rating);
      break;
    }
    case "KSPULSE_NAV": {
      const m = msg as NavMessage;
      await tabStateManager.updateNav(tabId, {
        ttfb: m.ttfb,
        domContentLoaded: m.domContentLoaded,
        loadComplete: m.loadComplete,
        protocol: m.protocol,
        transferSize: m.transferSize,
      });
      break;
    }
    case "KSPULSE_RESOURCE": {
      await tabStateManager.updateResourceTiming(tabId, msg as ResourceMessage);
      break;
    }
    case "KSPULSE_LONG_TASK": {
      const m = msg as LongTaskMessage;
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

async function refreshBadge(tabId: number): Promise<void> {
  const state = await tabStateManager.get(tabId);
  if (!state) return;
  const health =
    state.health === "loading" ? "loading" : classifier.overallHealth(state);
  await tabStateManager.setHealth(tabId, health);
  updateBadge(tabId, health);
}

function notifyDashboards(tabId: number): void {
  for (const port of dashboardPorts) {
    try {
      port.postMessage({ type: "KSPULSE_STATE_UPDATE", tabId });
    } catch {
      /* port disconnected */
    }
  }
}
