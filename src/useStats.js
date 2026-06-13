import { useEffect, useRef, useState } from 'react'
import { lee, top5 } from './data.js'
import { fetchQualifiedBatters, fetchTeamGamesPlayed } from './lib/mlb.js'

const LIVE_INTERVAL_MS = 60_000 // 실시간 폴링 주기 (경기 중 갱신)
const HISTORY_KEY = 'baseball-rank-history-v1'
const HISTORY_MAX = 240 // 최대 기록 포인트 수
const HISTORY_TRACK = 12 // 기록할 상위 선수 수
const DEDUPE_MS = 45_000 // 직전 기록과 너무 가까우면 스킵

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

// players(타율 내림차순, rank 부여됨) → 히스토리 포인트
function toPoint(players, isoTs) {
  const top = players.slice(0, HISTORY_TRACK)
  return {
    t: Date.parse(isoTs) || Date.now(),
    r: Object.fromEntries(top.map((p) => [p.id, p.rank])),
    a: Object.fromEntries(top.map((p) => [p.id, p.AVG])),
  }
}

// 정적 폴백 payload — 네트워크 실패 시
const FALLBACK = {
  updatedAt: null,
  season: 2026,
  qualifiedCount: 6,
  leagueMean: 0.27,
  players: [lee, ...top5].sort((a, b) => b.AVG - a.AVG).map((p, i) => ({ ...p, rank: i + 1 })),
  predictions: [],
  teamGP: {},
}

// 발행된 최신 스냅샷(빠른 초기 로딩). raw GitHub → 로컬 번들 → 폴백 순.
async function loadPublished() {
  const base = import.meta.env.BASE_URL || '/'
  const RAW =
    import.meta.env.VITE_DATA_URL ||
    'https://raw.githubusercontent.com/sanghakbae/baseball/main/public/data/latest.json'
  for (const url of [RAW, `${base}data/latest.json`]) {
    try {
      const r = await fetch(url, { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return await r.json()
    } catch (err) {
      console.warn(`발행 데이터 로드 실패 (${url}):`, err.message)
    }
  }
  return null
}

export function useStats() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isFallback, setIsFallback] = useState(false)
  const [live, setLive] = useState(false) // 실시간 폴링 활성 여부
  const [refreshing, setRefreshing] = useState(false)
  const [refreshedAt, setRefreshedAt] = useState(null)
  const [history, setHistory] = useState(loadHistory) // 순위 변동 기록

  const seasonRef = useRef(2026)
  const workerRef = useRef(null)
  const timerRef = useRef(null)
  const busyRef = useRef(false)

  // 새 포인트를 기록에 추가 (직전과 너무 가까우면 스킵, 최대 길이 제한, localStorage 저장)
  function pushHistory(point) {
    setHistory((prev) => {
      const last = prev[prev.length - 1]
      if (last && point.t - last.t < DEDUPE_MS) return prev
      const next = [...prev, point].slice(-HISTORY_MAX)
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  useEffect(() => {
    let alive = true

    // Web Worker (예측 재계산을 메인 스레드 밖에서)
    try {
      workerRef.current = new Worker(new URL('./predict.worker.js', import.meta.url), {
        type: 'module',
      })
      workerRef.current.onmessage = (e) => {
        if (!alive || !e.data?.ok) return
        setData((prev) =>
          prev
            ? { ...prev, predictions: e.data.predictions, leagueMean: e.data.leagueMean }
            : prev,
        )
      }
    } catch (err) {
      console.warn('Worker 생성 실패 — 예측 재계산 비활성:', err.message)
    }

    // 경기 중 실시간 1회 갱신: MLB API 직접 폴링 → 리더보드 즉시 반영 → 예측 워커 위임
    async function liveRefresh() {
      if (busyRef.current) return // 중복 방지 (visibility는 폴링 스케줄로만 제어)
      busyRef.current = true
      setRefreshing(true)
      try {
        const season = seasonRef.current
        const [players, teamGP] = await Promise.all([
          fetchQualifiedBatters(season),
          fetchTeamGamesPlayed(season),
        ])
        players.sort((a, b) => b.AVG - a.AVG)
        players.forEach((p, i) => { p.rank = i + 1 })
        if (!alive) return
        const now = new Date().toISOString()
        setData((prev) => ({
          ...(prev ?? {}),
          updatedAt: now,
          season,
          qualifiedCount: players.length,
          players,
          teamGP,
        }))
        setRefreshedAt(now)
        setLive(true)
        setIsFallback(false)
        pushHistory(toPoint(players, now))
        // 예측 재계산 (워커). 워커 없으면 직전 예측 유지.
        if (workerRef.current) {
          workerRef.current.postMessage({ players, teamGP, season, sims: 12000 })
        }
      } catch (err) {
        console.warn('실시간 갱신 실패:', err.message)
        setLive(false)
      } finally {
        busyRef.current = false
        if (alive) setRefreshing(false)
      }
    }

    function startTimer() {
      stopTimer()
      timerRef.current = setInterval(liveRefresh, LIVE_INTERVAL_MS)
    }
    function stopTimer() {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }

    function onVisibility() {
      if (document.hidden) {
        stopTimer()
      } else {
        liveRefresh() // 다시 보면 즉시 갱신
        startTimer()
      }
    }

    // 초기화: 발행 스냅샷 빠른 표시 → 실시간 폴링 시작
    ;(async () => {
      const published = await loadPublished()
      if (!alive) return
      if (published) {
        seasonRef.current = published.season || seasonRef.current
        setData(published)
      } else {
        setData(FALLBACK)
        setIsFallback(true)
      }
      setLoading(false)

      // 실시간 시작 (즉시 1회 + 주기)
      liveRefresh()
      startTimer()
      document.addEventListener('visibilitychange', onVisibility)
    })()

    return () => {
      alive = false
      stopTimer()
      document.removeEventListener('visibilitychange', onVisibility)
      workerRef.current?.terminate()
    }
  }, [])

  return { data, loading, isFallback, live, refreshing, refreshedAt, history }
}
