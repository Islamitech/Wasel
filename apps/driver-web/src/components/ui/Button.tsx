import React from 'react';
import { Spinner } from './Spinner.js';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'accent' | 'success';
  isLoading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  isLoading = false,
  disabled,
  children,
  style,
  ...props
}) => {
  const baseStyle: React.CSSProperties = {
    minHeight: 'var(--min-touch-target, 56px)',
    height: '56px',
    padding: '0 24px',
    borderRadius: 'var(--radius-md, 18px)',
    fontFamily: 'var(--font-family)',
    fontSize: '1.05rem',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
    border: 'none',
    outline: 'none',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    width: '100%',
    opacity: disabled || isLoading ? 0.6 : 1,
    boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
    ...style,
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: 'var(--color-ink, #12302b)',
      color: 'var(--color-sheet, #ffffff)',
    },
    secondary: {
      backgroundColor: 'var(--color-chip, #eef3ef)',
      color: 'var(--color-ink, #12302b)',
    },
    outline: {
      backgroundColor: 'transparent',
      border: '2px solid var(--color-ink, #12302b)',
      color: 'var(--color-ink, #12302b)',
    },
    danger: {
      backgroundColor: '#d32f2f',
      color: '#ffffff',
    },
    accent: {
      backgroundColor: 'var(--color-accent, #f2a20c)',
      color: '#12302b',
    },
    success: {
      backgroundColor: 'var(--color-ok, #1f8a5b)',
      color: '#ffffff',
    },
  };

  return (
    <button
      disabled={disabled || isLoading}
      style={{ ...baseStyle, ...variantStyles[variant] }}
      {...props}
    >
      {isLoading ? <Spinner size={22} color="currentColor" /> : children}
    </button>
  );
};
