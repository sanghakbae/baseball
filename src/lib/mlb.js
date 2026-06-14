// 브라우저·Node 공용 MLB Stats API 모듈
// statsapi.mlb.com 은 CORS(*)를 허용하므로 브라우저에서 직접 호출 가능 → 실시간 폴링 가능.

import { buildPredictions } from './predict.js'

const API = 'https://statsapi.mlb.com/api/v1'
export const SCHEDULE_GAMES = 162

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

export async function fetchQualifiedBatters(season) {
  const url =
    `${API}/stats?stats=season&group=hitting&gameType=R&season=${season}` +
    `&sportId=1&playerPool=qualified&limit=500&hydrate=team`
  const data = await getJson(url)
  const splits = data?.stats?.[0]?.splits ?? []
  return splits.map((s) => {
    const st = s.stat
    const team = s.team || {}
    return {
      id: s.player.id,
      name: s.player.fullName,
      team: team.abbreviation || '—',
      teamId: team.id || null,
      teamName: team.teamName || '',
      pos: s.position?.abbreviation || '',
      G: st.gamesPlayed,
      AB: st.atBats,
      PA: st.plateAppearances,
      R: st.runs,
      H: st.hits,
      B2: st.doubles,
      B3: st.triples,
      HR: st.homeRuns,
      RBI: st.rbi,
      SB: st.stolenBases,
      BB: st.baseOnBalls,
      SO: st.strikeOuts,
      AVG: Number(st.avg),
      OBP: Number(st.obp),
      SLG: Number(st.slg),
      OPS: Number(st.ops),
    }
  })
}

// 통산 타율 캐시 (시즌 중 거의 안 변하므로 세션당 1회 조회)
const _careerCache = {}
const chunk = (arr, n) => {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

// 선수들에게 통산 타율(careerAVG/careerAB/careerHits)을 붙인다. 미조회 ID만 일괄 요청.
export async function attachCareer(players) {
  const missing = [...new Set(players.map((p) => p.id).filter((id) => !(id in _careerCache)))]
  const hydrate = encodeURIComponent('stats(group=[hitting],type=[career])')
  for (const ids of chunk(missing, 100)) {
    try {
      const d = await getJson(`${API}/people?personIds=${ids.join(',')}&hydrate=${hydrate}`)
      for (const per of d.people ?? []) {
        let st = null
        for (const blk of per.stats ?? []) for (const sp of blk.splits ?? []) st = sp.stat
        _careerCache[per.id] = st
          ? { careerAVG: Number(st.avg), careerAB: st.atBats, careerHits: st.hits }
          : {}
      }
    } catch (e) {
      console.warn('통산 스탯 조회 실패:', e.message)
    }
    for (const id of ids) if (!(id in _careerCache)) _careerCache[id] = {} // 재요청 방지
  }
  return players.map((p) => ({ ...p, ...(_careerCache[p.id] || {}) }))
}

// CSV 한 줄 파싱(따옴표 안 콤마 처리)
function parseCsvLine(line) {
  const out = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

// Statcast 기대 타율(xBA = est_ba) — 선수ID → xBA. CORS 허용됨. 세션 캐시.
let _xbaCache = null
export async function fetchXBA(season) {
  if (_xbaCache) return _xbaCache
  const map = {}
  try {
    const url = `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=${season}&min=q&csv=true`
    const text = await (await fetch(url, { cache: 'no-store' })).text()
    const lines = text.trim().split('\n')
    const header = parseCsvLine(lines[0].replace(/^﻿/, ''))
    const idIdx = header.indexOf('player_id')
    const xbaIdx = header.indexOf('est_ba')
    if (idIdx >= 0 && xbaIdx >= 0) {
      for (let i = 1; i < lines.length; i++) {
        const c = parseCsvLine(lines[i])
        const id = Number(c[idIdx]); const xba = Number(c[xbaIdx])
        if (id && !Number.isNaN(xba)) map[id] = xba
      }
    }
  } catch (e) {
    console.warn('xBA 조회 실패:', e.message)
  }
  _xbaCache = map
  return map
}

export async function fetchTeamGamesPlayed(season) {
  const url = `${API}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`
  const data = await getJson(url)
  const map = {}
  for (const rec of data.records ?? []) {
    for (const tr of rec.teamRecords ?? []) {
      map[tr.team.id] = tr.gamesPlayed
    }
  }
  return map
}

// 전체 수집 + 예측까지 한 번에 (Node 수집기 / 클라이언트 공용)
export async function buildPayload(season, opts = {}) {
  const [players, teamGP] = await Promise.all([
    fetchQualifiedBatters(season),
    fetchTeamGamesPlayed(season),
  ])
  players.sort((a, b) => b.AVG - a.AVG)
  players.forEach((p, i) => { p.rank = i + 1 })
  const withCareer = await attachCareer(players) // 통산 타율 prior 부착
  const xba = await fetchXBA(season) // Statcast 기대타율(xBA)
  for (const p of withCareer) { if (xba[p.id] != null) p.xBA = xba[p.id] }

  const { leagueMean, predictions } = buildPredictions(withCareer, teamGP, {
    scheduleGames: SCHEDULE_GAMES,
    season,
    ...opts,
  })

  return {
    updatedAt: new Date().toISOString(),
    season,
    qualifiedCount: withCareer.length,
    leagueMean,
    scheduleGames: SCHEDULE_GAMES,
    players: withCareer,
    predictions,
    teamGP, // 클라이언트가 워커에서 재계산할 때 재사용
  }
}
