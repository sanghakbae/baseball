import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AdminPage from './AdminPage.jsx'
import './firebase.js' // Firebase 초기화 (Analytics)
import './index.css'

// baseball.sanghak.kr/#admin → 관리자 페이지 (해시 변경에 실시간 반응)
function Root() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const isAdmin = hash.replace('#', '').toLowerCase().startsWith('admin')
  return isAdmin ? <AdminPage /> : <App />
}

// 서비스 워커 — 오프라인 진입 + 재방문 속도. dev 에서는 HMR 을 방해하므로 등록하지 않는다.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
  // 새 워커가 제어권을 가져가면 1회만 새로고침해 최신 코드로 맞춘다(무한 새로고침 방지)
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
