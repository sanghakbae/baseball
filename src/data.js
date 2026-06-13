// 2026 MLB 타율 기준 데이터 (조회 시점: 2026-06-13, 출처: MLB.com)
// 규정타석 충족 선수 기준

export const STAT_KEYS = [
  { key: 'rank', label: '타율 순위', fmt: (v) => `${v}위` },
  { key: 'G', label: '경기 (G)' },
  { key: 'AB', label: '타수 (AB)' },
  { key: 'R', label: '득점 (R)' },
  { key: 'H', label: '안타 (H)' },
  { key: 'B2', label: '2루타 (2B)' },
  { key: 'B3', label: '3루타 (3B)' },
  { key: 'HR', label: '홈런 (HR)' },
  { key: 'RBI', label: '타점 (RBI)' },
  { key: 'SB', label: '도루 (SB)' },
  { key: 'BB', label: '볼넷 (BB)' },
  { key: 'SO', label: '삼진 (SO)' },
  { key: 'AVG', label: '타율 (AVG)', fmt: (v) => v.toFixed(3).replace(/^0/, '') },
  { key: 'OBP', label: '출루율 (OBP)', fmt: (v) => v.toFixed(3).replace(/^0/, '') },
  { key: 'SLG', label: '장타율 (SLG)', fmt: (v) => v.toFixed(3).replace(/^0/, '') },
  { key: 'OPS', label: 'OPS', fmt: (v) => v.toFixed(3).replace(/^0/, '') },
]

// 값이 높을수록 좋은 스탯 (하이라이트 비교용). SO(삼진)는 낮을수록 좋으므로 제외.
export const HIGHER_IS_BETTER = [
  'G', 'AB', 'R', 'H', 'B2', 'B3', 'HR', 'RBI', 'SB', 'BB',
  'AVG', 'OBP', 'SLG', 'OPS',
]

export const lee = {
  id: 'lee',
  name: '이정후',
  nameEn: 'Jung Hoo Lee',
  team: 'SF',
  pos: 'RF',
  rank: 2,
  G: 62, AB: 237, R: 34, H: 79, B2: 15, B3: 2, HR: 3, RBI: 24,
  SB: 3, BB: 11, SO: 25, AVG: 0.333, OBP: 0.368, SLG: 0.451, OPS: 0.819,
}

export const top5 = [
  {
    id: 'lopez', name: 'Otto Lopez', nameEn: 'Otto Lopez', team: 'MIA', pos: 'SS',
    rank: 1,
    G: 69, AB: 275, R: 43, H: 94, B2: 18, B3: 3, HR: 5, RBI: 31,
    SB: 13, BB: 10, SO: 45, AVG: 0.342, OBP: 0.369, SLG: 0.484, OPS: 0.853,
  },
  {
    id: 'diaz', name: 'Yandy Díaz', nameEn: 'Yandy Diaz', team: 'TB', pos: 'DH',
    rank: 3,
    G: 63, AB: 243, R: 34, H: 80, B2: 11, B3: 1, HR: 12, RBI: 46,
    SB: 1, BB: 25, SO: 34, AVG: 0.329, OBP: 0.404, SLG: 0.531, OPS: 0.935,
  },
  {
    id: 'arraez', name: 'Luis Arraez', nameEn: 'Luis Arraez', team: 'SF', pos: '2B',
    rank: 4,
    G: 67, AB: 267, R: 35, H: 87, B2: 14, B3: 5, HR: 2, RBI: 25,
    SB: 5, BB: 15, SO: 13, AVG: 0.326, OBP: 0.360, SLG: 0.438, OPS: 0.798,
  },
  {
    id: 'marsh', name: 'Brandon Marsh', nameEn: 'Brandon Marsh', team: 'PHI', pos: 'LF',
    rank: 5,
    G: 64, AB: 227, R: 34, H: 73, B2: 12, B3: 2, HR: 8, RBI: 31,
    SB: 5, BB: 12, SO: 59, AVG: 0.322, OBP: 0.357, SLG: 0.498, OPS: 0.855,
  },
  {
    id: 'alvarez', name: 'Yordan Alvarez', nameEn: 'Yordan Alvarez', team: 'HOU', pos: 'DH',
    rank: 6,
    G: 70, AB: 252, R: 48, H: 81, B2: 13, B3: 0, HR: 24, RBI: 54,
    SB: 1, BB: 46, SO: 53, AVG: 0.321, OBP: 0.433, SLG: 0.659, OPS: 1.092,
  },
]
