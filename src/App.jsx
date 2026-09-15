import { useEffect, useMemo, useRef, useState } from 'react'
import { useStats } from './useStats.js'
import { useVisitors } from './useVisitors.js'
import { useCheers } from './useCheers.js'
import { useVote } from './useVote.js'
import { useServiceWorker } from './useServiceWorker.js'
import CoupangBanner from './CoupangBanner.jsx'
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
  { id: 'war', label: '🏆 WAR' },
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
        <div className="hero-actions">
          <button className="hero-admin" title="관리자" onClick={() => { window.location.hash = 'admin' }}>🔧</button>
          <ShareButton />
        </div>
        <h1>2026년 누가 <span className="hl">타격왕</span>이 될까?</h1>
        <p className="updated">
          <span className={`live-dot ${live ? 'on' : ''} ${refreshing ? 'pulse' : ''}`} />
          {live ? 'LIVE' : '대기'} · {updated}
          {isFallback && <span className="badge-warn"> · 정적 폴백</span>}
          {' · '}규정타석 {data.qualifiedCount}명
        </p>
        <div className="hero-meta"><Visitors /></div>
      </header>

      <UpdateToast />
      <DebugViewport />
      <InstallHint />

      {isDesktop ? (
        // PC 대시보드: 1행(예측+랭킹), 2행(톱10·코스별·비교), 3행(응원)
        <div className="dashboard">
          <div className="dash-item d-predict"><Predict data={data} /></div>
          <div className="dash-item d-rank"><Leaderboard players={data.players} season={data.season} wide /></div>
          <div className="dash-item d-live"><LiveTop10 players={data.players} season={data.season} /></div>
          <div className="dash-item d-zone"><LeeZone players={data.players} season={data.season} /><LeeSeason players={data.players} season={data.season} /></div>
          <div className="dash-item d-compare"><Compare players={data.players} /></div>
          <div className="dash-item d-war"><WarBoard season={data.season} /></div>
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
          {tab === 'zone' && <><LeeZone players={data.players} season={data.season} /><LeeSeason players={data.players} season={data.season} /></>}
          {tab === 'war' && <WarBoard season={data.season} />}
          {tab === 'cheer' && <CheerBoard />}
        </>
      )}

      <CoupangBanner />

      <AllStarModal />
    </div>
  )
}

/* ---------- 레이아웃 진단 (?debug=1 일 때만) ---------- */
// iOS safe-area 는 데스크톱 브라우저에서 재현되지 않아, 실제 기기 값을 눈으로 확인하기 위한 도구.
function DebugViewport() {
  const [on] = useState(() => new URLSearchParams(location.search).get('debug') === '1')
  const [v, setV] = useState(null)

  useEffect(() => {
    if (!on) return
    const read = () => {
      const cs = getComputedStyle(document.documentElement)
      const probe = document.createElement('div')
      probe.style.cssText = 'position:fixed;bottom:0;left:0;height:env(safe-area-inset-bottom);width:1px'
      document.body.appendChild(probe)
      const safeB = probe.getBoundingClientRect().height
      probe.remove()
      const nav = document.querySelector('.tabs')?.getBoundingClientRect()
      setV({
        innerH: window.innerHeight,
        visualH: Math.round(window.visualViewport?.height ?? 0),
        screenH: window.screen.height,
        dvh: parseFloat(cs.getPropertyValue('--probe-dvh')) || 0,
        safeB: Math.round(safeB),
        navTop: nav ? Math.round(nav.top) : null,
        navBottom: nav ? Math.round(nav.bottom) : null,
        navH: nav ? Math.round(nav.height) : null,
        gap: nav ? Math.round(window.innerHeight - nav.bottom) : null,
        standalone: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true,
      })
    }
    read()
    window.addEventListener('resize', read)
    window.visualViewport?.addEventListener('resize', read)
    return () => {
      window.removeEventListener('resize', read)
      window.visualViewport?.removeEventListener('resize', read)
    }
  }, [on])

  if (!on || !v) return null
  return (
    <div className="dbg-vp">
      innerH {v.innerH} · visualH {v.visualH} · screenH {v.screenH}<br />
      safe-bottom {v.safeB} · standalone {String(v.standalone)}<br />
      nav top {v.navTop} / bottom {v.navBottom} / h {v.navH}<br />
      <b>탭바 아래 남은 높이: {v.gap}</b>
    </div>
  )
}

