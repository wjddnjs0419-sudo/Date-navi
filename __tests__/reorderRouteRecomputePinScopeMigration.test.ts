import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('reorder route 재계산 + regenerate 핀 유지 조건 마이그레이션', () => {
  const sql = readFileSync(
    join(__dirname, '../supabase/migrations/20260723090000_reorder_route_recompute_and_pin_scope.sql'),
    'utf8',
  );

  it('클라이언트와 동일한 haversine(R=6371000) SQL 헬퍼를 정의한다', () => {
    expect(sql).toContain('create or replace function public.recommendation_route_haversine_meters');
    expect(sql).toContain('6371000');
    expect(sql).toMatch(/asin\(sqrt\(/);
  });

  it('세션 route 재계산 함수가 인접거리·총거리·도보판정·relaxedConstraints를 함께 갱신한다', () => {
    expect(sql).toContain('create or replace function public.recompute_recommendation_session_route');
    expect(sql).toContain("'{route,adjacentDistanceMeters}'");
    expect(sql).toContain("'{route,totalDistanceMeters}'");
    expect(sql).toContain("'{route,walkingLimitAssessment}'");
    expect(sql).toContain("'maxWalkingMinutes'");
    expect(sql).toContain("'{relaxedConstraints}'");
  });

  it('뮤테이션 RPC가 reorder/delete 후 route를 재계산한다', () => {
    const mutationFn = sql.slice(
      sql.indexOf('create or replace function public.apply_recommendation_session_mutation'),
    );
    expect(mutationFn).toMatch(/p_action in \('reorder',\s*'delete'\)[\s\S]{0,120}recompute_recommendation_session_route\(p_session_id\)/);
  });

  it('regenerate는 새 장소가 핀 장소와 일치할 때만 핀을 이어붙인다(핀 이탈 시 해제)', () => {
    const mutationFn = sql.slice(
      sql.indexOf('create or replace function public.apply_recommendation_session_mutation'),
    );
    const regenerateBlock = mutationFn.slice(
      mutationFn.indexOf("elsif p_action = 'regenerate'"),
      mutationFn.indexOf("elsif p_action in ('replace', 'add')"),
    );
    expect(regenerateBlock).toMatch(/p ->> 'pinnedKakaoPlaceId' = v_new_step ->> 'kakaoPlaceId'/);
  });

  it('이미 어긋난 기존 세션들의 route를 일괄 복구한다', () => {
    expect(sql).toMatch(/perform public\.recompute_recommendation_session_route\((r|s)\.id\)/);
  });
});
