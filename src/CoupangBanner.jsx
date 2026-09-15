import { useEffect, useRef, useState } from 'react'

/**
 * 쿠팡 파트너스 다이나믹 배너.
 *
 * 위젯 스크립트(PartnersCoupang.G)는 container 옵션으로 삽입 위치를 지정할 수 있어
 * React 의 ref 에 그대로 붙일 수 있다(기본 동작은 마지막 <script> 앞에 끼워 넣는 방식이라 부적합).
 *
 * WIDGET_ID 는 쿠팡 파트너스 콘솔에서 배너를 만들면 발급되는 번호다.
 * 생성자가 id 를 필수로 요구하므로(instance id is required!) 값이 없으면 아무것도 렌더하지 않는다.
 * 트래킹 코드(AF5168844)는 랜딩 링크의 lptag 로 붙어 수수료가 귀속된다.
 */
const TRACKING_CODE = 'AF5168844'
// 기본값은 운영 배너. VITE_COUPANG_WIDGET_ID=0(또는 빈 값)으로 끌 수 있어야 하므로
// `|| 기본값` 을 쓰면 안 된다(0 도 기본값으로 덮여 배너를 끌 수 없다).
const ENV_ID = import.meta.env.VITE_COUPANG_WIDGET_ID
const WIDGET_ID = ENV_ID == null || ENV_ID === '' ? 5168844 : Number(ENV_ID)
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

// 컨테이너 폭을 위젯이 받는 픽셀값으로 환산(계단식으로 끊어 잦은 재생성을 막는다)
const stepWidth = (px) => Math.max(200, Math.min(680, Math.round(px / 40) * 40 || 320))

export default function CoupangBanner() {
  const box = useRef(null)
  const [state, setState] = useState('loading') // loading | shown | hidden
  const [width, setWidth] = useState(0)

  // 폭이 실제로 달라질 때만 갱신 → 위젯 재생성(=광고 재요청)을 최소화
  useEffect(() => {
    const measure = () => {
      if (!box.current) return
      const w = stepWidth(box.current.clientWidth)
      setWidth((prev) => (prev === w ? prev : w))
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [])

  useEffect(() => {
    if (!WIDGET_ID || !box.current || !width) { if (!WIDGET_ID) setState('hidden'); return }
    let alive = true
    let timer
    loadPartnersScript()
      .then(() => {
        if (!alive || !box.current) return
        box.current.innerHTML = ''
        // 위젯은 초기 크기를 숫자로 받아 iframe 을 만들고, 그 안에서 렌더된 뒤
        // postMessage 로 최종 크기를 알려준다. '100%' 를 주면 렌더가 시작되지 않으므로
        // 픽셀값을 넘긴다.
        new window.PartnersCoupang.G({
          id: WIDGET_ID,
          trackingCode: TRACKING_CODE,
          template: 'carousel',
          width: String(width),
          height: '140',
          container: box.current,
          // 노출할 광고가 없으면 빈 상자만 남으므로 안내문까지 같이 숨긴다
          onLoaded: (hasAd) => { if (alive) setState(hasAd === false ? 'hidden' : 'shown') },
        })

        // 콜백이 오지 않는 경우(차단 확장, iframe 로드 실패 등)에도 빈 상자와 안내문이
        // 남지 않도록 높이로 한 번 더 확인한다. 위젯은 렌더 후 postMessage 로 크기를 채운다.
        timer = setTimeout(() => {
          if (!alive || !box.current) return
          setState(box.current.getBoundingClientRect().height > 20 ? 'shown' : 'hidden')
        }, 6000)
      })
      .catch(() => { if (alive) setState('hidden') }) // 광고 차단·네트워크 실패 시 조용히 숨김
    return () => { alive = false; clearTimeout(timer) }
  }, [width])

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
