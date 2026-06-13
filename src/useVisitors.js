import { useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc, increment } from 'firebase/firestore'
import { db } from './firebase.js'

const SESSION_KEY = 'baseball-visited'

// Firestore meta/visitors 문서에 방문자 수를 누적·구독한다.
// 세션당 1회만 증가(새로고침으로 중복 카운트 방지).
export function useVisitors() {
  const [count, setCount] = useState(null)

  useEffect(() => {
    let unsub
    try {
      const ref = doc(db, 'meta', 'visitors')
      if (!sessionStorage.getItem(SESSION_KEY)) {
        sessionStorage.setItem(SESSION_KEY, '1')
        setDoc(
          ref,
          { count: increment(1), updatedAt: new Date().toISOString() },
          { merge: true },
        ).catch((e) => console.warn('방문자 카운트 증가 실패:', e.message))
      }
      unsub = onSnapshot(
        ref,
        (snap) => {
          const v = snap.data()?.count
          if (typeof v === 'number') setCount(v)
        },
        (e) => console.warn('방문자 구독 실패:', e.message),
      )
    } catch (e) {
      console.warn('방문자 카운트 비활성:', e.message)
    }
    return () => unsub && unsub()
  }, [])

  return count
}
