#!/usr/bin/env python3
"""공유용 Open Graph 카드(1200x630) 생성 → public/og.png
latest.json의 현재 1위·이정후 수치를 주입(매시간 Action에서 재생성)."""
from PIL import Image, ImageDraw, ImageFont
import os, json

W, H = 1200, 630
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "public", "og.png")

# 한글 폰트 후보 (맥 / 리눅스 CI)
FONT_CANDIDATES = [
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
]
FONT_PATH = next((p for p in FONT_CANDIDATES if os.path.exists(p)), None)

def f(size):
    if FONT_PATH:
        try: return ImageFont.truetype(FONT_PATH, size)
        except Exception: pass
    return ImageFont.load_default()

# 현재 수치 로드
sub = "매시간 실시간 데이터 · 타율왕 확률 예측"
try:
    with open(os.path.join(ROOT, "public", "data", "latest.json"), encoding="utf-8") as fp:
        d = json.load(fp)
    players = d.get("players", [])
    def avg3(v): return ("%.3f" % v).lstrip("0") if isinstance(v, (int, float)) else "-"
    leader = players[0] if players else None
    lee = next((p for p in players if p.get("name") in ("이정후", "Jung Hoo Lee")), None)
    if leader and lee:
        sub = f"현재 1위 {leader['name']} {avg3(leader['AVG'])} · 이정후 {lee['rank']}위 {avg3(lee['AVG'])}"
except Exception as e:
    print("latest.json 로드 실패:", e)

img = Image.new("RGB", (W, H), "#0b1220")
d = ImageDraw.Draw(img)
top, bot = (27, 42, 71), (11, 18, 32)
for y in range(H):
    t = y / H
    d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))

GOLD, BLUE, TEXT, MUTED = "#f6c445", "#4aa8ff", "#e8edf6", "#93a1bd"

# 야구공
cx, cy, rad = 150, 150, 56
d.ellipse([cx-rad, cy-rad, cx+rad, cy+rad], fill="#f4f6fb")
d.arc([cx-rad+14, cy-rad-22, cx+rad+40, cy+rad-22], 110, 160, fill="#d62934", width=5)
d.arc([cx-rad-40, cy-rad+22, cx+rad-14, cy+rad+22], 290, 340, fill="#d62934", width=5)

d.text((250, 120), "2026 MLB · 실시간 예측", font=f(34), fill=MUTED)

y0 = 200
d.text((96, y0), "2026 누가 ", font=f(82), fill=TEXT)
w1 = d.textlength("2026 누가 ", font=f(82))
d.text((96 + w1, y0), "타격왕", font=f(82), fill=GOLD)
w2 = d.textlength("타격왕", font=f(82))
d.text((96 + w1 + w2, y0), "이", font=f(82), fill=TEXT)
d.text((96, y0 + 100), "될까?", font=f(82), fill=TEXT)

# 동적 수치 라인
d.text((96, y0 + 210), sub, font=f(34), fill=BLUE)
d.text((96, y0 + 262), "톱10 라이브 · 이정후 응원 게시판", font=f(30), fill=MUTED)

d.rectangle([0, H-78, W, H], fill="#131c2e")
d.text((96, H-58), "baseball.sanghak.kr", font=f(34), fill=GOLD)

img.save(OUT, "PNG")
print("저장:", os.path.abspath(OUT), "|", sub)