/* ---------- 업데이트 알림 ---------- */
function UpdateToast() {
  const { updateReady, applyUpdate } = useServiceWorker()
  const [hidden, setHidden] = useState(false)
  if (!updateReady || hidden) return null
  return (
    <div className="update-toast" role="status">
      <span className="update-dot" />
      <span className="update-text">새 버전이 있습니다</span>
      <button className="update-btn" onClick={applyUpdate}>새로고침</button>
      <button className="update-x" onClick={() => setHidden(true)} aria-label="나중에">✕</button>
    </div>
  )
}

/* ---------- 설치 가이드 ---------- */
// 플랫폼마다 설치 경로가 완전히 달라 안내를 분리한다
function installSteps() {
  const ua = navigator.userAgent
  const ios = isIOS()
  if (ios) {
    // iOS 는 Safari 에서만 홈 화면 추가가 제대로 동작한다
    const safari = /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua)
    if (!safari) {
      return {
        title: 'Safari 에서 열어주세요',
        note: 'iPhone 은 Safari 에서만 홈 화면 추가가 정상 동작합니다.',
        steps: [
          '이 페이지 주소를 복사합니다',
          'Safari 를 열고 주소를 붙여넣어 접속합니다',
          '아래 iPhone 안내대로 진행합니다',
        ],
      }
    }
    return {
      title: 'iPhone · Safari',
      steps: [
        <>화면 하단 가운데의 <b>공유</b> <ShareGlyph /> 버튼을 누릅니다</>,
        <>메뉴를 아래로 내려 <b>홈 화면에 추가</b> 를 선택합니다</>,
        <>오른쪽 위 <b>추가</b> 를 누르면 완료됩니다</>,
      ],
    }
  }
  if (/android/i.test(ua)) {
    return {
      title: 'Android · Chrome',
      steps: [
        <>오른쪽 위 <b>⋮</b> 메뉴를 누릅니다</>,
        <><b>앱 설치</b> 또는 <b>홈 화면에 추가</b> 를 선택합니다</>,
        <><b>설치</b> 를 누르면 완료됩니다</>,
      ],
    }
  }
  return {
    title: 'PC · Chrome / Edge',
    steps: [
      <>주소창 오른쪽의 <b>설치</b> 아이콘을 누릅니다</>,
      <>안 보이면 <b>⋮</b> 메뉴 → <b>앱</b> → <b>이 사이트 설치</b></>,
      <><b>설치</b> 를 누르면 완료됩니다</>,
    ],
  }
}

function InstallGuide({ onClose }) {
  const { title, steps, note } = installSteps()
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal install-guide" onClick={(e) => e.stopPropagation()}>
        <img className="guide-icon" src="/apple-touch-icon.png" alt="" width="56" height="56" />
        <h2 className="modal-title">홈 화면에 추가하기</h2>
        <p className="modal-desc">
          주소창 없이 전체화면으로 열리고, 오프라인에서도 마지막 화면을 볼 수 있습니다.
        </p>
        <div className="guide-plat">{title}</div>
        <ol className="guide-steps">
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
        {note && <p className="guide-note">{note}</p>}
        <button className="modal-btn" onClick={onClose}>확인</button>
      </div>
    </div>
  )
}

/* ---------- 홈 화면 추가 / 앱 설치 안내 ---------- */
const INSTALL_DISMISS_KEY = 'baseball-install-dismissed'

// 이미 홈 화면에서 실행 중인지 (iOS 는 navigator.standalone, 그 외는 display-mode)
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

