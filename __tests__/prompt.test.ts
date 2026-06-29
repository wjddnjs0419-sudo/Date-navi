import { buildPrompt, MODE_EMPHASIS, MODE_EMPHASIS_EN } from '../lib/prompt';
import type { FeelingInput } from '../lib/ai';

const base: FeelingInput = {
  energy: 'low', budget: 'low', distance: 'near',
  mood: 'comfortable', duration: '1h', avoid: [],
};

describe('buildPrompt mode별 차별화 (ko)', () => {
  it('pick_for_me: 조건 충실/무난 지침 포함', () => {
    const p = buildPrompt(base, 'pick_for_me');
    expect(p).toContain('계획이 귀찮');
    expect(p).toContain('조건에 충실');
  });
  it('feeling: 감정/분위기 구체화 지침 포함', () => {
    const p = buildPrompt(base, 'feeling');
    expect(p).toContain('끌리는 분위기');
    expect(p).toContain('감성');
  });
  it('light: 저예산/근거리 지침 포함', () => {
    const p = buildPrompt(base, 'light');
    expect(p).toContain('체력 소모가 적은');
    expect(p).toContain('근거리');
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

describe('make_course JSON 골격에 steps 필드', () => {
  it('ko: make_course면 JSON 스키마에 "steps": 포함', () => {
    expect(buildPrompt(base, 'make_course')).toContain('"steps":');
  });
  it('en: make_course면 JSON 스키마에 "steps": 포함', () => {
    expect(buildPrompt(base, 'make_course', undefined, 'en')).toContain('"steps":');
  });
  it('다른 모드는 JSON 스키마에 "steps": 미포함', () => {
    expect(buildPrompt(base, 'pick_for_me')).not.toContain('"steps":');
    expect(buildPrompt(base, 'light', undefined, 'en')).not.toContain('"steps":');
  });
});
