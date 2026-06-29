import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from '@vant/auto-import-resolver'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'
import path from 'path'

// 读取根目录版本号
const rootPkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version)
  },
  plugins: [
    vue(),
    Components({ resolvers: [VantResolver()] }),
    VitePWA({
      registerType: 'autoUpdate',
      // Electron 环境禁用 SW 避免导航拦截
      disable: true,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '晶振报价系统',
        short_name: '报价查询',
        description: '晶振物料价格记录与查询',
        theme_color: '#1989fa',
        background_color: '#f7f8fa',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ],
        display: 'standalone',
        orientation: 'portrait'
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 } }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3266', changeOrigin: true }
    }
  }
})
