import React, { useEffect } from 'react';

export interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const Sheet: React.FC<SheetProps> = ({ isOpen, onClose, title, children }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(2px)',
          animation: 'waselFadeIn 0.2s ease-out',
        }}
      />

      {/* Sheet Content */}
      <div
        style={{
          position: 'relative',
          backgroundColor: 'var(--color-sheet, #ffffff)',
          borderTopLeftRadius: 'var(--radius-lg, 24px)',
          borderTopRightRadius: 'var(--radius-lg, 24px)',
          padding: '16px 20px calc(24px + var(--safe-bottom, 0px)) 20px',
          boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.12)',
          zIndex: 1001,
          animation: 'waselSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <style>{`
          @keyframes waselSlideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
          @keyframes waselFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>
        {/* Grab Handle */}
        <div
          style={{
            width: '44px',
            height: '5px',
            backgroundColor: '#d1d5db',
            borderRadius: '9999px',
            margin: '0 auto 16px auto',
          }}
        />

        {title && (
          <h3
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              marginBottom: '16px',
              textAlign: 'center',
            }}
          >
            {title}
          </h3>
        )}

        {children}
      </div>
    </div>
  );
};
