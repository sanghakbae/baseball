/* 타율왕 예측 — 서비스 워커
 *
 * 이 앱은 MLB API 를 실시간으로 조회하므로 "캐시로 인해 옛날 타율이 보이는 것"이
 * 오프라인 지원보다 훨씬 나쁘다. 그래서 캐시 대상을 아래로 엄격히 제한한다.
 *
 *   - 같은 출처(앱 셸)만 캐시. MLB API·Firestore·ipinfo·웹훅 등 외부 요청은 손대지 않는다.
 *   - index.html(내비게이션): 네트워크 우선 → 실패 시 캐시 (새 배포를 즉시 반영하기 위함)
 *   - /assets/*: 캐시 우선 (Vite 가 파일명에 해시를 박으므로 내용이 바뀌면 이름도 바뀐다)
 *   - /data/latest.json: 네트워크 우선 → 실패 시 캐시 (오프라인에선 마지막 데이터라도 보여준다)
 */
const VERSION = '__BUILD__' // 빌드 시 scripts/stamp-sw.mjs 가 자산 해시로 치환
const CACHE = `baseball-${VERSION}`
const OFFLINE_URL = '/index.html'

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, '/manifest.webmanifest'])).catch(() => {}),
  )
  // 여기서 skipWaiting 하지 않는다. 사용자가 조작 중인 화면이 예고 없이 새로고침되기 때문.
  // 대기 상태로 두고, 앱이 '업데이트 있음'을 안내한 뒤 사용자가 수락하면 아래 메시지로 교체한다.
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const putIfOk = async (req, res) => {
  if (res && res.ok && res.type === 'basic') {
    const c = await caches.open(CACHE)
    c.put(req, res.clone()).catch(() => {})
  }
  return res
}

async function networkFirst(req, fallbackUrl) {
  try {
    return await putIfOk(req, await fetch(req))
  } catch {
    const cached = await caches.match(fallbackUrl || req)
    if (cached) return cached
    throw new Error('offline')
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req)
  if (cached) return cached
  return putIfOk(req, await fetch(req))
}

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // 외부 출처(MLB API·Firestore·ipinfo·웹훅)는 절대 가로채지 않는다
  if (url.origin !== self.location.origin) return

  // 내비게이션(주소창 진입·새로고침) — 최신 배포를 놓치지 않도록 네트워크 우선
  if (request.mode === 'navigate') {
    e.respondWith(networkFirst(request, OFFLINE_URL))
    return
  }

  // 매시간 갱신되는 데이터 — 온라인이면 항상 최신, 오프라인이면 마지막 값
  if (url.pathname.startsWith('/data/')) {
    e.respondWith(networkFirst(request))
    return
  }

  // 해시된 정적 자산 + 아이콘
  if (url.pathname.startsWith('/assets/') || /\.(png|svg|webmanifest|woff2?)$/.test(url.pathname)) {
    e.respondWith(cacheFirst(request))
    return
  }
})

// 앱에서 사용자가 업데이트를 수락하면 호출된다
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
