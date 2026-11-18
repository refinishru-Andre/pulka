import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Метка сборки — видна в форме сдачи, чтобы сразу понять, свежая ли версия
// открыта на устройстве (18.11.2026: телефон держал старый код весь вечер).
const BUILD_STAMP = new Date().toLocaleString('ru-RU', {
  timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

export default defineConfig({
  base: '/pulka/',
  define: { __BUILD_STAMP__: JSON.stringify(BUILD_STAMP) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        // Не перехватывать запросы к Supabase — они должны идти напрямую в сеть
        navigateFallbackDenylist: [/^\/auth\//, /^\/rest\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/pulka-api-178-154-204-13\.sslip\.io\/.*/,
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: 'Людочка',
        short_name: 'Людочка',
        description: 'Учёт и расчёт игры в преферанс (Питер)',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        // 'landscape' навязывал бы поворот на телефоне, где играют вертикально.
        // На планшете и так альбомная — там ориентацию выбирает человек.
        orientation: 'any',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
})
