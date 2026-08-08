#!/usr/bin/env node
/**
 * visits 컬렉션의 지역 정보 재조회 백필.
 *
 * 기존 기록은 geojs 로 조회돼 한국 도시가 틀린 경우가 있다(예: 서울 종로 IP → '화성시').
 * 저장된 IP 로 ipinfo 에 다시 물어 city/region/country 만 덮어쓴다.
 * 방문 시각·유입경로·IP 등 나머지 필드는 건드리지 않는다.
 *
 * 관리자 권한이 필요하므로 GitHub Actions 에서 FIREBASE_SERVICE_ACCOUNT 로 실행한다.
 *   DRY_RUN=1  변경 없이 무엇이 바뀔지만 출력
 *   LIMIT=n    처리할 문서 수 상한 (기본 5000)
 */

const DRY_RUN = !!process.env.DRY_RUN
const LIMIT = Number(process.env.LIMIT) || 5000
// ipinfo 무토큰 한도(약 1000/일) 보호용 — 고유 IP 기준으로만 호출한다
const IPINFO_TOKEN = process.env.IPINFO_TOKEN || ''

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function countryName(v) {
  if (!v) return null
  if (v.length !== 2) return v
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(v) || v } catch { return v }
}

async function lookupIpinfo(ip) {
  const url = `https://ipinfo.io/${ip}/json${IPINFO_TOKEN ? `?token=${IPINFO_TOKEN}` : ''}`
  const r = await fetch(url)
  if (r.status === 429) throw new Error('RATE_LIMIT')
  if (!r.ok) throw new Error(`ipinfo ${r.status}`)
  const g = await r.json()
  if (g.error || g.bogon) throw new Error('ipinfo 조회 불가')
  return { city: g.city || null, region: g.region || null, country: countryName(g.country) }
}

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT 미설정 — 관리자 권한 없이는 실행 불가')

  const admin = (await import('firebase-admin')).default
  const app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) })
  const db = admin.firestore(app)

  const snap = await db.collection('visits').orderBy('ts', 'desc').limit(LIMIT).get()
  console.log(`📄 대상 문서 ${snap.size}건`)

  // 같은 IP 를 여러 번 조회하지 않도록 고유 IP 로 먼저 묶는다
  const byIp = new Map()
  for (const d of snap.docs) {
    const ip = d.data().ip
    if (!ip || ip === 'unknown') continue
    if (!byIp.has(ip)) byIp.set(ip, [])
    byIp.get(ip).push(d)
  }
  console.log(`🌐 고유 IP ${byIp.size}개 조회 시작`)

  const geoByIp = new Map()
  let failed = 0
  for (const ip of byIp.keys()) {
    try {
      geoByIp.set(ip, await lookupIpinfo(ip))
    } catch (e) {
      failed++
      if (e.message === 'RATE_LIMIT') {
        console.warn('⚠️  ipinfo 한도 초과 — 조회 중단, 여기까지 반영합니다')
        break
      }
      console.warn(`⚠️  ${ip}: ${e.message}`)
    }
    await sleep(120) // 초당 ~8건으로 제한
  }

  // 값이 실제로 달라진 문서만 수정
  const changes = []
  for (const [ip, docs] of byIp) {
    const geo = geoByIp.get(ip)
    if (!geo) continue
    for (const d of docs) {
      const cur = d.data()
      if (cur.city === geo.city && cur.region === geo.region && cur.country === geo.country) continue
      changes.push({ ref: d.ref, ip, from: `${cur.city || '?'} / ${cur.region || '?'}`, to: `${geo.city || '?'} / ${geo.region || '?'}`, geo })
    }
  }

  console.log(`\n✏️  변경 대상 ${changes.length}건 (IP 조회 실패 ${failed}건)`)
  const sample = {}
  for (const c of changes) sample[`${c.from} → ${c.to}`] = (sample[`${c.from} → ${c.to}`] || 0) + 1
  for (const [k, n] of Object.entries(sample).sort((a, b) => b[1] - a[1])) console.log(`   ${k}  ×${n}`)

  if (DRY_RUN) { console.log('\n🧪 DRY_RUN — 저장하지 않았습니다'); return }
  if (!changes.length) { console.log('변경할 내용이 없습니다'); return }

  // Firestore 배치는 500건 제한
  for (let i = 0; i < changes.length; i += 400) {
    const batch = db.batch()
    for (const c of changes.slice(i, i + 400)) {
      batch.update(c.ref, { city: c.geo.city, region: c.geo.region, country: c.geo.country })
    }
    await batch.commit()
    console.log(`   저장 ${Math.min(i + 400, changes.length)}/${changes.length}`)
  }
  console.log('✅ 완료')
}

main().catch((e) => { console.error('❌ 실패:', e.message); process.exit(1) })
