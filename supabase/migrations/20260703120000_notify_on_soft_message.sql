-- "마음 전하기" 문장을 상대에게 보내도 알림함(notifications)에 아무 것도 남지 않던 문제를 수정한다.
-- notify_on_card/notify_on_reaction과 동일한 패턴으로, soft_messages insert 시 상대방에게
-- 'soft_message' 타입 알림을 자동 생성한다.

ALTER TABLE "public"."notifications"
  DROP CONSTRAINT "notifications_type_check";

ALTER TABLE "public"."notifications"
  ADD CONSTRAINT "notifications_type_check"
  CHECK (("type" = ANY (ARRAY['reaction'::"text", 'new_card'::"text", 'soft_message'::"text"])));

CREATE OR REPLACE FUNCTION "public"."notify_on_soft_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_partner uuid;
begin
  v_partner := public.couple_partner(NEW.couple_id, NEW.user_id);
  if v_partner is null then
    return NEW;
  end if;

  insert into public.notifications (user_id, couple_id, type, payload)
  values (
    v_partner,
    NEW.couple_id,
    'soft_message',
    jsonb_build_object('message', NEW.generated_text, 'soft_message_id', NEW.id)
  );
  return NEW;
end;
$$;

ALTER FUNCTION "public"."notify_on_soft_message"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."notify_on_soft_message"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_soft_message"() TO "service_role";

CREATE OR REPLACE TRIGGER "trg_notify_soft_message"
  AFTER INSERT ON "public"."soft_messages"
  FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_soft_message"();
