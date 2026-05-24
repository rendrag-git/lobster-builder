import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const gatewayProxyTarget = process.env.LOBSTER_BUILDER_GATEWAY_PROXY ?? 'http://localhost:18789'
const rootDir = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: process.env.LOBSTER_BUILDER_BASE ?? (command === 'build' ? './' : '/'),
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/ws': {
        target: gatewayProxyTarget,
        changeOrigin: true,
        ws: true,
      },
      '/tools': {
        target: gatewayProxyTarget,
        changeOrigin: true,
      },
      '/api': {
        target: gatewayProxyTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    alias: {
      'openclaw/plugin-sdk/plugin-entry': path.resolve(rootDir, 'plugin/openclaw/test-mocks/plugin-entry.mjs'),
      'openclaw/plugin-sdk/temp-path': path.resolve(rootDir, 'plugin/openclaw/test-mocks/temp-path.mjs'),
      'openclaw/plugin-sdk/gateway-runtime': path.resolve(rootDir, 'plugin/openclaw/test-mocks/gateway-runtime.mjs'),
    },
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
}))