const isIOS = () => {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return false // 안드로이드가 먼저 배제되어야 한다
  return /iphone|ipad|ipod/i.test(ua)
    // iPadOS 13+ 는 UA 가 Mac 으로 보이므로 터치 지원 여부로 판별한다
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// iOS 공유 아이콘(네모+위쪽 화살표) — 폰트에 의존하지 않도록 SVG 로 그린다
function ShareGlyph() {
  return (
    <svg className="ios-share" viewBox="0 0 24 24" width="13" height="13" aria-label="공유" role="img">
      <path d="M12 3v12M12 3l-3.5 3.5M12 3l3.5 3.5" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 10H5.5A1.5 1.5 0 0 0 4 11.5v8A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 18.5 10H17"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function InstallHint() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(INSTALL_DISMISS_KEY) === '1' } catch { return false }
  })
  // index.html 에서 미리 붙잡아 둔 이벤트가 있으면 그것을 쓰고, 아직이면 신호를 기다린다
  const [deferred, setDeferred] = useState(() => window.__installPrompt || null)
  const [guide, setGuide] = useState(false)

  useEffect(() => {
    const pick = () => setDeferred(window.__installPrompt || null)
    window.addEventListener('installprompt-ready', pick)
    return () => window.removeEventListener('installprompt-ready', pick)
  }, [])

  if (dismissed || isStandalone()) return null

  const close = () => {
    try { localStorage.setItem(INSTALL_DISMISS_KEY, '1') } catch {}
    setDismissed(true)
  }

  const install = async () => {
    if (!deferred) return
    deferred.prompt()
    try { await deferred.userChoice } catch {}
    window.__installPrompt = null // 프롬프트는 1회용
    setDeferred(null)
    close()
  }

  return (
    <div className="install-hint">
      <img className="install-icon" src="/apple-touch-icon.png" alt="" width="34" height="34" />
      <div className="install-body">
        <b>앱처럼 쓰기</b>
        <span>홈 화면에 추가하면 주소창 없이 전체화면으로 열립니다</span>
      </div>
      {deferred
        ? <button className="install-btn" onClick={install}>설치</button>
        : <button className="install-btn" onClick={() => setGuide(true)}>설치 방법</button>}
      <button className="install-x" onClick={close} aria-label="닫기">✕</button>
      {guide && <InstallGuide onClose={() => setGuide(false)} />}
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
function FormChart({ players, season, picks, wide = false }) {
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

  // PC는 폭이 넓어 320:120 비율을 그대로 쓰면 높이가 과하게 커진다 → 납작한 좌표계 사용
  const W = wide ? 1000 : 320
  const H = wide ? 150 : 120
  const padL = Math.round(W * 0.094), padR = Math.round(W * 0.175)
  const padT = 8, padB = 8
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
  const GAP = wide ? 14 : 9 // 라벨 폰트가 커지면 최소 간격도 넓혀야 겹치지 않는다
  labels.forEach((l, i) => {
    l.yLab = i === 0 ? l.yReal : Math.max(l.yReal, labels[i - 1].yLab + GAP)
  })

  return (
    <div className={`rank-chart ${wide ? 'wide' : ''}`}>
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
              <polyline points={pts} fill="none" stroke={color}
                strokeWidth={(lee ? 2.4 : 1.4) * (wide ? 1.5 : 1)}
                strokeLinejoin="round" strokeLinecap="round" opacity={lee ? 1 : 0.85} />
              <circle cx={x(N - 1)} cy={y(last)} r={(lee ? 3 : 2.2) * (wide ? 1.5 : 1)} fill={color} />
            </g>
          )
        })}
        {labels.map((l, i) => (
          <text key={i} x={x(N - 1) + (wide ? 14 : 5)} y={l.yLab + 3} className="ch-name" fill={l.color}>{l.name}</text>
        ))}
      </svg>
    </div>
  )
}

