import { useEffect, useMemo, useState } from 'react'
import { useStats } from './useStats.js'
import { useVisitors } from './useVisitors.js'
import { useCheers } from './useCheers.js'
import { useVote } from './useVote.js'
import { STAT_KEYS, HIGHER_IS_BETTER } from './data.js'

const avg3 = (v) => (v == null ? '—' : v.toFixed(3).replace(/^0/, ''))
const pct = (v) => `${(v * 100).toFixed(1)}%`
const isLee = (p) => p?.name === '이정후' || p?.name === 'Jung Hoo Lee'
const systemTheme = () =>
  (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')

const fmt = (k, v) => {
  const def = STAT_KEYS.find((s) => s.key === k)
  return def?.fmt ? def.fmt(v) : v
}

// MLB 선수 사진 / 팀 로고
const headshot = (id) => `https://midfield.mlbstatic.com/v1/people/${id}/spots/120`
const teamLogo = (teamId) => (teamId ? `https://www.mlbstatic.com/team-logos/${teamId}.svg` : null)
const hideOnError = (e) => { e.currentTarget.style.visibility = 'hidden' }

// 공유 버튼 — 누르면 홍보 문구를 클립보드에 복사
const SHARE_TEXT = '2026 MLB 타율왕 누가 될까? ⚾\n이정후 실시간 순위·예측·응원 게시판\nhttps://baseball.sanghak.kr\n재미로 만들어봤어요 ㅎㅎ'
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch {}
  try {
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.focus(); ta.select()
    const ok = document.execCommand('copy'); document.body.removeChild(ta); return ok
  } catch { return false }
}
function ShareButton() {
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const ok = await copyText(SHARE_TEXT)
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1800) }
    else if (navigator.share) { try { await navigator.share({ text: SHARE_TEXT }) } catch {} }
  }
  return <button className="share-btn" onClick={share}>{copied ? '복사됨!' : '🔗 공유'}</button>
}

// 올스타 투표 기간 (미정 시 대략치 — 실제 일정 확정되면 수정) · 한국시간 기준
const ASG_VOTE_START = '2026-06-01'
const ASG_VOTE_END = '2026-07-03'
const ASG_BALLOT_URL = 'https://www.mlb.com/all-star/ballot'
const ASG_DISMISS_KEY = 'baseball-asg-dismissed'

const TABS = [
  { id: 'predict', label: '🔮 예측' },
  { id: 'board', label: '📊 랭킹' },
  { id: 'live', label: '🔴 Live' },
  { id: 'compare', label: '⚔️ 비교' },
  { id: 'zone', label: '🎯 이정후' },
  { id: 'cheer', label: '📣 응원' },
]
const TAB_KEY = 'baseball-tab'

export default function App() {
  const { data, loading, isFallback, live, refreshing, refreshedAt } = useStats()
  // 새로고침해도 마지막으로 보던 탭 유지
  const [tab, setTab] = useState(() => {
    const saved = localStorage.getItem(TAB_KEY)
    return TABS.some((t) => t.id === saved) ? saved : 'predict'
  })
  useEffect(() => { localStorage.setItem(TAB_KEY, tab) }, [tab])

  // 다크/라이트 테마 — 저장된 수동 선택이 없으면 시스템 설정을 따름
  const [theme, setTheme] = useState(() => {
    try { const s = localStorage.getItem('baseball-theme'); if (s === 'dark' || s === 'light') return s } catch {}
    return systemTheme()
  })
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  // 시스템 설정 변경에 실시간 반응(수동 선택이 없을 때만)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)')
    if (!mq) return
    const onChange = () => {
      let saved = null
      try { saved = localStorage.getItem('baseball-theme') } catch {}
      if (saved !== 'dark' && saved !== 'light') setTheme(systemTheme())
    }
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  // PC 너비면 대시보드(6섹션 한 화면), 모바일이면 탭
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia?.('(min-width: 960px)').matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.('(min-width: 960px)')
    if (!mq) return
    const on = () => setIsDesktop(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])

  if (loading) return <div className="page loading">데이터 불러오는 중…</div>
  const toggleTheme = () => setTheme((t) => {
    const n = t === 'dark' ? 'light' : 'dark'
    try { localStorage.setItem('baseball-theme', n) } catch {}
    return n
  })

  const stamp = refreshedAt || data.updatedAt
  const updated = stamp
    ? new Date(stamp).toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    : '정적 샘플'

  return (
    <div className={`page ${isDesktop ? 'page--wide' : ''}`}>
      <header className="hero">
        <button className="theme-btn" onClick={toggleTheme} title="테마 전환">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <h1>2026년 누가 <span className="hl">타격왕</span>이 될까?</h1>
        <p className="updated">
          <span className={`live-dot ${live ? 'on' : ''} ${refreshing ? 'pulse' : ''}`} />
          {live ? 'LIVE' : '대기'} · {updated}
          {isFallback && <span className="badge-warn"> · 정적 폴백</span>}
          {' · '}규정타석 {data.qualifiedCount}명
        </p>
        <div className="hero-meta"><Visitors /></div>
        <ShareButton />
      </header>

      {isDesktop ? (
        // PC 대시보드: 1행(예측+랭킹), 2행(톱10·코스별·비교), 3행(응원)
        <div className="dashboard">
          <div className="dash-item d-predict"><Predict data={data} /></div>
          <div className="dash-item d-rank"><Leaderboard players={data.players} season={data.season} /></div>
          <div className="dash-item d-live"><LiveTop10 players={data.players} season={data.season} /></div>
          <div className="dash-item d-zone"><LeeZone players={data.players} season={data.season} /></div>
          <div className="dash-item d-compare"><Compare players={data.players} /></div>
          <div className="dash-item d-cheer"><CheerBoard /></div>
        </div>
      ) : (
        // 모바일: 탭 + 하단 네비
        <>
          <nav className="tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {tab === 'predict' && <Predict data={data} />}
          {tab === 'board' && <Leaderboard players={data.players} season={data.season} />}
          {tab === 'live' && <LiveTop10 players={data.players} season={data.season} />}
          {tab === 'compare' && <Compare players={data.players} />}
          {tab === 'zone' && <LeeZone players={data.players} season={data.season} />}
          {tab === 'cheer' && <CheerBoard />}
        </>
      )}

      <AllStarModal />
    </div>
  )
}

