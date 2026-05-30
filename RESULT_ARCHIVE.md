# RESULT_ARCHIVE.md

현재 세션보다 오래된 작업 기록을 누적합니다.
최신 기록은 `RESULT.md`를 참조하세요.

---

## 2026-05-23 세션 C — Phase 3 반응 & 후보 분류

| 항목 | 내용 |
|------|------|
| `supabase/reactions` | 신규 테이블 (card_id text, user_id uuid, reaction_type CHECK, UNIQUE(card_id,user_id)) + RLS 4개 정책 |
| `app/card/[id].tsx` | 카드 상세 화면 — 반응 버튼 4개 (완전 끌려/느낌은 좋아/오늘은 부담돼/다음에) + 상대 반응 표시 |
| `app/(tabs)/candidates.tsx` | 분류별 탭 (전체/둘 다 끌림/조건부/다음에) + 카드 클릭 → 상세 화면 라우팅 |
| `app/mode-flow/result.tsx` | 저장 후 "첫 번째 카드에 반응하기" 버튼 추가 |

반응 유형: love(🔥) / like(😊) / burden(😅) / next_time(⏰)
분류 로직: 둘 다 love/like → 둘 다 끌림 | 한 명 love/like + 한 명 burden → 조건부 | 하나라도 next_time → 다음에

---

## 2026-05-23 세션 B — Phase 2 데이트 모드 UX + AI 카드 생성

| 항목 | 내용 |
|------|------|
| `supabase/date_cards` | 신규 테이블 + RLS |
| `lib/ai.ts` | Gemini Flash API 호출 + fallback 템플릿 3개 |
| `app/mode-flow/feeling.tsx` | 5단계 버튼 선택 + 피하고 싶은 것 멀티 + 자유 텍스트 |
| `app/mode-flow/result.tsx` | AI 카드 3개 표시 + DB 저장 |

Gemini 모델: `gemini-1.5-flash` / API키: `EXPO_PUBLIC_GOOGLE_AI_STUDIO_API_KEY`

---

## 2026-05-23 세션 A — Expo SDK 54 호환 + Phase 1 완료

| 항목 | 내용 |
|------|------|
| Expo SDK | 56 → 54 다운그레이드 |
| `app/_layout.tsx` | `onAuthStateChange` + `getDestination()` 기반 라우팅 |
| `app/onboarding/` | 닉네임 입력 + 커플 초대 코드 화면 |

Supabase 프로젝트: `wqjguifsmtblgrhdfnji` (ap-northeast-2)
데모 계정: `demo-partner@datemate.app` / 닉네임 `Claudia` / 커플 `DEMO01`
이메일 인증: Auth → Providers → Email → Confirm email OFF 필요
