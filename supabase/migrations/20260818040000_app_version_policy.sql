begin;

create table if not exists public.app_version_policies (
  platform text primary key check (platform in ('ios')),
  minimum_version text not null check (minimum_version ~ '^[0-9]([.][0-9]){0,2}$'),
  store_url text not null check (store_url ~ '^https://apps[.]apple[.]com/'),
  enforced boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.app_version_policies enable row level security;

drop policy if exists app_version_policies_public_read on public.app_version_policies;
create policy app_version_policies_public_read on public.app_version_policies
  for select using (true);

insert into public.app_version_policies (platform, minimum_version, store_url, enforced)
values ('ios', '1.0.1', 'https://apps.apple.com/kr/app/date-navi/id6794355525', false)
on conflict (platform) do nothing;

commit;
