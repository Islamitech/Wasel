import React from 'react';

export interface ChipProps {
  label: string;
  variant?: 'default' | 'accent' | 'ok' | 'danger';
  icon?: React.ReactNode;
}

export const Chip: React.FC<ChipProps> = ({ label, variant = 'default', icon }) => {
  const styles: Record<string, React.CSSProperties> = {
    default: {
      backgroundColor: 'var(--color-chip, #eef3ef)',
      color: 'var(--color-ink, #12302b)',
    },
    accent: {
      backgroundColor: 'rgba(242, 162, 12, 0.15)',
      color: '#b27400',
    },
    ok: {
      backgroundColor: 'rgba(31, 138, 91, 0.15)',
      color: 'var(--color-ok, #1f8a5b)',
    },
    danger: {
      backgroundColor: 'rgba(217, 45, 32, 0.15)',
      color: '#d92d20',
    },
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 14px',
        borderRadius: 'var(--radius-sm, 14px)',
        fontSize: '0.875rem',
        fontWeight: 600,
        ...styles[variant],
      }}
    >
      {icon}
      {label}
    </span>
  );
};
