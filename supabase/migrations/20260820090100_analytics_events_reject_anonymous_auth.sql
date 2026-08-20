-- An anonymous Supabase Auth user has the authenticated database role, so the
-- INSERT policy must reject that JWT claim in addition to checking auth.uid().
drop policy if exists analytics_events_authenticated_insert on public.analytics_events;
create policy analytics_events_authenticated_insert
  on public.analytics_events
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
    and (auth.jwt() ->> 'is_anonymous') is distinct from 'true'
  );
