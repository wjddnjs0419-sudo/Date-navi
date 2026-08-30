alter function public.enforce_personal_step_intent_tag_limit() security invoker;
alter function public.enforce_personal_step_intent_tag_limit() set search_path = '';

revoke all on function public.enforce_personal_step_intent_tag_limit() from public, anon, authenticated;
