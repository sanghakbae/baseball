import { useEffect, useMemo, useState } from 'react'
import { useStats } from './useStats.js'
import { useVisitors } from './useVisitors.js'
import { STAT_KEYS, HIGHER_IS_BETTER } from './data.js'

const avg3 = (v) => (v == null ? '—' : v.toFixed(3).replace(/^0/, ''))
const pct = (v) => `${(v * 100).toFixed(1)}%`
const isLee = (p) => p?.name === '이정후' || p?.name === 'Jung Hoo Lee'

const fmt = (k, v) => {
  const def = STAT_KEYS.find((s) => s.key === k)
  return def?.fmt ? def.fmt(v) : v
}

const TABS = [
  { id: 'predict', label: '🔮 예측' },
  { id: 'board', label: '📊 랭킹' },
  { id: 'compare', label: '⚔️ 비교' },
  { id: 'zone', label: '🎯 이정후' },
]

export default function App() {
  const { data, loading, isFallback, live, refreshing, refreshedAt, history } = useStats()
  const [tab, setTab] = useState('predict')

  if (loading) return <div className="page loading">데이터 불러오는 중…</div>

  const stamp = refreshedAt || data.updatedAt
  const updated = stamp
    ? new Date(stamp).toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    : '정적 샘플'

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">{data.season} MLB · 타율왕 예측 시스템</p>
        <h1>누가 <span className="hl">타율왕</span>이 될까?</h1>
        <p className="updated">
          <span className={`live-dot ${live ? 'on' : ''} ${refreshing ? 'pulse' : ''}`} />
          {live ? 'LIVE' : '대기'} · {updated}
          {isFallback && <span className="badge-warn"> · 정적 폴백</span>}
          {' · '}규정타석 {data.qualifiedCount}명
        </p>
      </header>

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
      {tab === 'board' && <Leaderboard players={data.players} history={history} />}
      {tab === 'compare' && <Compare players={data.players} />}
      {tab === 'zone' && <LeeZone players={data.players} season={data.season} />}
    </div>
  )
}

/* ---------- 방문자 수 (Firestore 저장·실시간) ---------- */
function Visitors() {
  const count = useVisitors()
  const text = count == null ? '0000' : String(count).padStart(4, '0')
  return (
    <span className="visitors" title="누적 방문자 수">
      👁 {text}
    </span>
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
      <div className="sec-head">
        <h2 className="sec-title">시즌 종료 타율 1위 확률</h2>
        <Visitors />
      </div>
      <p className="sec-desc">평균회귀 실력 추정 + 잔여 타석 2만 회 시뮬레이션 결과</p>
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
    </section>
  )
}

/* ---------- 리더보드 탭 ---------- */
const CHART_COLORS = ['#4aa8ff', '#34d399', '#f472b6', '#a78bfa', '#fb923c', '#22d3ee']

