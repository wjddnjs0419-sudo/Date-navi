begin;
create table if not exists public.ai_data_processing_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  policy_version text not null default '2026-07-14',
  consented_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_data_processing_consents enable row level security;
create policy "ai_consent_owner_select" on public.ai_data_processing_consents for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.ai_data_processing_consents from authenticated;

create or replace function public.record_ai_data_processing_consent()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise insufficient_privilege using message = 'not authenticated'; end if;
  insert into public.ai_data_processing_consents(user_id) values (auth.uid()) on conflict (user_id) do update set consented_at=now(),updated_at=now(),policy_version='2026-07-14';
end;
$$;
revoke all on function public.record_ai_data_processing_consent() from public;
grant execute on function public.record_ai_data_processing_consent() to authenticated;

create or replace function public.purge_expired_ai_data()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.recommendation_generation_attestations where created_at < now() - interval '30 days';
  delete from public.ai_recommendation_logs where created_at < now() - interval '30 days';
end;
$$;
revoke all on function public.purge_expired_ai_data() from public;
commit;
