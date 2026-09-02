import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'XRPL Wallet',
        short_name: 'XRPL Wallet',
        description: 'Self-custody XRP Ledger wallet',
        theme_color: '#e6eaef',
        background_color: '#e6eaef',
        display: 'standalone',
        icons: [
          { src: 'pwa-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: 'pwa-512.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Only the static app shell is precached. Ledger/RPC traffic (XRPL
        // JSON-RPC + WebSocket, faucet) must NEVER be served from cache —
        // see docs/decisions.md guardrail #6. Explicitly exclude any runtime
        // caching for those hosts by not registering a runtimeCaching entry
        // for them; navigateFallback covers the SPA shell only.
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
})
