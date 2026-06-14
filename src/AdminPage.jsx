import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { auth, db } from './firebase.js'

// 아이디 'totoriverce' → 내부 이메일로 매핑 (Firebase Auth는 이메일 기반)
const ADMIN_DOMAIN = 'baseball-93c5d.firebaseapp.com'

export default function AdminPage() {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setReady(true) }), [])

  if (!ready) return <div className="admin-wrap"><p className="admin-msg">로딩…</p></div>
  if (!user) return <Login />
  return <Stats onLogout={() => signOut(auth)} email={user.email} />
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
const dayKey = (ts) => {
  const d = tsDate(ts)
  return d ? d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : '?'
}

function Stats({ onLogout, email }) {
  const [visits, setVisits] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'visits'), orderBy('ts', 'desc'), limit(2000)))
        setVisits(snap.docs.map((d) => d.data()))
      } catch (e) {
        setErr(e.code === 'permission-denied' ? '이 계정은 통계 조회 권한이 없습니다' : e.message)
      }
    })()
  }, [])

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
    <div className="admin-wrap admin-dash">
      <div className="admin-head">
        <h1 className="admin-h1">📊 방문자 통계</h1>
        <button className="admin-logout" onClick={onLogout}>로그아웃</button>
      </div>
      <p className="admin-sub">{email}</p>

      {err && <p className="admin-err">{err} <button className="admin-link" onClick={onLogout}>로그아웃</button></p>}
      {!err && !agg && <p className="admin-msg">불러오는 중…</p>}

      {agg && (
        <>
          <div className="admin-cards">
            <div className="admin-card"><span className="ac-num">{agg.total.toLocaleString()}</span><span className="ac-lbl">총 방문</span></div>
            <div className="admin-card"><span className="ac-num">{agg.uniqIp.toLocaleString()}</span><span className="ac-lbl">고유 IP</span></div>
          </div>

          <Block title="유입 경로" rows={agg.byRef} />
          <Block title="국가" rows={agg.byCountry} />
          <Block title="지역" rows={agg.byRegion} />
          <Block title="일자별 방문" rows={agg.byDay} />

          <h2 className="admin-sec">최근 방문 {agg.recent.length}건</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>시각</th><th>IP</th><th>지역</th><th>경로</th><th>유입</th></tr></thead>
              <tbody>
                {agg.recent.map((v, i) => {
                  const d = tsDate(v.ts)
                  return (
                    <tr key={i}>
                      <td>{d ? d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                      <td>{v.ip || '-'}</td>
                      <td>{[v.city, v.country].filter(Boolean).join(' / ') || '-'}</td>
                      <td>{v.path || '-'}</td>
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

function Block({ title, rows }) {
  const max = Math.max(1, ...rows.map((r) => r[1]))
  return (
    <section className="admin-block">
      <h2 className="admin-sec">{title}</h2>
      {rows.length === 0 && <p className="admin-msg">데이터 없음</p>}
      {rows.map(([k, n]) => (
        <div key={k} className="admin-row">
          <span className="ar-key">{k}</span>
          <span className="ar-bar"><span style={{ width: `${(n / max) * 100}%` }} /></span>
          <span className="ar-num">{n}</span>
        </div>
      ))}
    </section>
  )
}
