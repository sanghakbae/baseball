#!/usr/bin/env node
/**
 * MLB 타율 데이터 수집 + 시즌 타율 1위 예측 (시간별 아카이브용)
 *
 * 수집·예측 로직은 src/lib 공용 모듈을 사용한다(브라우저 실시간 폴링과 동일 코드).
 * 결과를 Firestore(있으면)와 정적 JSON(public/data/latest.json)에 저장한다.
 * GitHub Actions에서 매시간 실행된다.
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPayload } from '../src/lib/mlb.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const SEASON = Number(process.env.SEASON) || new Date().getUTCFullYear()
const SIMS = Number(process.env.SIMS) || 20000

async function saveToFirestore(payload) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) {
    console.log('ℹ️  FIREBASE_SERVICE_ACCOUNT 미설정 — Firestore 저장 건너뜀')
    return false
  }
  let admin
  try {
    admin = await import('firebase-admin')
  } catch {
    console.log('ℹ️  firebase-admin 미설치 — Firestore 저장 건너뜀')
    return false
  }
  const cred = JSON.parse(raw)
  const app = admin.default.apps.length
    ? admin.default.app()
    : admin.default.initializeApp({ credential: admin.default.credential.cert(cred) })
  const db = admin.default.firestore(app)

  const hourId = payload.updatedAt.slice(0, 13).replace(/[:T]/g, '')

  await db.collection('meta').doc('latest').set(payload, { merge: true })
  await db.collection('snapshots').doc(hourId).set({
    ts: payload.updatedAt,
    season: payload.season,
    leaders: payload.players.slice(0, 30).map((p) => ({
      id: p.id, name: p.name, team: p.team, AVG: p.AVG, H: p.H, AB: p.AB,
    })),
  })
  const batch = db.batch()
  for (const p of payload.players) {
    batch.set(db.collection('players').doc(String(p.id)), p, { merge: true })
  }
  await batch.commit()
  console.log(`✅ Firestore 저장 완료 (snapshots/${hourId}, players ${payload.players.length})`)
  return true
}

async function saveToJson(payload) {
  const dir = resolve(ROOT, 'public', 'data')
  await mkdir(dir, { recursive: true })
  await writeFile(resolve(dir, 'latest.json'), JSON.stringify(payload, null, 2))
  console.log(`✅ public/data/latest.json 저장 (${payload.players.length}명)`)
}

async function main() {
  console.log(`⚾ ${SEASON} 시즌 타율 데이터 수집 + 몬테카를로 ${SIMS.toLocaleString()}회 시뮬레이션…`)
  const payload = await buildPayload(SEASON, { sims: SIMS })

  console.log(`  규정타석 ${payload.qualifiedCount}명 / 현재 1위 ${payload.players[0]?.name} ${payload.players[0]?.AVG}`)
  console.log('  타율왕 예측 TOP5:')
  payload.predictions.slice(0, 5).forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.name} (${p.team}) 현재 ${p.currentAVG} → 예상 ${p.projAVG} | 1위확률 ${(p.pWinTitle * 100).toFixed(1)}%`)
  })

  await saveToJson(payload)
  await saveToFirestore(payload)
  console.log('🏁 완료')
}

main().catch((err) => {
  console.error('❌ 실패:', err)
  process.exit(1)
})
