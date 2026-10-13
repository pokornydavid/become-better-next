import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/manrope';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './styles.css';
import './refinements.css';
import './features.css';
import './planning.css';
import './theme.css';
import './usability.css';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() {
    if (this.state.error) return <main className="fatal"><h1>Potřebujeme obnovit aplikaci.</h1><p>{this.state.error}</p><button onClick={() => location.reload()}>Zkusit znovu</button><p>Uložená data zůstávají v tomto prohlížeči.</p></main>;
    return this.props.children;
  }
}
const root = ReactDOM.createRoot(document.getElementById('root')!);
if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL('sw.js', window.location.href), { updateViaCache: 'none' }).then(registration => {
      const update = () => { if (registration.waiting && navigator.serviceWorker.controller) window.dispatchEvent(new CustomEvent('bb-update-ready',{detail:registration})); };
      update(); registration.addEventListener('updatefound',() => { registration.installing?.addEventListener('statechange',update); });
      void navigator.serviceWorker.ready.then(() => window.dispatchEvent(new Event('bb-offline-ready')));
    }).catch(() => { /* Online use remains available when caching is unavailable. */ });
  },{once:true});
}
void import('./App').then(({ App }) => root.render(<ErrorBoundary><App /></ErrorBoundary>)).catch((error: Error) => root.render(<main className="fatal"><h1>Aplikaci se nepodařilo načíst.</h1><p>{error.message}</p><p>Uložená data jsme neměnili. Obnov stránku nebo si vyžádej pomoc.</p></main>));
