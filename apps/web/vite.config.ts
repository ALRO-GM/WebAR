import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // three.js ocupa casi todo el paquete (~140 KB con gzip); es lo esperado.
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
    // Tres páginas: la app, la de imprimir tarjetas y el panel del profesorado.
    rollupOptions: { input: { main: 'index.html', cartas: 'cartas.html', profesor: 'profesor.html' } },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'WebAR · Átomos',
        short_name: 'Átomos AR',
        description: 'Realidad aumentada desde la web para aprender química con átomos y moléculas',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#111317',
        theme_color: '#111317',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
        // De la fuente basta el alfabeto latino (el resto se descarga si hiciera falta).
        globIgnores: ['**/*cyrillic*', '**/*vietnamese*', '**/*greek*', '**/*-italic*'],
        // /health es del servidor y tiene que llegar siempre fresco.
        navigateFallbackDenylist: [/^\/health/, /^\/api\//, /^\/profesor/, /^\/cartas/],
      },
    }),
  ],
});
