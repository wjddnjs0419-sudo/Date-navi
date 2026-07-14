alter table public.date_cards
  add column if not exists recommendation_request_id text,
  add column if not exists recommendation_session_id text,
  add column if not exists kakao_place_id text;

comment on column public.date_cards.recommendation_request_id is
  'Old/manual cards remain null. This request ID identifies one generation attempt.';

comment on column public.date_cards.recommendation_session_id is
  'Old/manual cards remain null. This session ID groups regenerations when available.';

comment on column public.date_cards.kakao_place_id is
  'Old/manual cards remain null. This top-level Kakao ID belongs to the card''s single selected place; course place IDs remain in steps[].kakaoPlaceId.';
