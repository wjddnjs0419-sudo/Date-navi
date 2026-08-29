begin;

do $$
begin
  if not exists (
    select 1
    from public.app_version_policies
    where platform = 'ios'
  ) then
    raise exception 'iOS app version policy is missing';
  end if;

  update public.app_version_policies
  set minimum_version = '1.0.1', updated_at = now()
  where platform = 'ios';
end;
$$;

commit;
