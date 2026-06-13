# ⚾ MLB 타율왕 예측 시스템

올해 MLB 전체 규정타석 타자의 타격 데이터를 **매시간** 수집하고,
몬테카를로 시뮬레이션으로 **시즌 종료 시점 타율 1위**를 예측한다.
이정후 vs 타율 TOP5 비교 화면도 포함한다.

## 구성

```
baseball/
├─ scripts/fetch-stats.mjs        # 수집기 + 예측기 (Node, 의존성 없이 동작)
├─ .github/workflows/fetch-stats.yml  # 매시간 cron
├─ public/data/latest.json        # 발행된 최신 스냅샷 (Actions가 커밋)
└─ src/                           # React + Vite 프론트엔드
   ├─ App.jsx                     # 예측 / 랭킹 / 이정후 비교 탭
   ├─ useStats.js                 # latest.json 로더 (+정적 폴백)
   └─ data.js                     # 폴백용 정적 데이터
```

## 데이터 흐름

```
MLB Stats API (statsapi.mlb.com)
        │  매시간
        ▼
scripts/fetch-stats.mjs  ──►  Firestore  (시계열 + 최신 + 예측)
        │                     meta/latest, players/{id}, snapshots/{YYYYMMDDHH}
        └──────────────────►  public/data/latest.json  (정적 발행)
                                       │
                                       ▼
                              React 프론트엔드
```

## 예측 모델

1. **평균회귀(베이지안)** — 규정타석 타자들의 PA가중 평균 타율을 사전분포 중심으로,
   각 선수의 안타/타수를 더해 사후 `Beta(α, β)`로 진짜 실력 `p`를 추정.
2. **잔여 타석 추정** — 팀 소화 경기수(162 기준)와 선수 경기당 타수로 남은 타수 산출.
3. **몬테카를로 2만 회** — 매 시뮬레이션마다 `p ~ Beta`를 뽑고, 잔여 안타를 이항분포로
   모사해 최종 타율 계산 → 1위 빈도를 집계해 **타율왕 확률**을 구함.

## 로컬 실행

```bash
npm install
npm run fetch     # 데이터 수집 + 예측 → public/data/latest.json
npm run dev       # 프론트엔드 (http://localhost:5173)
npm run build     # 프로덕션 빌드
```

`npm run fetch` 는 Firebase 설정이 없어도 동작하며, `public/data/latest.json` 만 갱신한다.

## Firebase(Firestore) 연동

1. Firebase 콘솔에서 프로젝트 생성 → **Firestore** 사용 설정.
2. 프로젝트 설정 → 서비스 계정 → **새 비공개 키 생성** (JSON 다운로드).
3. GitHub 저장소 → Settings → Secrets and variables → Actions:
   - **Secret** `FIREBASE_SERVICE_ACCOUNT` = 다운로드한 JSON 전체 내용
   - (선택) **Variable** `SEASON` = `2026`
4. 수집기가 다음 컬렉션에 기록한다:
   - `meta/latest` — 최신 스냅샷 + 예측 요약
   - `players/{playerId}` — 선수별 최신 스탯
   - `snapshots/{YYYYMMDDHH}` — 시간당 시계열(상위 30명)

> 정적 JSON(`public/data/latest.json`)만으로도 프론트엔드가 완전히 동작하므로,
> Firestore는 시계열 누적·고급 쿼리·확장을 위한 저장소로 쓴다.

## 자동 실행

`.github/workflows/fetch-stats.yml` 이 매시간(UTC 정각) 실행되어
데이터를 수집하고 `public/data/latest.json` 변경분을 커밋한다.
수동 실행은 Actions 탭의 **Run workflow** 로 가능하다.

## 배포

`npm run build` 결과(`dist/`)를 정적 호스팅(GitHub Pages 등)에 올리면 된다.
`public/data/latest.json` 이 함께 배포되어 프론트엔드가 읽는다.
