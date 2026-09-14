#!/usr/bin/env python3
"""PWA 아이콘 생성 → public/icon-*.png, public/apple-touch-icon.png

이모지 폰트는 플랫폼마다 렌더링이 달라(맥 컬러 이모지 vs CI 리눅스) 결과가 흔들린다.
그래서 야구공을 도형으로 직접 그린다 — 어디서 실행하든 같은 결과가 나온다.
"""
from PIL import Image, ImageDraw
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
PUB = os.path.join(ROOT, "public")

BG = (11, 18, 32)        # --bg #0b1220 (manifest theme_color 와 일치)
BALL = (250, 250, 248)
SEAM = (214, 58, 48)

def draw_icon(size, pad_ratio, rounded):
    """pad_ratio: 공이 차지하지 않는 여백 비율. maskable 은 크게 줘야 잘리지 않는다."""
    # 4배로 그린 뒤 축소 — PIL 에는 안티앨리어싱이 없어 계단 현상이 생긴다
    S = size * 4
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BG)
    else:
        d.rectangle([0, 0, S - 1, S - 1], fill=BG)  # iOS 는 자체 마스크를 씌운다

    R = S * (1 - pad_ratio * 2) / 2
    cx = cy = S / 2
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=BALL)

    # 솔기 — 공 바깥에 중심을 둔 큰 원의 호가 공 안쪽을 지나간다
    sw = max(2, int(R * 0.11))
    off, sr = R * 1.42, R * 1.30
    d.arc([cx - off - sr, cy - sr, cx - off + sr, cy + sr], -40, 40, fill=SEAM, width=sw)
    d.arc([cx + off - sr, cy - sr, cx + off + sr, cy + sr], 140, 220, fill=SEAM, width=sw)

    return img.resize((size, size), Image.LANCZOS)

def save(img, name, keep_alpha=True):
    path = os.path.join(PUB, name)
    if not keep_alpha:
        flat = Image.new("RGB", img.size, BG)
        flat.paste(img, mask=img.split()[3])
        img = flat
    img.save(path)
    print(f"  {name}  {img.size[0]}x{img.size[1]}  {os.path.getsize(path):,}B")

print("PWA 아이콘 생성:")
save(draw_icon(192, 0.16, True), "icon-192.png")
save(draw_icon(512, 0.16, True), "icon-512.png")
# maskable: 플랫폼이 원형 등으로 잘라내므로 안전영역(중앙 80%) 안에 내용을 둔다
save(draw_icon(512, 0.26, False), "icon-maskable-512.png")
# iOS 홈 화면 — 투명도 금지, 모서리는 iOS 가 직접 둥글게 처리
save(draw_icon(180, 0.16, False), "apple-touch-icon.png", keep_alpha=False)
