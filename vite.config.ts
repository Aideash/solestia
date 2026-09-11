import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dotenv from 'dotenv'

dotenv.config()

export default defineConfig({
  plugins: [vue()],
  server: {
    allowedHosts: [process.env.DOMAIN ?? 'localhost'],
    port: parseInt(process.env.PORT || '5173'),
  },
})
