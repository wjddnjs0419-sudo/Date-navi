"""힉스필드 1:1 핀 원본에서 핀+하트만 투명 PNG로 추출한다.

배경(파스텔 세계지도/바닥)은 채도가 낮고 핀·하트는 채도가 높다는 점을 이용한
순수 PIL 채도 마스크 + 바깥쪽 플러드필. 외부 API 호출 없음.

플러드필을 쓰는 이유: 핀 위쪽의 하이라이트와 가운데 구멍은 채도가 낮아
단순 임계값만으로는 뚫려버린다. 테두리에서 연결된 영역만 배경으로 본다.
"""
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageMath

SRC = 'pin-source.png'  # 힉스필드 생성물 원본(1024x1024, 핀+하트)
OUT = 'pin-cutout.png'  # 배경 제거 결과. build_assets.py의 입력
SAT_THRESHOLD = 78  # 이 값 미만이면 배경 후보

im = Image.open(SRC).convert('RGB')
r, g, b = im.split()

mx = ImageChops.lighter(ImageChops.lighter(r, g), b)
mn = ImageChops.darker(ImageChops.darker(r, g), b)

# 채도 = (max - min) / max * 255
sat = ImageMath.lambda_eval(
    lambda a: a['convert'](255 * (a['mx'] - a['mn']) / a['max'](a['mx'], 1), 'L'),
    mx=mx, mn=mn,
).convert('L')
sat = sat.filter(ImageFilter.MedianFilter(5))  # 지도 점선 잡티 제거

# 배경 후보(저채도) = 255, 피사체 = 0
bgmask = sat.point(lambda v: 255 if v < SAT_THRESHOLD else 0)

# 네 모서리에서 플러드필 → 바깥과 연결된 저채도 영역만 128로 표시
ImageDraw.floodfill(bgmask, (0, 0), 128, thresh=0)
for seed in ((im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1)):
    if bgmask.getpixel(seed) == 255:
        ImageDraw.floodfill(bgmask, seed, 128, thresh=0)

alpha = bgmask.point(lambda v: 0 if v == 128 else 255)
# 모폴로지 닫힘: 하이라이트가 테두리에 닿아 생긴 톱니 자국을 메운다
alpha = alpha.filter(ImageFilter.MaxFilter(17)).filter(ImageFilter.MinFilter(17))
alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))  # 가장자리 안티에일리어싱

out = im.copy()
out.putalpha(alpha)

bbox = alpha.getbbox()
out = out.crop(bbox)
out.save(OUT)
print('saved', OUT, out.size, 'bbox', bbox)
