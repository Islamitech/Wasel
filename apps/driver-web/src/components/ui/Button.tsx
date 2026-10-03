import React from 'react';
import { Spinner } from './Spinner.js';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
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
    minHeight: 'var(--min-touch-target, 52px)',
    height: '52px',
    padding: '0 20px',
    borderRadius: 'var(--radius-md, 18px)',
    fontFamily: 'var(--font-family)',
    fontSize: '1rem',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
    border: 'none',
    outline: 'none',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    width: '100%',
    opacity: disabled || isLoading ? 0.6 : 1,
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
      border: '1.5px solid var(--color-ink, #12302b)',
      color: 'var(--color-ink, #12302b)',
    },
    danger: {
      backgroundColor: '#d32f2f',
      color: '#ffffff',
    },
  };

  return (
    <button
      disabled={disabled || isLoading}
      style={{ ...baseStyle, ...variantStyles[variant] }}
      {...props}
    >
      {isLoading ? <Spinner size={20} color="currentColor" /> : children}
    </button>
  );
};
