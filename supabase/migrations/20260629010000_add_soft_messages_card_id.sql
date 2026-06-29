-- soft_messages 가 어떤 데이트 후보(date_cards)를 보낸 것인지 연결되지 않아,
-- 상대가 받은 제안과 후보/반응을 이어볼 수 없던 문제를 수정한다.
ALTER TABLE "public"."soft_messages"
  ADD COLUMN IF NOT EXISTS "card_id" "text";

ALTER TABLE "public"."soft_messages"
  ADD CONSTRAINT "soft_messages_card_id_fkey"
  FOREIGN KEY ("card_id") REFERENCES "public"."date_cards"("id") ON DELETE CASCADE;
