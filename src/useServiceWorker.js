import { useEffect, useRef, useState } from 'react'

/**
 * 서비스워커 등록 + 업데이트 감지.
 *
 * sw.js 는 install 단계에서 skipWaiting 하지 않고 '대기(waiting)' 상태로 머문다.
 * 그래야 사용자가 보던 화면이 예고 없이 새로고침되지 않는다.
 * 여기서 대기 워커를 감지해 알리고, 사용자가 수락하면 교체 후 1회 새로고침한다.
 */
export function useServiceWorker() {
  const [waiting, setWaiting] = useState(null) // 교체 대기 중인 새 워커
  const accepted = useRef(false) // 사용자가 업데이트를 수락했는지 (새로고침 여부 판단)

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

    let reg
    let reloading = false

    // controllerchange 는 두 경우에 발생한다.
    //  (1) 최초 설치 — activate 의 clients.claim() 이 이 페이지를 붙잡을 때
    //  (2) 사용자가 업데이트를 수락해 대기 워커가 교체될 때
    // (1)에서 새로고침하면 첫 방문자가 영문 모를 새로고침을 겪는다. 그렇다고 마운트 시점의
    // controller 유무로 판단하면, 최초 방문 페이지는 그 값이 false 로 굳어 이후 정당한
    // 업데이트까지 막힌다. 그래서 '사용자가 수락했는지'를 직접 신호로 쓴다.
    const onControllerChange = () => {
      if (!accepted.current || reloading) return
      reloading = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    const track = (r) => {
      // 이미 대기 중인 워커가 있으면 즉시 안내
      // (controller 가 없으면 최초 설치라 '업데이트'가 아니다)
      if (r.waiting && navigator.serviceWorker.controller) setWaiting(r.waiting)
      r.addEventListener('updatefound', () => {
        const nw = r.installing
        if (!nw) return
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) setWaiting(nw)
        })
      })
    }

    navigator.serviceWorker.register('/sw.js')
      .then((r) => { reg = r; track(r) })
      .catch(() => {})

    // 앱으로 되돌아올 때 새 배포가 있는지 확인 (장시간 열어두는 사용을 고려)
    const onVisible = () => { if (document.visibilityState === 'visible') reg?.update().catch(() => {}) }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // 수락 → 대기 워커 교체 → controllerchange 에서 새로고침
  const applyUpdate = () => {
    if (!waiting) return
    accepted.current = true
    waiting.postMessage({ type: 'SKIP_WAITING' })
  }

  return { updateReady: !!waiting, applyUpdate }
}
