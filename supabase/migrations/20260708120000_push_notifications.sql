-- 실제 푸시 알림(APNs) 발송 인프라: push_tokens 테이블 + notifications insert 시 자동 발송 트리거.

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expo_push_token text not null,
  platform text not null default 'ios',
  updated_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_upsert_self" on public.push_tokens;
create policy "push_tokens_upsert_self" on public.push_tokens
  for insert with check (user_id = auth.uid());

drop policy if exists "push_tokens_update_self" on public.push_tokens;
create policy "push_tokens_update_self" on public.push_tokens
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "push_tokens_select_self" on public.push_tokens;
create policy "push_tokens_select_self" on public.push_tokens
  for select using (user_id = auth.uid());

create or replace function public.trigger_send_push() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare
  v_secret text;
  v_function_url text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'internal_push_secret';
  select decrypted_secret into v_function_url
  from vault.decrypted_secrets where name = 'send_push_function_url';

  -- Vault 시크릿이 아직 등록 안 됐으면(로컬 개발 등) 조용히 스킵 — insert 자체를 막지 않는다.
  if v_secret is null or v_function_url is null then
    return NEW;
  end if;

  perform net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Secret', v_secret
    ),
    body := jsonb_build_object(
      'notification_id', NEW.id,
      'user_id', NEW.user_id,
      'type', NEW.type,
      'payload', NEW.payload
    )
  );
  return NEW;
end;
$$;

alter function public.trigger_send_push() owner to postgres;
revoke all on function public.trigger_send_push() from public;
grant all on function public.trigger_send_push() to service_role;

drop trigger if exists trg_send_push on public.notifications;
create trigger trg_send_push
  after insert on public.notifications
  for each row execute function public.trigger_send_push();
