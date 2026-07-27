// 리뷰/추억 수정 두 화면이 공유하는 장소별 등급 상태. 화면은 렌더만 하고
// 조회·유도 기본값·저장은 전부 여기 모은다(두 화면이 어긋나 한쪽만 갱신되는 사고 방지).
import { useCallback, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { PriceLevel } from '../shared/recommendation/place-price';
import {
  PlaceSatisfaction, initialPlaceSatisfactions, togglePlaceSatisfaction, placeFeedbackRpcArgs,
} from './placeReview';
import type { Rating } from './ratingFeedback';

export type CoursePlace = {
  session_id: string;
  step_id: string;
  step_order: number;
  place_name: string;
  kakao_place_id: string | null;
};

type ExistingFeedbackRow = {
  step_id: string;
  price_level: number | null;
  satisfaction: boolean | null;
};

export function usePlaceFeedback() {
  const [places, setPlaces] = useState<CoursePlace[]>([]);
  const [satisfactions, setSatisfactions] = useState<Record<string, PlaceSatisfaction>>({});
  const [prices, setPrices] = useState<Record<string, PriceLevel>>({});
  // 사용자가 직접 만졌거나 이미 저장돼 있던 스텝 — 별점 유도 기본값이 덮지 않는다.
  const touchedRef = useRef<Set<string>>(new Set());

  const load = useCallback(async (cardId: string | undefined) => {
    if (!cardId) { setPlaces([]); return; }
    // rpc는 실패해도 reject하지 않는다. error를 열어보지 않으면 수집 0건이 무증상이 된다.
    const { data, error } = await supabase.rpc('get_course_places_for_review', { p_card_id: cardId });
    if (error) console.warn('[review] course_places lookup failed', error);
    const rows = Array.isArray(data) ? (data as CoursePlace[]) : [];
    setPlaces(rows);
    if (rows.length === 0) return;

    const { data: existing, error: existingError } = await supabase
      .from('place_feedback')
      .select('step_id, price_level, satisfaction')
      .in('step_id', rows.map((row) => row.step_id));
    if (existingError) { console.warn('[review] place_feedback lookup failed', existingError); return; }

    const nextSatisfactions: Record<string, PlaceSatisfaction> = {};
    const nextPrices: Record<string, PriceLevel> = {};
    for (const row of (existing ?? []) as ExistingFeedbackRow[]) {
      if (row.satisfaction !== null) {
        nextSatisfactions[row.step_id] = row.satisfaction ? 'good' : 'bad';
        touchedRef.current.add(row.step_id);
      }
      if (row.price_level !== null) {
        nextPrices[row.step_id] = row.price_level as PriceLevel;
        touchedRef.current.add(row.step_id);
      }
    }
    setSatisfactions(nextSatisfactions);
    setPrices(nextPrices);
  }, []);

  const applyRatingDefaults = useCallback((rating: number) => {
    setSatisfactions((prev) => {
      // 만진 스텝은 유도 대상에서 아예 제외한다. prev를 덮어쓰는 방식이면
      // "해제(=무응답)"가 undefined라 좋아요로 되살아난다.
      const derived = initialPlaceSatisfactions(
        rating as Rating,
        places.map((place) => place.step_id).filter((stepId) => !touchedRef.current.has(stepId)),
      );
      const kept = Object.fromEntries(
        [...touchedRef.current]
          .filter((stepId) => prev[stepId] !== undefined)
          .map((stepId) => [stepId, prev[stepId]]),
      );
      return { ...derived, ...kept };
    });
  }, [places]);

  const tapSatisfaction = useCallback((stepId: string, tapped: PlaceSatisfaction) => {
    touchedRef.current.add(stepId);
    setSatisfactions((prev) => {
      const next = { ...prev };
      const value = togglePlaceSatisfaction(prev[stepId], tapped);
      if (value === undefined) delete next[stepId];
      else next[stepId] = value;
      return next;
    });
  }, []);

  const tapPrice = useCallback((stepId: string, level: PriceLevel) => {
    touchedRef.current.add(stepId);
    setPrices((prev) => {
      const next = { ...prev };
      if (prev[stepId] === level) delete next[stepId];
      else next[stepId] = level;
      return next;
    });
  }, []);

  // 장소별 등급은 선택 사항 — 실패해도 별점 저장 흐름을 막지 않는다(로그로만 드러낸다).
  const submit = useCallback(async () => {
    const calls = places
      .map((entry) => placeFeedbackRpcArgs({
        sessionId: entry.session_id,
        stepId: entry.step_id,
        satisfaction: satisfactions[entry.step_id],
        priceLevel: prices[entry.step_id] ?? null,
      }))
      .filter((args): args is NonNullable<typeof args> => args !== null);
    const results = await Promise.allSettled(calls.map((args) =>
      supabase.rpc('record_recommendation_place_feedback', args)));
    for (const result of results) {
      const failure = result.status === 'rejected' ? result.reason : result.value?.error;
      if (failure) console.warn('[review] place_feedback rpc failed', failure);
    }
  }, [places, satisfactions, prices]);

  return { places, satisfactions, prices, load, applyRatingDefaults, tapSatisfaction, tapPrice, submit };
}