/* ---------- 올스타 투표 모달 ---------- */
function AllStarModal() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const inPeriod = today >= ASG_VOTE_START && today <= ASG_VOTE_END
  const [open, setOpen] = useState(() => {
    if (!inPeriod) return false
    try { return localStorage.getItem(ASG_DISMISS_KEY) !== today } catch { return true }
  })

  if (!inPeriod || !open) return null

  const close = () => {
    try { localStorage.setItem(ASG_DISMISS_KEY, today) } catch {}
    setOpen(false)
  }

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-emoji">⭐</div>
        <h2 className="modal-title">2026 MLB 올스타 투표</h2>
        <p className="modal-desc">
          지금은 올스타 투표 기간! <b className="hl">이정후</b>를 올스타로 보냅시다 🇰🇷
        </p>
        <a className="modal-btn" href={ASG_BALLOT_URL} target="_blank" rel="noreferrer" onClick={close}>
          이정후 투표하러 가기 →
        </a>
        <button className="modal-later" onClick={close}>오늘은 그만 보기</button>
      </div>
    </div>
  )
}

/* ---------- 방문자 수 (Firestore 저장·실시간) ---------- */
function Visitors() {
  const count = useVisitors()
  const text = count == null ? '—' : count.toLocaleString()
  return (
    <span className="visitors" title="누적 방문자 수">
      방문 <b>{text}</b>
    </span>
  )
}

/* ---------- 이정후 타율왕 시나리오 계산기 ---------- */
function ScenarioCard({ players }) {
  const lee = players.find(isLee)
  const leader = players[0]
  if (!lee || !leader) return null
  if (isLee(leader)) {
    return (
      <div className="scenario hot">
        🏆 이정후 현재 <b>타율 1위</b>! ({avg3(lee.AVG)}) 이 자리를 지키면 타격왕입니다.
      </div>
    )
  }
  const L = leader.AVG
  const gap = (L - lee.AVG)
  // (H+n)/(AB+n) > L 를 만족하는 최소 연속 안타 n
  let n = Math.ceil((L * lee.AB - lee.H) / (1 - L))
  if (n < 1) n = 1
  return (
    <div className="scenario">
      🎯 <b>1위까지 {gap.toFixed(3).replace(/^0/, '')} 차</b> ·
      {' '}1위 {leader.name} {avg3(L)} vs 이정후 {avg3(lee.AVG)}
      <span className="scenario-hl">앞으로 {n}타수 연속 안타면 역전</span>
    </div>
  )
}

