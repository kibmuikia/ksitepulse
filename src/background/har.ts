import type { TabState, RequestRecord } from '@shared/types';

interface HarEntry {
  startedDateTime: string;
  time: number;
  request: { method: string; url: string; httpVersion: string; headers: unknown[]; queryString: unknown[]; headersSize: number; bodySize: number };
  response: { status: number; statusText: string; httpVersion: string; headers: unknown[]; content: { size: number; mimeType: string }; redirectURL: string; headersSize: number; bodySize: number };
  cache: Record<string, never>;
  timings: { send: number; wait: number; receive: number };
}

export function buildHar(state: TabState): object {
  const entries: HarEntry[] = state.requests
    .filter(r => r.status !== 'pending')
    .map(r => requestToEntry(r, state.startTime));

  return {
    log: {
      version: '1.2',
      creator: { name: 'ksitepulse', version: '1.0.0' },
      pages: [{
        startedDateTime: new Date(state.startTime).toISOString(),
        id: 'page_1',
        title: state.url,
        pageTimings: {
          onContentLoad: state.nav?.domContentLoaded ?? -1,
          onLoad: state.nav?.loadComplete ?? -1,
        },
      }],
      entries,
    },
  };
}

function requestToEntry(r: RequestRecord, pageStart: number): HarEntry {
  const status = r.statusCode ?? (r.status === 'failed' ? 0 : 200);
  const duration = r.duration ?? 0;
  const wait = Math.max(0, duration - 1);

  return {
    startedDateTime: new Date(pageStart + r.timeStamp).toISOString(),
    time: duration,
    request: {
      method: 'GET',
      url: r.url,
      httpVersion: 'HTTP/1.1',
      headers: [],
      queryString: [],
      headersSize: -1,
      bodySize: -1,
    },
    response: {
      status,
      statusText: r.status === 'failed' ? r.error ?? 'Error' : String(status),
      httpVersion: 'HTTP/1.1',
      headers: [],
      content: { size: r.transferSize ?? -1, mimeType: mimeFromType(r.type) },
      redirectURL: '',
      headersSize: -1,
      bodySize: r.transferSize ?? -1,
    },
    cache: {},
    timings: { send: 0, wait, receive: 1 },
  };
}

function mimeFromType(type: string): string {
  const map: Record<string, string> = {
    script: 'application/javascript',
    stylesheet: 'text/css',
    image: 'image/*',
    font: 'font/*',
    xmlhttprequest: 'application/json',
    fetch: 'application/json',
    document: 'text/html',
  };
  return map[type] ?? 'application/octet-stream';
}
