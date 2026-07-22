# 추억 수정 화면(edit/[id].tsx) 별점 편집 통일 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `app/card/memory/edit/[id].tsx`("추억 수정하기")의 "다시 하고 싶어요?" 예/아니오 하트 토글을 제거하고, `app/card/review.tsx`/`app/card/memory/new.tsx`와 동일한 별점(1~5) 바 + 파생 피드백으로 교체한다.

**배경:** [2026-07-22-review-rating-star-unification.md](2026-07-22-review-rating-star-unification.md)에서 review/new 두 화면을 별점 단일 입력으로 통일했지만, 세 번째 진입점인 이 수정 화면은 스코프 밖으로 남겨뒀다. 사용자가 실기기에서 이 화면을 보고 "여기는 rating이 다르게 나온다"고 지적 — 확인 결과 이 화면은 `rating` 컬럼을 아예 select/update하지 않고 독립된 `want_again` 예/아니오 토글만 다뤄서, 별점으로 만든 추억을 여기서 수정하면 `rating`(예: 5점)과 `want_again`(사용자가 여기서 "아니오"로 바꿈)이 새 파생 규칙(`rating>=4`)과 어긋나는 조합이 생길 수 있었다. 사용자가 "별점 편집으로 통일"을 선택 — 완전히 일관된 경험을 위해 이 화면도 같은 패턴으로 마이그레이션한다.

**Architecture:** 기존 `lib/ratingFeedback.ts` 공유 모듈을 그대로 재사용(재작성 없음). 이 화면은 `strings.card.memory.*`(자기 전용 문구)와 `strings.review.*`(별점 공유 문구: `starRatingLabel`/`noStarRatingError`/`ratingFeedback`)를 함께 쓴다 — `app/card/memory/new.tsx`가 이미 쓰는 패턴과 동일.

**Tech Stack:** React Native(Expo Router), lucide-react-native, react-i18next, Jest + react-test-renderer.

**선행 상태:** `date_memories.rating` 컬럼은 이미 원격 배포됨(`20260722100000_date_memories_add_rating.sql`). 이 플랜은 그 컬럼을 select/update 대상에 추가만 한다 — 새 마이그레이션 불필요.

---

## Task 1 — `app/card/memory/edit/[id].tsx` 별점 편집으로 교체

**Files:**
- Modify: `app/card/memory/edit/[id].tsx`
- Modify: `__tests__/card-memory-edit-icons.test.ts`
- Create: `__tests__/card-memory-edit-screen-contract.test.tsx`
- Modify: `locales/ko/card.json`, `locales/en/card.json`

- [ ] **Step 1: 로케일에서 사용 끝난 want-again 문구 제거**

`locales/ko/card.json`의 `memory` 섹션에서 다음 3줄 삭제:

```json
      "wantAgainLabel": "다시 하고 싶어요?",
      "wantAgainYes": "또 가고 싶어요",
      "wantAgainNo": "한 번이면 충분",
```

`locales/en/card.json`의 `memory` 섹션에서 다음 3줄 삭제:

```json
      "wantAgainLabel": "Want to do this again?",
      "wantAgainYes": "Yes, again",
      "wantAgainNo": "Once was enough",
```

(이 세 키는 `app/card/memory/edit/[id].tsx`에서만 쓰이던 것으로 확인됨 — `locales/*/memories.json`의 동명이인 `wantAgainYes`/`wantAgainNo`는 별개 네임스페이스라 영향 없음.)

- [ ] **Step 2: `__tests__/card-memory-edit-icons.test.ts`를 새 구조 기준으로 교체(실패 유도)**

파일 전체를 다음으로 교체:

