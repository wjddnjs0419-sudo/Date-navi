import { buildSoftMessagePrompt } from '../lib/prompt';

const base = { reasons: ['tired'] };

describe('buildSoftMessagePrompt 톤별 지침 (ko)', () => {
  it('다정하게: 다정함을 강조하는 지침 포함', () => {
    const p = buildSoftMessagePrompt({ ...base, tone: '다정하게' }, 'ko');
    expect(p).toContain('다정하고');
  });

  it('가볍게: 캐주얼함을 강조하는 지침 포함', () => {
    const p = buildSoftMessagePrompt({ ...base, tone: '가볍게' }, 'ko');
    expect(p).toContain('캐주얼');
  });

  it('솔직하게: 직설적임을 강조하는 지침 포함', () => {
    const p = buildSoftMessagePrompt({ ...base, tone: '솔직하게' }, 'ko');
    expect(p).toContain('직설적');
  });

  it('톤이 다르면 프롬프트도 달라진다', () => {
    const p1 = buildSoftMessagePrompt({ ...base, tone: '다정하게' }, 'ko');
    const p2 = buildSoftMessagePrompt({ ...base, tone: '솔직하게' }, 'ko');
    expect(p1).not.toBe(p2);
  });

  it('톤이 없으면 추가 지침 없이도 정상 동작', () => {
    const p = buildSoftMessagePrompt(base, 'ko');
    expect(p).toContain('피곤해요');
  });
});
