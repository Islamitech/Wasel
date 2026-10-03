import React from 'react';

export interface ToastProps {
  message: string;
  type?: 'ok' | 'error' | 'info';
  onClose?: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'ok', onClose }) => {
  const bg = type === 'ok' ? 'var(--color-ok, #1f8a5b)' : type === 'error' ? '#d32f2f' : 'var(--color-ink, #12302b)';

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(16px + var(--safe-top, 0px))',
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
        animation: 'waselSlideDown 0.25s ease-out',
      }}
    >
      <style>{`
        @keyframes waselSlideDown {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <span>{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '1.2rem',
            padding: '0 4px',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
};
