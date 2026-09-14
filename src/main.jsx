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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
