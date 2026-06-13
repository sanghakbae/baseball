import { useEffect, useState } from 'react'
import {
  addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'

// 익명 응원 게시판 — Firestore cheers 컬렉션 (실시간 구독 + 작성)
export function useCheers() {
  const [cheers, setCheers] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let unsub
    try {
      const q = query(collection(db, 'cheers'), orderBy('createdAt', 'desc'), limit(100))
      unsub = onSnapshot(
        q,
        (snap) => setCheers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (e) => { console.warn('응원 구독 실패:', e.message); setError(e.message) },
      )
    } catch (e) {
      setError(e.message)
    }
    return () => unsub && unsub()
  }, [])

  const post = async (text) => {
    const t = (text || '').trim()
    if (!t) return
    await addDoc(collection(db, 'cheers'), {
      text: t.slice(0, 200),
      createdAt: serverTimestamp(),
    })
  }

  return { cheers, post, error }
}
