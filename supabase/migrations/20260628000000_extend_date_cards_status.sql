-- date_cards.status 에 'confirmed'(확정·예정), 'done'(완료·회고) 단계를 추가한다.
-- 기존 제약은 'active'/'archived'만 허용해 확정 흐름이 CHECK 위반으로 실패했다.
ALTER TABLE "public"."date_cards"
  DROP CONSTRAINT IF EXISTS "date_cards_status_check";

ALTER TABLE "public"."date_cards"
  ADD CONSTRAINT "date_cards_status_check"
  CHECK (("status" = ANY (ARRAY['active'::"text", 'confirmed'::"text", 'done'::"text", 'archived'::"text"])));
