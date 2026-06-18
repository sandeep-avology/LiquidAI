import fs from 'fs'
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function getApiPort() {
  if (process.env.VITE_API_PORT) return Number(process.env.VITE_API_PORT)
  try {
    const portFile = path.join(process.cwd(), '.api-port')
    if (fs.existsSync(portFile)) return Number(fs.readFileSync(portFile, 'utf8').trim())
  } catch {
    // fall through
  }
  return Number(process.env.PORT) || 3001
}

const apiPort = getApiPort()

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
})
