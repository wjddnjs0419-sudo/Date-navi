-- DateMate QA reset script
--
-- Run this in Supabase Dashboard > SQL Editor for the DateMate project.
-- WARNING: This deletes all DateMate app data and all Auth users in this Supabase project.
-- Use only before QA when you intentionally want everyone to sign up again.
--
-- After running this, also clear the app session on test devices:
-- 1. If the app is open, use Settings > Log out.
-- 2. If an old session still appears, uninstall/reinstall the dev app or clear Expo Go app data.

begin;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    -- Mobile MVP tables
    'analytics_events',
    'date_memories',
    'soft_messages',
    'reactions',
    'date_cards',
    'user_preferences',

    -- Earlier web MVP tables
    'date_planner_ai_requests',
    'date_planner_option_preferences',
    'date_planner_comments',
    'date_planner_options',
    'date_planner_proposals',
    'date_planner_profiles',
    'date_planner_couples'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('truncate table public.%I restart identity cascade', table_name);
    end if;
  end loop;
end $$;

-- Removes sign-up accounts from Supabase Auth.
-- Public app rows are already truncated above; FK cascades cover any future dependent rows.
delete from auth.users;

commit;
