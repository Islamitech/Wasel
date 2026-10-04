import '@testing-library/jest-dom';
import '../src/i18n.js';

// Polyfill MediaRecorder for test environments
if (typeof window !== 'undefined' && !window.MediaRecorder) {
  class FakeMediaRecorder {
    state = 'inactive';
    ondataavailable: ((e: any) => void) | null = null;
    onstop: (() => void) | null = null;

    start() {
      this.state = 'recording';
    }

    stop() {
      this.state = 'inactive';
      if (this.ondataavailable) {
        this.ondataavailable({ data: new Blob(['fake-audio'], { type: 'audio/webm' }) });
      }
      if (this.onstop) {
        this.onstop();
      }
    }
  }

  (window as any).MediaRecorder = FakeMediaRecorder;
}

// Polyfill navigator.vibrate
if (typeof navigator !== 'undefined' && !navigator.vibrate) {
  navigator.vibrate = () => true;
}
