import { Component, ErrorInfo, type ReactNode } from 'react';
import { Button } from './Button.js';

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: Error }> {
  public state = { hasError: false, error: undefined };

  public static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Admin Error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', gap: '16px' }}>
          <div style={{ fontSize: '3rem' }}>⚠️</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>حدث خطأ في لوحة التحكم</h2>
          <div style={{ width: '200px' }}>
            <Button onClick={() => window.location.reload()}>إعادة المحاولة</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
