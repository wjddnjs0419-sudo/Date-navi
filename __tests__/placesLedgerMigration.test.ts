import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('places 원장 마이그레이션', () => {
  const root = join(__dirname, '..');
  const migration = readFileSync(join(root, 'supabase/migrations/20260727110000_places_ledger.sql'), 'utf8');
  const canonical = readFileSync(join(root, 'docs/supabase-schema.sql'), 'utf8');

  it.each([['migration', () => migration], ['canonical', () => canonical]])(
    '%s: 원장은 추정·관측을 별도 컬럼으로 갖고 서비스 롤 전용이다', (_l, sql) => {
      expect(sql()).toContain('create table if not exists public.places');
      expect(sql()).toContain('kakao_place_id text primary key');
      for (const col of ['estimated_min_krw', 'estimated_max_krw', 'estimated_at', 'estimate_model',
        'observed_min_krw', 'observed_max_krw', 'observed_sample_count', 'first_seen_at', 'last_seen_at']) {
        expect(sql()).toContain(col);
      }
      expect(sql()).toContain('revoke all on public.places from authenticated');
    });

  it('place_feedback.price_level은 1~3 nullable', () => {
    expect(migration).toContain('add column if not exists price_level smallint');
    expect(migration).toContain('price_level between 1 and 3');
  });

  it('피드백 RPC는 커플 멤버를 허용하고 price_level·satisfaction을 받는다', () => {
    expect(migration).toContain('drop function if exists public.record_recommendation_place_feedback(text,text,boolean,text[])');
    expect(migration).toContain('p_price_level smallint default null');
    expect(migration).toContain('p_satisfaction boolean default null');
    expect(migration).toContain('public.is_couple_member(v_session.couple_id)');
  });

  it('만족도는 무응답(null)과 부정(false)을 구별하는 별도 컬럼이다', () => {
    expect(migration).toContain('add column if not exists satisfaction boolean');
    // revisit 태그로 역추적하면 "말 안 함"이 "별로였음"으로 집계된다.
    expect(migration).toContain('satisfaction=excluded.satisfaction');
  });

  it('관측 구간은 보간 백분위를 쓰지 않는다 — place-price.ts와 같은 표본 선택 규칙', () => {
    expect(migration).not.toContain('percentile_cont');
    expect(migration).toContain("lowers[floor((array_length(lowers, 1) - 1) * 0.75)::integer + 1]");
    expect(migration).toContain("uppers[ceil((array_length(uppers, 1) - 1) * 0.25)::integer + 1]");
  });

  it('관측 재계산 실패는 피드백 저장을 실패시키지 않는다', () => {
    expect(migration).toMatch(/perform public\.recompute_place_observed_price[\s\S]*?exception when others then null/);
  });

  it('리뷰 화면용 장소 조회 RPC가 커플 멤버 검사와 함께 정의된다', () => {
    expect(migration).toContain('create or replace function public.get_course_places_for_review(p_card_id text)');
    expect(migration).toContain("status = 'confirmed'");
  });

  it('ai_recommendation_logs action 제약에 estimate_place_price가 추가된다', () => {
    expect(migration).toContain("'estimate_place_price'");
  });

  it('실 DB 실측 액션 목록(5종)과 코드가 이미 쓰는 parse_step_intents를 모두 유지한다', () => {
    for (const action of ['cards', 'feeling_select', 'course_select', 'recommend_date_select',
      'replacement_select', 'parse_step_intents']) {
      expect(migration).toContain(`'${action}'`);
    }
  });
});
