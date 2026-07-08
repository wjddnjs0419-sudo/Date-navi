import { buildPrompt, MODE_EMPHASIS, MODE_EMPHASIS_EN, PROMPT_VERSION } from '../lib/prompt';
import type { FeelingInput } from '../lib/ai';

const base: FeelingInput = {
  energy: 'low', budget: 'low', distance: 'near',
  mood: 'comfortable', duration: '1h', avoid: [],
};

describe('buildPrompt mode별 차별화 (ko)', () => {
  it('feeling: 감정/분위기 구체화 지침 포함', () => {
    const p = buildPrompt(base, 'feeling');
    expect(p).toContain('끌리는 분위기');
    expect(p).toContain('감성');
  });
  it('make_course: 단계별 동선 지침 포함', () => {
    const p = buildPrompt(base, 'make_course');
    expect(p).toContain('steps');
  });
  it('feeling(en): 영문 context/emphasis 정합', () => {
    const p = buildPrompt(base, 'feeling', undefined, 'en');
    expect(p).toContain('only knows the vibe');
    expect(p).toContain('emotionally resonant');
  });
});

describe('make_course 프롬프트', () => {
  it('ko 지침에 steps 출력 요구가 포함', () => {
    expect(MODE_EMPHASIS.make_course).toContain('steps');
  });
  it('en 지침에 steps 출력 요구가 포함', () => {
    expect(MODE_EMPHASIS_EN.make_course).toContain('steps');
  });
});

describe('실제 장소 블록 주입', () => {
  const block = '\n\n【실제 주변 장소 목록】\n- 성수동 카페 (카페) · 서울 성동구 1 · http://p/1';
  it('placesBlock을 주면 프롬프트에 그대로 포함된다', () => {
    const p = buildPrompt(base, 'feeling', undefined, 'ko', block);
    expect(p).toContain('성수동 카페');
  });
  it('placesBlock이 있으면 JSON 골격에 place_name 필드가 들어간다', () => {
    const p = buildPrompt(base, 'feeling', undefined, 'ko', block);
    expect(p).toContain('"place_name":');
    expect(p).toContain('"place_address":');
    expect(p).toContain('"map_url":');
  });
  it('placesBlock이 없으면 place_name 필드 미포함', () => {
    expect(buildPrompt(base, 'feeling')).not.toContain('"place_name":');
  });
  it('en에서도 placesBlock 주입 + place 필드 포함', () => {
    const p = buildPrompt(base, 'feeling', undefined, 'en', block);
    expect(p).toContain('성수동 카페');
    expect(p).toContain('"place_name":');
  });
});

describe('make_course JSON 골격에 steps 필드', () => {
  it('ko: make_course면 JSON 스키마에 "steps": 포함', () => {
    expect(buildPrompt(base, 'make_course')).toContain('"steps":');
  });
  it('en: make_course면 JSON 스키마에 "steps": 포함', () => {
    expect(buildPrompt(base, 'make_course', undefined, 'en')).toContain('"steps":');
  });
  it('다른 모드는 JSON 스키마에 "steps": 미포함', () => {
    expect(buildPrompt(base, 'feeling')).not.toContain('"steps":');
    expect(buildPrompt(base, 'next_meet', undefined, 'en')).not.toContain('"steps":');
  });
});

describe('PROMPT_VERSION', () => {
  it('vN 형식의 문자열이다', () => {
    expect(PROMPT_VERSION).toMatch(/^v\d+$/);
  });
});
