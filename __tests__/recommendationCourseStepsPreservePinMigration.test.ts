import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('recommendation_course_steps pin 보존 마이그레이션', () => {
  const sql = readFileSync(
    join(__dirname, '../supabase/migrations/20260722110000_recommendation_course_steps_preserve_pin.sql'),
    'utf8',
  );

  it('recommendation_course_steps에 pinned_kakao_place_id/pinned_name 컬럼을 추가한다', () => {
    expect(sql).toContain('add column if not exists pinned_kakao_place_id text');
    expect(sql).toContain('add column if not exists pinned_name text');
  });

  it('세션 최초 저장 시 원본 요청의 courseSteps 핀을 컬럼에 함께 저장한다', () => {
    expect(sql).toContain('create or replace function public.persist_recommendation_session(p_request_id text)');
    const persistFn = sql.slice(
      sql.indexOf('create or replace function public.persist_recommendation_session(p_request_id text)'),
    );
    expect(persistFn).toContain('pinned_kakao_place_id');
    expect(persistFn).toContain("req_step ->> 'pinnedKakaoPlaceId'");
    expect(persistFn).toContain("req_step ->> 'pinnedName'");
  });

  it('뮤테이션 RPC가 courseSteps를 재구성할 때 핀이 있는 스텝은 pinnedKakaoPlaceId/pinnedName을 함께 실어보낸다', () => {
    expect(sql).toContain('create or replace function public.apply_recommendation_session_mutation');
    const mutationFn = sql.slice(
      sql.indexOf('create or replace function public.apply_recommendation_session_mutation'),
    );
    const rebuildQuery = mutationFn.slice(mutationFn.indexOf('into v_request_steps') - 400, mutationFn.indexOf('into v_request_steps') + 50);
    expect(rebuildQuery).toContain('pinned_kakao_place_id is not null');
    expect(rebuildQuery).toContain("'pinnedKakaoPlaceId', pinned_kakao_place_id");
    expect(rebuildQuery).toContain("'pinnedName', pinned_name");
  });

  it('replace 성공 시 교체 대상 스텝의 옛 핀을 지운다(다음 재생성에서 되살아나지 않도록)', () => {
    const mutationFn = sql.slice(
      sql.indexOf('create or replace function public.apply_recommendation_session_mutation'),
    );
    const replaceUpdate = mutationFn.slice(
      mutationFn.indexOf('update public.recommendation_course_steps set current_candidate_id'),
    );
    expect(replaceUpdate.slice(0, 700)).toContain('pinned_kakao_place_id=null, pinned_name=null');
  });

  it('regenerate 시 기존 스텝의 핀을 stepId로 매칭해 새 행에 이어붙인다', () => {
    const mutationFn = sql.slice(
      sql.indexOf('create or replace function public.apply_recommendation_session_mutation'),
    );
    expect(mutationFn).toContain('v_persisted_pins');
    const regenerateBlock = mutationFn.slice(
      mutationFn.indexOf("elsif p_action = 'regenerate'"),
      mutationFn.indexOf("elsif p_action in ('replace', 'add')"),
    );
    expect(regenerateBlock).toContain('v_persisted_pins');
    expect(regenerateBlock).toContain("p ->> 'pinnedKakaoPlaceId'");
  });
});
