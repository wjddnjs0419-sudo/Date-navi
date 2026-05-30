-- 알림 테이블 + 자동 생성 트리거
-- 생성 기준: (1) 상대가 내 카드에 반응  (2) 커플 상대가 AI 데이트 카드 생성
-- soft_messages는 "자동 전송 금지" 원칙(Proposal 11.9)에 따라 알림 제외.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,   -- 알림 받는 사람
  couple_id text references public.date_planner_couples(id) on delete cascade,
  type text not null check (type in ('reaction', 'new_card')),
  payload jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

-- 본인이 받은 알림만 조회/수정/삭제. insert 정책 없음 → 트리거(security definer)만 생성 가능.
drop policy if exists "notifications_select_self" on public.notifications;
create policy "notifications_select_self" on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists "notifications_update_self" on public.notifications;
create policy "notifications_update_self" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "notifications_delete_self" on public.notifications;
create policy "notifications_delete_self" on public.notifications
  for delete using (user_id = auth.uid());

-- 커플에서 행동한 사람(p_actor)의 상대 user_id 반환
create or replace function public.couple_partner(p_couple_id text, p_actor uuid)
returns uuid
language sql
security definer
set search_path = public
as $$
  select case
           when c.owner_user_id = p_actor then c.partner_user_id
           else c.owner_user_id
         end
  from public.date_planner_couples c
  where c.id = p_couple_id;
$$;

-- 트리거 1: 카드 반응 → 카드 만든 사람에게 알림 (자기 카드에 자기가 반응하면 제외)
create or replace function public.notify_on_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
      'condition_tag', NEW.condition_tag,
      'card_title', v_title,
      'card_id', NEW.card_id
    )
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_reaction on public.reactions;
create trigger trg_notify_reaction
  after insert on public.reactions
  for each row execute function public.notify_on_reaction();

-- 트리거 2: AI 데이트 카드 생성 → 커플 상대에게 알림 (직접 추가 카드 source='manual'은 제외)
create or replace function public.notify_on_card()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner uuid;
begin
  if NEW.source is distinct from 'ai' then
    return NEW;
  end if;

  v_partner := public.couple_partner(NEW.couple_id, NEW.created_by);
  if v_partner is null then
    return NEW;
  end if;

  insert into public.notifications (user_id, couple_id, type, payload)
  values (
    v_partner,
    NEW.couple_id,
    'new_card',
    jsonb_build_object('card_title', NEW.title, 'card_id', NEW.id)
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_card on public.date_cards;
create trigger trg_notify_card
  after insert on public.date_cards
  for each row execute function public.notify_on_card();

-- RPC로 외부 노출 차단 (트리거는 owner 권한으로 실행되므로 동작에 영향 없음)
revoke execute on function public.couple_partner(text, uuid) from public, anon, authenticated;
revoke execute on function public.notify_on_reaction() from public, anon, authenticated;
revoke execute on function public.notify_on_card() from public, anon, authenticated;
