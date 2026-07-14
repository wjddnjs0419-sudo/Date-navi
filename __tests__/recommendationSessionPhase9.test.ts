import {
  applyCourseEdit,
  type CourseEditAction,
} from '../lib/recommendation-session-edit';
import {
  recommendDateResponseSchema,
  recommendationRequestSchema,
  validateRecommendDateResponseForRequest,
} from '../shared/recommendation/schemas';
import {
  recommendDateResponseFixture,
  recommendationRequestFixture,
} from './recommendation-session-fixture';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Phase 9 editable recommendation session contracts', () => {
  it('keeps a stable session while a regeneration gets a fresh request identity', () => {
    const request = recommendationRequestSchema.parse({
      ...recommendationRequestFixture,
      requestId: 'req-regeneration-001',
      sessionId: 'req-phase8-001',
      lockedSteps: [{
        stepId: 'step-meal',
        candidateId: 'candidate-meal',
        kakaoPlaceId: 'place-meal',
      }],
      excludedPlaceIds: ['place-cafe'],
    });
    const response = recommendDateResponseSchema.parse({
      ...recommendDateResponseFixture,
      requestId: request.requestId,
      course: {
        ...recommendDateResponseFixture.course,
        requestId: request.requestId,
        sessionId: request.sessionId,
        steps: recommendDateResponseFixture.course.steps.map((step, index) => (
          index === 0 ? { ...step, locked: true } : step
        )),
      },
      cards: recommendDateResponseFixture.cards.map((card) => ({
        ...card,
        requestId: request.requestId,
        sessionId: request.sessionId,
      })),
    });

    expect(validateRecommendDateResponseForRequest(request, response)).toBe(response);
  });

  it('enforces locks, contiguous reordering, min/max, duplicates, and confirmation immutability in the pure reducer', () => {
    const initial = {
      status: 'draft' as const,
      steps: recommendDateResponseFixture.course.steps,
    };
    const lock: CourseEditAction = { type: 'setLock', stepId: 'step-meal', locked: true };
    const locked = applyCourseEdit(initial, lock);
    expect(locked.steps[0].locked).toBe(true);
    expect(() => applyCourseEdit(locked, {
      type: 'replace', stepId: 'step-meal', step: { ...locked.steps[0], candidateId: 'other', kakaoPlaceId: 'other-place' },
    })).toThrow(/locked/);
    expect(() => applyCourseEdit(initial, { type: 'reorder', stepIds: ['step-cafe', 'step-cafe'] })).toThrow(/invalid_order/);
    expect(() => applyCourseEdit(initial, { type: 'delete', stepId: 'step-meal' })).toThrow(/min_steps/);
    const confirmed = applyCourseEdit(initial, { type: 'confirm' });
    expect(() => applyCourseEdit(confirmed, lock)).toThrow(/confirmed/);
  });

  it('uses a definer-only atomic SQL boundary for every owner edit and keeps REST writes revoked', () => {
    const sql = readFileSync(join(__dirname, '../supabase/migrations/20260715090000_editable_recommendation_sessions.sql'), 'utf8').toLowerCase();
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = public, pg_temp');
    expect(sql).toContain('v_owner uuid := auth.uid()');
    expect(sql).toContain('revoke insert, update, delete on public.recommendation_sessions from authenticated');
    expect(sql).toContain('apply_recommendation_session_mutation');
    expect(sql).toContain("p_action in ('replace', 'add')");
    expect(sql).toContain("p_action = 'regenerate'");
    expect(sql).toContain('unique (session_id, step_order) deferrable initially deferred');
    expect(sql).not.toContain('step_order = step_order + 10');
    expect(sql).toContain('confirmed_card_id');
    expect(sql).toContain('insert into public.date_cards');
    expect(sql).toContain("p_action = 'confirm'");
    expect(sql).toContain("cards = (select coalesce(jsonb_agg(jsonb_set(card, '{steps}', v_card_steps))");
    expect(sql).toContain("'{lockedsteps}', v_locked_steps");
    expect(sql).toContain("- 'lockedsteps'");
  });

  it('consumes an Edge-issued attestation so neither persistence nor edits trust client response/place facts', () => {
    const sql = readFileSync(join(__dirname, '../supabase/migrations/20260715090000_editable_recommendation_sessions.sql'), 'utf8').toLowerCase();
    const repository = readFileSync(join(__dirname, '../lib/recommendation-session-repository.ts'), 'utf8');
    const generating = readFileSync(join(__dirname, '../app/mode-flow/generating.tsx'), 'utf8');

    expect(sql).toContain('persist_recommendation_session(p_request_id text)');
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = public, pg_temp');
    expect(sql).toContain('from public.recommendation_generation_attestations');
    expect(sql).toContain('for update');
    expect(sql).toContain('consumed_at is null');
    expect(sql).toContain('set consumed_at = now()');
    expect(sql).toContain("p_payload ->> 'attestationrequestid'");
    expect(sql).toContain("v_attestation.request_json ->> 'baserequestid'");
    expect(sql).toContain('revoke all on function public.persist_recommendation_session(jsonb, jsonb) from authenticated');
    expect(sql).not.toContain("p_payload -> 'response'");
    expect(sql).not.toContain("p_payload -> 'request'");
    expect(sql).not.toContain("v_new_step := p_payload -> 'step'");
    expect(repository).toContain('persist(requestId: string)');
    expect(repository).toContain('p_request_id: requestId');
    expect(repository).not.toContain('p_response: response');
    expect(generating).toContain('persistRecommendationSession(request.requestId)');
    expect(generating).not.toContain('persistRecommendationSession(request, response)');
  });

  it('rejects an attested course that changes the normalized draft shape or omits current locks', () => {
    const sql = readFileSync(join(__dirname, '../supabase/migrations/20260715090000_editable_recommendation_sessions.sql'), 'utf8').toLowerCase();

    expect(sql).toContain("jsonb_array_elements(coalesce(v_request -> 'lockedsteps', '[]'::jsonb)) requested_lock");
    expect(sql).toContain("next ->> 'locked' = 'true'");
    expect(sql).toContain("current_step.category");
    expect(sql).toContain("current_step.label");
    expect(sql).toContain("p_action in ('replace', 'add')");
    expect(sql).toContain("p_action = 'add'");
    expect(sql).toContain("new_step ->> 'category' <> 'ai_decide'");
    expect(sql).toContain("v_original_candidate is not distinct from v_new_step ->> 'candidateid'");
  });

  it('requires persisted locks as an attested-request subset while permitting temporary replacement/addition locks', () => {
    const sql = readFileSync(join(__dirname, '../supabase/migrations/20260715090000_editable_recommendation_sessions.sql'), 'utf8').toLowerCase();

    expect(sql).toContain('where current_lock.session_id = p_session_id and current_lock.locked');
    expect(sql).not.toContain("jsonb_array_length(coalesce(v_request -> 'lockedsteps', '[]'::jsonb)) <>");
  });

  it('rejects a temporary lock unless it names an exact current DB step tuple', () => {
    const sql = readFileSync(join(__dirname, '../supabase/migrations/20260715090000_editable_recommendation_sessions.sql'), 'utf8').toLowerCase();

    expect(sql).toContain("select 1 from jsonb_array_elements(coalesce(v_request -> 'lockedsteps', '[]'::jsonb)) requested_lock\n      where not exists (\n        select 1 from public.recommendation_course_steps current_step\n        where current_step.session_id = p_session_id\n          and current_step.step_id = requested_lock ->> 'stepid'\n          and current_step.current_candidate_id = requested_lock ->> 'candidateid'\n          and current_step.current_kakao_place_id = requested_lock ->> 'kakaoplaceid'\n      )");
  });

  it('locks every non-target tuple for a targeted replacement request', () => {
    const source = readFileSync(join(__dirname, '../app/mode-flow/course-result.tsx'), 'utf8');

    expect(source).toContain('targetStepId ? step.stepId !== targetStepId : step.locked');
    expect(source).toContain('targetStepId ? step.stepId === targetStepId : !step.locked');
  });

  it('does not persist temporary replacement locks as user-managed draft locks', () => {
    const sql = readFileSync(join(__dirname, '../supabase/migrations/20260715090000_editable_recommendation_sessions.sql'), 'utf8').toLowerCase();

    expect(sql).toContain('v_persisted_locked_steps jsonb');
    expect(sql).toContain('jsonb_array_elements(v_persisted_locked_steps) persisted_lock');
  });

  it('requires attested retained steps to preserve DB order and appends an added step at the final order', () => {
    const sql = readFileSync(join(__dirname, '../supabase/migrations/20260715090000_editable_recommendation_sessions.sql'), 'utf8').toLowerCase();

    expect(sql).toContain('with ordinality requested_step(value, ordinality)');
    expect(sql).toContain('requested_step.ordinality = current_step.step_order');
    expect(sql).toContain("(next ->> 'order')::smallint = current_step.step_order");
    expect(sql).toContain("(v_new_step ->> 'order')::smallint <> (");
  });

  it('wires ID-only result controls to server-validated replacement/addition and confirmation', () => {
    const source = readFileSync(join(__dirname, '../app/mode-flow/course-result.tsx'), 'utf8');
    expect(source).toContain("testID=\"course-replace-step\"");
    expect(source).toContain("testID=\"course-add-step\"");
    expect(source).toContain("testID=\"course-delete-step\"");
    expect(source).toContain('sessionId: snapshot.sessionId');
    expect(source).toContain("mutateRecommendationSession(snapshot.sessionId, 'regenerate'");
    expect(source).toContain("mutateRecommendationSession(snapshot.sessionId, 'add'");
    expect(source).toContain("applyMutation('confirm', {})");
    expect(source).not.toContain("supabase.from('date_cards').insert");
  });
});
