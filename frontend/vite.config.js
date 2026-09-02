import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { buildApiBaseUrl } from './src/config.js'

export default defineConfig(({ mode }) => {
  if (mode !== 'test') {
    const environment = loadEnv(mode, process.cwd(), '')
    buildApiBaseUrl(environment.VITE_API_ORIGIN)
  }

  return {
    plugins: [react()],
  }
})
