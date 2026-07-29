create table if not exists public.personal_step_intent_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('meal', 'cafe', 'drinks', 'activity', 'culture', 'walk')),
  tag text not null check (char_length(btrim(tag)) between 1 and 40),
  normalized_tag text not null,
  created_at timestamptz not null default now(),
  unique (user_id, category, normalized_tag)
);

create table if not exists public.personal_hidden_step_intent_defaults (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('meal', 'cafe', 'drinks', 'activity', 'culture', 'walk')),
  tag text not null check (char_length(btrim(tag)) between 1 and 40),
  normalized_tag text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, category, normalized_tag)
);

alter table public.personal_step_intent_tags enable row level security;
alter table public.personal_hidden_step_intent_defaults enable row level security;

drop policy if exists "personal_step_intent_tags_owner" on public.personal_step_intent_tags;
create policy "personal_step_intent_tags_owner"
on public.personal_step_intent_tags
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "personal_hidden_step_intent_defaults_owner" on public.personal_hidden_step_intent_defaults;
create policy "personal_hidden_step_intent_defaults_owner"
on public.personal_hidden_step_intent_defaults
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'personal_step_intent_tags'
  ) then
    alter publication supabase_realtime add table public.personal_step_intent_tags;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'personal_hidden_step_intent_defaults'
  ) then
    alter publication supabase_realtime add table public.personal_hidden_step_intent_defaults;
  end if;
end;
$$;
