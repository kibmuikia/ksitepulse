import type { Health } from '@shared/types';
import { DEFAULTS } from '@config/defaults';

interface BadgeConfig {
  text: string;
  color: string;
}

const BADGE: Record<Health, BadgeConfig> = {
  loading: { text: DEFAULTS.BADGE_LOADING_TEXT, color: DEFAULTS.BADGE_COLOR_LOADING },
  good:    { text: DEFAULTS.BADGE_GOOD_TEXT,    color: DEFAULTS.BADGE_COLOR_GOOD    },
  warning: { text: DEFAULTS.BADGE_WARN_TEXT,    color: DEFAULTS.BADGE_COLOR_WARN    },
  error:   { text: DEFAULTS.BADGE_ERROR_TEXT,   color: DEFAULTS.BADGE_COLOR_ERROR   },
};

export function updateBadge(tabId: number, health: Health): void {
  const { text, color } = BADGE[health];
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });
}
