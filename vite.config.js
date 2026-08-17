import fs from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// package.json adalah SATU-SATUNYA sumber versi. Jangan hardcode versi di file lain.
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'))

// https://vitejs.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      // 'prompt': service worker tidak pernah reload halaman sendiri. Yang memutuskan kapan
      // update dipasang adalah UpdaterAlert, dari hasil cek /ota/version.json — sama seperti APK.
      registerType: 'prompt',
      // 'auto' meng-inject registerSW.js ke index.html, jadi SW terdaftar sejak halaman dibuka
      // (dulu registrasinya nebeng komponen di dalam area login, jadi baru jalan setelah login).
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
          { src: '/pwa-192x192.png', type: 'image/png', sizes: '192x192', purpose: 'any' },
          { src: '/pwa-512x512.webp', type: 'image/webp', sizes: '512x512', purpose: 'any' },
          { src: '/maskable-icon-512x512.webp', type: 'image/webp', sizes: '512x512', purpose: 'maskable' },
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
        // Navigasi TIDAK boleh dilayani dari precache. Kalau index.html lama disajikan SW,
        // reload sesudah update tetap memuat aplikasi versi lama — inilah yang dulu bikin
        // user harus hapus data/cache dulu. NetworkFirst: online selalu HTML terbaru,
        // offline jatuh ke salinan terakhir.
        navigateFallback: null,
        // index.html HARUS keluar dari precache. Workbox memetakan '/' ke entri precache
        // 'index.html' (directoryIndex), jadi selama dia masih di precache, rute NetworkFirst
        // di bawah tidak pernah kebagian menangani navigasi dan HTML lama tetap tersaji.
        globIgnores: ['index.html'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'lomeal-html',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 1 },
            },
          },
        ],
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
