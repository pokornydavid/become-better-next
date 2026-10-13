import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { serviceWorkerSource, staticBuildId } from './src/lib/service-worker-source';
export default defineConfig(({ mode }) => ({
  plugins: [react(), { name: 'become-better-offline', apply: 'build', generateBundle: { order: 'post', handler(_options, bundle) {
    const files = Object.keys(bundle).filter(name => !name.endsWith('.map'));
    const version = staticBuildId(files.sort().flatMap(name => { const file=bundle[name]; return [name,file.type==='chunk'?file.code:file.source]; }));
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(version, [...files.map(name => './' + name), './favicon.svg', './manifest.webmanifest']) });
  } } }],
  base: loadEnv(mode, '.', '').VITE_BASE_PATH || './',
  build: { sourcemap: true, rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom'], cloud: ['@supabase/supabase-js'] } } } },
}));
