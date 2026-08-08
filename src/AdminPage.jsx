import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, writeBatch } from 'firebase/firestore'
import { auth, db } from './firebase.js'

// 아이디 'totoriverce' → 내부 이메일로 매핑 (Firebase Auth는 이메일 기반)
const ADMIN_DOMAIN = 'baseball-93c5d.firebaseapp.com'

const ADMIN_TABS = [
  { id: 'stats', label: '📊 방문자 통계' },
  { id: 'cheers', label: '📣 응원 관리' },
]

export default function AdminPage() {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState('stats')

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setReady(true) }), [])

  if (!ready) return <div className="admin-wrap"><p className="admin-msg">로딩…</p></div>
  if (!user) return <Login />

  return (
    <div className="admin-wrap">
      <div className="admin-head">
        <h1 className="admin-h1">🔧 관리자</h1>
        <button className="admin-logout" onClick={() => signOut(auth)}>로그아웃</button>
      </div>
      <p className="admin-sub">{user.email}</p>

      {tab === 'stats' && <Stats />}
      {tab === 'cheers' && <CheerAdmin />}

      <nav className="admin-nav">
        {ADMIN_TABS.map((t) => (
          <button key={t.id} className={`admin-navbtn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
        <button className="admin-navbtn" onClick={() => { window.location.hash = '' }}>← 사이트</button>
      </nav>
    </div>
  )
}

function Login() {
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    const email = id.includes('@') ? id.trim() : `${id.trim()}@${ADMIN_DOMAIN}`
    try {
      await signInWithEmailAndPassword(auth, email, pw)
    } catch (e2) {
      setErr(e2.code === 'auth/operation-not-allowed'
        ? '인증이 아직 활성화되지 않았습니다(콘솔에서 Email/Password 켜기)'
        : '아이디 또는 비밀번호가 올바르지 않습니다')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-wrap">
      <form className="admin-login" onSubmit={submit}>
        <div className="admin-emoji">🔒</div>
        <h1 className="admin-h1">관리자 로그인</h1>
        <input className="admin-input" type="email" placeholder="이메일 (totoriverce@gmail.com)" value={id}
          autoCapitalize="off" autoCorrect="off" onChange={(e) => setId(e.target.value)} />
        <input className="admin-input" type="password" placeholder="비밀번호" value={pw}
          onChange={(e) => setPw(e.target.value)} />
        <button className="admin-btn" disabled={busy}>{busy ? '…' : '로그인'}</button>
        {err && <p className="admin-err">{err}</p>}
      </form>
    </div>
  )
}

const tally = (arr) => {
  const m = {}
  for (const x of arr) m[x] = (m[x] || 0) + 1
  return Object.entries(m).sort((a, b) => b[1] - a[1])
}
const refHost = (ref) => {
  if (!ref) return '직접 방문/앱'
  try { return new URL(ref).hostname } catch { return ref }
}
const tsDate = (ts) => (ts?.toDate ? ts.toDate() : null)
// 정렬용 ISO 날짜키(YYYY-MM-DD, 한국시간) — 문자열 정렬해도 날짜순 유지
const dayKey = (ts) => {
  const d = tsDate(ts)
  return d ? d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) : '?'
}

// ipinfo 는 국가코드(KR), geojs 는 국가명(South Korea)을 준다 → 국가명으로 통일
function countryName(v) {
  if (!v) return null
  if (v.length !== 2) return v
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(v) || v } catch { return v }
}

function Stats() {
  const [visits, setVisits] = useState(null)
  const [err, setErr] = useState('')
  const [fix, setFix] = useState(null) // 지역 재조회 진행 상태

  const load = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'visits'), orderBy('ts', 'desc'), limit(2000)))
      setVisits(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    } catch (e) {
      setErr(e.code === 'permission-denied' ? '이 계정은 통계 조회 권한이 없습니다' : e.message)
    }
  }

  useEffect(() => { load() }, [])

  // 기존 기록의 지역을 ipinfo 로 다시 조회해 교정 (geojs 시절 오답 보정)
  const refixGeo = async () => {
    if (!visits) return
    const ips = [...new Set(visits.map((v) => v.ip).filter((ip) => ip && ip !== 'unknown'))]
    if (!window.confirm(`고유 IP ${ips.length}개의 지역을 다시 조회해 교정합니다.\n방문 시각·유입경로는 변경되지 않습니다. 진행할까요?`)) return

    setFix({ done: 0, total: ips.length, updated: 0 })
    const geoByIp = new Map()
    for (let i = 0; i < ips.length; i++) {
      try {
        const r = await fetch(`https://ipinfo.io/${ips[i]}/json`)
        if (r.ok) {
          const g = await r.json()
          if (!g.error && !g.bogon) {
            geoByIp.set(ips[i], { city: g.city || null, region: g.region || null, country: countryName(g.country) })
          }
        }
      } catch { /* 개별 실패는 건너뛴다 */ }
      setFix((s) => ({ ...s, done: i + 1 }))
      await new Promise((r) => setTimeout(r, 120)) // 무토큰 한도 보호
    }

    // 실제로 값이 달라진 문서만 수정
    const targets = visits.filter((v) => {
      const g = geoByIp.get(v.ip)
      return g && (v.city !== g.city || v.region !== g.region || v.country !== g.country)
    })
    try {
      for (let i = 0; i < targets.length; i += 400) {
        const batch = writeBatch(db)
        for (const v of targets.slice(i, i + 400)) batch.update(doc(db, 'visits', v.id), geoByIp.get(v.ip))
        await batch.commit()
      }
      setFix({ done: ips.length, total: ips.length, updated: targets.length, finished: true })
      await load()
    } catch (e) {
      setFix({ finished: true, error: e.code === 'permission-denied' ? '규칙에 수정 권한이 없습니다(firestore.rules 배포 필요)' : e.message })
    }
  }

  const agg = useMemo(() => {
    if (!visits) return null
    return {
      total: visits.length,
      uniqIp: new Set(visits.map((v) => v.ip).filter(Boolean)).size,
      byCountry: tally(visits.map((v) => v.country || '미상')).slice(0, 8),
      byRegion: tally(visits.map((v) => [...new Set([v.city, v.region].filter(Boolean))].join(', ') || '미상')).slice(0, 8),
      byRef: tally(
        visits.map((v) => refHost(v.ref))
          .filter((h) => h !== 'localhost' && h !== '127.0.0.1'),
      ).slice(0, 8),
      byDay: tally(visits.map((v) => dayKey(v.ts))).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 10),
      recent: visits.slice(0, 60),
    }
  }, [visits])

  return (
    <div className="admin-dash">
      {err && <p className="admin-err">{err}</p>}
      {!err && !agg && <p className="admin-msg">불러오는 중…</p>}

      {agg && (
        <>
          <div className="admin-cards">
            <div className="admin-card"><span className="ac-num">{agg.total.toLocaleString()}</span><span className="ac-lbl">총 방문</span></div>
            <div className="admin-card"><span className="ac-num">{agg.uniqIp.toLocaleString()}</span><span className="ac-lbl">고유 IP</span></div>
          </div>

          <div className="admin-blocks">
            <Block title="유입 경로" rows={agg.byRef} label="경로" />
            <Block title="국가" rows={agg.byCountry} label="국가" />
            <Block title="지역" rows={agg.byRegion} label="지역" />
            <Block title="일자별 방문" rows={agg.byDay} label="날짜" />
          </div>

          <div className="geo-fix">
            <button className="geo-fix-btn" onClick={refixGeo} disabled={!!fix && !fix.finished}>
              {fix && !fix.finished ? `조회 중… ${fix.done}/${fix.total}` : '📍 지역 재조회'}
            </button>
            <span className="geo-fix-msg">
              {fix?.error ? `❌ ${fix.error}`
                : fix?.finished ? `✅ ${fix.updated}건 교정 완료`
                : '예전 기록의 지역을 ipinfo 로 다시 조회해 바로잡습니다'}
            </span>
          </div>

          <h2 className="admin-sec">최근 방문 {agg.recent.length}건</h2>
          <div className="admin-table-wrap">
            <table className="admin-table recent">
              <thead><tr><th>시각</th><th>IP</th><th>지역</th><th>유입</th></tr></thead>
              <tbody>
                {agg.recent.map((v, i) => {
                  const d = tsDate(v.ts)
                  return (
                    <tr key={i}>
                      <td>{d ? d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                      <td>{v.ip || '-'}</td>
                      <td>{[v.city, v.country].filter(Boolean).join(' / ') || '-'}</td>
                      <td>{refHost(v.ref)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// 응원 관리 — 글 목록 + 삭제
function CheerAdmin() {
  const [cheers, setCheers] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    const q = query(collection(db, 'cheers'), orderBy('createdAt', 'desc'), limit(300))
    const unsub = onSnapshot(
      q,
      (snap) => setCheers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => setErr(e.message),
    )
    return () => unsub()
  }, [])

  const remove = async (id) => {
    if (!window.confirm('이 응원 글을 삭제할까요?')) return
    setBusy(id)
    try { await deleteDoc(doc(db, 'cheers', id)) }
    catch (e) { setErr('삭제 실패: ' + e.message) }
    finally { setBusy(null) }
  }

  if (err) return <p className="admin-err">{err}</p>
  if (!cheers) return <p className="admin-msg">불러오는 중…</p>

  return (
    <div className="admin-dash">
      <p className="admin-sub">총 {cheers.length}개 · 부적절한 글을 삭제할 수 있습니다</p>
      <ul className="adm-cheer-list">
        {cheers.length === 0 && <li className="admin-msg">응원 글이 없습니다</li>}
        {cheers.map((c) => (
          <li key={c.id} className="adm-cheer">
            <div className="adm-cheer-main">
              <p className="adm-cheer-text">{c.text}</p>
              <span className="adm-cheer-meta">
                {tsDate(c.createdAt)?.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) || '방금'}
                {' · ♥ '}{c.likes || 0}
              </span>
            </div>
            <button className="adm-del" disabled={busy === c.id} onClick={() => remove(c.id)}>
              {busy === c.id ? '…' : '삭제'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

const DONUT_COLORS = ['#4aa8ff', '#34d399', '#f472b6', '#a78bfa', '#fb923c', '#22d3ee', '#facc15', '#94a3b8']

function Donut({ rows }) {
  const total = rows.reduce((a, [, n]) => a + n, 0) || 1
  const R = 16, CIRC = 2 * Math.PI * R
  let acc = 0
  return (
    <svg className="donut" viewBox="0 0 44 44" width="112" height="112" role="img">
      <circle cx="22" cy="22" r={R} fill="none" stroke="var(--border)" strokeWidth="8" />
      <g transform="rotate(-90 22 22)">
        {rows.map(([k, n], i) => {
          const dash = (n / total) * CIRC
          const seg = (
            <circle key={k} cx="22" cy="22" r={R} fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]} strokeWidth="8"
              strokeDasharray={`${dash} ${CIRC - dash}`} strokeDashoffset={-acc} />
          )
          acc += dash
          return seg
        })}
      </g>
      <text x="22" y="22" textAnchor="middle" dominantBaseline="central" className="donut-c">{total}</text>
    </svg>
  )
}

function Block({ title, rows, label = '항목' }) {
  const total = rows.reduce((a, [, n]) => a + n, 0)
  return (
    <section className="admin-block">
      <h2 className="admin-sec">{title}</h2>
      {rows.length === 0 ? (
        <p className="admin-msg">데이터 없음</p>
      ) : (
        <div className="block-body">
          <Donut rows={rows} />
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>{label}</th><th className="ta-r">건수</th><th className="ta-r">비율</th></tr></thead>
              <tbody>
                {rows.map(([k, n], i) => (
                  <tr key={k}>
                    <td><span className="dot" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />{k}</td>
                    <td className="ta-r">{n}</td>
                    <td className="ta-r ta-muted">{total ? Math.round((n / total) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