```ts
// __tests__/card-memory-edit-icons.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('card memory edit screen icons', () => {
  const source = read('app/card/memory/edit/[id].tsx');
  const feedback = read('lib/ratingFeedback.ts');

  it('imports the shared star icon and rating feedback module (no more Heart toggle)', () => {
    expect(source).toMatch(/import \{[^}]*Camera[^}]*\} from 'lucide-react-native'/);
    expect(source).toMatch(/import \{[^}]*Star[^}]*\} from 'lucide-react-native'/);
    expect(source).toMatch(/from '\.\.\/\.\.\/\.\.\/\.\.\/lib\/ratingFeedback'/);
  });

  it('gives each rating a distinct pastel tone (bad/meh/okay/good/amazing) in the shared feedback module', () => {
    expect(feedback).toMatch(/1:[\s\S]{0,60}C\.grayFg/);
    expect(feedback).toMatch(/2:[\s\S]{0,60}C\.lavenderFg/);
    expect(feedback).toMatch(/3:[\s\S]{0,60}C\.mintFg/);
    expect(feedback).toMatch(/4:[\s\S]{0,60}C\.creamFg/);
    expect(feedback).toMatch(/5:[\s\S]{0,60}C\.danger/);
  });

  it('renders the heading heart doodle and trees mini illustration (목업 09 반복 누락 패턴)', () => {
    expect(source).toMatch(/headingBlock[\s\S]*?<HeartDoodle/);
    expect(source).toMatch(/<Illustration name="mini-trees-heart" width=\{MINI_ILLUSTRATION_WIDTH\}/);
  });

  it('preserves the save contract (freeform title gate + rating + fields)', () => {
    const payload = source.match(/\.update\(\{([\s\S]*?)\}\)/)?.[1] ?? '';
    expect(payload).toContain("title: isFreeform ? (title.trim() || null) : undefined");
    expect(payload).toContain('review: reviewText.trim()');
    expect(payload).toContain('rating,');
    expect(payload).toContain('want_again: wantAgain');
    expect(payload).toContain('photo_url: photoUrl');
  });

  it('requires a star rating before saving', () => {
    expect(source).toMatch(/if \(!rating\)[\s\S]*?noStarRatingError/);
  });

  it('preserves the edit-forbidden guard', () => {
    expect(source).toMatch(/if \(!data\?\.length\)[\s\S]*?editForbidden/);
  });
});
```

- [ ] **Step 3: 신규 화면 렌더 계약 테스트 작성**

```tsx
// __tests__/card-memory-edit-screen-contract.test.tsx
import React from 'react';
import { TouchableOpacity, Text } from 'react-native';

const mockMaybeSingle = jest.fn(async () => ({
  data: { card_id: null, title: '한강 피크닉', review: '좋았어요', want_again: true, photo_url: null, rating: 5 },
}));
const mockUpdate = jest.fn(() => ({
  eq: () => ({ select: async () => ({ data: [{ id: 'm1' }], error: null }) }),
}));
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'm1' }),
  useRouter: () => ({ back: mockBack }),
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(() => cb(), []),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: async () => ({ granted: false }),
  launchImageLibraryAsync: async () => ({ canceled: true }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('../components/illustration', () => {
  const { View } = require('react-native');
  return { Illustration: View, MINI_ILLUSTRATION_WIDTH: 130 };
});

jest.mock('../lib/i18n', () => {
  const review = require('../locales/ko/review.json').review;
  const card = require('../locales/ko/card.json').card;
  const common = { cancel: '취소', error: '오류', notice: '안내', save: '저장' };
  return {
    useI18n: () => ({
      strings: { review, card, common },
    }),
  };
});

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'date_memories') {
        return { select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }), update: mockUpdate };
      }
      return {};
    },
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  },
}));

const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => { root: { findAllByType: (t: unknown) => { props: any }[] } };
};

const EditMemoryScreen = require('../app/card/memory/edit/[id]').default;

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<EditMemoryScreen />); });
  await TR.act(async () => {});
  return tree;
}

beforeEach(() => {
  mockUpdate.mockClear();
  mockBack.mockClear();
});

describe('추억 수정 화면 — 별점 편집', () => {
  it('기존 rating(5점)을 불러와 별 5개가 채워진 상태로 렌더한다', async () => {
    const tree = await render();
    const txt = tree.root.findAllByType(Text).map((n) => n.props.children).flat(Infinity).join(' ');
    expect(txt).toContain('전체 별점');
    const stars = tree.root.findAllByType(TouchableOpacity).filter((n) => String(n.props.testID ?? '').startsWith('edit-memory-star-'));
    expect(stars.length).toBe(5);
  });

  it('별 2번째를 누르고 저장하면 rating=2, want_again=false로 업데이트한다', async () => {
    const tree = await render();
    const stars = tree.root.findAllByType(TouchableOpacity).filter((n) => String(n.props.testID ?? '').startsWith('edit-memory-star-'));
    await TR.act(async () => { stars[1].props.onPress(); }); // 0-indexed → 2점

    const saveBtn = tree.root.findAllByType(require('../components/ui').BigButton)[0];
    await TR.act(async () => { saveBtn.props.onPress(); });

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ rating: 2, want_again: false }));
  });
});
```

- [ ] **Step 4: 테스트 실행 → 실패 확인**

Run: `npx jest card-memory-edit-icons card-memory-edit-screen-contract`
Expected: FAIL — `app/card/memory/edit/[id].tsx`가 아직 예전 want_again 토글 구조.

- [ ] **Step 5: `app/card/memory/edit/[id].tsx` 전체 교체**

파일 전체를 다음으로 교체:

