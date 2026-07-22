# 후기 화면 별점 단일화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `app/card/review.tsx`와 `app/card/memory/new.tsx`의 감정 선택 그리드를 제거하고, 별점(1~5) 탭 바 하나로 입력을 통일한다. 선택한 별점에서 파생된 아이콘+라벨 피드백을 화면에 보여준다.

**Architecture:** 두 화면이 공유하는 `lib/ratingFeedback.ts`에 별점→아이콘/톤/i18n키 매핑과 `deriveWantAgain()`을 한 곳에 둔다(기존에 두 화면이 각자 하드코딩한 매핑이 어긋나 회귀가 생겼던 문제의 재발 방지). `date_memories.rating` 컬럼(이미 배포 대기 중인 마이그레이션, `20260722100000_date_memories_add_rating.sql`)에 저장한다. `want_again`은 `rating >= 4`로 파생 — 기존 `mood==='amazing'||mood==='good'`, `rating==='love'||rating==='good'`(5단계 중 상위 2단계)와 동일한 의미라 `app/(tabs)/memories.tsx`의 "베스트" 필터는 변경 불필요.

**Tech Stack:** React Native(Expo Router), lucide-react-native, react-i18next, Jest + react-test-renderer.

**Design doc:** [2026-07-22-review-rating-star-unification-design.md](../specs/2026-07-22-review-rating-star-unification-design.md)

**선행 상태:** `date_memories.rating` 마이그레이션 파일과 `date_memories rating 컬럼 마이그레이션` 테스트는 이전 작업(commit `4d45fd1`)에서 이미 커밋되어 있다 — 이 플랜은 그 위에서 진행하며 마이그레이션을 다시 만들지 않는다. `app/card/review.tsx`/`locales/*/review.json`은 이전 작업(commit `0cd6c21`, 감정 4→5 확장)에서 이미 수정된 상태이며, 이 플랜의 Task 2가 그 위에 다시 수정을 가한다.

---

## Task 1 — `lib/ratingFeedback.ts` 공유 모듈

**Files:**
- Create: `lib/ratingFeedback.ts`
- Test: `__tests__/ratingFeedback.test.ts` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// __tests__/ratingFeedback.test.ts
import { RATING_FEEDBACK_KEY, RATING_FEEDBACK_ICON, RATING_FEEDBACK_TONE, deriveWantAgain } from '../lib/ratingFeedback';

