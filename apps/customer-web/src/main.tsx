import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import './index.css';
import './i18n.js';

// Auto-check for Service Worker updates to immediately replace stale caches
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    registration.update();
  }).catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
