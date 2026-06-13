import { useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc, increment } from 'firebase/firestore'
import { db } from './firebase.js'

// 페이지 로드(새로고침)당 1회만 증가. 모듈 플래그로 StrictMode 중복 호출 방지.
let countedThisLoad = false

// Firestore meta/visitors 문서에 방문자 수를 누적·구독한다.
export function useVisitors() {
  const [count, setCount] = useState(null)

  useEffect(() => {
    let unsub
    try {
      const ref = doc(db, 'meta', 'visitors')
      if (!countedThisLoad) {
        countedThisLoad = true
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
