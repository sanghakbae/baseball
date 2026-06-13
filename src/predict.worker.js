// 예측 계산을 메인 스레드 밖에서 수행 → iPhone에서도 화면 끊김 없이 실시간 갱신
import { buildPredictions } from './lib/predict.js'

self.onmessage = (e) => {
  const { players, teamGP, season, sims } = e.data
  try {
    const result = buildPredictions(players, teamGP, { season, sims })
    self.postMessage({ ok: true, ...result })
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) })
  }
}
