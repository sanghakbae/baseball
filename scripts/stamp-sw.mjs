#!/usr/bin/env node
/**
 * 빌드 결과물의 자산 해시로 dist/sw.js 의 버전을 각인한다.
 *
 * 서비스워커 업데이트는 브라우저가 sw.js 를 바이트 비교해 감지한다.
 * 따라서 sw.js 내용이 그대로면 새 코드를 배포해도 업데이트 알림이 뜨지 않는다.
 *
 * 반대로 커밋 해시를 쓰면, 매시간 도는 데이터 커밋(latest.json·og.png)마다
 * 버전이 바뀌어 "바뀐 것도 없는데" 업데이트 알림이 뜬다.
 * → 실제 앱 코드가 바뀔 때만 달라지는 '자산 파일명 + index.html' 해시를 쓴다.
 */
import { createHash } from 'node:crypto'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = resolve(ROOT, 'dist')

const assets = (await readdir(resolve(DIST, 'assets'))).sort() // Vite 해시 파일명
const html = await readFile(resolve(DIST, 'index.html'), 'utf8')
const version = createHash('sha256')
  .update(assets.join('|'))
  .update(html)
  .digest('hex')
  .slice(0, 12)

const swPath = resolve(DIST, 'sw.js')
const sw = await readFile(swPath, 'utf8')
const stamped = sw.replace("const VERSION = '__BUILD__'", `const VERSION = '${version}'`)
if (stamped === sw) {
  console.error('❌ sw.js 에 VERSION 자리표시자가 없습니다 — 업데이트 감지가 동작하지 않습니다')
  process.exit(1)
}
await writeFile(swPath, stamped)
console.log(`✅ sw.js 버전 각인: ${version} (자산 ${assets.length}개 기준)`)
