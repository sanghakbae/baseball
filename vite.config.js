import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 포트가 바뀌면 오리진이 달라져 Firebase Auth 로그인 세션이 매번 풀린다 → 고정
  server: { port: Number(process.env.PORT) || 5174, strictPort: true },
})
