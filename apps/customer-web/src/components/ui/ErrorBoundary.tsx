import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from './Button.js';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in UI tree:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center',
            gap: '16px',
          }}
        >
          <div style={{ fontSize: '3rem' }}>⚠️</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>عذراً، حدث خطأ غير متوقع</h2>
          <p style={{ color: '#6b7280', maxWidth: '400px' }}>
            {this.state.error?.message || 'واجه التطبيق مشكلة غير متوقعة. يرجى إعادة المحاولة.'}
          </p>
          <div style={{ width: '200px' }}>
            <Button onClick={() => window.location.reload()}>إعادة المحاولة</Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
