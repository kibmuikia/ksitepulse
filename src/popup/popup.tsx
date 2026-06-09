import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getUserConfig, applyTheme } from '@config/userConfig';
import '../styles/tokens.css';
import '../styles/base.css';

function Popup() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getUserConfig().then(config => {
      applyTheme(config.theme);
      setReady(true);
    });
  }, []);

  if (!ready) return null;

  return (
    <div class="popup-root">
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px var(--space-4)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <span style={{ fontWeight: 600, fontSize: 'var(--text-md)', letterSpacing: '-0.01em' }}>
          ksite<span style={{ color: 'var(--health-good)' }}>pulse</span>
        </span>
      </header>
      <main style={{
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-3)',
      }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          Loading page data…
        </p>
      </main>
    </div>
  );
}

render(<Popup />, document.getElementById('app')!);
