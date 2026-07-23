"""추출한 핀 컷아웃으로 앱 아이콘·스플래시·파비콘 에셋을 만든다.

- 아이콘: 불투명(iOS는 투명도 금지) + 은은한 세로 그라디언트 배경
- 정렬 기준은 마크 전체 bbox가 아니라 '핀'이다. 하트가 오른쪽 위에 떠 있어서
  bbox 기준으로 가운데를 잡으면 핀이 왼쪽 아래로 밀려 보인다.
"""
from collections import deque

from pathlib import Path

from PIL import Image

SRC = 'pin-cutout.png'
DEST = str(Path(__file__).resolve().parents[2] / 'assets')

SIZE = 1024
ICON_BG_TOP = (255, 236, 241)     # #FFECF1
ICON_BG_BOTTOM = (255, 249, 252)  # #FFF9FC (앱 배경색과 동일)
ADAPTIVE_BG = (255, 241, 246)     # #FFF1F6

# 정사각 캔버스 대비 마크(핀+하트) 가로 폭 비율
ICON_MARK_RATIO = 0.50      # 앱 아이콘
SPLASH_MARK_RATIO = 0.52    # 스플래시: contain으로 화면 폭에 맞춰 깔린다
ADAPTIVE_MARK_RATIO = 0.44  # 안드로이드 세이프존(가운데 66%) 안에 들어오게

mark = Image.open(SRC).convert('RGBA')


def largest_component_bbox(alpha, threshold=128):
    """알파 채널에서 가장 큰 연결 요소(=핀)의 bbox를 구한다."""
    w, h = alpha.size
    px = alpha.load()
    seen = bytearray(w * h)
    best = None
    best_area = 0

    for sy in range(h):
        for sx in range(w):
            if seen[sy * w + sx] or px[sx, sy] < threshold:
                continue
            queue = deque([(sx, sy)])
            seen[sy * w + sx] = 1
            x0 = x1 = sx
            y0 = y1 = sy
            area = 0
            while queue:
                x, y = queue.popleft()
                area += 1
                x0, x1 = min(x0, x), max(x1, x)
                y0, y1 = min(y0, y), max(y1, y)
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny] >= threshold:
                        seen[ny * w + nx] = 1
                        queue.append((nx, ny))
            if area > best_area:
                best_area, best = area, (x0, y0, x1 + 1, y1 + 1)
    return best


PIN_BBOX = largest_component_bbox(mark.getchannel('A'))
PIN_CENTER = ((PIN_BBOX[0] + PIN_BBOX[2]) / 2 / mark.width,
              (PIN_BBOX[1] + PIN_BBOX[3]) / 2 / mark.height)


def place(mark_ratio, size=SIZE):
    """마크를 정사각 투명 캔버스에 배치한다. 핀의 중심을 캔버스 정중앙에 맞춘다."""
    w = int(size * mark_ratio)
    h = round(w * mark.height / mark.width)
    resized = mark.resize((w, h), Image.LANCZOS)

    cx, cy = PIN_CENTER
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(resized, (round(size / 2 - w * cx), round(size / 2 - h * cy)), resized)
    return canvas


def vertical_gradient(size, top, bottom):
    grad = Image.new('RGB', (1, size))
    for y in range(size):
        f = y / (size - 1)
        grad.putpixel((0, y), tuple(round(top[i] + (bottom[i] - top[i]) * f) for i in range(3)))
    return grad.resize((size, size), Image.BICUBIC)


# 1) iOS/기본 앱 아이콘 — 불투명
icon = vertical_gradient(SIZE, ICON_BG_TOP, ICON_BG_BOTTOM).convert('RGBA')
icon.alpha_composite(place(ICON_MARK_RATIO))
icon.convert('RGB').save(f'{DEST}/icon.png')

# 2) 스플래시 — 투명(배경색은 app.json이 칠한다)
place(SPLASH_MARK_RATIO).save(f'{DEST}/splash-icon.png')

# 3) 안드로이드 adaptive
place(ADAPTIVE_MARK_RATIO).save(f'{DEST}/android-icon-foreground.png')
Image.new('RGB', (SIZE, SIZE), ADAPTIVE_BG).save(f'{DEST}/android-icon-background.png')

mono = place(ADAPTIVE_MARK_RATIO)
mono_black = Image.new('RGBA', mono.size, (0, 0, 0, 0))
mono_black.putalpha(mono.getchannel('A'))
mono_black.save(f'{DEST}/android-icon-monochrome.png')

# 4) 파비콘
icon.convert('RGB').resize((96, 96), Image.LANCZOS).save(f'{DEST}/favicon.png')

# 5) 앱 내부에서 쓸 투명 마크 원본
mark.save(f'{DEST}/brand/pin.png')

print('pin bbox', PIN_BBOX, 'pin center', tuple(round(v, 4) for v in PIN_CENTER))
