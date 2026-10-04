import React from 'react';

export const Chip: React.FC<{ label: string; variant?: 'default' | 'accent' | 'ok' | 'warn' | 'no' }> = ({
  label,
  variant = 'default',
}) => {
  const styles: Record<string, React.CSSProperties> = {
    default: { backgroundColor: 'var(--color-chip, #eef3ef)', color: 'var(--color-ink, #12302b)' },
    accent: { backgroundColor: 'rgba(242, 162, 12, 0.15)', color: '#b27400' },
    ok: { backgroundColor: 'rgba(31, 138, 91, 0.15)', color: 'var(--color-ok, #1f8a5b)' },
    warn: { backgroundColor: 'rgba(234, 88, 12, 0.15)', color: '#ea580c' },
    no: { backgroundColor: 'rgba(220, 38, 38, 0.15)', color: '#dc2626' },
  };


  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '6px 14px',
        borderRadius: 'var(--radius-sm, 14px)',
        fontSize: '0.875rem',
        fontWeight: 600,
        ...styles[variant],
      }}
    >
      {label}
    </span>
  );
};

export const Toast: React.FC<{ message: string; type?: 'ok' | 'error'; onClose?: () => void }> = ({
  message,
  type = 'ok',
  onClose,
}) => {
  const bg = type === 'ok' ? 'var(--color-ok, #1f8a5b)' : '#d32f2f';
  return (
    <div
      style={{
        position: 'fixed',
        top: '16px',
        left: '16px',
        right: '16px',
        maxWidth: '420px',
        margin: '0 auto',
        backgroundColor: bg,
        color: '#ffffff',
        padding: '12px 18px',
        borderRadius: 'var(--radius-sm, 14px)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.95rem',
        fontWeight: 600,
      }}
    >
      <span>{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer', fontSize: '1.2rem' }}
        >
          ×
        </button>
      )}
    </div>
  );
};
