begin;

-- Provider-scoped identity is additive. Existing Kakao columns remain in place
-- until all clients, session mutations, history, and ledger consumers use the
-- neutral tuple. This migration deliberately creates no canonical place entity.
alter table public.recommendation_course_steps
  add column if not exists original_place_provider text,
  add column if not exists original_provider_place_id text,
  add column if not exists current_place_provider text,
  add column if not exists current_provider_place_id text;

update public.recommendation_course_steps
  set original_place_provider = 'kakao',
      original_provider_place_id = original_kakao_place_id
  where original_place_provider is null
    and original_provider_place_id is null;

update public.recommendation_course_steps
  set current_place_provider = 'kakao',
      current_provider_place_id = current_kakao_place_id
  where current_place_provider is null
    and current_provider_place_id is null;

alter table public.recommendation_course_steps
  add constraint recommendation_course_steps_original_provider_pair_check
    check ((original_place_provider is null) = (original_provider_place_id is null)) not valid,
  add constraint recommendation_course_steps_current_provider_pair_check
    check ((current_place_provider is null) = (current_provider_place_id is null)) not valid,
  add constraint recommendation_course_steps_original_provider_check
    check (original_place_provider is null or original_place_provider in ('kakao', 'naver')) not valid,
  add constraint recommendation_course_steps_current_provider_check
    check (current_place_provider is null or current_place_provider in ('kakao', 'naver')) not valid;

alter table public.recommendation_course_steps
  validate constraint recommendation_course_steps_original_provider_pair_check;
alter table public.recommendation_course_steps
  validate constraint recommendation_course_steps_current_provider_pair_check;
alter table public.recommendation_course_steps
  validate constraint recommendation_course_steps_original_provider_check;
alter table public.recommendation_course_steps
  validate constraint recommendation_course_steps_current_provider_check;

create unique index if not exists recommendation_course_steps_current_provider_place_identity_key
  on public.recommendation_course_steps (session_id, current_place_provider, current_provider_place_id)
  where current_place_provider is not null and current_provider_place_id is not null;

-- The trigger preserves existing Kakao-only writers while allowing the next
-- RPC migration to write Naver tuples. No cross-provider merge is attempted.
create or replace function public.sync_recommendation_course_step_provider_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.original_place_provider is null and new.original_kakao_place_id is not null then
    new.original_place_provider := 'kakao';
    new.original_provider_place_id := new.original_kakao_place_id;
  end if;
  if new.current_place_provider is null and new.current_kakao_place_id is not null then
    new.current_place_provider := 'kakao';
    new.current_provider_place_id := new.current_kakao_place_id;
  end if;
  if new.original_place_provider = 'kakao' then
    new.original_kakao_place_id := new.original_provider_place_id;
  elsif new.original_place_provider = 'naver' then
    new.original_kakao_place_id := null;
  end if;
  if new.current_place_provider = 'kakao' then
    new.current_kakao_place_id := new.current_provider_place_id;
  elsif new.current_place_provider = 'naver' then
    new.current_kakao_place_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists recommendation_course_steps_provider_identity_sync
  on public.recommendation_course_steps;
create trigger recommendation_course_steps_provider_identity_sync
  before insert or update on public.recommendation_course_steps
  for each row execute function public.sync_recommendation_course_step_provider_identity();

comment on column public.recommendation_course_steps.current_place_provider is
  'Provider-scoped recommendation identity. kakao and naver are separate identities; this is not a canonical entity ID.';
comment on column public.recommendation_course_steps.current_provider_place_id is
  'Provider-local stable place ID paired with current_place_provider. Cross-provider matching is request-scoped only.';

commit;
