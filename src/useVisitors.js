import { useEffect, useState } from 'react'
import { addDoc, collection, doc, getDoc, increment, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firebase.js'

// 페이지 로드(새로고침)당 1회만 증가. 모듈 플래그로 StrictMode 중복 호출 방지.
let countedThisLoad = false
const VISIT_SESSION_KEY = 'baseball-visit-logged'

// 방문 로그(IP·위치·유입경로·UA)를 visits 컬렉션에 기록. 세션당 1회(쓰기 절감).
async function logVisit() {
  try {
    if (sessionStorage.getItem(VISIT_SESSION_KEY)) return
    sessionStorage.setItem(VISIT_SESSION_KEY, '1')
  } catch { /* 무시 */ }
  try {
    let geo = {}
    try {
      const r = await fetch('https://ipapi.co/json/')
      if (r.ok) {
        const j = await r.json()
        if (!j.error) geo = { ip: j.ip, city: j.city, region: j.region, country: j.country_name }
      }
    } catch { /* geo 실패 시 IP만 */ }
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

// 방문자 수: 로드당 1회 증가 + 1회 읽기(getDoc). 실시간 구독을 쓰지 않아 읽기 증폭 없음.
export function useVisitors() {
  const [count, setCount] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const ref = doc(db, 'meta', 'visitors')
        const shouldCount = !countedThisLoad
        // 증분 전에 서버 값을 먼저 읽는다(증분 후 읽으면 로컬 낙관값이 반환됨)
        const snap = await getDoc(ref)
        const v = snap.data()?.count
        if (alive && typeof v === 'number') setCount(v + (shouldCount ? 1 : 0))
        if (shouldCount) {
          countedThisLoad = true
          setDoc(
            ref,
            { count: increment(1), updatedAt: new Date().toISOString() },
            { merge: true },
          ).catch((e) => console.warn('방문자 카운트 증가 실패:', e.message))
          logVisit() // IP·위치·유입경로 기록 (세션당 1회)
        }
      } catch (e) {
        console.warn('방문자 카운트 비활성:', e.message)
      }
    })()
    return () => { alive = false }
  }, [])

  return count
}
