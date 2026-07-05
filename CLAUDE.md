# CLAUDE.md — AI Agent Router

> **CRITICAL:** Claude가 자동으로 로드하는 파일. 전체 프로젝트 문서의 기본 라우터.

## 🚀 빠른 부트스트랩 순서

토큰 낭비 없이 즉시 실행 가능한 상태로 진입한다.

1. **최신 상태 파악**: `PLAN.md`(활성 태스크)와 `RESULT.md`(최신 세션 결과)를 읽는다.
2. **필요 시 코드 탐색**: 변경이 필요한 파일만 `Read` 또는 `grep`으로 정밀 탐색.

```bash
rg -n "^##|^###" PLAN.md RESULT.md
```

## 💡 세션 단축키

- **`ㅎㅇ`**: 위 부트스트랩 순서 실행. 현재 상태를 요약한 뒤 작업 지시를 기다린다.
- **`종료`**: `PLAN.md` 완료 항목 반영, `RESULT.md` 최신화, 루트에서 `npm run validate` 기록 여부 점검.

## ⚠️ 핵심 원칙

- **Korean Only**: 모든 소통은 한국어.
- **Plan Before Code**: 코드 수정 전 반드시 계획을 제안하고 명시적 승인을 받는다.
- **Validate**: 변경 후 항상 루트에서 `npm run validate`(= `tsc --noEmit`) 실행. 에러는 사용자 개입 없이 스스로 수정한다.
- **No Hardcoding**: 환경변수와 타입 시스템 활용. 마법 문자열·ID 금지.
- **i18n Sync**: 화면에 보이는 문구를 추가·수정할 땐 `locales/ko.json`과 `locales/en.json`을 같은 작업에서 함께 갱신한다. 한쪽 언어만 반영된 상태로 작업 완료 보고 금지.
- **Ratchet**: 스스로 해결한 빌드/린트 오류는 `AGENTS.md` Anti-Patterns에 1줄 추가.

---

*이전 세션 기록은 `RESULT_ARCHIVE.md` 참조.*
