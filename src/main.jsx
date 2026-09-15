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


// 실제 뷰포트 높이를 --app-h 로 반영한다(회전·창 크기 변경에 대응).
//
// visualViewport.height 를 쓰면 안 된다: 모바일 소프트 키보드가 열릴 때 함께 줄어들어
// (응원 게시판 입력 등) 페이지가 화면 절반으로 접히고 하단 탭바 정렬이 깨진다.
// window.innerHeight 는 레이아웃 뷰포트라 키보드·핀치줌에 영향받지 않는다.
function syncViewportHeight() {
  const h = Math.round(window.innerHeight)
  if (h > 0) document.documentElement.style.setProperty('--app-h', `${h}px`)
}
syncViewportHeight()
window.addEventListener('resize', syncViewportHeight)
window.addEventListener('orientationchange', syncViewportHeight)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