describe('lib/ratingFeedback', () => {
  it('maps each rating (1~5) to a distinct feedback key', () => {
    expect(RATING_FEEDBACK_KEY).toEqual({
      1: 'bad', 2: 'meh', 3: 'okay', 4: 'good', 5: 'amazing',
    });
  });

  it('provides an icon and tone for every rating', () => {
    for (const n of [1, 2, 3, 4, 5] as const) {
      expect(RATING_FEEDBACK_ICON[n]).toBeDefined();
      expect(RATING_FEEDBACK_TONE[n].fg).toEqual(expect.any(String));
      expect(RATING_FEEDBACK_TONE[n].bg).toEqual(expect.any(String));
    }
  });

  it('derives want_again as true only for rating >= 4', () => {
    expect(deriveWantAgain(1)).toBe(false);
    expect(deriveWantAgain(2)).toBe(false);
    expect(deriveWantAgain(3)).toBe(false);
    expect(deriveWantAgain(4)).toBe(true);
    expect(deriveWantAgain(5)).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest ratingFeedback`
Expected: FAIL — `lib/ratingFeedback` 모듈이 없음.

- [ ] **Step 3: 모듈 작성**

```ts
// lib/ratingFeedback.ts
import { Star, Smile, Meh, Frown, Angry } from 'lucide-react-native';
import { C } from '../constants/theme';

export type Rating = 1 | 2 | 3 | 4 | 5;

export const RATING_FEEDBACK_KEY: Record<Rating, 'bad' | 'meh' | 'okay' | 'good' | 'amazing'> = {
  1: 'bad',
  2: 'meh',
  3: 'okay',
  4: 'good',
  5: 'amazing',
};

export const RATING_FEEDBACK_ICON: Record<Rating, typeof Star> = {
  1: Angry,
  2: Frown,
  3: Meh,
  4: Smile,
  5: Star,
};

// 목업(09_review)의 emoji 5종을 lock의 파스텔 톤 패밀리로 재현한다.
export const RATING_FEEDBACK_TONE: Record<Rating, { fg: string; bg: string }> = {
  1: { fg: C.grayFg, bg: C.gray },
  2: { fg: C.lavenderFg, bg: C.lavender },
  3: { fg: C.mintFg, bg: C.mint },
  4: { fg: C.creamFg, bg: C.cream },
  5: { fg: C.danger, bg: C.pinkLight },
};

export function deriveWantAgain(rating: Rating): boolean {
  return rating >= 4;
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx jest ratingFeedback`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/ratingFeedback.ts __tests__/ratingFeedback.test.ts
git commit -m "feat(review): 별점→감정 피드백 공유 모듈(lib/ratingFeedback) 추가"
```

---

## Task 2 — `app/card/review.tsx` 별점 단일화

**Files:**
- Modify: `app/card/review.tsx`
- Modify: `__tests__/card-review-icons.test.ts`
- Create: `__tests__/card-review-screen-contract.test.tsx`
- Modify: `locales/ko/review.json`, `locales/en/review.json`

Depends on: Task 1 (`lib/ratingFeedback.ts`)

- [ ] **Step 1: 로케일 키 교체(감정 그리드 제거, 별점+파생 피드백 키로 대체)**

`locales/ko/review.json` 전체를 다음으로 교체:

```json
{
  "review": {
    "heading": "오늘 데이트 어땠어요?",
    "sub": "가볍게 남기면 다음 추천이 더 잘 맞아요.",
    "starRatingLabel": "전체 별점",
    "noStarRatingError": "별점을 선택해주세요.",
    "ratingFeedback": {
      "bad": "별로였어요",
      "meh": "아쉬웠어요",
      "okay": "무난했어요",
      "good": "좋았어요",
      "amazing": "최고였어요"
    },
    "reviewLabel": "한 줄 후기",
    "reviewPlaceholder": "오늘 데이트 한 마디로 남기기",
    "saveButton": "추억으로 저장",
    "saveError": "저장에 실패했어요. 다시 시도해주세요.",
    "missingCoupleError": "커플 정보를 불러올 수 없어요."
  }
}
```

`locales/en/review.json` 전체를 다음으로 교체:

```json
{
  "review": {
    "heading": "How was the date?",
    "sub": "A quick note helps future picks get better.",
    "starRatingLabel": "Overall rating",
    "noStarRatingError": "Please pick a star rating.",
    "ratingFeedback": {
      "bad": "Not great",
      "meh": "A bit disappointing",
      "okay": "It was okay",
      "good": "Good",
      "amazing": "Amazing"
    },
    "reviewLabel": "One-line review",
    "reviewPlaceholder": "What would you say in one line?",
    "saveButton": "Save as memory",
    "saveError": "Could not save. Please try again.",
    "missingCoupleError": "Could not load couple info."
  }
}
```

- [ ] **Step 2: `__tests__/card-review-icons.test.ts`를 새 구조 기준으로 교체(실패 유도)**

파일 전체를 다음으로 교체:

```ts
// __tests__/card-review-icons.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('card review screen icons', () => {
  const source = read('app/card/review.tsx');
  const feedback = read('lib/ratingFeedback.ts');

  it('no longer renders emoji rating icons', () => {
    expect(source).not.toContain('❤️');
    expect(source).not.toContain('⭐');
    expect(source).not.toContain('✅');
    expect(source).not.toContain('🔄');
  });

  it('imports the shared star icon and rating feedback module', () => {
    expect(source).toMatch(/import \{[^}]*Star[^}]*\} from 'lucide-react-native'/);
    expect(source).toMatch(/from '\.\.\/\.\.\/lib\/ratingFeedback'/);
  });

  it('gives each rating a distinct pastel tone (bad/meh/okay/good/amazing) in the shared feedback module', () => {
    expect(feedback).toMatch(/1:[\s\S]{0,60}C\.grayFg/);
    expect(feedback).toMatch(/2:[\s\S]{0,60}C\.lavenderFg/);
    expect(feedback).toMatch(/3:[\s\S]{0,60}C\.mintFg/);
    expect(feedback).toMatch(/4:[\s\S]{0,60}C\.creamFg/);
    expect(feedback).toMatch(/5:[\s\S]{0,60}C\.danger/);
  });

  it('preserves the save contract (memory insert + card status flip + redirect)', () => {
    expect(source).toMatch(/from\('date_memories'\)\.insert\(\{[\s\S]*?want_again: wantAgain/);
    expect(source).toMatch(/from\('date_cards'\)\.update\(\{ status: 'done' \}\)/);
    expect(source).toMatch(/router\.replace\('\/\(tabs\)\/memories'\)/);
  });
});
```

- [ ] **Step 3: 신규 화면 렌더 계약 테스트 작성**

```tsx
// __tests__/card-review-screen-contract.test.tsx
import React from 'react';
import { TouchableOpacity, Text } from 'react-native';

const mockInsert = jest.fn(async () => ({ error: null }));
const mockUpdate = jest.fn(() => ({ eq: async () => ({ error: null }) }));
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'card-1' }),
  useRouter: () => ({ replace: mockReplace }),
  useFocusEffect: (cb: () => void) => require('react').useEffect(() => { cb(); }, []),
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

jest.mock('../lib/i18n', () => {
  const ko = require('../locales/ko/review.json').review;
  const common = { cancel: '취소', error: '오류', saving: '저장 중' };
  return {
    useI18n: () => ({
      strings: { review: ko, common, card: { memory: {} } },
    }),
  };
});

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => {
      if (table === 'date_planner_profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { couple_id: 'c1' } }) }) }) };
      }
      if (table === 'date_memories') {
        return { insert: mockInsert };
      }
      if (table === 'date_cards') {
        return { update: mockUpdate };
      }
      return {};
    },
  },
}));

const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => { root: { findAllByType: (t: unknown) => { props: any }[] } };
};

const ReviewScreen = require('../app/card/review').default;

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<ReviewScreen />); });
  await TR.act(async () => {});
  return tree;
}

beforeEach(() => {
  mockInsert.mockClear();
  mockUpdate.mockClear();
  mockReplace.mockClear();
});

describe('데이트 후기 화면 — 별점 바', () => {
  it('전체 별점 라벨과 별 5개를 렌더한다', async () => {
    const tree = await render();
    const txt = tree.root.findAllByType(Text).map((n) => n.props.children).flat(Infinity).join(' ');
    expect(txt).toContain('전체 별점');
    const stars = tree.root.findAllByType(TouchableOpacity).filter((n) => String(n.props.testID ?? '').startsWith('review-star-'));
    expect(stars.length).toBe(5);
  });

  it('별점을 선택하지 않으면 저장 시 별점 에러를 띄운다', async () => {
    const { Alert } = require('react-native');
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await render();

    const saveBtn = tree.root.findAllByType(require('../components/ui').BigButton)[0];
    await TR.act(async () => { saveBtn.props.onPress(); });

    expect(Alert.alert).toHaveBeenCalledWith('', '별점을 선택해주세요.');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('별 3번째를 누르면 rating=3, want_again=false로 저장한다', async () => {
    const tree = await render();
    const stars = tree.root.findAllByType(TouchableOpacity).filter((n) => String(n.props.testID ?? '').startsWith('review-star-'));
    await TR.act(async () => { stars[2].props.onPress(); }); // 0-indexed → 3점

    const saveBtn = tree.root.findAllByType(require('../components/ui').BigButton)[0];
    await TR.act(async () => { saveBtn.props.onPress(); });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ rating: 3, want_again: false }));
  });

  it('별 5번째를 누르면 want_again=true로 저장한다', async () => {
    const tree = await render();
    const stars = tree.root.findAllByType(TouchableOpacity).filter((n) => String(n.props.testID ?? '').startsWith('review-star-'));
    await TR.act(async () => { stars[4].props.onPress(); }); // 5점

    const saveBtn = tree.root.findAllByType(require('../components/ui').BigButton)[0];
    await TR.act(async () => { saveBtn.props.onPress(); });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ rating: 5, want_again: true }));
  });
});
```

- [ ] **Step 4: 테스트 실행 → 실패 확인**

Run: `npx jest card-review-icons card-review-screen-contract`
Expected: FAIL — `app/card/review.tsx`가 아직 `lib/ratingFeedback`를 쓰지 않고 `mood`/감정 그리드를 그대로 갖고 있음.

- [ ] **Step 5: `app/card/review.tsx` 전체 교체**

파일 전체를 다음으로 교체:

```tsx
// app/card/review.tsx
import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Image,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, TouchableOpacity, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';
import { Star, Camera } from 'lucide-react-native';
import { C, SP, R } from '../../constants/theme';
import { BackBar, BigButton } from '../../components/ui';
import { Rating, RATING_FEEDBACK_KEY, RATING_FEEDBACK_ICON, RATING_FEEDBACK_TONE, deriveWantAgain } from '../../lib/ratingFeedback';

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { strings: s } = useI18n();
  const c = s.review;

  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        setMyUserId(user.id);
        const { data: profile } = await supabase
          .from('date_planner_profiles')
          .select('couple_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (profile?.couple_id) setCoupleId(profile.couple_id);
        setLoading(false);
      })();
    }, []),
  );

  async function handlePickPhoto() {
    if (uploadingPhoto) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        s.card.memory.photoPermTitle,
        s.card.memory.photoPermMessage,
        [
          { text: s.common.cancel, style: 'cancel' },
          { text: s.card.memory.openSettingsCta, onPress: () => Linking.openSettings() },
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
      Alert.alert(s.common.error, s.card.memory.photoUploadError);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave() {
    if (!rating) { Alert.alert('', c.noStarRatingError); return; }
    if (!myUserId || !coupleId) { Alert.alert('', s.common.coupleRequired); return; }
    if (saving) return;
    setSaving(true);
    try {
      const wantAgain = deriveWantAgain(rating as Rating);

      const { error } = await supabase.from('date_memories').insert({
        couple_id: coupleId,
        card_id: id,
        user_id: myUserId,
        rating,
        review: reviewText.trim(),
        want_again: wantAgain,
        photo_url: photoUrl,
      });
      if (error) throw error;
      // 회고를 남기면 데이트는 완료 상태가 되어 계획 목록에서 빠진다.
      await supabase.from('date_cards').update({ status: 'done' }).eq('id', id);
      router.replace('/(tabs)/memories');
    } catch {
      Alert.alert(s.common.error, c.saveError);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.pink} />
        </View>
      </SafeAreaView>
    );
  }

  const feedbackKey = rating ? RATING_FEEDBACK_KEY[rating as Rating] : null;
  const FeedbackIcon = rating ? RATING_FEEDBACK_ICON[rating as Rating] : null;
  const feedbackTone = rating ? RATING_FEEDBACK_TONE[rating as Rating] : null;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
        <ScrollView style={styles.flex1} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackBar />

          <View style={styles.headingBlock}>
            <Text style={styles.heading}>{c.heading}</Text>
            <Text style={styles.sub}>{c.sub}</Text>
          </View>

          <Text style={styles.sectionLabel}>{c.starRatingLabel}</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                testID={`review-star-${n}`}
                accessibilityRole="button"
                accessibilityLabel={`${n}점`}
                onPress={() => setRating(n)}
                style={styles.starBtn}
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
            <View style={[styles.feedbackCard, { backgroundColor: feedbackTone.bg, borderColor: feedbackTone.fg }]}>
              <FeedbackIcon size={18} color={feedbackTone.fg} strokeWidth={2} />
              <Text style={[styles.feedbackLabel, { color: feedbackTone.fg }]}>{c.ratingFeedback[feedbackKey]}</Text>
            </View>
          )}

          <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>{c.reviewLabel}</Text>
          <TextInput
            style={styles.reviewInput}
            value={reviewText}
            onChangeText={setReviewText}
            placeholder={c.reviewPlaceholder}
            placeholderTextColor={C.textFaint}
            multiline
            maxLength={100}
            returnKeyType="done"
          />

          <TouchableOpacity
            style={styles.photoPlaceholder}
            onPress={handlePickPhoto}
            activeOpacity={0.8}
            disabled={uploadingPhoto}
          >
            {uploadingPhoto ? (
              <ActivityIndicator color={C.pinkDeep} />
            ) : photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.photoPreview} />
            ) : (
              <View style={styles.photoTextWrap}>
                <Camera size={18} color={C.pinkDeep} strokeWidth={2} />
                <Text style={styles.photoText}>{s.card.memory.addPhotoCta}</Text>
              </View>
            )}
          </TouchableOpacity>

          <BigButton onPress={handleSave} variant={saving ? 'disabled' : 'primary'} style={styles.saveBtn}>
            {saving ? s.common.saving : c.saveButton}
          </BigButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flex1: { flex: 1 },
  content: { paddingHorizontal: SP.xl, paddingTop: SP.lg, paddingBottom: SP.xxxl + SP.lg },

  headingBlock: { marginTop: SP.lg, marginBottom: SP.xl },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 30 },
  sub: { marginTop: SP.xs + 2, fontSize: 13, color: C.textSub, lineHeight: 19 },

  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: SP.md },
  sectionLabelSpaced: { marginTop: SP.xl },

  starRow: { flexDirection: 'row', gap: SP.sm },
  starBtn: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },

  feedbackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
    marginTop: SP.md,
    marginBottom: SP.xl,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
    borderRadius: R.lg,
    borderWidth: 1.5,
  },
  feedbackLabel: { fontSize: 13, fontWeight: '600' },

  reviewInput: {
    backgroundColor: C.white,
    borderRadius: R.btn,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md + 2,
    fontSize: 14,
    color: C.text,
    minHeight: 70,
    textAlignVertical: 'top',
  },

  photoPlaceholder: {
    marginTop: SP.md + 2,
    height: 140,
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
  saveBtn: { marginTop: SP.xxl },
});
```

- [ ] **Step 6: 테스트 실행 → 통과 확인**

Run: `npx jest card-review-icons card-review-screen-contract ratingFeedback`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add app/card/review.tsx __tests__/card-review-icons.test.ts __tests__/card-review-screen-contract.test.tsx locales/ko/review.json locales/en/review.json
git commit -m "feat(review): 감정 그리드 제거, 별점(1~5) 단일 입력 + 파생 피드백으로 통일"
```

---

## Task 3 — `app/card/memory/new.tsx` 동일 방식으로 마이그레이션

**Files:**
- Modify: `app/card/memory/new.tsx`
- Modify: `__tests__/card-memory-new-icons.test.ts`

Depends on: Task 1, Task 2 (같은 `c.review` 로케일 네임스페이스를 공유)

**배경:** 이 화면은 `locales/*/review.json`의 키를 `app/card/review.tsx`와 공유해서 쓰면서도, 자기만의 `RATING_ICONS`/`RATING_TONES`를 예전 키(`love/good/ok/change`)로 하드코딩해뒀다. Task 2가 공유 로케일을 별점 기반으로 바꾸면 이 화면은 그대로 둘 경우 깨진다 — 반드시 같은 방식으로 맞춰야 한다.

- [ ] **Step 1: `__tests__/card-memory-new-icons.test.ts`를 새 구조 기준으로 교체(실패 유도)**

파일 전체를 다음으로 교체:

```ts
// __tests__/card-memory-new-icons.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('card memory new screen icons', () => {
  const source = read('app/card/memory/new.tsx');
  const feedback = read('lib/ratingFeedback.ts');

  it('no longer renders emoji rating or camera icons', () => {
    expect(source).not.toContain('❤️');
    expect(source).not.toContain('⭐');
    expect(source).not.toContain('✅');
    expect(source).not.toContain('🔄');
  });

  it('imports the shared star icon, camera icon, and rating feedback module', () => {
    expect(source).toMatch(/import \{[^}]*Star[^}]*\} from 'lucide-react-native'/);
    expect(source).toMatch(/import \{[^}]*Camera[^}]*\} from 'lucide-react-native'/);
    expect(source).toMatch(/from '\.\.\/\.\.\/\.\.\/lib\/ratingFeedback'/);
  });

  it('gives each rating a distinct pastel tone (bad/meh/okay/good/amazing) in the shared feedback module', () => {
    expect(feedback).toMatch(/1:[\s\S]{0,60}C\.grayFg/);
    expect(feedback).toMatch(/2:[\s\S]{0,60}C\.lavenderFg/);
    expect(feedback).toMatch(/3:[\s\S]{0,60}C\.mintFg/);
    expect(feedback).toMatch(/4:[\s\S]{0,60}C\.creamFg/);
    expect(feedback).toMatch(/5:[\s\S]{0,60}C\.danger/);
  });

  it('renders the park-bench mini illustration next to the heading (목업 07 반복 누락 패턴)', () => {
    expect(source).toMatch(/headingBlock[\s\S]*?<Illustration name="mini-park-bench" width=\{MINI_ILLUSTRATION_WIDTH\}/);
  });

  it('preserves the save contract (memory insert with title + photo + rating required)', () => {
    expect(source).toMatch(/if \(!photoUrl\)[\s\S]*?photoRequiredError/);
    expect(source).toMatch(/if \(!rating\)[\s\S]*?noStarRatingError/);
    expect(source).toMatch(/from\('date_memories'\)\.insert\(\{[\s\S]*?card_id: null[\s\S]*?rating,[\s\S]*?want_again: wantAgain/);
    expect(source).toMatch(/router\.replace\('\/\(tabs\)\/memories'\)/);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest card-memory-new-icons`
Expected: FAIL — `app/card/memory/new.tsx`가 아직 예전 4지선다 구조.

- [ ] **Step 3: `app/card/memory/new.tsx` 전체 교체**

파일 전체를 다음으로 교체:

```tsx
// app/card/memory/new.tsx
import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Image,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, TouchableOpacity, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../../lib/supabase';
import { useI18n } from '../../../lib/i18n';
import { Star, Camera } from 'lucide-react-native';
import { C, SP, R } from '../../../constants/theme';
import { BackBar, BigButton } from '../../../components/ui';
import { Illustration, MINI_ILLUSTRATION_WIDTH } from '../../../components/illustration';
import { Rating, RATING_FEEDBACK_KEY, RATING_FEEDBACK_ICON, RATING_FEEDBACK_TONE, deriveWantAgain } from '../../../lib/ratingFeedback';

export default function NewMemoryScreen() {
  const router = useRouter();
  const { strings: s } = useI18n();
  const c = s.review;

  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        setMyUserId(user.id);
        const { data: profile } = await supabase
          .from('date_planner_profiles')
          .select('couple_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (profile?.couple_id) setCoupleId(profile.couple_id);
        setLoading(false);
      })();
    }, []),
  );

  async function handlePickPhoto() {
    if (uploadingPhoto) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        s.card.memory.photoPermTitle,
        s.card.memory.photoPermMessage,
        [
          { text: s.common.cancel, style: 'cancel' },
          { text: s.card.memory.openSettingsCta, onPress: () => Linking.openSettings() },
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
      Alert.alert(s.common.error, s.card.memory.photoUploadError);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave() {
    if (!photoUrl) { Alert.alert('', s.card.memory.photoRequiredError); return; }
    if (!rating) { Alert.alert('', c.noStarRatingError); return; }
    if (!myUserId || !coupleId) { Alert.alert('', s.common.coupleRequired); return; }
    if (saving) return;
    setSaving(true);
    try {
      const wantAgain = deriveWantAgain(rating as Rating);

      const { error } = await supabase.from('date_memories').insert({
        couple_id: coupleId,
        card_id: null,
        user_id: myUserId,
        title: title.trim() || null,
        rating,
        review: reviewText.trim(),
        want_again: wantAgain,
        photo_url: photoUrl,
      });
      if (error) throw error;
      router.replace('/(tabs)/memories');
    } catch {
      Alert.alert(s.common.error, c.saveError);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.pink} />
        </View>
      </SafeAreaView>
    );
  }

  const feedbackKey = rating ? RATING_FEEDBACK_KEY[rating as Rating] : null;
  const FeedbackIcon = rating ? RATING_FEEDBACK_ICON[rating as Rating] : null;
  const feedbackTone = rating ? RATING_FEEDBACK_TONE[rating as Rating] : null;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
        <ScrollView style={styles.flex1} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackBar />

          <View style={styles.headingBlock}>
            <Text style={styles.heading}>{s.card.memory.newHeading}</Text>
            <Text style={styles.sub}>{s.card.memory.newSub}</Text>
            <Illustration name="mini-park-bench" width={MINI_ILLUSTRATION_WIDTH} style={styles.headingIllustration} />
          </View>

          <TouchableOpacity
            style={styles.photoPlaceholder}
            onPress={handlePickPhoto}
            activeOpacity={0.8}
            disabled={uploadingPhoto}
          >
            {uploadingPhoto ? (
              <ActivityIndicator color={C.pinkDeep} />
            ) : photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.photoPreview} />
            ) : (
              <View style={styles.photoTextWrap}>
                <Camera size={18} color={C.pinkDeep} strokeWidth={2} />
                <Text style={styles.photoText}>{s.card.memory.addPhotoCta}</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={[styles.sectionLabel, styles.sectionLabelTop]}>{s.card.memory.titleLabel}</Text>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder={s.card.memory.titlePlaceholder}
            placeholderTextColor={C.textFaint}
            maxLength={40}
            returnKeyType="next"
          />

          <Text style={[styles.sectionLabel, styles.sectionLabelTop]}>{c.starRatingLabel}</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                testID={`new-memory-star-${n}`}
                accessibilityRole="button"
                accessibilityLabel={`${n}점`}
                onPress={() => setRating(n)}
                style={styles.starBtn}
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
            <View style={[styles.feedbackCard, { backgroundColor: feedbackTone.bg, borderColor: feedbackTone.fg }]}>
              <FeedbackIcon size={18} color={feedbackTone.fg} strokeWidth={2} />
              <Text style={[styles.feedbackLabel, { color: feedbackTone.fg }]}>{c.ratingFeedback[feedbackKey]}</Text>
            </View>
          )}

          <Text style={[styles.sectionLabel, styles.sectionLabelTop]}>{c.reviewLabel}</Text>
          <TextInput
            style={styles.reviewInput}
            value={reviewText}
            onChangeText={setReviewText}
            placeholder={c.reviewPlaceholder}
            placeholderTextColor={C.textFaint}
            multiline
            maxLength={100}
            returnKeyType="done"
          />

          <BigButton onPress={handleSave} variant={saving ? 'disabled' : 'primary'} style={styles.saveBtn}>
            {saving ? s.common.saving : c.saveButton}
          </BigButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flex1: { flex: 1 },
  content: { paddingHorizontal: SP.xl, paddingTop: SP.lg, paddingBottom: SP.xxxl + SP.lg },

  headingBlock: { marginTop: SP.lg, marginBottom: SP.xl },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 30 },
  sub: { marginTop: SP.xs + 2, fontSize: 13, color: C.textSub, lineHeight: 19 },
  headingIllustration: { alignSelf: 'flex-end', marginTop: -8 },

  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: SP.md },
  sectionLabelTop: { marginTop: SP.xl },
  saveBtn: { marginTop: SP.xxl },

  titleInput: {
    backgroundColor: C.white,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
    fontSize: 14,
    color: C.text,
  },

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

  reviewInput: {
    backgroundColor: C.white,
    borderRadius: R.btn,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md + 2,
    fontSize: 14,
    color: C.text,
    minHeight: 70,
    textAlignVertical: 'top',
  },

  photoPlaceholder: {
    marginTop: SP.md + 2,
    height: 180,
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
});
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx jest card-memory-new-icons`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/card/memory/new.tsx __tests__/card-memory-new-icons.test.ts
git commit -m "feat(memory): 수동 추억 추가 화면도 별점(1~5) 단일 입력으로 마이그레이션"
```

---

## Task 4 — 전체 검증 + 목업 대조 시각 검증

- [ ] `npm run validate && npx jest` 전체 실행 → 모두 PASS 확인.
- [ ] `mcp__plugin_supabase_supabase__apply_migration`으로 `20260722100000_date_memories_add_rating.sql`을 실제 프로젝트에 배포(사용자 승인 필요 — 원격 DB 변경). 이미 Task 1(commit `4d45fd1`)에서 파일은 커밋됐으나 아직 배포되지 않았다면 여기서 배포.
- [ ] 시뮬레이터에서 `/card/review`(카드 상세→후기 진입 경로)와 `/card/memory/new`(추억 탭→수동 추가) 둘 다 렌더 — 별점 탭 시 아래 파생 피드백(아이콘+라벨)이 올바른 톤으로 나타나는지 육안 확인.
- [ ] `app/(tabs)/memories.tsx`의 "베스트" 필터가 rating 4~5점으로 저장한 추억을 정상적으로 걸러내는지 확인(코드 변경은 없었지만 실동작 확인).
- [ ] `/ss-verify` 실행해 두 화면 점수 확인, 80 미만이면 수정 후 재확인.
- [ ] `RESULT.md`/`PLAN.md` 갱신.

---

## Self-Review 메모 (작성자용, 실행 불필요)

- 원래 계획(`2026-07-22-review-rating-overhaul.md`)의 감정 5종 그리드(Task 2)는 이 플랜의 Task 2/3에서 완전히 대체된다 — 그리드 코드와 관련 로케일 키(`ratings` 배열, `noRatingError`)는 모두 제거된다.
- `app/(tabs)/memories.tsx`("베스트" 필터), `app/card/memory/edit/[id].tsx`, `app/card/memory/[id].tsx`(추억 수정/상세 화면)는 `want_again` 컬럼만 읽고 이번 변경으로 파생 로직이 바뀌지 않으므로 스코프 밖 — 코드 변경 없음.
- "AI 요약 도움" 카드는 원 계획대로 이번 스코프에서 계속 제외.
- 마이그레이션은 Task 4까지 배포해야 실제로 `rating` insert가 성공한다 — 로컬 테스트는 SQL 파일 내용/코드 계약만 검증하므로, 배포 전엔 실기기·실 Supabase 프로젝트에서 insert가 실패할 수 있음.
