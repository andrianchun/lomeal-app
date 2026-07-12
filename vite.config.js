import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // autoUpdate: versi baru langsung aktif begitu online lagi, user tidak pernah
      // nyangkut di build lama (dan tidak perlu prompt "reload?" yang gampang diabaikan).
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Lomeal Nutrition Tracker',
        short_name: 'Lomeal',
        description: 'Aplikasi pelacak nutrisi & kalori harian',
        start_url: '/',
        display: 'standalone',
        background_color: '#070a08',
        theme_color: '#070a08',
        icons: [
          { src: '/icon-48.png', type: 'image/png', sizes: '48x48', purpose: 'any maskable' },
          { src: '/icon-72.png', type: 'image/png', sizes: '72x72', purpose: 'any maskable' },
          { src: '/icon-96.png', type: 'image/png', sizes: '96x96', purpose: 'any maskable' },
          { src: '/icon-128.png', type: 'image/png', sizes: '128x128', purpose: 'any maskable' },
          { src: '/icon-192.png', type: 'image/png', sizes: '192x192', purpose: 'any maskable' },
          { src: '/icon-256.png', type: 'image/png', sizes: '256x256', purpose: 'any maskable' },
          { src: '/icon-512.png', type: 'image/png', sizes: '512x512', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Default glob Workbox tidak mencakup .webp/.json — tanpa ini, background gambar
        // dan exercisedb.json (dipakai utk nambah exercise ke rutinitas) gagal saat offline.
        globPatterns: ['**/*.{js,css,html,ico,png,webp,svg,json,woff2}'],
        // exercisedb.json (~1MB) & beberapa bg-*.webp melebihi limit default Workbox (2MB aman,
        // tapi dinaikkan sedikit untuk jaga-jaga total payload gabungan).
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Pisahkan vendor besar ke chunk sendiri: parse per-unit lebih kecil di device
        // low-end, dan cache browser tetap valid saat kode aplikasi berubah.
        // PENTING: react/react-dom/scheduler harus satu chunk tersendiri yang tidak
        // mengimpor chunk lain, supaya tidak terjadi circular init (layar putih).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('html2canvas')) return undefined; // biarkan ikut dynamic import (lazy)
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
          if (id.includes('node_modules/firebase/') || id.includes('node_modules/@firebase/')) return 'vendor-firebase';
          if (id.includes('recharts') || id.includes('victory-vendor') || /node_modules\/d3-/.test(id)) return 'vendor-recharts';
          if (id.includes('lucide-react') || id.includes('@dnd-kit')) return 'vendor-ui';
          return 'vendor';
        },
      },
    },
  },
})
