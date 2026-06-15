import { useEffect, useState } from 'react'
import { addDoc, collection, doc, getDoc, increment, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firebase.js'

// 페이지 로드(새로고침)당 1회만 증가. 모듈 플래그로 StrictMode 중복 호출 방지.
let countedThisLoad = false
const VISIT_SESSION_KEY = 'baseball-visit-logged'
// 구글챗 웹훅 (새 유입처 알림)
const CHAT_WEBHOOK = 'https://chat.googleapis.com/v1/spaces/AAQABNK83oQ/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=uoZajVQKj1mKD_qmfHR6TE0Za72-Ukw-t8ZQfDjG7aU'
const INTERNAL_HOSTS = ['baseball.sanghak.kr', 'localhost', '127.0.0.1']

const sendChat = (text) =>
  fetch(CHAT_WEBHOOK, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
  }).catch(() => {})

// 유입 출처 판단: ?from= / utm_source 우선(referrer보다 정확), 없으면 referrer 호스트
function visitSource() {
  try {
    const p = new URLSearchParams(location.search)
    const tag = p.get('from') || p.get('utm_source')
    if (tag) return tag.slice(0, 40)
  } catch {}
  const ref = document.referrer
  if (!ref) return null // 직접 방문
  try {
    const host = new URL(ref).hostname
    if (INTERNAL_HOSTS.includes(host) || host.endsWith('github.io')) return null
    return host
  } catch { return null }
}

// 기존에 없던 유입처면 구글챗으로 알림 (출처별 1회)
async function notifyNewReferrer(geo) {
  const source = visitSource()
  if (!source) return
  try {
    const refDoc = doc(db, 'meta', 'refSources')
    const snap = await getDoc(refDoc)
    const hosts = snap.data()?.hosts || {}
    if (hosts[source]) return // 이미 알려진 유입처
    await setDoc(refDoc, { hosts: { [source]: true } }, { merge: true })
    const where = [geo.city, geo.country].filter(Boolean).join(', ') || '위치 미상'
    sendChat(`🔔 새 유입처 감지: ${source}\n· 출처: ${document.referrer || location.search || '직접'}\n· 방문자: ${geo.ip || '?'} (${where})\n· baseball.sanghak.kr`)
  } catch (e) {
    console.warn('유입처 알림 실패:', e.message)
  }
}

// 이정후(SF) 경기가 진행 중이면 구글챗 알림 (경기당 1회)
async function notifyLeeGameLive() {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const sd = await (await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=137&date=${today}&hydrate=linescore`,
      { cache: 'no-store' },
    )).json()
    const game = sd.dates?.[0]?.games?.[0]
    if (!game || game.status?.abstractGameState !== 'Live') return
    const alertDoc = doc(db, 'meta', 'leeGameAlert')
    const snap = await getDoc(alertDoc)
    if (snap.data()?.gamePk === game.gamePk) return // 이미 알림
    await setDoc(alertDoc, { gamePk: game.gamePk }, { merge: true })
    const home = game.teams?.home?.team, away = game.teams?.away?.team
    const opp = home?.id === 137 ? away?.name : home?.name
    const ls = game.linescore
    const inn = ls?.currentInning ? ` (${ls.inningHalf || ''} ${ls.currentInning}회)` : ''
    sendChat(`⚾ 이정후(SF) 경기 중! vs ${opp}${inn}\nbaseball.sanghak.kr`)
  } catch (e) {
    console.warn('경기 알림 실패:', e.message)
  }
}

// 방문 로그(IP·위치·유입경로·UA)를 visits 컬렉션에 기록. 세션당 1회(쓰기 절감).
async function logVisit() {
  try {
    if (sessionStorage.getItem(VISIT_SESSION_KEY)) return
    sessionStorage.setItem(VISIT_SESSION_KEY, '1')
  } catch { /* 무시 */ }
  try {
    let geo = {}
    // 1) IPv4 먼저 확보 (실패해도 위치 조회는 계속)
    try { geo.ip = (await (await fetch('https://api4.ipify.org?format=json')).json()).ip } catch {}
    // 2) 위치 조회 (geojs: CORS·무료). IPv4가 있으면 그 IP로, 없으면 접속 IP로
    try {
      const url = geo.ip
        ? `https://get.geojs.io/v1/ip/geo/${geo.ip}.json`
        : 'https://get.geojs.io/v1/ip/geo.json'
      const g = await (await fetch(url)).json()
      geo = { ip: geo.ip || g.ip, city: g.city, region: g.region, country: g.country }
    } catch { /* 위치 실패 시 IP만 기록 */ }
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
    notifyNewReferrer(geo) // 새 유입처면 구글챗 알림
    notifyLeeGameLive() // 이정후 경기 중이면 구글챗 알림
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
