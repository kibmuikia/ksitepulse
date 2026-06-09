import { setUserConfig } from '@config/userConfig';
import type { Mode } from '@shared/types';

interface Props {
  current: Mode;
  onChange: (mode: Mode) => void;
}

export function ModeToggle({ current, onChange }: Props) {
  async function toggle() {
    const next: Mode = current === 'everyday' ? 'developer' : 'everyday';
    onChange(next);
    await setUserConfig({ mode: next });
  }

  const isDev = current === 'developer';

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDev ? 'Switch to Everyday mode' : 'Switch to Developer mode'}
      aria-label={`Mode: ${current}. Click to toggle.`}
      style={{
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-sm)',
        fontSize: '10px',
        fontFamily: 'var(--font-mono)',
        color: isDev ? 'var(--health-good)' : 'var(--text-secondary)',
        fontWeight: isDev ? 600 : 400,
        transition: `color var(--dur) var(--ease-out), background var(--dur) var(--ease-out)`,
      }}
      onMouseEnter={(e) => ((e.target as HTMLElement).style.background = 'var(--bg-hover)')}
      onMouseLeave={(e) => ((e.target as HTMLElement).style.background = '')}
    >
      {'</>'}
    </button>
  );
}
