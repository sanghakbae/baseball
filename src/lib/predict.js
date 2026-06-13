// 브라우저·Node 공용 예측 모듈
// 베이지안 평균회귀 + 몬테카를로 시뮬레이션으로 시즌 타율 1위 확률을 계산한다.

export const round3 = (v) => Math.round(v * 1000) / 1000

// 결정적 시드 RNG (mulberry32)
function makeRng(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randNorm(rng) {
  let u = 0, v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Gamma(shape, 1) — Marsaglia–Tsang
function randGamma(rng, shape) {
  if (shape < 1) {
    const u = rng()
    return randGamma(rng, shape + 1) * Math.pow(u, 1 / shape)
  }
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x, v
    do {
      x = randNorm(rng)
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = rng()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

function randBeta(rng, a, b) {
  const x = randGamma(rng, a)
  const y = randGamma(rng, b)
  return x / (x + y)
}

/**
 * @param players  타율 내림차순 정렬된 선수 배열 (H, AB, G, teamId, ...)
 * @param teamGP   { [teamId]: gamesPlayed } 객체 (또는 Map)
 * @param opts     { sims, regressionAB, scheduleGames, season }
 * @returns { leagueMean, predictions }
 */
export function buildPredictions(players, teamGP, opts = {}) {
  const SIMS = opts.sims ?? 20000
  const REGRESSION_AB = opts.regressionAB ?? 200
  const SCHEDULE_GAMES = opts.scheduleGames ?? 162
  const seed = (opts.season ?? 2026) ^ 0x9e3779b1
  const gp = (id) => (teamGP instanceof Map ? teamGP.get(id) : teamGP?.[id])

  let sumH = 0, sumAB = 0
  for (const p of players) { sumH += p.H; sumAB += p.AB }
  const leagueMean = sumH / sumAB

  const a0 = leagueMean * REGRESSION_AB
  const b0 = (1 - leagueMean) * REGRESSION_AB

  const model = players.map((p) => {
    const teamGames = gp(p.teamId) ?? p.G
    const teamRemaining = Math.max(0, SCHEDULE_GAMES - teamGames)
    const abPerGame = p.G > 0 ? p.AB / p.G : 0
    const remAB = Math.round(abPerGame * teamRemaining)
    const alpha = a0 + p.H
    const beta = b0 + (p.AB - p.H)
    const pMean = alpha / (alpha + beta)
    const projAVG = (p.H + remAB * pMean) / (p.AB + remAB)
    return { ...p, remAB, alpha, beta, pMean, projAVG, teamRemaining }
  })

  const candidates = model
  const wins = new Array(candidates.length).fill(0)
  const finalSamples = candidates.map(() => [])
  const rng = makeRng(seed)

  for (let s = 0; s < SIMS; s++) {
    let bestIdx = -1
    let bestAvg = -1
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]
      const p = randBeta(rng, c.alpha, c.beta)
      let restH
      if (c.remAB <= 0) {
        restH = 0
      } else {
        const mu = c.remAB * p
        const sd = Math.sqrt(c.remAB * p * (1 - p))
        restH = Math.round(mu + sd * randNorm(rng))
        if (restH < 0) restH = 0
        if (restH > c.remAB) restH = c.remAB
      }
      const finalAvg = (c.H + restH) / (c.AB + c.remAB)
      if (s < 400) finalSamples[i].push(finalAvg)
      if (finalAvg > bestAvg) { bestAvg = finalAvg; bestIdx = i }
    }
    if (bestIdx >= 0) wins[bestIdx]++
  }

  const predictions = candidates.map((c, i) => {
    const samples = finalSamples[i].slice().sort((a, b) => a - b)
    const q = (frac) => samples.length
      ? samples[Math.min(samples.length - 1, Math.floor(frac * samples.length))]
      : c.projAVG
    return {
      id: c.id,
      name: c.name,
      team: c.team,
      pos: c.pos,
      currentAVG: c.AVG,
      H: c.H,
      AB: c.AB,
      remAB: c.remAB,
      teamRemaining: c.teamRemaining,
      trueTalent: round3(c.pMean),
      projAVG: round3(c.projAVG),
      ci80: [round3(q(0.1)), round3(q(0.9))],
      pWinTitle: wins[i] / SIMS,
    }
  })

  predictions.sort((a, b) => b.pWinTitle - a.pWinTitle || b.projAVG - a.projAVG)
  return { leagueMean: round3(leagueMean), predictions }
}
