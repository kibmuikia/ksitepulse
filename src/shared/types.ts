export type Health = 'loading' | 'good' | 'warning' | 'error';
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Theme = 'auto' | 'light' | 'dark';
export type Mode = 'everyday' | 'developer';

export interface TabState {
  tabId: number;
  url: string;
  startTime: number;
  requests: RequestRecord[];
  console: ConsoleEntry[];
  vitals: Record<string, VitalEntry>;
  nav: NavTiming | null;
  longTasks: LongTask[];
  health: Health;
}

export interface RequestRecord {
  requestId: string;
  url: string;
  method?: string;
  type: string;
  timeStamp: number;
  status: 'pending' | 'complete' | 'failed';
  statusCode?: number;
  fromCache?: boolean;
  duration?: number | null;
  error?: string;
  transferSize?: number;
}

export interface ConsoleEntry {
  id: string;
  level: string;
  category: string;
  message: string;
  timestamp: number;
}

export interface VitalEntry {
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
}

export interface NavTiming {
  ttfb: number;
  domContentLoaded: number;
  loadComplete: number;
  protocol: string;
  transferSize: number;
}

export interface LongTask {
  duration: number;
  blockingDuration: number;
  startTime: number;
  entryType: 'long-animation-frame' | 'longtask';
}

export interface Issue {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  action: string | null;
  technical?: unknown;
  count?: number;
}

export interface TabSummary extends TabState {
  issues: Issue[];
  score: number;
}

// ── Message shapes ────────────────────────────────────────────────

export interface KspMessage {
  type: string;
  [key: string]: unknown;
}

export interface BatchMessage {
  type: 'KSPULSE_BATCH';
  items: KspMessage[];
}

export interface ConsoleMessage extends KspMessage {
  type: 'KSPULSE_CONSOLE';
  level: string;
  category: string;
  message: string;
  timestamp: number;
}

export interface VitalMessage extends KspMessage {
  type: 'KSPULSE_VITAL';
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
}

export interface NavMessage extends KspMessage {
  type: 'KSPULSE_NAV';
  ttfb: number;
  domContentLoaded: number;
  loadComplete: number;
  protocol: string;
  transferSize: number;
}

export interface ResourceMessage extends KspMessage {
  type: 'KSPULSE_RESOURCE';
  name: string;
  initiatorType: string;
  duration: number;
  transferSize: number;
  deliveryType: string;
  nextHopProtocol: string;
  timestamp: number;
}

export interface LongTaskMessage extends KspMessage {
  type: 'KSPULSE_LONG_TASK';
  duration: number;
  blockingDuration: number;
  startTime: number;
  entryType: 'long-animation-frame' | 'longtask';
}

export interface GetStateMessage {
  type: 'KSPULSE_GET_STATE';
  tabId: number;
}

export interface ExportMessage {
  type: 'KSPULSE_EXPORT';
  tabId: number;
}