function Leaderboard({ players, season, className = '', wide = false }) {
  const cols = STAT_KEYS.filter((s) => !['rank'].includes(s.key))
  return (
    <section className={`card-section ${className}`}>
      <h2 className="sec-title">현재 타율 랭킹</h2>
      <p className="sec-desc">최근 {FORM_GAMES}경기 누적 타율 추이 · 상위 6명</p>
      <FormChart players={players} season={season} wide={wide} />
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
// (N위) 배지를 붙일 스탯 — 'rank'(타율 순위)는 그 자체가 순위라 제외하고 나머지 전부
const RANKED_STATS = STAT_KEYS.map((s) => s.key).filter((k) => k !== 'rank')

function Compare({ players }) {
  const lee = players.find(isLee)
  const top5 = players.filter((p) => p !== lee).slice(0, 5)
  const [oppId, setOppId] = useState(top5[0]?.id)

  // 스탯별 MLB 순위(전체 규정타자 기준, 내림차순) — 선수ID → 순위
  const ranks = useMemo(() => {
    const map = {}
    for (const key of RANKED_STATS) {
      // 삼진(SO)만 적을수록 좋으므로 오름차순, 나머지는 내림차순
      const asc = !HIGHER_IS_BETTER.includes(key)
      const sorted = [...players].sort((x, y) => {
        const vx = x[key], vy = y[key]
        if (vx == null) return 1
        if (vy == null) return -1
        return asc ? vx - vy : vy - vx
      })
      const m = {}
      // 동률은 같은 순위로 (공동 3위 다음은 5위)
      sorted.forEach((p, i) => {
        const prev = sorted[i - 1]
        m[p.id] = prev && prev[key] === p[key] ? m[prev.id] : i + 1
      })
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
  // 이정후 외 규정타자가 아직 없으면 비교 대상이 없다(시즌 초 등)
  if (!opponent) {
    return <section className="card-section"><p className="empty">비교할 상대 선수가 아직 없습니다.</p></section>
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

// 이정후 시즌 전체 타율 추이 + 상대 팀별 성적 (gameLog 기반)
function LeeSeason({ players, season }) {
  const lee = players.find(isLee)
  const id = lee?.id || 808982
  const [d, setD] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let alive = true
    setStatus('loading')
    fetch(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=gameLog&season=${season}&group=hitting&gameType=R`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return
        const splits = (data.stats?.[0]?.splits ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : 1))
        const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
        let h = 0, ab = 0
        const trend = splits.map((s) => {
          h += num(s.stat?.hits); ab += num(s.stat?.atBats)
          return ab ? h / ab : 0
        })
        const om = {}
        for (const s of splits) {
          const name = s.opponent?.name || '?'
          const o = om[name] || (om[name] = { ab: 0, h: 0, hr: 0, rbi: 0 })
          o.ab += num(s.stat?.atBats); o.h += num(s.stat?.hits)
          o.hr += num(s.stat?.homeRuns); o.rbi += num(s.stat?.rbi)
        }
        const byOpp = Object.entries(om).map(([opp, o]) => ({ opp, ...o, avg: o.ab ? o.h / o.ab : 0 }))
          .filter((x) => x.ab >= 3).sort((a, b) => b.avg - a.avg)
        setD({ trend, byOpp, seasonAvg: ab ? h / ab : 0 })
        // 경기 기록이 없으면(시즌 개막 전 등) 차트 축 계산이 NaN이 되므로 빈 상태로
        setStatus(trend.length ? 'ok' : 'empty')
      })
      .catch(() => alive && setStatus('error'))
    return () => { alive = false }
  }, [id, season])

  if (status !== 'ok' || !d) {
    const msg = status === 'error' ? '데이터를 불러오지 못했습니다.'
      : status === 'empty' ? '아직 경기 기록이 없습니다.'
      : '이정후 시즌 데이터 불러오는 중…'
    return <section className="card-section lee-sub"><p className="empty">{msg}</p></section>
  }

  const W = 320, H = 120, padL = 30, padR = 12, padT = 8, padB = 8
  const n = d.trend.length
  let mn = Math.min(...d.trend), mx = Math.max(...d.trend)
  if (mx === mn) { mx += 0.005; mn -= 0.005 }
  const pad = (mx - mn) * 0.12; mn -= pad; mx += pad
  const x = (i) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR))
  const y = (v) => padT + (1 - (v - mn) / (mx - mn)) * (H - padT - padB)
  const fmtA = (v) => v.toFixed(3).replace(/^0/, '')
  const pts = d.trend.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const ticks = [mn + (mx - mn) * 0.1, (mn + mx) / 2, mx - (mx - mn) * 0.1]

  return (
    <>
    <section className="card-section lee-sub">
      <h2 className="sec-title">📈 이정후 시즌 타율 추이</h2>
      <p className="sec-desc">{season} 시즌 경기별 누적 타율 · 현재 {fmtA(d.seasonAvg)}</p>
      <div className="rank-chart">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
          {ticks.map((tv, i) => (
            <g key={i}>
              <line x1={padL} y1={y(tv)} x2={W - padR} y2={y(tv)} stroke="var(--border)" strokeWidth="0.5" />
              <text x={padL - 4} y={y(tv) + 3} textAnchor="end" className="ch-axis">{fmtA(tv)}</text>
            </g>
          ))}
          <polyline points={pts} fill="none" stroke="var(--lee)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {n > 0 && <circle cx={x(n - 1)} cy={y(d.trend[n - 1])} r="3" fill="var(--lee)" />}
        </svg>
      </div>
    </section>

    <section className="card-section lee-sub">
      <h2 className="sec-title">⚔️ 상대 팀별 성적</h2>
      <p className="sec-desc">타율 높은 순 · 타수 3 이상</p>
      <div className="table-wrap">
        <table className="opp-table">
          <thead><tr><th>상대</th><th>타수</th><th>안타</th><th>홈런</th><th>타점</th><th>타율</th></tr></thead>
          <tbody>
            {d.byOpp.map((o) => (
              <tr key={o.opp}>
                <td className="opp-name">{abbr(o.opp)}</td>
                <td>{o.ab}</td><td>{o.h}</td><td>{o.hr}</td><td>{o.rbi}</td>
                <td className="opp-avg">{fmtA(o.avg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
    </>
  )
}

/* ---------- WAR 순위 탭 ---------- */
// MLB Stats API sabermetrics(FanGraphs 계열). WAR = 타격 + 주루 + 수비 + 포지션조정 + 리그조정 + 대체수준
//  - hitting: war, batting, baseRunning, fielding, positional, replacement, wRcPlus, woba, spd
//  - pitching: war, fip, xfip, eraMinus, rar
const WAR_TOP = 100

// 표에 쓸 수 있는 열 정의. asc=true 는 값이 낮을수록 상위(FIP·ERA-).
const COL = {
  war: { key: 'war', label: 'WAR', fmt: (v) => n1(v) },
  warBat: { key: 'warBat', label: '타자', fmt: (v) => n1(v) },
  warPit: { key: 'warPit', label: '투수', fmt: (v) => n1(v) },
  batting: { key: 'batting', label: '타격', fmt: (v) => signed(v) },
  baseRunning: { key: 'baseRunning', label: '주루', fmt: (v) => signed(v) },
  fielding: { key: 'fielding', label: '수비', fmt: (v) => signed(v) },
  wRcPlus: { key: 'wRcPlus', label: 'wRC+', fmt: (v) => n0(v) },
  spd: { key: 'spd', label: '스피드', fmt: (v) => n1(v) },
  positional: { key: 'positional', label: '포지션조정', fmt: (v) => signed(v) },
  rar: { key: 'rar', label: 'RAR', fmt: (v) => n1(v) },
  fip: { key: 'fip', label: 'FIP', fmt: (v) => n2(v), asc: true },
  eraMinus: { key: 'eraMinus', label: 'ERA-', fmt: (v) => n0(v), asc: true },
}

// 종합만 전 구성요소를 보여주고, 나머지는 해당 부문 지표만 보여준다.
// (타격 탭에 주루·수비가 섞여 나오면 무엇을 보는 표인지 흐려진다)
const WAR_CATS = [
  // 종합은 타자 WAR + 투수 WAR 합산. 투수도 포함되고, 이도류는 양쪽이 더해진다.
  { id: 'total', label: '종합', group: 'combined', sort: 'war',
    cols: ['war', 'warBat', 'warPit', 'batting', 'fielding'] },
  // 정렬 기준 지표를 맨 앞에 둔다. WAR 이 앞에 오면 그 값이 오르내려
  // 정렬이 안 된 것처럼 보인다(모바일은 가로 스크롤이라 첫 열만 보이기도 한다).
  { id: 'batting', label: '타격', group: 'hitting', sort: 'batting',
    cols: ['batting', 'wRcPlus', 'war'] },
  { id: 'baseRunning', label: '주루', group: 'hitting', sort: 'baseRunning',
    cols: ['baseRunning', 'spd', 'war'] },
  { id: 'fielding', label: '수비', group: 'hitting', sort: 'fielding',
    cols: ['fielding', 'positional', 'war'] },
  { id: 'pitching', label: '투구', group: 'pitching', sort: 'war',
    cols: ['war', 'rar', 'fip', 'eraMinus'] },
]

const n1 = (v) => (v == null || Number.isNaN(+v) ? '—' : (+v).toFixed(1))
const n2 = (v) => (v == null || Number.isNaN(+v) ? '—' : (+v).toFixed(2))
const n0 = (v) => (v == null || Number.isNaN(+v) ? '—' : String(Math.round(+v)))
// 런(run) 지표는 0 기준 ± 이므로 부호를 붙여야 읽힌다
const signed = (v) => (v == null || Number.isNaN(+v) ? '—' : `${+v > 0 ? '+' : ''}${(+v).toFixed(1)}`)

// 값 배열로 선수ID → 공동순위 맵 만들기
function rankMap(splits, key, asc = false) {
  const valid = splits.filter((s) => s.stat?.[key] != null)
  const sorted = [...valid].sort((a, b) => (asc ? a.stat[key] - b.stat[key] : b.stat[key] - a.stat[key]))
  const m = {}
  sorted.forEach((s, i) => {
    const prev = sorted[i - 1]
    m[s.player.id] = prev && prev.stat[key] === s.stat[key] ? m[prev.player.id] : i + 1
  })
  return m
}

function WarBoard({ season }) {
  const [cat, setCat] = useState('total')
  const [pools, setPools] = useState(null) // { hitting: splits[], pitching: splits[] }
  const [status, setStatus] = useState('loading')

  const active = WAR_CATS.find((c) => c.id === cat)
  const cols = useMemo(() => active.cols.map((k) => COL[k]), [active])

  // 타자·투수 풀을 한 번에 받아 둔다. 종합은 두 풀을 합산해야 하므로 어차피 둘 다 필요하다.
  useEffect(() => {
    let alive = true
    setStatus('loading')
    const url = (g) =>
      `https://statsapi.mlb.com/api/v1/stats?stats=sabermetrics&group=${g}`
      + `&season=${season}&sportId=1&limit=1500&playerPool=All`
    Promise.all([
      fetch(url('hitting')).then((r) => r.json()),
      fetch(url('pitching')).then((r) => r.json()),
    ])
      .then(([h, p]) => {
        if (!alive) return
        const hitting = h.stats?.[0]?.splits ?? []
        const pitching = p.stats?.[0]?.splits ?? []
        // 한쪽만 비어도 종합 합산이 성립하지 않으므로 오류로 처리한다
        if (!hitting.length || !pitching.length) { setStatus('error'); return }
        setPools({ hitting, pitching })
        setStatus('ok')
      })
      .catch(() => { if (alive) setStatus('error') })
    return () => { alive = false }
  }, [season])

  // 종합: 선수 단위로 타자 WAR + 투수 WAR 를 더한다(이도류는 둘 다 합산된다).
  // 투수도 종합 순위에 포함되어야 하므로 두 풀의 합집합을 만든다.
  const combined = useMemo(() => {
    if (!pools) return []
    const by = new Map()
    const take = (s) => {
      let e = by.get(s.player.id)
      if (!e) {
        e = { player: s.player, team: s.team, position: s.position, stat: {} }
        by.set(s.player.id, e)
      }
      return e
    }
    for (const s of pools.hitting) {
      const e = take(s)
      Object.assign(e.stat, s.stat)          // 타격·주루·수비·wRC+ 등
      e.stat.warBat = s.stat.war
    }
    for (const s of pools.pitching) {
      const e = take(s)
      e.stat.warPit = s.stat.war
      // rar 은 타자 쪽에도 있는 키라 그대로 대입하면 덮어쓴다. 투수 값은 접두사로 분리해 보관한다.
      e.stat.pitFip = s.stat.fip
      e.stat.pitEraMinus = s.stat.eraMinus
      e.stat.pitRar = s.stat.rar
      if (!e.position) e.position = s.position
    }
    for (const e of by.values()) e.stat.war = (e.stat.warBat || 0) + (e.stat.warPit || 0)
    return [...by.values()]
  }, [pools])

  const poolFor = (g) => (g === 'combined' ? combined : pools?.[g] ?? [])

  const { rows, leeRow, ranks, total } = useMemo(() => {
    const pool = poolFor(active.group)
    // 열마다 순위 맵을 미리 계산 (규정 충족 여부와 무관하게 전체 풀 기준)
    const rk = {}
    for (const c of cols) rk[c.key] = rankMap(pool, c.key, c.asc)
    if (!rk[active.sort]) rk[active.sort] = rankMap(pool, active.sort, active.asc)

    const key = active.sort
    const sorted = [...pool]
      .filter((s) => s.stat?.[key] != null)
      .sort((a, b) => (active.asc ? a.stat[key] - b.stat[key] : b.stat[key] - a.stat[key]))

    const listed = sorted.map((s) => ({
      rank: rk[key][s.player.id],
      id: s.player.id,
      name: s.player.fullName,
      team: s.team?.name,
      pos: s.position?.abbreviation,
      st: s.stat,
    }))
    const lee = listed.find((r) => isLee({ name: r.name }))
    return {
      rows: listed.slice(0, WAR_TOP),
      leeRow: lee && lee.rank > WAR_TOP ? lee : null,
      ranks: rk,
      total: listed.length,
    }
  }, [pools, combined, active, cols])

  const isPit = active.group === 'pitching'
  const desc = {
    total: '타자 WAR + 투수 WAR 합산 (투수 포함, 이도류는 양쪽 합산)',
    batting: '타격으로 만든 득점 기여(런)',
    baseRunning: '주루로 만든 득점 기여(런)',
    fielding: '수비로 막은 실점 기여(런)',
    pitching: '투수 WAR',
  }[cat]

  return (
    <section className="card-section">
      <h2 className="sec-title">🏆 WAR 순위 TOP {WAR_TOP}</h2>
      <p className="sec-desc">
        {season} 시즌 · {desc}{status === 'ok' ? ` 기준 · 전체 ${total}명 중` : ''}
      </p>

      <div className="war-cats">
        {WAR_CATS.map((c) => (
          <button key={c.id} className={`chip ${c.id === cat ? 'active' : ''}`} onClick={() => setCat(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {status !== 'ok' ? (
        <p className="empty">
          {status === 'loading' ? 'WAR 데이터 불러오는 중…' : 'WAR 데이터를 불러오지 못했습니다.'}
        </p>
      ) : (
      <>
      <div className="table-wrap">
        <table className="war-table">
          <thead>
            <tr>
              <th className="sticky">#</th>
              <th className="sticky2">선수</th>
              <th>팀</th>
              {!isPit && <th>POS</th>}
              {cols.map((c) => (
                <th key={c.key} className={c.key === active.sort ? 'war-sorted' : ''}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <WarRow key={r.id} r={r} cols={cols} ranks={ranks} isPit={isPit} sortKey={active.sort} />
            ))}
            {leeRow && (
              <>
                <tr className="war-gap"><td colSpan={cols.length + (isPit ? 3 : 4)}>⋯</td></tr>
                <WarRow r={leeRow} cols={cols} ranks={ranks} isPit={isPit} sortKey={active.sort} />
              </>
            )}
          </tbody>
        </table>
      </div>
      <p className="war-note">
        출처: MLB Stats API 세이버메트릭스 — 투수 WAR 를 FIP 기반으로 계산하는 <b>fWAR 계열</b>입니다.
        실점 기반인 bWAR(Baseball-Reference)와는 값이 다를 수 있습니다(특히 투수·수비형 선수).
        <br />
        괄호 안은 해당 지표 단독 순위 · 규정 충족 여부와 무관하게 전체 {total}명 기준 ·
        FIP·ERA-는 낮을수록 상위 · 출장이 적은 선수도 포함되므로 비율 지표는 표본이 작은 순위가 섞일 수 있습니다
      </p>
      </>
      )}
    </section>
  )
}

function WarRow({ r, cols, ranks, isPit, sortKey }) {
  const lee = isLee({ name: r.name })
  return (
    <tr className={lee ? 'is-lee' : ''}>
      <td className="sticky">{r.rank}</td>
      <td className="sticky2"><strong>{r.name}</strong></td>
      <td>{abbr(r.team)}</td>
      {!isPit && <td>{r.pos || '—'}</td>}
      {cols.map((c) => {
        const rank = ranks[c.key]?.[r.id]
        return (
          <td key={c.key} className={c.key === sortKey ? 'war-sorted' : ''}>
            {c.fmt(r.st[c.key])}
            {rank ? <small className={`stat-rk ${rank <= 10 ? 'top' : ''}`}>({rank})</small> : null}
          </td>
        )
      })}
    </tr>
  )
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
  // 모든 스탯에 순위 표시. 10위 이내는 강조해 눈에 띄게 한다.
  const badge = (rank) =>
    rank ? <small className={`stat-rk ${rank <= 10 ? 'top' : ''}`}>({rank}위)</small> : null
  return (
    <div className="stat-row">
      <span className={`val ${compare === 'left' ? 'win' : ''}`}>{fmt(s.key, a)}{badge(aRank)}</span>
      <span className="stat-label">{s.label}</span>
      <span className={`val ${compare === 'right' ? 'win' : ''}`}>{fmt(s.key, b)}{badge(bRank)}</span>
    </div>
  )
}
