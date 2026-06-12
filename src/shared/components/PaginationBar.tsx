interface PaginationBarProps {
  page: number;
  totalPages: number;
  start: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
}

export function PaginationBar({
  page,
  totalPages,
  start,
  pageSize,
  total,
  onPageChange,
}: PaginationBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 'var(--space-2)',
      }}
    >
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        {start + 1}–{Math.min(start + pageSize, total)} of {total}
      </span>
      <div style={{ display: 'flex', gap: 'var(--space-1)', alignItems: 'center' }}>
        <PagerBtn label="← Prev" disabled={page <= 1} onClick={() => onPageChange(page - 1)} />
        <span
          style={{
            padding: '3px var(--space-2)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {page} / {totalPages}
        </span>
        <PagerBtn
          label="Next →"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        />
      </div>
    </div>
  );
}

function PagerBtn({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '3px 10px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-default)',
        background: 'var(--bg-surface)',
        color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
        fontSize: 'var(--text-xs)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}
