import { useEffect, useState } from 'react'
import { addDoc, collection, doc, increment, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firebase.js'

// 페이지 로드(새로고침)당 1회만 증가. 모듈 플래그로 StrictMode 중복 호출 방지.
let countedThisLoad = false

// 방문 로그(IP·위치·유입경로·UA)를 visits 컬렉션에 기록 (개인정보라 읽기는 비공개)
async function logVisit() {
  try {
    let geo = {}
    try {
      const r = await fetch('https://ipapi.co/json/')
      if (r.ok) {
        const j = await r.json()
        geo = { ip: j.ip, city: j.city, region: j.region, country: j.country_name }
      }
    } catch { /* geo 실패 무시 */ }
    if (!geo.ip) {
      try { geo.ip = (await (await fetch('https://api.ipify.org?format=json')).json()).ip } catch {}
    }
    await addDoc(collection(db, 'visits'), {
      ip: geo.ip || 'unknown',
      city: geo.city || null,
      region: geo.region || null,
      country: geo.country || null,
      ua: navigator.userAgent,
      ref: document.referrer || null,
      path: location.pathname + location.search,
      ts: serverTimestamp(),
    })
  } catch (e) {
    console.warn('방문 로그 실패:', e.message)
  }
}

// Firestore meta/visitors 문서에 방문자 수를 누적·구독한다.
export function useVisitors() {
  const [count, setCount] = useState(null)

  useEffect(() => {
    let unsub
    try {
      const ref = doc(db, 'meta', 'visitors')
      if (!countedThisLoad) {
        countedThisLoad = true
        setDoc(
          ref,
          { count: increment(1), updatedAt: new Date().toISOString() },
          { merge: true },
        ).catch((e) => console.warn('방문자 카운트 증가 실패:', e.message))
        logVisit() // IP·위치·유입경로 기록
      }
      unsub = onSnapshot(
        ref,
        (snap) => {
          const v = snap.data()?.count
          if (typeof v === 'number') setCount(v)
        },
        (e) => console.warn('방문자 구독 실패:', e.message),
      )
    } catch (e) {
      console.warn('방문자 카운트 비활성:', e.message)
    }
    return () => unsub && unsub()
  }, [])

  return count
}
