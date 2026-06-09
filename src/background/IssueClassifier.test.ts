import type { TabState } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { IssueClassifier } from './IssueClassifier';

function makeState(overrides: Partial<TabState> = {}): TabState {
  return {
    tabId: 1,
    url: 'https://example.com',
    startTime: Date.now(),
    requests: [],
    console: [],
    vitals: {},
    nav: null,
    longTasks: [],
    health: 'good',
    ...overrides,
  };
}

const classifier = new IssueClassifier();

describe('IssueClassifier', () => {
  it('returns no issues for clean state', () => {
    const state = makeState({
      requests: [
        {
          requestId: '1',
          url: 'https://example.com/',
          type: 'main_frame',
          timeStamp: 0,
          status: 'complete',
          statusCode: 200,
        },
      ],
    });
    expect(classifier.classify(state)).toHaveLength(0);
    expect(classifier.healthScore(state)).toBe(100);
    expect(classifier.overallHealth(state)).toBe('good');
  });

  it('returns TOTAL_FAILURE when all requests fail', () => {
    const state = makeState({
      requests: [
        {
          requestId: '1',
          url: 'https://example.com/',
          type: 'main_frame',
          timeStamp: 0,
          status: 'failed',
          error: 'ERR_CONNECTION_TIMED_OUT',
        },
        {
          requestId: '2',
          url: 'https://example.com/app.js',
          type: 'script',
          timeStamp: 0,
          status: 'failed',
          error: 'ERR_CONNECTION_TIMED_OUT',
        },
        {
          requestId: '3',
          url: 'https://example.com/style.css',
          type: 'stylesheet',
          timeStamp: 0,
          status: 'failed',
          error: 'ERR_CONNECTION_TIMED_OUT',
        },
      ],
    });
    const issues = classifier.classify(state);
    expect(issues[0].id).toBe('TOTAL_FAILURE');
    expect(issues[0].severity).toBe('critical');
    expect(classifier.healthScore(state)).toBe(0);
    expect(classifier.overallHealth(state)).toBe('error');
  });

  it('returns SERVER_ERROR for 5xx responses', () => {
    const state = makeState({
      requests: [
        {
          requestId: '1',
          url: 'https://example.com/',
          type: 'main_frame',
          timeStamp: 0,
          status: 'complete',
          statusCode: 200,
        },
        {
          requestId: '2',
          url: 'https://example.com/api',
          type: 'xmlhttprequest',
          timeStamp: 0,
          status: 'complete',
          statusCode: 503,
        },
        {
          requestId: '3',
          url: 'https://example.com/app.js',
          type: 'script',
          timeStamp: 0,
          status: 'complete',
          statusCode: 504,
        },
      ],
    });
    const issues = classifier.classify(state);
    const serverErr = issues.find((i) => i.id === 'SERVER_ERROR');
    expect(serverErr).toBeDefined();
    expect(serverErr?.severity).toBe('high');
    expect(serverErr?.count).toBe(2);
    expect(classifier.healthScore(state)).toBeLessThan(80);
  });

  it('returns SLOW_TTFB for nav timing above poor threshold', () => {
    const state = makeState({
      requests: [
        {
          requestId: '1',
          url: 'https://example.com/',
          type: 'main_frame',
          timeStamp: 0,
          status: 'complete',
          statusCode: 200,
        },
      ],
      nav: {
        ttfb: 2500,
        domContentLoaded: 3000,
        loadComplete: 3500,
        protocol: 'h2',
        transferSize: 12000,
      },
    });
    const issues = classifier.classify(state);
    const ttfbIssue = issues.find((i) => i.id === 'SLOW_TTFB');
    expect(ttfbIssue).toBeDefined();
    expect(ttfbIssue?.severity).toBe('medium');
  });

  it('returns poor vital issue for LCP poor rating', () => {
    const state = makeState({
      requests: [
        {
          requestId: '1',
          url: 'https://example.com/',
          type: 'main_frame',
          timeStamp: 0,
          status: 'complete',
          statusCode: 200,
        },
      ],
      vitals: { LCP: { value: 5200, rating: 'poor' } },
    });
    const issues = classifier.classify(state);
    const vitalIssue = issues.find((i) => i.id === 'VITAL_POOR_LCP');
    expect(vitalIssue).toBeDefined();
    expect(vitalIssue?.severity).toBe('low');
  });

  it('score is 0 for critical, ~60 for high, ~80 for medium, 100 for clean', () => {
    const critical = makeState({
      requests: Array.from({ length: 3 }, (_, i) => ({
        requestId: `${i}`,
        url: 'x',
        type: 'script',
        timeStamp: 0,
        status: 'failed' as const,
        error: 'ERR_FAILED',
      })),
    });
    expect(classifier.healthScore(critical)).toBe(0);

    const oneHigh = makeState({
      requests: [
        {
          requestId: '1',
          url: 'https://x.com/',
          type: 'main_frame',
          timeStamp: 0,
          status: 'complete',
          statusCode: 200,
        },
        {
          requestId: '2',
          url: 'https://x.com/app.js',
          type: 'script',
          timeStamp: 0,
          status: 'complete',
          statusCode: 500,
        },
      ],
    });
    expect(classifier.healthScore(oneHigh)).toBe(60);

    const oneMedium = makeState({
      requests: [
        {
          requestId: '1',
          url: 'https://x.com/',
          type: 'main_frame',
          timeStamp: 0,
          status: 'complete',
          statusCode: 200,
        },
      ],
      console: [
        { level: 'error', category: 'REACT_ERROR', message: 'Hydration failed', timestamp: 0 },
      ],
    });
    expect(classifier.healthScore(oneMedium)).toBe(80);
  });
});