/* ---------- 예측 탭 ---------- */
function Predict({ data }) {
  const preds = data.predictions ?? []
  if (!preds.length) {
    return (
      <section className="card-section">
        <p className="empty">
          예측 데이터가 아직 없습니다. 수집기(<code>npm run fetch</code>)를 실행하면
          몬테카를로 예측 결과가 채워집니다.
        </p>
      </section>
    )
  }
  const maxP = Math.max(...preds.map((p) => p.pWinTitle))
  return (
    <section className="card-section">
      <h2 className="sec-title">시즌 종료 타율 1위 확률</h2>
      <p className="sec-desc">평균회귀 실력 추정 + 잔여 타석 2만 회 시뮬레이션 결과</p>
      <ScenarioCard players={data.players} />
      <GapChart players={data.players} season={data.season} />
      <ol className="pred-list">
        {preds.slice(0, 10).map((p, i) => (
          <li key={p.id} className={`pred-row ${isLee(p) ? 'is-lee' : ''}`}>
            <span className="pred-rank">{i + 1}</span>
            <div className="pred-main">
              <div className="pred-name">
                <span>{p.name} <span className="pred-team">{p.team}</span></span>
                <span className="pred-prob">{pct(p.pWinTitle)}</span>
              </div>
              <div className="pred-bar-wrap">
                <div className="pred-bar" style={{ width: `${Math.max(3, (p.pWinTitle / maxP) * 100)}%` }} />
              </div>
              <div className="pred-detail">
                <span>현재 {avg3(p.currentAVG)} → 예상 <b>{avg3(p.projAVG)}</b></span>
                <span>80% 구간 {avg3(p.ci80?.[0])}~{avg3(p.ci80?.[1])}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <VoteCard players={data.players} />
    </section>
  )
}

/* ---------- 1위 vs 이정후 경쟁 격차 그래프 ---------- */
function GapChart({ players, season }) {
  const lee = players.find(isLee)
  const leader = players[0]
  if (!lee || !leader || isLee(leader)) return null
  return (
    <div className="gap-wrap">
      <p className="gap-title">📉 최근 10경기 · 1위({abbr2(leader.name)}) vs 이정후 추이</p>
      <FormChart players={players} season={season} picks={[leader, lee]} />
    </div>
  )
}
const abbr2 = (name) => (name ? name.split(' ').slice(-1)[0] : '')

/* ---------- 타율왕 예측 투표 ---------- */
function VoteCard({ players }) {
  const { counts, voted, vote } = useVote()
  const cands = players.slice(0, 5)
  const total = counts ? Object.values(counts).reduce((a, b) => a + (b || 0), 0) : 0

  return (
    <div className="vote-card">
      <h3 className="vote-title">🗳️ 당신의 예상 타율왕은?</h3>
      {!voted ? (
        <div className="vote-opts">
          {cands.map((p) => (
            <button key={p.id} className="vote-opt" onClick={() => vote(p.id)}>
              <img className="vote-photo" src={headshot(p.id)} alt="" loading="lazy" onError={hideOnError} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="vote-result">
          {cands
            .map((p) => ({ p, n: counts?.[String(p.id)] || 0 }))
            .sort((a, b) => b.n - a.n)
            .map(({ p, n }) => {
              const pctv = total ? Math.round((n / total) * 100) : 0
              return (
                <div key={p.id} className={`vote-row ${String(p.id) === voted ? 'mine' : ''}`}>
                  <span className="vote-name">{p.name}{String(p.id) === voted && ' ✓'}</span>
                  <span className="vote-bar"><span style={{ width: `${pctv}%` }} /></span>
                  <span className="vote-pct">{pctv}%</span>
                </div>
              )
            })}
          <p className="vote-total">총 {total.toLocaleString()}표 · 투표 완료</p>
        </div>
      )}
    </div>
  )
}

/* ---------- 리더보드 탭 ---------- */
const CHART_COLORS = ['#4aa8ff', '#34d399', '#f472b6', '#a78bfa', '#fb923c', '#22d3ee']

const FORM_GAMES = 10 // 최근 N경기

// 최근 10경기 동안의 누적 타율 추이 (각 선수 gameLog 기반)
function FormChart({ players, season, picks }) {
  const tracked = useMemo(() => {
    if (picks) return picks.filter(Boolean)
    const lee = players.find(isLee)
    const t = players.slice(0, 6)
    if (lee && !t.includes(lee)) t.push(lee)
    return t
  }, [players, picks])
  const ids = tracked.map((p) => p.id).join(',')

  const [series, setSeries] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let alive = true
    setStatus('loading')
    Promise.all(
      tracked.map(async (p) => {
        try {
          const url =
            `https://statsapi.mlb.com/api/v1/people/${p.id}/stats` +
            `?stats=gameLog&season=${season}&group=hitting&gameType=R`
          const r = await fetch(url, { cache: 'no-store' })
          const d = await r.json()
          const splits = (d.stats?.[0]?.splits ?? []).slice()
          splits.sort((a, b) => (a.date < b.date ? -1 : 1)) // 날짜 오름차순
          // 시즌 누적 타율 추이
          let h = 0, ab = 0
          const cum = splits.map((s) => {
            h += s.stat.hits; ab += s.stat.atBats
            return ab ? h / ab : 0
          })
          return { id: p.id, name: p.name, rank: p.rank, vals: cum.slice(-FORM_GAMES) }
        } catch {
          return { id: p.id, name: p.name, rank: p.rank, vals: [] }
        }
      }),
    ).then((res) => { if (alive) { setSeries(res); setStatus('ok') } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, season])

  if (status === 'loading') {
    return <div className="rank-chart empty-chart">📈 최근 {FORM_GAMES}경기 타율 불러오는 중…</div>
  }
  const valid = (series ?? []).filter((s) => s.vals.length >= 2)
  if (!valid.length) {
    return <div className="rank-chart empty-chart">최근 경기 데이터를 불러오지 못했습니다.</div>
  }

  const W = 320, H = 120
  const padL = 30, padR = 56, padT = 8, padB = 8
  const N = Math.min(FORM_GAMES, Math.max(...valid.map((s) => s.vals.length)))
  const allVals = valid.flatMap((s) => s.vals)
  let minV = Math.min(...allVals), maxV = Math.max(...allVals)
  if (maxV === minV) { maxV += 0.005; minV -= 0.005 }
  const pad = (maxV - minV) * 0.12
  minV -= pad; maxV += pad

  const x = (i) => padL + (N <= 1 ? 0 : (i / (N - 1)) * (W - padL - padR))
  const y = (v) => padT + (1 - (v - minV) / (maxV - minV)) * (H - padT - padB)
  const fmtAvg = (v) => v.toFixed(3).replace(/^0/, '')

  // y축 눈금 3개
  const ticks = [minV + (maxV - minV) * 0.1, (minV + maxV) / 2, maxV - (maxV - minV) * 0.1]

  // 우측 이름 라벨 충돌 방지: y 정렬 후 최소 간격 확보
  const labels = valid.map((s, idx) => ({
    name: s.name.split(' ').slice(-1)[0],
    color: isLee(s) ? '#f6c445' : CHART_COLORS[idx % CHART_COLORS.length],
    yReal: y(s.vals[s.vals.length - 1]),
  }))
  labels.sort((a, b) => a.yReal - b.yReal)
  const GAP = 9
  labels.forEach((l, i) => {
    l.yLab = i === 0 ? l.yReal : Math.max(l.yReal, labels[i - 1].yLab + GAP)
  })

  return (
    <div className="rank-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
        {ticks.map((tv, i) => (
          <g key={i}>
            <line x1={padL} y1={y(tv)} x2={W - padR} y2={y(tv)} stroke="var(--border)" strokeWidth="0.5" />
            <text x={padL - 4} y={y(tv) + 3} textAnchor="end" className="ch-axis">{fmtAvg(tv)}</text>
          </g>
        ))}
        {valid.map((s, idx) => {
          const lee = isLee(s)
          const color = lee ? '#f6c445' : CHART_COLORS[idx % CHART_COLORS.length]
          const off = N - s.vals.length // 경기 수가 적으면 오른쪽 정렬
          const pts = s.vals.map((v, k) => `${x(off + k)},${y(v)}`).join(' ')
          const last = s.vals[s.vals.length - 1]
          return (
            <g key={s.id}>
              <polyline points={pts} fill="none" stroke={color} strokeWidth={lee ? 2.4 : 1.4}
                strokeLinejoin="round" strokeLinecap="round" opacity={lee ? 1 : 0.85} />
              <circle cx={x(N - 1)} cy={y(last)} r={lee ? 3 : 2.2} fill={color} />
            </g>
          )
        })}
        {labels.map((l, i) => (
          <text key={i} x={x(N - 1) + 5} y={l.yLab + 3} className="ch-name" fill={l.color}>{l.name}</text>
        ))}
      </svg>
    </div>
  )
}

function Leaderboard({ players, season, className = '' }) {
  const cols = STAT_KEYS.filter((s) => !['rank'].includes(s.key))
  return (
    <section className={`card-section ${className}`}>
      <h2 className="sec-title">현재 타율 랭킹</h2>
      <p className="sec-desc">최근 {FORM_GAMES}경기 누적 타율 추이 · 상위 6명</p>
      <FormChart players={players} season={season} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="sticky">#</th>
              <th className="sticky2">선수</th>
              {cols.map((c) => <th key={c.key}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {players.slice(0, 10).map((p) => {
              return (
                <tr key={p.id} className={isLee(p) ? 'is-lee' : ''}>
                  <td className="sticky">{p.rank}</td>
                  <td className="sticky2">
                    <strong>{p.name}</strong>
                    <span className="td-team">{p.team}{p.pos ? ` · ${p.pos}` : ''}</span>
                  </td>
                  {cols.map((c) => <td key={c.key}>{fmt(c.key, p[c.key])}</td>)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ---------- 톱10 실시간 성적 탭 ---------- */
const LIVE_TOP10_MS = 90_000

function LiveTop10({ players }) {
  const top10 = useMemo(() => players.slice(0, 10), [players])
  const ids = top10.map((p) => p.id).join(',')
  const teamIds = top10.map((p) => p.teamId).join(',')
  const [info, setInfo] = useState({ chosen: {}, box: {} })
  const [status, setStatus] = useState('loading')

  // MLB 경기는 미국 동부시간(ET) 기준
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        // 어제~오늘(ET) 일정 — 새 경기가 시작되기 전까진 직전 경기 결과를 유지하기 위해
        const yd = new Date(`${today}T12:00:00Z`)
        yd.setUTCDate(yd.getUTCDate() - 1)
        const yesterday = yd.toISOString().slice(0, 10)
        const sd = await (await fetch(
          `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${yesterday}&endDate=${today}`,
          { cache: 'no-store' },
        )).json()
        const teamGames = {}
        for (const dt of sd.dates ?? []) for (const g of dt.games ?? []) {
          const mk = (oppName, isHome) => ({
            date: dt.date, gamePk: g.gamePk, gameDate: g.gameDate,
            state: g.status?.abstractGameState, detailed: g.status?.detailedState, oppName, isHome,
          })
          const h = g.teams?.home?.team, a = g.teams?.away?.team
          if (h) (teamGames[h.id] = teamGames[h.id] || []).push(mk(a?.name, true))
          if (a) (teamGames[a.id] = teamGames[a.id] || []).push(mk(h?.name, false))
        }
        // 팀별 '현재/최근' 경기: 진행 중 > 가장 최근 완료 > 예정
        const chosen = {}
        for (const [tid, list] of Object.entries(teamGames)) {
          const desc = list.slice().sort((x, z) => (x.date < z.date ? 1 : -1))
          chosen[tid] = desc.find((g) => g.state === 'Live')
            || desc.find((g) => g.state === 'Final') || desc[0]
        }
        // 시작된 경기만 박스스코어 조회
        const pks = [...new Set(
          top10.map((p) => chosen[p.teamId]).filter((g) => g && g.state !== 'Preview').map((g) => g.gamePk),
        )]
        const box = {}
        await Promise.all(pks.map(async (pk) => {
          try {
            box[pk] = await (await fetch(
              `https://statsapi.mlb.com/api/v1/game/${pk}/boxscore`, { cache: 'no-store' },
            )).json()
          } catch { /* 개별 실패 무시 */ }
        }))
        if (alive) { setInfo({ chosen, box }); setStatus('ok') }
      } catch {
        if (alive) setStatus('error')
      }
    }
    setStatus('loading')
    load()
    const t = setInterval(load, LIVE_TOP10_MS)
    return () => { alive = false; clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, teamIds, today])

  // 선수의 현재/최근 경기 + 박스스코어 타격 라인
  const gameOf = (p) => {
    const g = info.chosen[p.teamId]
    if (!g) return null
    const bx = info.box[g.gamePk]
    let bat = null
    if (bx) {
      for (const side of ['home', 'away']) {
        const pl = bx.teams?.[side]?.players?.[`ID${p.id}`]
        if (pl) { bat = pl.stats?.batting ?? null; break }
      }
    }
    return { ...g, bat }
  }

  const anyLive = top10.some((p) => info.chosen[p.teamId]?.state === 'Live')

  return (
    <section className="card-section">
      <h2 className="sec-title">🔴 타율 톱10 실시간 성적</h2>
      <p className="sec-desc">
        미국시간 기준 · 현재/최근 경기{anyLive ? ' · LIVE' : ''} · 90초 갱신
      </p>
      <ul className="live-list">
        {top10.map((p) => {
          const g = gameOf(p)
          const bat = g?.bat
          return (
            <li key={p.id} className={`live-row ${isLee(p) ? 'is-lee' : ''}`}>
              <span className="live-rank">{p.rank}</span>
              <img className="live-photo" src={headshot(p.id)} alt="" loading="lazy" onError={hideOnError} />
              <div className="live-main">
                <div className="live-top">
                  <span className="live-name">{p.name} <span className="live-team">{p.team}</span></span>
                  <span className="live-avg">{avg3(p.AVG)}</span>
                </div>
                <div className="live-game">
                  {!g ? (
                    <span className="live-line">{status === 'loading' ? '불러오는 중…' : '오늘 경기 없음 · -'}</span>
                  ) : (
                    <>
                      {g.state === 'Live' && <span className="live-badge">● LIVE</span>}
                      {g.state === 'Final' && <span className="live-fin">종료</span>}
                      <span className="live-date">
                        {g.date?.slice(5).replace('-', '/')} {g.isHome ? 'vs' : '@'} {abbr(g.oppName)}
                      </span>
                      {g.state === 'Preview' ? (
                        <span className="live-line">{startTimeLabel(g.gameDate)}</span>
                      ) : bat ? (
                        <span className="live-line">
                          {bat.atBats ?? 0}타수 {bat.hits ?? 0}안타
                          {bat.homeRuns > 0 && ` · ${bat.homeRuns}홈런`}
                          {bat.rbi > 0 && ` · ${bat.rbi}타점`}
                          {bat.baseOnBalls > 0 && ` · ${bat.baseOnBalls}볼넷`}
                          {bat.stolenBases > 0 && ` · ${bat.stolenBases}도루`}
                        </span>
                      ) : (
                        <span className="live-line">결장 · -</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// 팀 풀네임 → 짧은 약칭(마지막 단어)
function abbr(name) {
  if (!name) return ''
  return name.split(' ').slice(-1)[0]
}

// 경기 예정 시작 시각 라벨 (한국시간)
function startTimeLabel(gameDate) {
  if (!gameDate) return '경기 예정'
  const t = new Date(gameDate).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit',
  })
  return `경기 예정 · ${t} 시작`
}

/* ---------- 이정후 비교 탭 ---------- */
// (N위) 배지를 붙일 스탯 — 높을수록 좋은 항목 (AVG는 '타율 순위' 행과 중복이라 제외)
const RANKED_STATS = ['R', 'H', 'B2', 'B3', 'HR', 'RBI', 'SB', 'BB', 'OBP', 'SLG', 'OPS']

function Compare({ players }) {
  const lee = players.find(isLee)
  const top5 = players.filter((p) => p !== lee).slice(0, 5)
  const [oppId, setOppId] = useState(top5[0]?.id)

  // 스탯별 MLB 순위(전체 규정타자 기준, 내림차순) — 선수ID → 순위
  const ranks = useMemo(() => {
    const map = {}
    for (const key of RANKED_STATS) {
      const sorted = [...players].sort((x, y) => (y[key] ?? -Infinity) - (x[key] ?? -Infinity))
      const m = {}
      sorted.forEach((p, i) => { m[p.id] = i + 1 })
      map[key] = m
    }
    return map
  }, [players])

  const opponent = useMemo(
    () => top5.find((p) => p.id === oppId) ?? top5[0],
    [oppId, top5],
  )

  if (!lee) {
    return <section className="card-section"><p className="empty">이정후 데이터를 찾을 수 없습니다.</p></section>
  }

  return (
    <section className="card-section">
      <div className="opponent-picker">
        {top5.map((p, i) => (
          <button
            key={p.id}
            className={`chip ${p.id === opponent.id ? 'active' : ''}`}
            onClick={() => setOppId(p.id)}
          >
            <span className="chip-rank">{i + 1}위</span>
            <span className="chip-name">{p.name}</span>
            <span className="chip-avg">{avg3(p.AVG)}</span>
          </button>
        ))}
      </div>

      <div className="compare">
        <div className="player-cards">
          <PlayerColumn player={lee} side="left" />
          <PlayerColumn player={opponent} side="right" />
        </div>
        <div className="stat-rows">
          <div className="stat-head">
            <span>{lee.name}</span>
            <span className="stat-label-head">STAT</span>
            <span>{opponent.name}</span>
          </div>
          {STAT_KEYS.map((s) => (
            <StatRow
              key={s.key}
              s={s}
              a={lee[s.key]}
              b={opponent[s.key]}
              aRank={ranks[s.key]?.[lee.id]}
              bRank={ranks[s.key]?.[opponent.id]}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function PlayerColumn({ player, side }) {
  return (
    <div className={`player-card ${side}`}>
      <img className="p-photo" src={headshot(player.id)} alt="" loading="lazy" onError={hideOnError} />
      <span className="rank-pill">{player.rank}위</span>
      <h2 className="p-name">{player.name}</h2>
      <p className="p-team">
        <img className="p-logo" src={teamLogo(player.teamId)} alt="" onError={hideOnError} />
        {player.team}
      </p>
      <div className="p-avg">
        <span className="p-avg-val">{avg3(player.AVG)}</span>
      </div>
    </div>
  )
}

/* ---------- 익명 응원 게시판 탭 ---------- */
function timeAgo(createdAt) {
  const ms = createdAt?.toMillis ? createdAt.toMillis() : null
  if (!ms) return '방금'
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return '방금'
  if (s < 3600) return `${Math.floor(s / 60)}분 전`
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`
  return `${Math.floor(s / 86400)}일 전`
}

const CHEER_PAGE_SIZE = 20

const LIKED_KEY = 'baseball-liked'
const loadLiked = () => { try { return new Set(JSON.parse(localStorage.getItem(LIKED_KEY) || '[]')) } catch { return new Set() } }

function CheerBoard() {
  const { cheers, post, like, error } = useCheers()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('new') // new | hot
  const [liked, setLiked] = useState(loadLiked)

  const sorted = useMemo(() => {
    if (sort === 'hot') return [...cheers].sort((a, b) => (b.likes || 0) - (a.likes || 0))
    return cheers
  }, [cheers, sort])

  const pageCount = Math.max(1, Math.ceil(sorted.length / CHEER_PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const shown = sorted.slice(safePage * CHEER_PAGE_SIZE, safePage * CHEER_PAGE_SIZE + CHEER_PAGE_SIZE)

  const submit = async (e) => {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await post(text)
      setText('')
    } catch (err) {
      console.warn('응원 작성 실패:', err.message)
    } finally {
      setSending(false)
    }
  }

  const onLike = (id) => {
    if (liked.has(id)) return
    const next = new Set(liked); next.add(id); setLiked(next)
    try { localStorage.setItem(LIKED_KEY, JSON.stringify([...next])) } catch {}
    like(id)
  }

  return (
    <section className="card-section">
      <div className="sec-head">
        <h2 className="sec-title">📣 이정후 응원 게시판</h2>
        <div className="cheer-sort">
          <button className={sort === 'new' ? 'on' : ''} onClick={() => setSort('new')}>최신</button>
          <button className={sort === 'hot' ? 'on' : ''} onClick={() => setSort('hot')}>인기</button>
        </div>
      </div>
      <p className="sec-desc">익명으로 응원 메시지를 남겨보세요 · 실시간</p>

      <form className="cheer-form" onSubmit={submit}>
        <input
          className="cheer-input"
          value={text}
          maxLength={200}
          placeholder="이정후 화이팅! 👏"
          onChange={(e) => setText(e.target.value)}
        />
        <button className="cheer-send" type="submit" disabled={!text.trim() || sending}>
          {sending ? '…' : '응원'}
        </button>
      </form>

      {error && <p className="empty-mini">⚠️ 게시판 연결 실패 (Firestore 규칙 확인)</p>}

      <ul className="cheer-list">
        {cheers.length === 0 && <li className="cheer-empty">첫 응원을 남겨주세요! 🙌</li>}
        {shown.map((c) => (
          <li key={c.id} className="cheer-item">
            <span className="cheer-time">{timeAgo(c.createdAt)}</span>
            <p className="cheer-text">{c.text}</p>
            <button
              className={`cheer-like ${liked.has(c.id) ? 'liked' : ''}`}
              onClick={() => onLike(c.id)}
              disabled={liked.has(c.id)}
            >
              ♥ {c.likes || 0}
            </button>
          </li>
        ))}
      </ul>

      {pageCount > 1 && (
        <div className="pager">
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              className={`pg ${i === safePage ? 'active' : ''}`}
              onClick={() => setPage(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/* ---------- 이정후 코스별 핫/콜드존 탭 ---------- */
// 존 번호 → 한글 코스 설명 (포수 시점)
const ZONE_LABEL = {
  '01': '높은 좌', '02': '높은 가운데', '03': '높은 우',
  '04': '가운데 좌', '05': '한가운데', '06': '가운데 우',
  '07': '낮은 좌', '08': '낮은 가운데', '09': '낮은 우',
  11: '바깥 높은 좌', 12: '바깥 높은 우', 13: '바깥 낮은 좌', 14: '바깥 낮은 우',
}
const METRICS = [
  { key: 'battingAverage', label: '타율' },
  { key: 'onBasePlusSlugging', label: 'OPS' },
  { key: 'sluggingPercentage', label: '장타율' },
]

// 지표별 절대 기준선 [파랑(낮음), 흰색(중립), 빨강(높음)]
// 타율은 3할(.300) 넘으면 빨강, .250 중립, .200 이하 파랑
const HEAT_ANCHOR = {
  // 타율: 1할(.100)~2할5푼(.250) 파랑, 2할6푼(.260)~ 빨강. 피벗 ≈ .255
  battingAverage: [0.1, 0.255, 0.36],
  onBasePlusSlugging: [0.6, 0.73, 0.85],
  sluggingPercentage: [0.33, 0.4, 0.47],
}
// 값 → t(0~1). 기준선 기반 절대 스케일.
function heatT(n, metric) {
  if (n == null) return null
  const [lo, mid, hi] = HEAT_ANCHOR[metric] || HEAT_ANCHOR.battingAverage
  if (n <= mid) return Math.max(0, (0.5 * (n - lo)) / (mid - lo))
  return Math.min(1, 0.5 + (0.5 * (n - mid)) / (hi - mid))
}
// t(0~1) → 파랑 → 흰색 → 빨강 연속 그라데이션
function heatRGB(t) {
  const lerp = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f))
  const blue = [46, 104, 210], mid = [232, 234, 238], red = [214, 41, 52]
  return t < 0.5 ? lerp(blue, mid, t / 0.5) : lerp(mid, red, (t - 0.5) / 0.5)
}
// 배경 밝기에 따라 가독성 좋은 글자색
function textOn([r, g, b]) {
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#0c1424' : '#f3f6fc'
}

function LeeZone({ players, season }) {
  const lee = players.find(isLee)
  const playerId = lee?.id || 808982
  const [metric, setMetric] = useState('battingAverage')
  const [zones, setZones] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let alive = true
    setStatus('loading')
    const url =
      `https://statsapi.mlb.com/api/v1/people/${playerId}/stats` +
      `?stats=hotColdZones&season=${season}&group=hitting&gameType=R`
    fetch(url, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        const map = {}
        for (const blk of d.stats ?? []) {
          for (const sp of blk.splits ?? []) {
            const st = sp.stat
            if (!st?.name || !st.zones) continue
            map[st.name] = {}
            for (const z of st.zones) {
              map[st.name][z.zone] = { value: z.value, color: z.color, temp: z.temp }
            }
          }
        }
        setZones(map)
        setStatus(Object.keys(map).length ? 'ok' : 'empty')
      })
      .catch(() => alive && setStatus('error'))
    return () => { alive = false }
  }, [playerId, season])

  if (status === 'loading') return <section className="card-section"><p className="empty">코스별 데이터 불러오는 중…</p></section>
  if (status !== 'ok') return <section className="card-section"><p className="empty">코스별 데이터를 불러오지 못했습니다.</p></section>

  const m = zones[metric] || {}
  const cell = (code) => m[code] || {}
  const innerCodes = ['01', '02', '03', '04', '05', '06', '07', '08', '09']

  // 강·약점 분류 (안쪽 9존 기준, value 숫자화)
  const num = (v) => (v == null ? null : Number(String(v).replace('', '')))
  const entries = Object.entries(m).map(([code, z]) => ({
    code, label: ZONE_LABEL[code] || code, ...z, n: num(z.value),
  }))
  const inner = entries.filter((e) => innerCodes.includes(e.code) && e.n != null)
  const best = inner.slice().sort((a, b) => b.n - a.n)[0]
  const worst = inner.slice().sort((a, b) => a.n - b.n)[0]
  // 절대 기준선 기반 색상 (3할 넘으면 빨강)
  const tOf = (n) => heatT(n, metric)
  const strong = entries.filter((e) => e.temp === 'hot' || e.temp === 'warm').sort((a, b) => b.n - a.n)
  const weak = entries.filter((e) => e.temp === 'cold' || e.temp === 'cool').sort((a, b) => a.n - b.n)
  const fmtV = (v) => (v == null ? '—' : metric === 'battingAverage' ? String(v) : String(v))

  const Cell = ({ code, outer, pos }) => {
    const z = cell(code)
    const t = tOf(num(z.value))
    const rgb = t == null ? null : heatRGB(t)
    const isBest = best && code === best.code
    const isWorst = worst && code === worst.code
    return (
      <div
        className={`zcell ${outer ? 'outer' : ''} ${pos || ''}`}
        style={{ background: rgb ? `rgb(${rgb.join(',')})` : 'transparent' }}
      >
        {isBest && <span className="zmark">🔥</span>}
        {isWorst && <span className="zmark">❄️</span>}
        <span className="zval" style={{ color: rgb ? textOn(rgb) : 'var(--muted)' }}>{fmtV(z.value)}</span>
      </div>
    )
  }

  return (
    <section className="card-section">
      <h2 className="sec-title">이정후 코스별 강·약점</h2>
      <p className="sec-desc">{season} 시즌 존별 {METRICS.find((x) => x.key === metric).label} · 포수 시점 · 🔥강점 ❄️약점</p>

      <div className="metric-toggle">
        {METRICS.map((mm) => (
          <button key={mm.key} className={`mt ${metric === mm.key ? 'active' : ''}`} onClick={() => setMetric(mm.key)}>
            {mm.label}
          </button>
        ))}
      </div>

      <div className="zone-field">
        <span className="zaxis top">높은 코스</span>
        <span className="zaxis bottom">낮은 코스</span>
        <Cell code={11} outer pos="zc-tl" />
        <Cell code={12} outer pos="zc-tr" />
        <div className="zgrid">
          {innerCodes.map((c) => <Cell key={c} code={c} />)}
        </div>
        <Cell code={13} outer pos="zc-bl" />
        <Cell code={14} outer pos="zc-br" />
      </div>

      <div className="zone-summary">
        <div className="zs-col strong">
          <h3>🔥 강한 코스</h3>
          {strong.length ? strong.slice(0, 4).map((e) => (
            <div key={e.code} className="zs-row"><span>{e.label}</span><b>{fmtV(e.value)}</b></div>
          )) : <p className="empty-mini">—</p>}
        </div>
        <div className="zs-col weak">
          <h3>❄️ 약한 코스</h3>
          {weak.length ? weak.slice(0, 4).map((e) => (
            <div key={e.code} className="zs-row"><span>{e.label}</span><b>{fmtV(e.value)}</b></div>
          )) : <p className="empty-mini">—</p>}
        </div>
      </div>
    </section>
  )
}

function StatRow({ s, a, b, aRank, bRank }) {
  const compare = HIGHER_IS_BETTER.includes(s.key)
    ? (a > b ? 'left' : b > a ? 'right' : 'tie')
    : s.key === 'SO'
      ? (a < b ? 'left' : b < a ? 'right' : 'tie')
      : 'none'
  const badge = (rank) => (rank && rank <= 10 ? <small className="stat-rk">({rank}위)</small> : null)
  return (
    <div className="stat-row">
      <span className={`val ${compare === 'left' ? 'win' : ''}`}>{fmt(s.key, a)}{badge(aRank)}</span>
      <span className="stat-label">{s.label}</span>
      <span className={`val ${compare === 'right' ? 'win' : ''}`}>{fmt(s.key, b)}{badge(bRank)}</span>
    </div>
  )
}
