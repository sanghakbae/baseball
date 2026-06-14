import { useEffect, useState } from 'react'
import { doc, getDoc, increment, setDoc } from 'firebase/firestore'
import { db } from './firebase.js'

const VOTE_KEY = 'baseball-voted'

// 타율왕 예측 투표 — meta/votes 문서에 선수별 집계(클라이언트 증가). 세션/브라우저당 1표.
export function useVote() {
  const [counts, setCounts] = useState(null)
  const [voted, setVoted] = useState(() => {
    try { return localStorage.getItem(VOTE_KEY) } catch { return null }
  })

  useEffect(() => {
    let alive = true
    getDoc(doc(db, 'meta', 'votes'))
      .then((s) => { if (alive) setCounts(s.data()?.counts || {}) })
      .catch(() => { if (alive) setCounts({}) })
    return () => { alive = false }
  }, [])

  const vote = async (id) => {
    if (voted) return
    const key = String(id)
    setVoted(key)
    setCounts((c) => ({ ...(c || {}), [key]: (c?.[key] || 0) + 1 })) // 낙관적 반영
    try { localStorage.setItem(VOTE_KEY, key) } catch {}
    try {
      await setDoc(
        doc(db, 'meta', 'votes'),
        { counts: { [key]: increment(1) }, total: increment(1) },
        { merge: true },
      )
    } catch (e) {
      console.warn('투표 실패:', e.message)
    }
  }

  return { counts, voted, vote }
}
