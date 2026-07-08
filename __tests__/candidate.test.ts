import { buildCandidates, type Candidate } from '../lib/candidate';
import { resolveIntent } from '../lib/intent';
import type { KakaoPlace } from '../lib/place';

const place = (over: Partial<KakaoPlace>): KakaoPlace => ({
  placeId: '1',
  name: '이름',
  category: '카페',
  address: '주소',
  url: 'http://m/1',
  x: '127.0',
  y: '37.5',
  ...over,
});

const studyIntent = resolveIntent({ mode: 'feeling', freeText: '공부하기 좋은 카페', mood: 'quiet', budget: 'low', duration: '2-3h' });

describe('buildCandidates — dedup', () => {
  it('같은 placeId는 하나로 합친다', () => {
    const out = buildCandidates(
      [place({ placeId: '1', name: 'A' }), place({ placeId: '1', name: 'A' }), place({ placeId: '2', name: 'B' })],
      studyIntent,
    );
    expect(out).toHaveLength(2);
    expect(new Set(out.map(c => c.placeId)).size).toBe(2);
  });
});

describe('buildCandidates — scoring & ranking', () => {
  it('검색 쿼리가 이름에 매칭되는 장소가 더 높게 랭크된다', () => {
    const out = buildCandidates(
      [place({ placeId: '1', name: '평범한 곳', category: '카페' }), place({ placeId: '2', name: '스터디카페 성수', category: '카페' })],
      studyIntent,
    );
    expect(out[0].placeId).toBe('2');
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });

  it('negativeSignal에 걸리는 장소는 감점되어 하위로 밀린다', () => {
    const out = buildCandidates(
      [place({ placeId: '1', name: '조용한 북카페', category: '카페' }), place({ placeId: '2', name: '시끌 술집', category: '술집' })],
      studyIntent,
    );
    expect(out[0].placeId).toBe('1');
    const bad = out.find(c => c.placeId === '2')!;
    expect(bad.score).toBeLessThan(out[0].score);
  });

  it('매칭된 쿼리를 matchedQueries로 노출한다', () => {
    const out = buildCandidates([place({ placeId: '1', name: '북카페 리브로', category: '카페' })], studyIntent);
    expect(out[0].matchedQueries).toContain('북카페');
  });
});

describe('buildCandidates — candidateId & 매핑', () => {
  it('랭크 순서대로 candidate_001부터 부여한다', () => {
    const out: Candidate[] = buildCandidates(
      [place({ placeId: '1', name: '스터디카페' }), place({ placeId: '2', name: '그냥카페' })],
      studyIntent,
    );
    expect(out[0].candidateId).toBe('candidate_001');
    expect(out[1].candidateId).toBe('candidate_002');
  });

  it('url을 mapUrl로 매핑한다', () => {
    const out = buildCandidates([place({ placeId: '1', url: 'http://kakao/xyz' })], studyIntent);
    expect(out[0].mapUrl).toBe('http://kakao/xyz');
  });
});

describe('buildCandidates — limit', () => {
  it('rankedCandidateLimit로 상한을 건다', () => {
    const many = Array.from({ length: 30 }, (_, i) => place({ placeId: String(i), name: `카페${i}` }));
    const out = buildCandidates(many, studyIntent, { rankedCandidateLimit: 20 });
    expect(out).toHaveLength(20);
  });
});
