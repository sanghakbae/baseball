// Firebase 클라이언트 (Analytics + 향후 Firestore 직접 읽기용)
// 웹 config 값은 공개되어도 되는 값이며, 필요 시 VITE_FIREBASE_* 환경변수로 덮어쓴다.
import { initializeApp } from 'firebase/app'
import { getAnalytics, isSupported } from 'firebase/analytics'
import { getFirestore } from 'firebase/firestore'

const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyDQ6_sGVnwGrFXLNkwuWyoCWhCsEHpln24',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'baseball-93c5d.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'baseball-93c5d',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'baseball-93c5d.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_SENDER_ID || '607616239475',
  appId: env.VITE_FIREBASE_APP_ID || '1:607616239475:web:849c72e895787494942706',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || 'G-BZ4HG8M3ZE',
}

export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

// Analytics 는 브라우저 + 지원 환경에서만 (로컬/SSR 안전 가드)
export let analytics = null
if (typeof window !== 'undefined') {
  isSupported()
    .then((ok) => { if (ok) analytics = getAnalytics(app) })
    .catch(() => {})
}
