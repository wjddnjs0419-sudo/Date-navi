import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { fetchInviterName } from '@/lib/invite';
import { resolveLang, STRINGS } from '@/lib/i18n';

// Node 런타임: 번들된 폰트 파일 읽기와 Supabase fetch에 안정적.
// (ImageResponse가 content-type: image/png 를 자동 설정한다.)
export const runtime = 'nodejs';

// 번들 자산을 프로젝트 루트 기준으로 읽는다. Vercel 서버리스에서 process.cwd() 는 프로젝트
// 루트를 가리키고, next.config 의 outputFileTracingIncludes 가 이 파일들을 번들에 포함시킨다.
function asset(relative: string): Buffer {
  return readFileSync(join(process.cwd(), relative));
}

const OG = { w: 1200, h: 630 };
const ACCENT = '#F26B7A';
const INK = '#3A2E2E';
const SUB = '#8A7F76';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const lang = resolveLang(searchParams.get('l'));
  const t = STRINGS[lang];

  const name = code ? await fetchInviterName(code) : null;
  const fontData = asset('assets/Pretendard-Bold.subset.otf');
  const mascotBuf = asset('public/mascot.png');

  const headline = name ? t.headlineNamed(name) : t.headlineAnon;
  const mascotSrc = `data:image/png;base64,${mascotBuf.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: '0 72px',
          gap: 28,
          background: 'linear-gradient(150deg, #FFF1F6 0%, #FFF9FC 100%)',
          fontFamily: 'Pretendard',
        }}
      >
        {/* 좌: 카피 */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 22 }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 4, color: ACCENT }}>
            {t.eyebrow.toUpperCase()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 62, fontWeight: 800, color: INK, lineHeight: 1.18, letterSpacing: -2 }}>
            {headline.split('\n').map((line, i) => (
              <span key={i} style={{ display: 'flex' }}>
                {name && i === 0 ? renderNamedFirstLine(line, name) : line}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, color: SUB }}>{t.ogSub}</div>
        </div>
        {/* 우: 마스코트 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mascotSrc} width={400} height={400} alt="" style={{ objectFit: 'contain' }} />
      </div>
    ),
    {
      ...OG,
      fonts: [{ name: 'Pretendard', data: fontData, weight: 800, style: 'normal' }],
    },
  );
}

// 첫 줄에서 이름 부분만 accent 색으로.
function renderNamedFirstLine(line: string, name: string) {
  const idx = line.indexOf(name);
  if (idx !== 0) return line;
  return (
    <span style={{ display: 'flex' }}>
      <span style={{ color: ACCENT }}>{name}</span>
      <span>{line.slice(name.length)}</span>
    </span>
  );
}
