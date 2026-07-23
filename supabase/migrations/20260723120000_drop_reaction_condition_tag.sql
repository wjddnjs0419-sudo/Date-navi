-- "오늘은 부담돼 → 조건 선택 → 재생성" 흐름을 앱에서 걷어내면서 남은 DB 흔적을 정리한다.
-- 앱은 더 이상 condition_tag를 읽지도 쓰지도 않고, 알림 화면도 payload의 이 필드를 읽은 적이 없다.
--
-- 순서가 중요하다: notify_on_reaction 트리거가 NEW.condition_tag를 참조하므로,
-- 함수를 먼저 고치지 않고 컬럼을 지우면 반응 저장(INSERT/UPDATE)이 통째로 실패한다.

-- 1) 트리거 함수에서 condition_tag만 빼고 나머지 payload는 그대로 둔다.
create or replace function public.notify_on_reaction()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_couple_id text;
  v_creator   uuid;
  v_title     text;
begin
  select dc.couple_id, dc.created_by, dc.title
    into v_couple_id, v_creator, v_title
  from public.date_cards dc
  where dc.id = NEW.card_id;

  if v_creator is null or v_creator = NEW.user_id then
    return NEW;
  end if;

  insert into public.notifications (user_id, couple_id, type, payload)
  values (
    v_creator,
    v_couple_id,
    'reaction',
    jsonb_build_object(
      'reaction_type', NEW.reaction_type,
      'card_title', v_title,
      'card_id', NEW.card_id
    )
  );
  return NEW;
end;
$function$;

-- 2) 허용값 CHECK 제약 제거. (2026-07-08에 UI에서만 뺐던 budget_adjust도 여기서 함께 사라진다.)
alter table public.reactions
  drop constraint if exists reactions_condition_tag_check;

-- 3) 컬럼 제거. 적용 시점 기준 값이 들어 있는 행은 0건이라 데이터 손실이 없다.
alter table public.reactions
  drop column if exists condition_tag;
