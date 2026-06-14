import { useEffect, useState } from 'react'
import {
  addDoc, collection, doc, increment, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc,
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

  const like = async (id) => {
    try {
      await updateDoc(doc(db, 'cheers', id), { likes: increment(1) })
    } catch (e) {
      console.warn('좋아요 실패:', e.message)
    }
  }

  return { cheers, post, like, error }
}
