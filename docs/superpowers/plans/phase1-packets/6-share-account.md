# 작업 패킷: 클러스터 6 — share + account + legal (9화면)

너는 Date Navi(React Native + Expo) 앱의 **공유·마이페이지·법률 화면 UI 교체**를 담당하는 세션이다. `UI RENEW/` 목업에 1:1로 맞춘다. 로직(제안 알림·계정 관리·탈퇴)은 손대지 않는다.

> **권장 모델: Sonnet.** 대부분 설정 리스트·폼·법률 텍스트라 기계적. 화면 9개지만 판단 부담 낮음. (공유/반응 플로우만 원하면 Opus.)

## 기준
- 작업 위치: 이 worktree(`ui/share-account` 브랜치, main 병합 `5a3faee`에서 분기).
- Phase 0 공용 컴포넌트 **재사용**: `ListGroup`/`ListRow`·`SectionLabel`·`BackBar`·`BigButton`·`SoftCard`·`Badge`·`InfoNote`·`SuccessModal`(버튼닫힘)·`Illustration`(공유 성공 등), 토큰 `C/SP/R/T`, lock `STYLESEED.md`.

## 담당 화면 (목업 1:1)
| 라우트 | 목업 PNG | 현행 노트 |
|---|---|---|
| `app/share/send.tsx` | `.../DATE_NAVI_P2_INDIVIDUAL_SCREENS/06_share_send.png` | 제안 보내기(문구 입력·AI 추천). |
| `app/share/reaction.tsx` | `.../P2.../07_share_reaction.png` | 받은 제안에 반응. |
| `app/share/mutual.tsx` | `.../P2.../08_mutual_confirmed.png`, `.../P1.../10_share.png`, `.../P2.../04_candidate_agreement.png` | 상호 확정/합의. **P2/04(합의) 귀속은 목업 대조로 mutual vs reaction 확정.** |
| `app/settings.tsx` | `.../P2.../09_settings.png` | 마이페이지(닉네임·언어·알림·도움말·로그아웃). |
| `app/account/notifications.tsx` | `.../P2.../10_notifications.png` | 알림함(제안 모달). |
| `app/account/edit-profile.tsx` | `.../P2.../11_profile_edit.png` | 프로필 수정. |
| `app/account/delete-account.tsx` | `.../P2.../12_account_delete.png` | 회원 탈퇴(위험 안내·재확인). |
| `app/legal/terms.tsx` | `.../P2.../13_terms.png` | 이용약관(10섹션). |
| `app/legal/privacy.tsx` | `.../P2.../14_privacy.png` | 개인정보처리방침. |

## 소유 i18n 조각 (이 파일들만 편집)
- `locales/{ko,en}/share.json`
- `locales/{ko,en}/account.json`
- `locales/{ko,en}/settings.json`
- `locales/{ko,en}/notifications.json`
- `locales/{ko,en}/legal.json`

## 규칙 (반드시)
1. 화면마다 대응 목업 PNG를 `Read`로 열어 1:1 대조.
2. **TDD** 먼저. 테스트 인프라 = `require('react-test-renderer')` + `TR.act()` 패턴. 기존 legal/settings 테스트 무회귀.
3. **StyleSeed 게이트**: 화면당 `/ss-score` ≥80 + `/styleseed-design-review`.
4. **i18n**: 소유 조각(ko/en) 동시. **법률 문구(terms/privacy)는 내용 변경 금지** — 레이아웃/타이포만 목업화(문구는 법률 검토 대상).
5. **하드코딩 금지**: `C/SP/R`.
6. **금지 편집**: 공용 컴포넌트 파일·`constants/*`·`locales/index.ts`·다른 클러스터·`lib/*`·`supabase/*` 로직. 새 공용 필요 시 화면-로컬 + `// PHASE0-BACKMERGE`.
7. 제안 알림·계정 수정·탈퇴 Edge Function 호출·라우팅 동작은 **그대로**. 비주얼·레이아웃만.

## 완료 기준
- tsc 클린 + 계약 테스트 통과 + 전체 jest 무회귀. 9화면 목업 일치·StyleSeed ≥80.
- `ui/share-account` 브랜치 커밋(`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`).
- 완료보고: 화면별 점수, P2/04 귀속 결정, PHASE0-BACKMERGE 플래그.

목업 대조 → TDD 순으로 화면 하나씩. 법률 화면은 문구 유지·레이아웃만. 불명확하면 질문.
