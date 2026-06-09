import { applyTheme, setUserConfig } from '@config/userConfig';
import type { Theme } from '@shared/types';
import { useState } from 'preact/hooks';

const THEMES: Theme[] = ['auto', 'light', 'dark'];
const ICONS: Record<Theme, string> = { auto: 'A', light: '☀', dark: '☾' };
const LABELS: Record<Theme, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' };

interface Props {
  current: Theme;
}

export function ThemeToggle({ current }: Props) {
  const [theme, setTheme] = useState<Theme>(current);

  async function cycle() {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    setTheme(next);
    applyTheme(next);
    await setUserConfig({ theme: next });
  }

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Theme: ${LABELS[theme]} — click to cycle`}
      aria-label={`Current theme: ${LABELS[theme]}. Click to change.`}
      style={{
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-sm)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-secondary)',
        transition: 'color var(--dur) var(--ease-out), background var(--dur) var(--ease-out)',
      }}
      onMouseEnter={(e) => ((e.target as HTMLElement).style.background = 'var(--bg-hover)')}
      onMouseLeave={(e) => ((e.target as HTMLElement).style.background = '')}
    >
      {ICONS[theme]}
    </button>
  );
}
