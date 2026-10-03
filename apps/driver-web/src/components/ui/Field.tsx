import React from 'react';

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
}

export const Field: React.FC<FieldProps> = ({ label, error, helperText, style, ...props }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
      <label
        style={{
          fontSize: '0.875rem',
          fontWeight: 600,
          color: error ? '#d32f2f' : 'var(--color-ink, #12302b)',
        }}
      >
        {label}
      </label>
      <input
        style={{
          minHeight: 'var(--min-touch-target, 52px)',
          height: '52px',
          padding: '0 16px',
          borderRadius: 'var(--radius-sm, 14px)',
          border: error ? '1.5px solid #d32f2f' : '1px solid #d1d5db',
          backgroundColor: 'var(--color-sheet, #ffffff)',
          color: 'var(--color-ink, #12302b)',
          fontSize: '1rem',
          fontFamily: 'var(--font-family)',
          direction: props.type === 'tel' ? 'ltr' : 'rtl',
          textAlign: props.type === 'tel' ? 'center' : 'start',
          outline: 'none',
          ...style,
        }}
        {...props}
      />
      {error && <span style={{ fontSize: '0.8rem', color: '#d32f2f' }}>{error}</span>}
      {helperText && !error && (
        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{helperText}</span>
      )}
    </div>
  );
};
