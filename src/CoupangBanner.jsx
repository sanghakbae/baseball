import { useEffect, useRef, useState } from 'react'

/**
 * 쿠팡 파트너스 다이나믹 배너.
 *
 * 위젯 스크립트(PartnersCoupang.G)는 container 옵션으로 삽입 위치를 지정할 수 있어
 * React 의 ref 에 그대로 붙일 수 있다(기본 동작은 마지막 <script> 앞에 끼워 넣는 방식이라 부적합).
 *
 * WIDGET_ID 는 쿠팡 파트너스 콘솔에서 배너를 만들면 발급되는 번호다.
 * 생성자가 id 를 필수로 요구하므로(instance id is required!) 값이 없으면 아무것도 렌더하지 않는다.
 */
const TRACKING_CODE = 'AF5168844'
const WIDGET_ID = Number(import.meta.env.VITE_COUPANG_WIDGET_ID) || 0
const SCRIPT_SRC = 'https://ads-partners.coupang.com/g.js'

let scriptPromise = null
function loadPartnersScript() {
  if (window.PartnersCoupang) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = SCRIPT_SRC
    el.async = true
    el.onload = resolve
    el.onerror = () => reject(new Error('쿠팡 파트너스 스크립트 로드 실패'))
    document.head.appendChild(el)
  }).catch((e) => { scriptPromise = null; throw e })
  return scriptPromise
}

export default function CoupangBanner() {
  const box = useRef(null)
  const [state, setState] = useState('loading') // loading | shown | hidden

  useEffect(() => {
    if (!WIDGET_ID || !box.current) { setState('hidden'); return }
    let alive = true
    loadPartnersScript()
      .then(() => {
        if (!alive || !box.current) return
        box.current.innerHTML = ''
        new window.PartnersCoupang.G({
          id: WIDGET_ID,
          trackingCode: TRACKING_CODE,
          template: 'carousel',
          width: '100%',
          height: '140',
          container: box.current,
          // 노출할 광고가 없으면 빈 상자만 남으므로 안내문까지 같이 숨긴다
          onLoaded: (hasAd) => { if (alive) setState(hasAd === false ? 'hidden' : 'shown') },
        })
      })
      .catch(() => { if (alive) setState('hidden') }) // 광고 차단·네트워크 실패 시 조용히 숨김
    return () => { alive = false }
  }, [])

  if (!WIDGET_ID || state === 'hidden') return null

  return (
    <aside className="cpang">
      <div className="cpang-box" ref={box} />
      {/* 공정위 표시·광고 심사지침상 대가성 문구는 필수 */}
      <p className="cpang-note">
        이 사이트는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
      </p>
    </aside>
  )
}
