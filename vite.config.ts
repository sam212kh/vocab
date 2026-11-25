import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  return {
    plugins: [vue(), tailwindcss()],
    server: {
      // The codebase knowledge graph is updated by the development tooling.
      // It is not application source; watching it causes Vite full-reloads
      // whenever the graph/artifact is refreshed.
      watch: {
        ignored: [
          '**/.codebase-memory/**',
          '**/.agents/**',
          '**/.codex/**',
        ],
      },
      proxy: {
        '/api/tts': env.TTS_PROXY_TARGET ?? 'http://127.0.0.1:8787',
        '/health': env.TTS_PROXY_TARGET ?? 'http://127.0.0.1:8787',
        '/api/ai': env.AI_PROXY_TARGET ?? 'http://127.0.0.1:8788',
        '/api/assessment': env.AI_PROXY_TARGET ?? 'http://127.0.0.1:8788',
      },
    },
  }
})
