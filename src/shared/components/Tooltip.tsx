import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

interface TooltipProps {
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: ComponentChildren;
  disabled?: boolean;
}

const POS: Record<string, Record<string, string>> = {
  top: { bottom: 'calc(100% + 7px)', left: '50%', transform: 'translateX(-50%)' },
  bottom: { top: 'calc(100% + 7px)', left: '50%', transform: 'translateX(-50%)' },
  left: { right: 'calc(100% + 7px)', top: '50%', transform: 'translateY(-50%)' },
  right: { left: 'calc(100% + 7px)', top: '50%', transform: 'translateY(-50%)' },
};

export function Tooltip({ content, position = 'bottom', children, disabled }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (disabled || !content) return <>{children}</>;

  const isLong = content.length > 120;
  const text = isLong && !expanded ? `${content.slice(0, 118)}…` : content;

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => {
        setVisible(false);
        setExpanded(false);
      }}
      onFocus={() => setVisible(true)}
      onBlur={() => {
        setVisible(false);
        setExpanded(false);
      }}
    >
      {children}
      <span
        role="tooltip"
        style={{
          position: 'absolute',
          ...POS[position],
          zIndex: 9999,
          maxWidth: 240,
          padding: '6px 10px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
          whiteSpace: 'normal',
          wordBreak: 'break-word',
          boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
          pointerEvents: visible && isLong ? 'auto' : 'none',
          opacity: visible ? 1 : 0,
          transition: 'opacity 120ms ease-out',
          animation: visible ? 'ksp-tooltip-in 120ms ease-out forwards' : undefined,
        }}
      >
        {text}
        {isLong && !expanded && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
            }}
            onKeyPress={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setExpanded(true);
              }
            }}
            style={{
              display: 'block',
              color: 'var(--health-good)',
              cursor: 'pointer',
              marginTop: 4,
            }}
          >
            show more
          </span>
        )}
      </span>
    </span>
  );
}
