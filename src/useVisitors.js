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

// 이정후(SF) 오늘 경기 알림 — 경기 전(예정) + 진행 중, 경기당 1회
async function notifyLeeGame() {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const sd = await (await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=137&date=${today}&hydrate=linescore`,
      { cache: 'no-store' },
    )).json()
    const game = sd.dates?.[0]?.games?.[0]
    const state = game?.status?.abstractGameState
    if (!game || (state !== 'Preview' && state !== 'Live')) return // 종료/취소 제외
    const alertDoc = doc(db, 'meta', 'leeGameAlert')
    const snap = await getDoc(alertDoc)
    if (snap.data()?.gamePk === game.gamePk) return // 이 경기는 이미 알림
    await setDoc(alertDoc, { gamePk: game.gamePk }, { merge: true })
    const home = game.teams?.home?.team, away = game.teams?.away?.team
    const opp = home?.id === 137 ? away?.name : home?.name
    let msg
    if (state === 'Preview') {
      const t = new Date(game.gameDate).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })
      msg = `⚾ 오늘 이정후(SF) 경기! vs ${opp} · ${t} 시작 예정\nbaseball.sanghak.kr`
    } else {
      const ls = game.linescore
      const inn = ls?.currentInning ? ` (${ls.inningHalf || ''} ${ls.currentInning}회)` : ''
      msg = `⚾ 이정후(SF) 경기 중! vs ${opp}${inn}\nbaseball.sanghak.kr`
    }
    sendChat(msg)
  } catch (e) {
    console.warn('경기 알림 실패:', e.message)
  }
}

// ipinfo 는 국가코드(KR), geojs 는 국가명(South Korea)을 준다 → 통계 버킷이 갈라지지 않게 국가명으로 통일
function countryName(v) {
  if (!v) return null
  if (v.length !== 2) return v // 이미 국가명
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(v) || v } catch { return v }
}

// IP 위치 조회. ipinfo(정확도 우선) → geojs(폴백) 순.
async function lookupGeo(ip) {
  try {
    const r = await fetch(ip ? `https://ipinfo.io/${ip}/json` : 'https://ipinfo.io/json')
    if (!r.ok) throw new Error(r.status) // 무토큰 한도 초과(429) 등 → 폴백
    const g = await r.json()
    if (g.error) throw new Error('ipinfo error')
    // ipinfo 의 country 는 국가코드(KR) — 표기 통일을 위해 그대로 두고 city/region 을 쓴다
    return { ip: ip || g.ip, city: g.city || null, region: g.region || null, country: countryName(g.country) }
  } catch {
    const url = ip ? `https://get.geojs.io/v1/ip/geo/${ip}.json` : 'https://get.geojs.io/v1/ip/geo.json'
    const g = await (await fetch(url)).json()
    return { ip: ip || g.ip, city: g.city || null, region: g.region || null, country: countryName(g.country) }
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
    // 2) 위치 조회 — ipinfo 우선(한국 도시 정확도가 geojs보다 높음), 실패 시 geojs 폴백.
    //    같은 IP를 geojs는 '화성시', ipinfo는 '서울'로 답하는 사례가 있어 순서를 이렇게 둔다.
    try {
      geo = { ...geo, ...(await lookupGeo(geo.ip)) }
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
    notifyLeeGame() // 이정후 경기 예정/진행 중이면 구글챗 알림
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
        // await 전에 동기적으로 플래그를 세운다(StrictMode 이중 호출 시 중복 증가 방지)
        const shouldCount = !countedThisLoad
        if (shouldCount) countedThisLoad = true
        // 증분 전에 서버 값을 먼저 읽는다(증분 후 읽으면 로컬 낙관값이 반환됨)
        const snap = await getDoc(ref)
        const v = snap.data()?.count
        if (alive && typeof v === 'number') setCount(v + (shouldCount ? 1 : 0))
        if (shouldCount) {
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
