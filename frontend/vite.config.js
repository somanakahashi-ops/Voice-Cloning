import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages(https://<user>.github.io/Voice-Cloning/)配下で配信するため
  base: '/Voice-Cloning/',
})
