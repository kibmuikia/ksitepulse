import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getUserConfig, applyTheme } from '@config/userConfig';
import '../styles/tokens.css';
import '../styles/base.css';

function Dashboard() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getUserConfig().then(config => {
      applyTheme(config.theme);
      setReady(true);
    });
  }, []);

  if (!ready) return null;

  return (
    <div class="dashboard-root" style={{ padding: 'var(--space-6)' }}>
      <h1 style={{
        fontSize: 'var(--text-xl)',
        fontWeight: 600,
        marginBottom: 'var(--space-2)',
      }}>
        ksite<span style={{ color: 'var(--health-good)' }}>pulse</span>
        <span style={{ color: 'var(--text-secondary)', marginLeft: 'var(--space-3)', fontSize: 'var(--text-base)', fontWeight: 400 }}>
          Dashboard
        </span>
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
        Full developer dashboard — coming in Phase 5.
      </p>
    </div>
  );
}

render(<Dashboard />, document.getElementById('app')!);
