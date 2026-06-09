import { DEFAULTS } from './defaults';
import type { Theme, Mode } from '@shared/types';

export interface UserConfig {
  theme: Theme;
  mode: Mode;
  ttfbWarnMs: number;
  ttfbPoorMs: number;
}

const CONFIG_KEY = 'ksp_user_config';

export async function getUserConfig(): Promise<UserConfig> {
  const result = await chrome.storage.local.get(CONFIG_KEY);
  return {
    theme: DEFAULTS.DEFAULT_THEME,
    mode: DEFAULTS.DEFAULT_MODE,
    ttfbWarnMs: DEFAULTS.TTFB_WARN_MS,
    ttfbPoorMs: DEFAULTS.TTFB_POOR_MS,
    ...(result[CONFIG_KEY] as Partial<UserConfig> ?? {}),
  };
}

export async function setUserConfig(patch: Partial<UserConfig>): Promise<void> {
  const current = await getUserConfig();
  await chrome.storage.local.set({ [CONFIG_KEY]: { ...current, ...patch } });
}

export function applyTheme(theme: Theme): void {
  const html = document.documentElement;
  if (theme === 'auto') {
    html.removeAttribute('data-theme');
  } else {
    html.setAttribute('data-theme', theme);
  }
}
