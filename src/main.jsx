import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AdminPage from './AdminPage.jsx'
import './firebase.js' // Firebase 초기화 (Analytics)
import './index.css'

// baseball.sanghak.kr/#admin → 관리자 페이지
const isAdmin = window.location.hash.replace('#', '').startsWith('admin')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isAdmin ? <AdminPage /> : <App />}
  </React.StrictMode>,
)
