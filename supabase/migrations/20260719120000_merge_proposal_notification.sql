-- 알림 통합: 카드를 '보내기'(soft_messages insert)할 때만 카드 정보 + 문구를 담은
-- 단일 '데이트 제안' 알림(new_card)을 만든다. 카드 생성만으론 알림을 보내지 않는다.
--
-- 기존: 카드 생성 → new_card 알림, 보내기 → soft_message 알림 (2개)
-- 변경: 보내기 → new_card 알림 1개(문구 포함). soft_message 타입은 legacy 데이터용으로 유지.

-- 1) 카드 생성 시 알림 트리거 제거 (만들기만 하면 상대에게 알림 안 감)
DROP TRIGGER IF EXISTS "trg_notify_card" ON "public"."date_cards";

-- 2) soft_messages insert 시, 보낸 카드 제목과 문구를 담은 new_card(제안) 알림 생성
CREATE OR REPLACE FUNCTION "public"."notify_on_soft_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_partner uuid;
  v_title   text;
begin
  v_partner := public.couple_partner(NEW.couple_id, NEW.user_id);
  if v_partner is null then
    return NEW;
  end if;

  select dc.title into v_title
  from public.date_cards dc
  where dc.id = NEW.card_id;

  insert into public.notifications (user_id, couple_id, type, payload)
  values (
    v_partner,
    NEW.couple_id,
    'new_card',
    jsonb_build_object(
      'card_id', NEW.card_id,
      'card_title', v_title,
      'message', NEW.generated_text
    )
  );
  return NEW;
end;
$$;

ALTER FUNCTION "public"."notify_on_soft_message"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."notify_on_soft_message"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_soft_message"() TO "service_role";
