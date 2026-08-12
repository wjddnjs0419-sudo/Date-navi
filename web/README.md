# Date Navi — 공유 링크 랜딩 + 동적 OG

커플 초대 공유 링크(`https://date-navi.vercel.app/invite?code=DN-XXXX&l=ko`)의
랜딩 페이지와, 카톡·문자·인스타 프리뷰용 동적 OG 이미지를 제공하는 Next.js 앱.

## App Store 웹사이트 URL

- Marketing URL: `https://date-navi.vercel.app/`
- Support URL: `https://date-navi.vercel.app/support`
- Privacy Policy URL: `https://date-navi.vercel.app/privacy`

두 페이지는 방문자의 브라우저 언어에 따라 한국어 또는 영어로 표시된다. App Store 제품 페이지가
만들어진 뒤 Vercel에 `NEXT_PUBLIC_APP_STORE_URL`을 설정하면 마케팅 페이지의 다운로드 버튼이 해당
주소로 연결된다.

## 구조

- `app/invite/page.tsx` — 랜딩. **받는 사람 언어**(Accept-Language)로 렌더. 앱 설치 시 유니버설
  링크로 바로 열리고, 아니면 초대 코드 + "앱에서 열기"(스킴 재시도) + 스토어 폴백을 보여준다.
- `app/api/og/route.tsx` — 동적 OG 이미지(1200×630, B1 레이아웃). **초대자 언어**(`l`)로 굽고,
  초대코드로 초대자 이름을 Supabase 공개 RPC(`get_invite_inviter`)에서 조회해 넣는다. 이름을
  못 읽으면 "커플 데이트에 초대했어요"로 폴백. 한글은 번들된 Pretendard(OFL) 서브셋으로 렌더.
- `app/.well-known/apple-app-site-association/route.ts` — 유니버설 링크 검증 파일(AASA).
  `appID = YQGRS8YK72.com.datenavi.app`.

## 배포 (Vercel)

```bash
cd web
vercel            # 최초: 프로젝트 링크 (Root Directory = web)
vercel --prod     # 프로덕션 배포
```

도메인 `date-navi.vercel.app` 를 이 프로젝트에 연결한다(Vercel 대시보드 → Domains).

### 환경변수 (선택)

기본값이 코드에 있어 없어도 동작한다. 덮어쓰려면 Vercel에 설정:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY` — 이름 조회용(공개 키, RLS 보호)
- `NEXT_PUBLIC_SITE_ORIGIN` — OG 이미지 절대 URL 기준 (기본 `https://date-navi.vercel.app`)
- `NEXT_PUBLIC_APP_STORE_URL` / `NEXT_PUBLIC_TESTFLIGHT_URL` — 출시 후 스토어 버튼. 비면 "곧 출시" 안내로 폴백.

## 배포 후 확인

1. `https://date-navi.vercel.app/.well-known/apple-app-site-association` 가 JSON 을 반환하는지(200, application/json).
2. `https://date-navi.vercel.app/api/og?code=DN-XXXX&l=ko` 가 PNG 이미지를 반환하는지.
3. 실제 초대 링크를 카톡/아이메시지에 붙여 프리뷰가 뜨는지.
4. 앱 설치된 기기에서 링크 탭 시 앱이 바로 열리는지(유니버설 링크). 이건 앱을 새 entitlement로
   재빌드(`associatedDomains: applinks:date-navi.vercel.app`)한 뒤에만 동작한다.