```tsx
// app/card/memory/edit/[id].tsx
import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Image,
  ActivityIndicator, Alert, TouchableOpacity, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../../../lib/supabase';
import { Camera, Star } from 'lucide-react-native';
import { C, SP, R, G } from '../../../../constants/theme';
import { BackBar, BigButton, HeartDoodle } from '../../../../components/ui';
import { Illustration, MINI_ILLUSTRATION_WIDTH } from '../../../../components/illustration';
import { useI18n } from '../../../../lib/i18n';
import { Rating, RATING_FEEDBACK_KEY, RATING_FEEDBACK_ICON, RATING_FEEDBACK_TONE, deriveWantAgain } from '../../../../lib/ratingFeedback';

export default function EditMemoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { strings } = useI18n();
  const c = strings.review;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isFreeform, setIsFreeform] = useState(false);
  const [title, setTitle] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [rating, setRating] = useState(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const { data } = await supabase
          .from('date_memories')
          .select('card_id, title, review, want_again, photo_url, rating')
          .eq('id', id)
          .maybeSingle();
        if (!active) return;
        if (data) {
          setIsFreeform(!data.card_id);
          setTitle(data.title ?? '');
          setReviewText(data.review ?? '');
          setRating(data.rating ?? 0);
          setPhotoUrl(data.photo_url);
        }
        setLoading(false);
      })();
      return () => { active = false; };
    }, [id]),
  );

  async function handlePickPhoto() {
    if (uploadingPhoto) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        strings.card.memory.photoPermTitle,
        strings.card.memory.photoPermMessage,
        [
          { text: strings.common.cancel, style: 'cancel' },
          { text: strings.card.memory.openSettingsCta, onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;

    setUploadingPhoto(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');

      const base64 = result.assets[0].base64!;
      const path = `${user.id}/memory_${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('memories')
        .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from('memories').getPublicUrl(path);
      setPhotoUrl(pub.publicUrl);
    } catch {
      Alert.alert(strings.common.error, strings.card.memory.photoUploadError);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave() {
    if (!rating) { Alert.alert('', c.noStarRatingError); return; }
    if (saving) return;
    setSaving(true);
    try {
      const wantAgain = deriveWantAgain(rating as Rating);

      const { data, error } = await supabase
        .from('date_memories')
        .update({
          title: isFreeform ? (title.trim() || null) : undefined,
          review: reviewText.trim(),
          rating,
          want_again: wantAgain,
          photo_url: photoUrl,
        })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data?.length) { Alert.alert(strings.common.notice, strings.card.memory.editForbidden); return; }
      router.back();
    } catch {
      Alert.alert(strings.common.error, strings.card.memory.saveError);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={C.pink} />
      </View>
    );
  }

  const feedbackKey = rating ? RATING_FEEDBACK_KEY[rating as Rating] : null;
  const FeedbackIcon = rating ? RATING_FEEDBACK_ICON[rating as Rating] : null;
  const feedbackTone = rating ? RATING_FEEDBACK_TONE[rating as Rating] : null;

  return (
    <SafeAreaView style={G.screen}>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BackBar onPress={() => router.back()} />

        <View style={s.headingBlock}>
          <View style={s.headingRow}>
            <Text style={[s.heading, s.headingTop]}>{strings.card.memory.editHeading}</Text>
            <HeartDoodle style={s.headingHeart} />
          </View>
          <Text style={s.subText}>{strings.card.memory.editSub}</Text>
          <Illustration name="mini-trees-heart" width={MINI_ILLUSTRATION_WIDTH} style={s.headingIllustration} />
        </View>

        <TouchableOpacity
          style={s.photoPlaceholder}
          onPress={handlePickPhoto}
          activeOpacity={0.8}
          disabled={uploadingPhoto}
        >
          {uploadingPhoto ? (
            <ActivityIndicator color={C.pinkDeep} />
          ) : photoUrl ? (
            <Image source={{ uri: photoUrl }} style={s.photoPreview} />
          ) : (
            <View style={s.photoTextWrap}>
              <Camera size={18} color={C.pinkDeep} strokeWidth={2} />
              <Text style={s.photoText}>{strings.card.memory.addPhotoCta}</Text>
            </View>
          )}
        </TouchableOpacity>

        {isFreeform && (
          <>
            <Text style={s.label}>{strings.card.memory.titleLabel}</Text>
            <View style={s.inputWrap}>
              <TextInput
                style={s.input}
                value={title}
                onChangeText={setTitle}
                placeholder={strings.card.memory.titlePlaceholder}
                placeholderTextColor={C.textFaint}
                maxLength={40}
              />
            </View>
          </>
        )}

        <Text style={s.label}>{strings.card.memory.reviewLabel}</Text>
        <View style={s.inputWrap}>
          <TextInput
            style={[s.input, s.inputMultiline]}
            value={reviewText}
            onChangeText={setReviewText}
            placeholder={strings.card.memory.reviewPlaceholder}
            placeholderTextColor={C.textFaint}
            multiline
            maxLength={100}
          />
        </View>

        <Text style={s.label}>{c.starRatingLabel}</Text>
        <View style={s.starRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity
              key={n}
              testID={`edit-memory-star-${n}`}
              accessibilityRole="button"
              accessibilityLabel={`${n}점`}
              onPress={() => setRating(n)}
              style={s.starBtn}
            >
              <Star
                size={28}
                strokeWidth={1.8}
                color={C.pinkDeep}
                fill={n <= rating ? C.pinkDeep : 'transparent'}
              />
            </TouchableOpacity>
          ))}
        </View>

        {feedbackKey && FeedbackIcon && feedbackTone && (
          <View style={[s.feedbackCard, { backgroundColor: feedbackTone.bg, borderColor: feedbackTone.fg }]}>
            <FeedbackIcon size={18} color={feedbackTone.fg} strokeWidth={2} />
            <Text style={[s.feedbackLabel, { color: feedbackTone.fg }]}>{c.ratingFeedback[feedbackKey]}</Text>
          </View>
        )}

        <View style={s.footerSpacer} />
      </ScrollView>

      <View style={s.footer}>
        <BigButton onPress={handleSave} variant={saving ? 'disabled' : 'primary'}>
          {saving ? <ActivityIndicator color={C.white} size="small" /> : strings.common.save}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: SP.xl, paddingTop: SP.xl, paddingBottom: SP.xxxl + SP.sm },
  headingBlock: { marginBottom: SP.md },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start' },
  headingHeart: { marginTop: SP.lg + 4, marginLeft: 4 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  headingTop: { marginTop: SP.lg },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: SP.sm },
  headingIllustration: { alignSelf: 'flex-end', marginTop: -8 },
  label: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: SP.xl, marginBottom: SP.sm },
  inputWrap: {
    backgroundColor: C.white,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
  },
  // 단일행 입력에 lineHeight를 주면 iOS에서 세로 중앙이 어긋난다. lineHeight는 multiline 전용.
  input: { fontSize: 14, color: C.text, paddingVertical: 0 },
  inputMultiline: { minHeight: 70, lineHeight: 22, textAlignVertical: 'top' },
  footerSpacer: { height: 120 },

  photoPlaceholder: {
    marginTop: SP.md + 2,
    height: 160,
    borderRadius: R.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.pinkBorder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoPreview: { width: '100%', height: '100%' },
  photoTextWrap: { flexDirection: 'row', alignItems: 'center', gap: SP.xs },
  photoText: { fontSize: 13, color: C.pinkDeep, fontWeight: '600' },

  starRow: { flexDirection: 'row', gap: SP.sm },
  starBtn: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },

  feedbackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
    marginTop: SP.md,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
    borderRadius: R.lg,
    borderWidth: 1.5,
  },
  feedbackLabel: { fontSize: 13, fontWeight: '600' },

  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: SP.xl,
    paddingBottom: SP.xxxl,
    paddingTop: SP.md,
    backgroundColor: C.bg,
  },
});
```

- [ ] **Step 6: 테스트 실행 → 통과 확인**

Run: `npx jest card-memory-edit-icons card-memory-edit-screen-contract ratingFeedback`
Expected: PASS

- [ ] **Step 7: 전체 검증**

Run: `npm run validate && npx jest`
Expected: 모두 PASS

- [ ] **Step 8: 커밋**

```bash
git add app/card/memory/edit/\[id\].tsx __tests__/card-memory-edit-icons.test.ts __tests__/card-memory-edit-screen-contract.test.tsx locales/ko/card.json locales/en/card.json
git commit -m "feat(memory): 추억 수정 화면도 별점(1~5) 편집으로 통일, want_again 예/아니오 토글 제거"
```

---

## Self-Review 메모 (작성자용, 실행 불필요)

- 목업(`09_card_memory_edit`)은 원래 하트 예/아니오 토글이었다 — 이번 변경은 목업 이탈이지만, 사용자가 세 화면(review/new/edit) 간 완전한 일관성을 명시적으로 선택했다(선행 세션에서 review.tsx의 별점+감정그리드 병존도 같은 이유로 별점 단일화로 통합한 전례와 동일한 판단).
- `app/card/memory/[id].tsx`(추억 상세 화면, 읽기 전용)는 `want_again`만 표시하고 여전히 스코프 밖 — 이 플랜은 수정 화면(edit)만 다룬다.
- `locales/*/memories.json`의 `wantAgainYes`/`wantAgainNo`(통계 카드용, 별개 네임스페이스)와 `locales/*/card.json`의 `wantAgainTag`는 이 플랜과 무관하므로 건드리지 않는다.
