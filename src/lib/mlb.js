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

  const { leagueMean, predictions } = buildPredictions(players, teamGP, {
    scheduleGames: SCHEDULE_GAMES,
    season,
    ...opts,
  })

  return {
    updatedAt: new Date().toISOString(),
    season,
    qualifiedCount: players.length,
    leagueMean,
    scheduleGames: SCHEDULE_GAMES,
    players,
    predictions,
    teamGP, // 클라이언트가 워커에서 재계산할 때 재사용
  }
}
