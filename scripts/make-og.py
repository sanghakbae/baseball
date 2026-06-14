#!/usr/bin/env python3
"""공유용 Open Graph 카드 이미지(1200x630) 생성 → public/og.png"""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1200, 630
FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "og.png")

def f(size, idx=0):
    return ImageFont.truetype(FONT, size, index=idx)

img = Image.new("RGB", (W, H), "#0b1220")
d = ImageDraw.Draw(img)

# 세로 그라데이션 배경
top, bot = (27, 42, 71), (11, 18, 32)
for y in range(H):
    t = y / H
    r = int(top[0] + (bot[0] - top[0]) * t)
    g = int(top[1] + (bot[1] - top[1]) * t)
    b = int(top[2] + (bot[2] - top[2]) * t)
    d.line([(0, y), (W, y)], fill=(r, g, b))

GOLD = "#f6c445"; BLUE = "#4aa8ff"; TEXT = "#e8edf6"; MUTED = "#93a1bd"

# 야구공 (간단한 원 + 실밥)
cx, cy, rad = 150, 150, 56
d.ellipse([cx-rad, cy-rad, cx+rad, cy+rad], fill="#f4f6fb")
d.arc([cx-rad+14, cy-rad-22, cx+rad+40, cy+rad-22], 110, 160, fill="#d62934", width=5)
d.arc([cx-rad-40, cy-rad+22, cx+rad-14, cy+rad+22], 290, 340, fill="#d62934", width=5)

# 상단 라벨
d.text((250, 120), "2026 MLB · 실시간 예측", font=f(34), fill=MUTED)

# 메인 타이틀 (타격왕 강조)
y0 = 200
d.text((96, y0), "2026 누가 ", font=f(82), fill=TEXT)
w1 = d.textlength("2026 누가 ", font=f(82))
d.text((96 + w1, y0), "타격왕", font=f(82), fill=GOLD)
w2 = d.textlength("타격왕", font=f(82))
d.text((96 + w1 + w2, y0), "이", font=f(82), fill=TEXT)
d.text((96, y0 + 100), "될까?", font=f(82), fill=TEXT)

# 서브 카피
d.text((96, y0 + 210), "매시간 실시간 데이터 · 몬테카를로로 타율왕 확률 예측", font=f(36), fill=MUTED)
d.text((96, y0 + 262), "톱10 라이브 · 이정후 응원 게시판", font=f(36), fill=BLUE)

# 하단 도메인 바
d.rectangle([0, H-78, W, H], fill="#131c2e")
d.text((96, H-58), "baseball.sanghak.kr", font=f(34), fill=GOLD)

img.save(OUT, "PNG")
print("저장:", os.path.abspath(OUT), img.size)
