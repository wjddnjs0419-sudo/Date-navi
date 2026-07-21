# Phase 1 병렬 실행 런북 (UI 전면 교체)

> Phase 0 완료·main 병합 끝. 이제 6개 화면 클러스터를 **worktree로 격리해 병렬 세션**으로 만든다.
> 기준선: main 병합 커밋 **`5a3faee`**. 모든 클러스터 브랜치는 이 커밋에서 분기한다.

---

## 왜 worktree인가
6개 세션이 각자 다른 폴더(worktree)에서 다른 브랜치를 작업 → 서로의 파일을 물리적으로 못 건드림. Phase 0에서 공용면(컴포넌트·i18n)을 이미 동결했고, 각 클러스터는 **자기 화면 파일 + 자기 i18n 조각만** 편집하므로 충돌이 구조적으로 0에 가깝다.

---

## 1단계 — worktree 6개 만들기

프로젝트 루트(`/Users/jeongwonkim/Desktop/Date-navi`)에서 한 번만 실행:

```bash
cd /Users/jeongwonkim/Desktop/Date-navi
for c in auth onboarding tabs course card share-account; do
  git worktree add "../datenavi-$c" -b "ui/$c" 5a3faee
done
git worktree list   # 6개 확인
```

각 worktree는 `.git`을 공유하지만 **node_modules는 공유 안 함**. RN/Expo 앱이라 jest·tsc에 node_modules가 필요하니, 설치 대신 **심볼릭 링크로 재사용**(빠름·용량 절약):

```bash
for c in auth onboarding tabs course card share-account; do
  ln -s /Users/jeongwonkim/Desktop/Date-navi/node_modules "../datenavi-$c/node_modules"
done
```
> ⚠️ 링크는 읽기용으로만. 어떤 세션도 worktree에서 `npm install`을 돌리면 안 된다(원본 오염). 의존성 추가는 이번 UI 작업 범위 밖 — 필요하면 Phase 2로.

---

## 클러스터별 권장 모델

각 세션에서 그 세션의 모델을 아래처럼 설정한다(`/model` 또는 세션 시작 시). 기준 = 화면 수 × 비주얼/인터랙션 복잡도.

| 클러스터 | 화면 | 권장 모델 | 이유 |
|---|---|---|---|
| 1 auth | 2 | **Sonnet** | 가벼움. 로그인 히어로 폴리시 원하면 Opus. |
| 2 onboarding | 9 | **Opus** | 볼륨 + 연결 애니메이션 + 커플연결 다중 상태. |
| 3 tabs | 5 | **Opus** | 홈이 쇼케이스(컴포넌트 합성). |
| 4 course | 5 | **Opus** | 결과 편집이 앱 최고 복잡 인터랙션. |
| 5 card | 7 | **Sonnet** | 폼·상세·리스트 표준. |
| 6 share-account | 9 | **Sonnet** | 설정·법률 위주, 기계적. |

- **원칙**: UI 목업 매칭은 판단이 필요해 **최소 Sonnet**. Haiku는 비주얼 뉘앙스 놓칠 수 있어 이 작업엔 비권장.
- 머신/토큰 여유 있으면 전부 Opus로 통일해도 무방(품질 상향). 반대로 예산 타이트하면 Opus는 2·3·4만, 나머지 Sonnet.
- 각 세션이 `superpowers:test-driven-development` + StyleSeed 게이트를 돌리므로, 모델과 무관하게 품질 바닥(테스트·≥80)은 강제된다.

## 2단계 — 각 worktree에서 Claude Code 세션 열기

worktree 폴더마다 새 Claude Code 세션(터미널/IDE 창)을 연다:

```bash
cd /Users/jeongwonkim/Desktop/datenavi-onboarding && claude   # (또는 IDE에서 해당 폴더 열기)
```

세션이 열리면 **대응 패킷 파일 내용을 통째로 붙여넣는다**:
- `docs/superpowers/plans/phase1-packets/1-auth.md`
- `2-onboarding.md` · `3-tabs.md` · `4-course.md` · `5-card.md` · `6-share-account.md`

패킷이 그 세션의 전체 지시서다(화면↔목업 1:1, TDD, StyleSeed 게이트, 완료 기준 포함).

> **동시 개수**: 한 번에 6개 다 돌려도 되고, 머신 부담되면 2~3개씩 나눠 돌려도 된다(서로 독립이라 순서 무관). 각 세션이 jest를 돌리니 CPU를 좀 먹는다.

---

## 3단계 — 세션 완료 후 (각 브랜치 커밋됨)

각 세션이 끝나면 자기 브랜치(`ui/<cluster>`)에 커밋이 쌓여 있다. worktree는 그대로 두고, **통합은 Phase 2에서 메인 세션이** 한다.

---

## 4단계 — Phase 2 통합 (전부 끝난 뒤, 메인 세션 1개에서)

```bash
cd /Users/jeongwonkim/Desktop/Date-navi
git checkout main
for c in auth onboarding tabs course card share-account; do
  git merge --no-ff "ui/$c" -m "merge: UI Phase 1 $c 클러스터"
done
```
- 파일 disjoint + i18n 조각 소유라 충돌은 근접 0. (혹시 충돌 나면 대개 같은 조각을 두 클러스터가 만진 것 — 소유권 재확인.)
- 병합 후: `npx jest && npm run validate` 전체 통과 확인.
- **StyleSeed 시각 게이트**: `ss-verify`로 핵심 플로우(로그인→온보딩→홈→코스생성→결과→공유) 렌더 스크린샷 점수. 스크린샷 도구 = 메모리 `screenshot-mode-tooling` 재사용.
- **실기기**: Xcode Release Run 1회(JS 변경만이라 prebuild 불필요).

정리:
```bash
for c in auth onboarding tabs course card share-account; do
  rm "../datenavi-$c/node_modules"          # 심링크 먼저 제거
  git worktree remove "../datenavi-$c"
  git branch -d "ui/$c"
done
```

---

## 미결(Phase 1에서 처리할 것)
- **GeneratingView 부제/팁카드**: 목업엔 있으나 Phase 0에서 i18n 이유로 생략 → course 클러스터가 `locales/{ko,en}/modeFlow.json`에 키 추가해 넣을 수 있음(옵션).
- 각 클러스터가 새 공용 프리미티브가 필요하다고 느끼면 → 화면-로컬로 만들고 `// PHASE0-BACKMERGE` 주석 + 완료보고에 기록. Phase 2에서 승격 검토.

## 참고
- 설계 전문: `docs/superpowers/specs/2026-07-21-ui-renew-parallel-design.md`
- Phase 0 결과: `RESULT.md` 세션 BE
