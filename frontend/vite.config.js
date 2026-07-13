import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 相対パスにしておくと、GitHub Pages(/Voice-Cloning/)とローカルバックエンドの
  // /app 配信の両方で同じビルドが動く
  base: './',
})
