interface Props {
  tabId: number | undefined;
}

export function ExportButton({ tabId }: Props) {
  if (!tabId) return null;

  function handleExport() {
    chrome.runtime.sendMessage({ type: 'KSPULSE_EXPORT', tabId });
  }

  return (
    <button
      onClick={handleExport}
      title="Download HAR file"
      style={{
        padding: '4px 10px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text-secondary)',
        fontSize: 'var(--text-xs)',
        fontWeight: 500,
        transition: `background var(--dur) var(--ease-out)`,
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)')}
    >
      ↓ HAR
    </button>
  );
}