function RankChart({ history, players }) {
  if (!history || history.length < 2) {
    return (
      <div className="rank-chart empty-chart">
        📈 순위 변동 기록 수집 중… 60초마다 갱신 ({history?.length || 0}개 기록)
      </div>
    )
  }

  // 추적 대상: 현재 상위 6명 + 이정후
  const lee = players.find(isLee)
  const tracked = players.slice(0, 6)
  if (lee && !tracked.includes(lee)) tracked.push(lee)

  const W = 320, H = 150
  const padL = 18, padR = 56, padT = 10, padB = 18
  const n = history.length
  const maxRank = Math.max(
    6,
    ...history.flatMap((h) => tracked.map((p) => h.r[p.id]).filter((v) => v != null)),
  )
  const x = (i) => padL + (n === 1 ? 0 : (i / (n - 1)) * (W - padL - padR))
  const y = (rank) => padT + ((rank - 1) / (maxRank - 1)) * (H - padT - padB)

  const t0 = new Date(history[0].t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  const t1 = new Date(history[n - 1].t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="rank-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
        {/* 가로 기준선 (순위 1,2,3…) */}
        {Array.from({ length: maxRank }, (_, k) => k + 1).map((rank) => (
          <g key={rank}>
            <line x1={padL} y1={y(rank)} x2={W - padR} y2={y(rank)} stroke="#263350" strokeWidth="0.5" />
            <text x={padL - 4} y={y(rank) + 3} textAnchor="end" className="ch-axis">{rank}</text>
          </g>
        ))}
        {/* 선수별 순위 추이 */}
        {tracked.map((p, idx) => {
          const lee = isLee(p)
          const color = lee ? '#f6c445' : CHART_COLORS[idx % CHART_COLORS.length]
          const pts = history
            .map((h, i) => (h.r[p.id] != null ? `${x(i)},${y(h.r[p.id])}` : null))
            .filter(Boolean)
            .join(' ')
          const lastRank = history[n - 1].r[p.id]
          return (
            <g key={p.id}>
              <polyline points={pts} fill="none" stroke={color} strokeWidth={lee ? 2.4 : 1.4}
                strokeLinejoin="round" strokeLinecap="round" opacity={lee ? 1 : 0.9} />
              {lastRank != null && (
                <>
                  <circle cx={x(n - 1)} cy={y(lastRank)} r={lee ? 3 : 2.2} fill={color} />
                  <text x={x(n - 1) + 5} y={y(lastRank) + 3} className="ch-name" fill={color}>
                    {p.name.split(' ').slice(-1)[0]}
                  </text>
                </>
              )}
            </g>
          )
        })}
        <text x={padL} y={H - 4} className="ch-axis">{t0}</text>
        <text x={W - padR} y={H - 4} textAnchor="end" className="ch-axis">{t1}</text>
      </svg>
    </div>
  )
}

function Leaderboard({ players, history }) {
  const cols = STAT_KEYS.filter((s) => !['rank'].includes(s.key))
  return (
    <section className="card-section">
      <h2 className="sec-title">현재 타율 랭킹</h2>
      <p className="sec-desc">실시간 순위 변동 · 상위 6명 + 이정후</p>
      <RankChart history={history} players={players} />
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

/* ---------- 이정후 비교 탭 ---------- */
function Compare({ players }) {
  const lee = players.find(isLee)
  const top5 = players.filter((p) => p !== lee).slice(0, 5)
  const [oppId, setOppId] = useState(top5[0]?.id)
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
        {top5.map((p) => (
          <button
            key={p.id}
            className={`chip ${p.id === opponent.id ? 'active' : ''}`}
            onClick={() => setOppId(p.id)}
          >
            <span className="chip-rank">{p.rank}위</span>
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
            <StatRow key={s.key} s={s} a={lee[s.key]} b={opponent[s.key]} />
          ))}
        </div>
      </div>
    </section>
  )
}

function PlayerColumn({ player, side }) {
  return (
    <div className={`player-card ${side}`}>
      <span className="rank-pill">{player.rank}위</span>
      <h2 className="p-name">{player.name}</h2>
      <p className="p-meta">{player.team}{player.pos ? ` · ${player.pos}` : ''}</p>
      <div className="p-avg">
        <span className="p-avg-val">{avg3(player.AVG)}</span>
        <span className="p-avg-lbl">AVG</span>
      </div>
      <div className="p-slash">
        {avg3(player.OBP)} / {avg3(player.SLG)} / {avg3(player.OPS)}
        <span className="p-slash-lbl">OBP / SLG / OPS</span>
      </div>
    </div>
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

function StatRow({ s, a, b }) {
  const compare = HIGHER_IS_BETTER.includes(s.key)
    ? (a > b ? 'left' : b > a ? 'right' : 'tie')
    : s.key === 'SO'
      ? (a < b ? 'left' : b < a ? 'right' : 'tie')
      : 'none'
  return (
    <div className="stat-row">
      <span className={`val ${compare === 'left' ? 'win' : ''}`}>{fmt(s.key, a)}</span>
      <span className="stat-label">{s.label}</span>
      <span className={`val ${compare === 'right' ? 'win' : ''}`}>{fmt(s.key, b)}</span>
    </div>
  )
}
