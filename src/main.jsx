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


// 실제 뷰포트 높이를 --app-h 로 반영한다.
// 100dvh 는 iOS 홈 화면 앱(standalone)에서 기기·설치 시점에 따라 실제 표시 영역과 어긋나는 경우가 있어,
// visualViewport 가 알려주는 값을 우선 사용하고 회전·리사이즈 때마다 갱신한다.
function syncViewportHeight() {
  const h = Math.round(window.visualViewport?.height ?? window.innerHeight)
  if (h > 0) document.documentElement.style.setProperty('--app-h', `${h}px`)
}
syncViewportHeight()
window.addEventListener('resize', syncViewportHeight)
window.addEventListener('orientationchange', syncViewportHeight)
window.visualViewport?.addEventListener('resize', syncViewportHeight)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
