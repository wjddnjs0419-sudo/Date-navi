create or replace function public.enforce_personal_step_intent_tag_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || new.category, 0));

  if exists (
    select 1
    from public.personal_step_intent_tags
    where user_id = new.user_id
      and category = new.category
      and normalized_tag = new.normalized_tag
  ) then
    return new;
  end if;

  select count(*) into v_count
  from public.personal_step_intent_tags
  where user_id = new.user_id
    and category = new.category;

  if v_count >= 20 then
    raise exception 'personal_step_intent_tag_limit_reached'
      using errcode = 'check_violation',
        detail = 'A category can contain at most 20 personal keywords.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_personal_step_intent_tag_limit() from public, anon, authenticated;

drop trigger if exists personal_step_intent_tag_limit on public.personal_step_intent_tags;
create trigger personal_step_intent_tag_limit
before insert or update of user_id, category, normalized_tag
on public.personal_step_intent_tags
for each row
execute function public.enforce_personal_step_intent_tag_limit();
