import React from 'react';

export const Spinner: React.FC<{ size?: number; color?: string }> = ({
  size = 24,
  color = 'var(--color-ink, #12302b)',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ animation: 'waselSpin 0.8s linear infinite' }}
    >
      <style>{`
        @keyframes waselSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
};
