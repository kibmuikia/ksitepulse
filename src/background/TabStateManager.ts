import { DEFAULTS } from '@config/defaults';
import type {
  ConsoleEntry,
  LongTask,
  NavTiming,
  RequestRecord,
  ResourceMessage,
  TabState,
} from '@shared/types';

export class TabStateManager {
  private key(tabId: number) {
    return `tab_${tabId}`;
  }

  async get(tabId: number): Promise<TabState | null> {
    const result = await chrome.storage.session.get(this.key(tabId));
    return (result[this.key(tabId)] as TabState) ?? null;
  }

  async init(tabId: number, url: string): Promise<void> {
    const state: TabState = {
      tabId,
      url,
      startTime: Date.now(),
      requests: [],
      console: [],
      vitals: {},
      nav: null,
      longTasks: [],
      health: 'loading',
    };
    await chrome.storage.session.set({ [this.key(tabId)]: state });
  }

  async remove(tabId: number): Promise<void> {
    await chrome.storage.session.remove(this.key(tabId));
  }

  async addRequest(
    tabId: number,
    req: Pick<RequestRecord, 'requestId' | 'url' | 'type' | 'timeStamp' | 'method'>,
  ): Promise<void> {
    await this.mutate(tabId, (state) => {
      state.requests.push({ ...req, status: 'pending' });
      if (state.requests.length > DEFAULTS.MAX_REQUESTS) state.requests.shift();
    });
  }

  async completeRequest(
    tabId: number,
    requestId: string,
    data: Pick<RequestRecord, 'statusCode' | 'fromCache' | 'duration'>,
  ): Promise<void> {
    await this.mutate(tabId, (state) => {
      const req = state.requests.find((r) => r.requestId === requestId);
      if (req) Object.assign(req, { status: 'complete', ...data });
    });
  }

  async failRequest(tabId: number, requestId: string, error: string): Promise<void> {
    await this.mutate(tabId, (state) => {
      const req = state.requests.find((r) => r.requestId === requestId);
      if (req) Object.assign(req, { status: 'failed', error });
    });
  }

  async addConsoleEntry(tabId: number, entry: ConsoleEntry): Promise<void> {
    await this.mutate(tabId, (state) => {
      state.console.push(entry);
      if (state.console.length > DEFAULTS.MAX_CONSOLE_ENTRIES) state.console.shift();
    });
  }

  async updateVital(
    tabId: number,
    name: string,
    value: number,
    rating: 'good' | 'needs-improvement' | 'poor',
  ): Promise<void> {
    await this.mutate(tabId, (state) => {
      state.vitals[name] = { value, rating };
    });
  }

  async updateNav(tabId: number, nav: NavTiming): Promise<void> {
    await this.mutate(tabId, (state) => {
      state.nav = nav;
    });
  }

  async addLongTask(tabId: number, task: LongTask): Promise<void> {
    await this.mutate(tabId, (state) => {
      state.longTasks.push(task);
      if (state.longTasks.length > DEFAULTS.MAX_LONG_TASKS) state.longTasks.shift();
    });
  }

  async updateResourceTiming(tabId: number, msg: ResourceMessage): Promise<void> {
    await this.mutate(tabId, (state) => {
      const req = state.requests.find((r) => r.url === msg.name && r.status === 'complete');
      if (req) {
        req.transferSize = msg.transferSize;
        if (req.duration == null && msg.duration > 0) req.duration = msg.duration;
        if (!req.fromCache && msg.deliveryType === 'cache') req.fromCache = true;
      }
    });
  }

  async setHealth(tabId: number, health: TabState['health']): Promise<void> {
    await this.mutate(tabId, (state) => {
      state.health = health;
    });
  }

  private async mutate(tabId: number, fn: (state: TabState) => void): Promise<void> {
    const state = await this.get(tabId);
    if (!state) return;
    fn(state);
    await chrome.storage.session.set({ [this.key(tabId)]: state });
  }
}
