'use client';

import { useEffect } from 'react';
import { APP_SCHEME } from '@/lib/config';

// 유니버설 링크가 안 걸린 경우(앱은 있지만 웹이 먼저 뜬 경우)를 위한 2차 시도.
// 앱이 설치돼 있으면 커스텀 스킴이 앱을 연다. 없으면 아무 일도 안 일어난다.
export function OpenInApp({ code, label }: { code: string; label: string }) {
  const target = `${APP_SCHEME}://onboarding/couple-connect?code=${encodeURIComponent(code)}`;

  useEffect(() => {
    // 페이지 진입 직후 한 번 자동 시도(설치돼 있으면 바로 앱으로).
    const timer = setTimeout(() => {
      window.location.href = target;
    }, 400);
    return () => clearTimeout(timer);
  }, [target]);

  return (
    <a
      href={target}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F26B7A',
        color: '#fff',
        fontWeight: 700,
        fontSize: 17,
        textDecoration: 'none',
        borderRadius: 16,
        padding: '16px 24px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {label}
    </a>
  );
}
