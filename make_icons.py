from PIL import Image, ImageDraw
import math, os

OUT = os.path.dirname(os.path.abspath(__file__))
BG = (217, 119, 87)      # Claude-ish warm orange
FACE = (255, 247, 237)   # cream
HAND = (60, 40, 30)

def make(size):
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # rounded square background
    r = int(s * 0.22)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=BG)

    # clock face
    pad = int(s * 0.18)
    d.ellipse([pad, pad, s - pad, s - pad], fill=FACE)

    # tick marks (12, 3, 6, 9)
    cx = cy = s / 2
    rad = (s / 2) - pad
    tick_outer = rad * 0.92
    tick_inner = rad * 0.78
    tick_w = max(2, int(s * 0.025))
    for ang_deg in (0, 90, 180, 270):
        a = math.radians(ang_deg - 90)
        x1 = cx + math.cos(a) * tick_inner
        y1 = cy + math.sin(a) * tick_inner
        x2 = cx + math.cos(a) * tick_outer
        y2 = cy + math.sin(a) * tick_outer
        d.line([x1, y1, x2, y2], fill=HAND, width=tick_w)

    # hour hand (points to ~10)
    hour_a = math.radians(-60 - 90)
    hx = cx + math.cos(hour_a) * rad * 0.45
    hy = cy + math.sin(hour_a) * rad * 0.45
    d.line([cx, cy, hx, hy], fill=HAND, width=max(3, int(s * 0.05)))

    # minute hand (points to 2)
    min_a = math.radians(60 - 90)
    mx = cx + math.cos(min_a) * rad * 0.7
    my = cy + math.sin(min_a) * rad * 0.7
    d.line([cx, cy, mx, my], fill=HAND, width=max(2, int(s * 0.035)))

    # center pin
    pin = max(2, int(s * 0.04))
    d.ellipse([cx - pin, cy - pin, cx + pin, cy + pin], fill=HAND)

    img = img.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(OUT, f"icon{size}.png"))

for sz in (16, 32, 48, 128):
    make(sz)
print("done")
