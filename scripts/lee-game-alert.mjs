#!/usr/bin/env node
/**
 * 이정후(SF) 경기 예정 알림 — GitHub Actions에서 12시간마다 실행.
 *
 * 사이트 방문과 무관하게 경기 전에 구글챗으로 알린다.
 * (클라이언트 useVisitors.js 알림은 방문자가 있어야만 동작하므로 이 스크립트가 주 경로다)
 *
 * 중복 방지: Firestore meta/leeGameAlert 문서를 클라이언트와 공유한다.
 *   - gamePk: 마지막으로 알린 경기 (클라이언트 호환 필드)
 *   - alerted: 최근 알린 gamePk 목록 (이 스크립트 전용, 12시간 주기 중복 차단)
 * 규칙상 meta/leeGameAlert 는 공개 read/write 이므로 웹 API 키만으로 REST 접근이 된다.
 */

const SF_TEAM_ID = 137
// 조회 주기(12h)보다 넉넉히 잡아야 두 실행 사이에 시작하는 경기를 놓치지 않는다.
const LOOKAHEAD_HOURS = 14
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'baseball-93c5d'
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDQ6_sGVnwGrFXLNkwuWyoCWhCsEHpln24'
const CHAT_WEBHOOK = process.env.CHAT_WEBHOOK
  || 'https://chat.googleapis.com/v1/spaces/AAQABNK83oQ/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=uoZajVQKj1mKD_qmfHR6TE0Za72-Ukw-t8ZQfDjG7aU'

const DOC_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/meta/leeGameAlert?key=${API_KEY}`

// 경기가 확정되지 않은 상태 — 알림 대상에서 제외
const SKIP_STATES = ['Postponed', 'Cancelled', 'Canceled', 'Suspended']

const kstDate = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
const etDate = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

async function getJson(url) {
  const r = await fetch(url, { headers: { 'cache-control': 'no-cache' } })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url.split('?')[0]}`)
  return r.json()
}

/** 지금부터 LOOKAHEAD_HOURS 안에 시작하는, 아직 시작 안 한 SF 경기 */
async function findUpcomingGame(now) {
  // ET 기준 오늘~모레까지 조회 (한국시간 새벽 경기가 ET 전날에 걸치는 경우 대비)
  const start = etDate(new Date(now.getTime() - 24 * 3600e3))
  const end = etDate(new Date(now.getTime() + 48 * 3600e3))
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${SF_TEAM_ID}`
    + `&startDate=${start}&endDate=${end}&hydrate=team`
  const data = await getJson(url)

  const games = (data.dates || []).flatMap((d) => d.games || [])
  const limit = now.getTime() + LOOKAHEAD_HOURS * 3600e3

  return games
    .filter((g) => g.status?.abstractGameState === 'Preview')
    .filter((g) => !SKIP_STATES.includes(g.status?.detailedState))
    .filter((g) => {
      const t = new Date(g.gameDate).getTime()
      return t > now.getTime() && t <= limit
    })
    .sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate))[0] || null
}

/** meta/leeGameAlert 읽기 → { gamePk, alerted[] } */
async function readAlertState() {
  const r = await fetch(DOC_URL)
  if (r.status === 404) return { gamePk: null, alerted: [] }
  if (!r.ok) throw new Error(`Firestore 읽기 실패: ${r.status}`)
  const f = (await r.json()).fields || {}
  const gamePk = f.gamePk?.integerValue ?? f.gamePk?.doubleValue ?? null
  const alerted = (f.alerted?.arrayValue?.values || [])
    .map((v) => v.integerValue ?? v.doubleValue ?? v.stringValue)
    .filter(Boolean)
    .map(Number)
  return { gamePk: gamePk == null ? null : Number(gamePk), alerted }
}

/** gamePk 는 클라이언트 호환용, alerted 는 최근 10건만 유지 */
async function writeAlertState(gamePk, alerted) {
  const keep = [...alerted.filter((x) => x !== gamePk), gamePk].slice(-10)
  const body = {
    fields: {
      gamePk: { integerValue: String(gamePk) },
      alerted: { arrayValue: { values: keep.map((x) => ({ integerValue: String(x) })) } },
    },
  }
  const url = `${DOC_URL}&updateMask.fieldPaths=gamePk&updateMask.fieldPaths=alerted`
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`Firestore 쓰기 실패: ${r.status} ${await r.text()}`)
}

async function sendChat(text) {
  const r = await fetch(CHAT_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!r.ok) throw new Error(`구글챗 전송 실패: ${r.status} ${await r.text()}`)
}

/** 최신 스냅샷에서 이정후 타율·순위 (없으면 생략) */
async function leeLine() {
  try {
    const { readFile } = await import('node:fs/promises')
    const { resolve, dirname } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const data = JSON.parse(await readFile(resolve(root, 'public/data/latest.json'), 'utf8'))
    const lee = (data.players || []).find((p) => /Jung Hoo Lee/i.test(p.name || ''))
    if (!lee) return ''
    const avg = Number(lee.AVG).toFixed(3).replace(/^0/, '')
    return `\n· 현재 타율 ${avg} (${lee.rank}위)`
  } catch {
    return '' // 스냅샷 없거나 형식이 달라도 알림 자체는 보낸다
  }
}

async function main() {
  const now = new Date()
  console.log(`⏱  실행 ${now.toISOString()} (KST ${kstDate(now)})`)

  const game = await findUpcomingGame(now)
  if (!game) {
    console.log(`ℹ️  향후 ${LOOKAHEAD_HOURS}시간 내 예정된 SF 경기 없음 — 알림 생략`)
    return
  }

  const state = await readAlertState()
  if (state.alerted.includes(game.gamePk)) {
    console.log(`ℹ️  이미 알린 경기(gamePk ${game.gamePk}) — 생략`)
    return
  }

  const home = game.teams?.home?.team
  const away = game.teams?.away?.team
  const isHome = home?.id === SF_TEAM_ID
  const opp = isHome ? away?.name : home?.name
  const start = new Date(game.gameDate)
  const when = start.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric',
    weekday: 'short', hour: '2-digit', minute: '2-digit',
  })
  const hoursLeft = Math.round((start - now) / 3600e3)

  const text = `⚾ 이정후(SF) 경기 예정!\n`
    + `· ${isHome ? 'vs' : '@'} ${opp}\n`
    + `· ${when} 시작 (약 ${hoursLeft}시간 후)`
    + (await leeLine())
    + `\nhttps://baseball.sanghak.kr`

  if (process.env.DRY_RUN) {
    console.log(`🧪 DRY_RUN — 전송/저장 생략. 보낼 내용:\n${text}`)
    return
  }

  await sendChat(text)
  await writeAlertState(game.gamePk, state.alerted)
  console.log(`✅ 알림 전송 (gamePk ${game.gamePk}, ${when})`)
}

main().catch((e) => {
  console.error('❌ 실패:', e.message)
  process.exit(1)
})
