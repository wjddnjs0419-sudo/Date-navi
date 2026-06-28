-- date_cards 에 UPDATE 정책이 없어 확정(status='confirmed')·완료(status='done')
-- 업데이트가 RLS 에 의해 조용히 0행 처리되던 문제를 수정한다.
-- 커플 멤버(소유자/파트너)는 자기 커플의 카드를 수정할 수 있다. (SELECT 정책과 동일 범위)
CREATE POLICY "date_cards_update" ON "public"."date_cards"
  FOR UPDATE TO "public"
  USING ("couple_id" IN (
    SELECT "date_planner_couples"."id" FROM "public"."date_planner_couples"
    WHERE (("date_planner_couples"."owner_user_id" = "auth"."uid"())
        OR ("date_planner_couples"."partner_user_id" = "auth"."uid"()))
  ))
  WITH CHECK ("couple_id" IN (
    SELECT "date_planner_couples"."id" FROM "public"."date_planner_couples"
    WHERE (("date_planner_couples"."owner_user_id" = "auth"."uid"())
        OR ("date_planner_couples"."partner_user_id" = "auth"."uid"()))
  ));
