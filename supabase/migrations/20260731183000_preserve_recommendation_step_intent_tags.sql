begin;

-- Mutation RPCs rebuild latest_request.courseSteps from normalized step rows.
-- Those rows do not store intentTags, so the rebuild used to silently broaden
-- ramen/salad/bowling/etc. back to their generic category. Preserve an explicit
-- incoming intentTags property, otherwise recover the same step/category tags
-- from the previous latest request and finally the immutable original request.
create or replace function public.preserve_recommendation_step_intent_tags()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_course_steps jsonb;
begin
  if new.latest_request is null
    or jsonb_typeof(new.latest_request -> 'courseSteps') <> 'array'
  then
    return new;
  end if;

  select coalesce(jsonb_agg(
    case
      when next_step.value ? 'intentTags' then next_step.value
      else next_step.value || coalesce((
        select jsonb_build_object('intentTags', source_step -> 'intentTags')
        from (
          select value as source_step, 1 as priority
          from jsonb_array_elements(coalesce(old.latest_request -> 'courseSteps', '[]'::jsonb))
          union all
          select value as source_step, 2 as priority
          from jsonb_array_elements(coalesce(old.original_request -> 'courseSteps', '[]'::jsonb))
        ) sources
        where source_step ->> 'id' = next_step.value ->> 'id'
          and source_step ->> 'category' = next_step.value ->> 'category'
          and jsonb_typeof(source_step -> 'intentTags') = 'array'
        order by priority
        limit 1
      ), '{}'::jsonb)
    end
    order by next_step.ordinality
  ), '[]'::jsonb)
  into v_course_steps
  from jsonb_array_elements(new.latest_request -> 'courseSteps')
    with ordinality as next_step(value, ordinality);

  new.latest_request := jsonb_set(new.latest_request, '{courseSteps}', v_course_steps);
  return new;
end;
$$;

drop trigger if exists preserve_recommendation_step_intent_tags
  on public.recommendation_sessions;
create trigger preserve_recommendation_step_intent_tags
before update of latest_request on public.recommendation_sessions
for each row
execute function public.preserve_recommendation_step_intent_tags();

-- Re-run existing rows through the trigger so already edited sessions recover
-- their original per-step tags immediately.
update public.recommendation_sessions
set latest_request = latest_request
where latest_request is not null
  and jsonb_typeof(latest_request -> 'courseSteps') = 'array'
  and jsonb_typeof(original_request -> 'courseSteps') = 'array';

commit;
