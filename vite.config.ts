import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      selfDestroying: false,
      includeAssets: [
        "icon-192.png",
        "icon-512.png",
        "apple-touch-icon.png",
        "wasm/binjgb.js",
        "wasm/binjgb.wasm",
        "roms/pokered.gb",
        "roms/pokered.sym",
      ],
      manifest: false, // using static public/manifest.json so it works in dev too
      workbox: {
        // Cache the large ROM and WASM files
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,png,wasm,gb,sym}"],
        runtimeCaching: [
          {
            // Cache ROM and WASM with cache-first strategy
            urlPattern: /\.(gb|wasm|sym)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "pokehealth-assets",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
  build: {
    target: "esnext",
  },
});
