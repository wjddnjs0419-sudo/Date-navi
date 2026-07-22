# generating 화면 퍼센트 진행바 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `components/ui.tsx`의 `GeneratingView`(AI 코스 생성 중 화면)의 진행 표시를 "단계별 분절 바"(현재: steps.length개의 네모 조각)에서 목업(`01_generating.png`)과 같은 **연속된 퍼센트 채움 바**로 바꾼다.

**Architecture:** `step`/`steps` prop 계약(개수·현재 인덱스)은 그대로 두고, 렌더 방식만 바꾼다 — `steps.map(...)`으로 N개의 박스를 그리던 것을, 트랙 1개 + `Animated.Value`로 폭을 `((current+1)/total)*100%`까지 애니메이션하는 채움 바 1개로 교체한다. `generating.tsx`(호출부)는 이미 `step`(현재 인덱스)과 `steps`(라벨 배열)를 넘기고 있으므로 호출부 변경은 불필요.

**Tech Stack:** React Native `Animated` API, Jest + react-test-renderer.

**목업 대조 메모(구현 전 확인 완료):** `01_generating.png` — "코스 구성 중 3/4 단계" 라벨(이미 `progressCount`로 구현됨) 아래 매끄러운 핑크 바(부분 채움, 분절 없음). **파트너 아바타는 이 화면 어디에도 없다** — 목업에도 없으므로 이번 계획에 포함하지 않는다(세션 BG 감사가 진행률바를 "없음"으로 오탐한 것과 별개로, 아바타는 애초에 이 화면 대상이 아니었을 가능성이 높음 — 만약 사용자가 다른 화면을 염두에 뒀다면 그 화면을 특정해서 별도 계획이 필요).

---

## Task 1 — 연속 채움 바로 교체

**Files:**
- Modify: `components/ui.tsx`
- Modify: `__tests__/generating-view.test.tsx`

- [ ] **Step 1: 실패하는 테스트 추가**

```tsx
// __tests__/generating-view.test.tsx 기존 describe 블록 안에 추가
  it('renders one continuous progress fill, not one segment per step', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(
        <GeneratingView heading="코스를 만드는 중" steps={['a', 'b', 'c', 'd']} step={2} />,
      );
    });
    const track = tree.root.findAll((n: any) => n.props.testID === 'generating-progress-track');
    const fill = tree.root.findAll((n: any) => n.props.testID === 'generating-progress-fill');
    expect(track.length).toBe(1);
    expect(fill.length).toBe(1);
    TR.act(() => { tree.unmount(); });
  });

  it('keeps showing the "current / total" count label', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(
        <GeneratingView heading="코스를 만드는 중" steps={['a', 'b', 'c', 'd']} step={2} />,
      );
    });
    const txt = tree.root.findAllByType(Text).map((n: any) => n.props.children).flat().join(' ');
    expect(txt).toContain('3 / 4');
    TR.act(() => { tree.unmount(); });
  });
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest generating-view`
Expected: FAIL — 현재 구현엔 `generating-progress-track`/`generating-progress-fill` testID가 없음(대신 `steps.length`개의 이름 없는 박스가 있음).

- [ ] **Step 3: `components/ui.tsx`의 `GeneratingView` 진행바 렌더 교체**

`useRef`/`useState` 선언부에 퍼센트 애니메이션 값 추가(기존 `pulseScale` 선언 바로 아래):

```ts
  const fillPercent = useRef(new Animated.Value(0)).current;
```

`statusLabel`/`current`/`total` 계산 다음, 기존 `useEffect`(pulse) 블록 아래에 새 `useEffect` 추가:

```ts
  useEffect(() => {
    Animated.timing(fillPercent, {
      toValue: ((current + 1) / total) * 100,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // width 애니메이션은 layout 속성이라 native driver 불가
    }).start();
  }, [current, total, fillPercent]);

  const fillWidth = fillPercent.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });
```

`progressTrack` 렌더 블록을 교체:

```tsx
        <View style={genS.progressTrack} testID="generating-progress-track">
          <Animated.View
            testID="generating-progress-fill"
            style={[genS.progressFill, { width: fillWidth }]}
          />
        </View>
```

스타일 교체(`progressTrack`/`progressSegment*` 대신):

```ts
  progressTrack: {
    height: 8, borderRadius: R.badge, backgroundColor: C.pinkMid, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', borderRadius: R.badge, backgroundColor: C.pink,
  },
```

(기존 `progressSegment`/`progressSegmentOn`/`progressSegmentOff` 스타일 키는 더 이상 쓰이지 않으므로 삭제한다.)

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx jest generating-view`
Expected: PASS

- [ ] **Step 5: 전체 검증**

Run: `npm run validate && npx jest`
Expected: 모두 PASS

- [ ] **Step 6: 커밋**

```bash
git add components/ui.tsx __tests__/generating-view.test.tsx
git commit -m "feat(generating): 단계 분절 바 → 목업과 동일한 연속 퍼센트 채움 바"
```

---

## Task 2 — 목업 대조 시각 검증

- [ ] 시뮬레이터에서 `/mode-flow/generating` 렌더(course 흐름 진입), 단계가 넘어갈 때 바가 부드럽게 채워지는지 육안 확인.
- [ ] `01_generating.png`와 나란히 비교 — 바 색상/두께/모서리, 라벨 위치 일치 여부.
- [ ] `/ss-verify` 실행해 점수 확인, 80 미만이면 수정 후 재확인.
- [ ] `RESULT.md`/`PLAN.md` 갱신 — 파트너 아바타는 이 화면 대상이 아니었음(목업에도 없음)을 기록하고, 사용자가 다른 화면을 염두에 뒀다면 다음 세션에 화면을 특정해 별도로 다룬다고 명시.

---

## Self-Review 메모 (작성자용, 실행 불필요)

- `useNativeDriver: false` 필수 — `width`는 layout 속성이라 native driver 애니메이션 불가(RN 제약). 기존 `pulseScale`(transform) 애니메이션은 `useNativeDriver: true`를 유지해도 된다 — 서로 다른 Animated.Value라 섞어써도 무방.
- 파트너 아바타: 이번 조사에서 generating/course-create 어느 목업에도 없었다 — 만약 사용자가 실제로 원했던 게 다른 화면(예: share/mutual, course-result 공동 편집 상태)이라면 이 계획은 해당 요구를 다루지 않는다. 실행 전 재확인 권장.
