-- date_cards 에 DELETE 정책이 없어 후보 카드 삭제가 RLS 에 의해 조용히 0행 처리되던 문제를 수정한다.
-- 커플 멤버(소유자/파트너)는 자기 커플의 카드를 삭제할 수 있다. (UPDATE/SELECT 정책과 동일 범위)
CREATE POLICY "date_cards_delete" ON "public"."date_cards"
  FOR DELETE TO "public"
  USING ("couple_id" IN (
    SELECT "date_planner_couples"."id" FROM "public"."date_planner_couples"
    WHERE (("date_planner_couples"."owner_user_id" = "auth"."uid"())
        OR ("date_planner_couples"."partner_user_id" = "auth"."uid"()))
  ));
