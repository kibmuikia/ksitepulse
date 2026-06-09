import type { TabState, Issue, Severity } from '@shared/types';
import { ERROR_MAP } from '@shared/errorMap';
import { DEFAULTS } from '@config/defaults';

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

const SEVERITY_PENALTY: Record<Severity, number> = {
  critical: 100, high: 40, medium: 20, low: 8,
};

export class IssueClassifier {
  classify(state: TabState): Issue[] {
    const issues: Issue[] = [];
    const total = state.requests.length;

    if (total === 0) return issues;

    const failed = state.requests.filter(
      r => r.status === 'failed' || (r.statusCode !== undefined && r.statusCode >= 400),
    );

    // Total failure — short-circuit
    if (failed.length === total && total >= 3) {
      return [{
        id: 'TOTAL_FAILURE',
        severity: 'critical',
        title: 'This website is down',
        detail: 'None of the page resources could load. The server may be offline.',
        action: 'Try again in a few minutes.',
      }];
    }

    // 5xx server errors
    const serverErrors = failed.filter(r => r.statusCode !== undefined && r.statusCode >= 500);
    if (serverErrors.length > 0) {
      const codes = [...new Set(serverErrors.map(r => r.statusCode))].join(', ');
      issues.push({
        id: 'SERVER_ERROR',
        severity: 'high',
        title: 'The website is having server problems',
        detail: `Server returned ${codes} error${serverErrors.length > 1 ? 's' : ''} on ${serverErrors.length} resource${serverErrors.length > 1 ? 's' : ''}.`,
        action: "This is on the website's end. Try again later.",
        technical: serverErrors.map(r => ({ url: r.url, code: r.statusCode })),
        count: serverErrors.length,
      });
    }

    // 4xx client errors (excluding 404 which is common and less alarming)
    const clientErrors = failed.filter(r => r.statusCode !== undefined && r.statusCode >= 400 && r.statusCode < 500 && r.statusCode !== 404);
    if (clientErrors.length > 0) {
      issues.push({
        id: 'CLIENT_ERROR',
        severity: 'medium',
        title: 'Some resources were rejected',
        detail: `${clientErrors.length} resource${clientErrors.length > 1 ? 's were' : ' was'} rejected by the server (${clientErrors[0].statusCode}).`,
        action: null,
        count: clientErrors.length,
      });
    }

    // Network errors — match against ERROR_MAP
    const netFailed = failed.filter(r => r.error);
    for (const [key, entry] of Object.entries(ERROR_MAP)) {
      const matching = netFailed.filter(r => r.error?.includes(key));
      if (matching.length > 0) {
        issues.push({
          id: key,
          severity: entry.severity,
          title: entry.title,
          detail: entry.detail,
          action: entry.action,
          count: matching.length,
        });
      }
    }

    // Slow TTFB
    const ttfbPoor = state.nav?.ttfb ?? 0;
    if (ttfbPoor > DEFAULTS.TTFB_POOR_MS) {
      issues.push({
        id: 'SLOW_TTFB',
        severity: 'medium',
        title: 'The website is slow to respond',
        detail: `Server took ${(ttfbPoor / 1000).toFixed(1)}s before sending any data.`,
        action: 'The website may be overloaded. Try again later.',
      });
    } else if (ttfbPoor > DEFAULTS.TTFB_WARN_MS) {
      issues.push({
        id: 'SLOW_TTFB_WARN',
        severity: 'low',
        title: 'Slightly slow server response',
        detail: `Server took ${(ttfbPoor / 1000).toFixed(1)}s to start responding.`,
        action: null,
      });
    }

    // Web Vitals — poor ratings
    for (const [name, vital] of Object.entries(state.vitals)) {
      if (vital.rating === 'poor') {
        issues.push({
          id: `VITAL_POOR_${name}`,
          severity: 'low',
          title: `Poor ${name} performance`,
          detail: `${name} is in the poor range (${formatVital(name, vital.value)}), which affects usability.`,
          action: null,
        });
      }
    }

    // Console: framework crashes
    const frameworkErrors = state.console.filter(c =>
      ['REACT_ERROR', 'VUE_WARN', 'ANGULAR_ERROR', 'UNHANDLED_PROMISE'].includes(c.category),
    );
    if (frameworkErrors.length > 0) {
      issues.push({
        id: 'FRAMEWORK_ERROR',
        severity: 'medium',
        title: 'The page has a code error',
        detail: `${frameworkErrors.length} application error${frameworkErrors.length > 1 ? 's' : ''} detected in the page.`,
        action: "Try refreshing. If it persists, it's a bug on the site.",
        count: frameworkErrors.length,
      });
    }

    // CORS errors
    const corsErrors = state.console.filter(c => c.category === 'CORS_ERROR');
    if (corsErrors.length > 0) {
      issues.push({
        id: 'CORS_ERROR',
        severity: 'medium',
        title: 'Cross-origin request blocked',
        detail: "A request was blocked by the browser's security policy (CORS).",
        action: null,
        count: corsErrors.length,
      });
    }

    // CSP violations
    const cspErrors = state.console.filter(c => c.category === 'CSP_VIOLATION');
    if (cspErrors.length > 0) {
      issues.push({
        id: 'CSP_VIOLATION',
        severity: 'medium',
        title: 'Content security policy violation',
        detail: `${cspErrors.length} resource${cspErrors.length > 1 ? 's were' : ' was'} blocked by the site's security policy.`,
        action: null,
        count: cspErrors.length,
      });
    }

    return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  }

  healthScore(state: TabState): number {
    const issues = this.classify(state);
    const penalty = issues.reduce((sum, i) => sum + (SEVERITY_PENALTY[i.severity] ?? 0), 0);
    return Math.max(0, 100 - penalty);
  }

  overallHealth(state: TabState): TabState['health'] {
    if (state.health === 'loading') return 'loading';
    const score = this.healthScore(state);
    if (score >= 80) return 'good';
    if (score >= 40) return 'warning';
    return 'error';
  }
}

function formatVital(name: string, value: number): string {
  if (name === 'CLS') return value.toFixed(3);
  if (name === 'INP' || name === 'LCP' || name === 'FCP' || name === 'TTFB') {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
  }
  return String(value);
}
