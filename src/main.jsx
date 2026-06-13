import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './firebase.js' // Firebase 초기화 (Analytics)
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
