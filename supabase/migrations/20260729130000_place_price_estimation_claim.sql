begin;

alter table public.places
  add column if not exists price_estimation_status text not null default 'pending'
    check (price_estimation_status in ('pending', 'claimed', 'estimated')),
  add column if not exists price_estimation_claim_id uuid,
  add column if not exists price_estimation_claimed_at timestamptz;

create or replace function public.claim_place_price_estimation(
  p_kakao_place_ids text[], p_claim_id uuid, p_now timestamptz default now()
)
returns table (kakao_place_id text)
language sql security definer set search_path = public, pg_temp as $$
  update public.places
  set price_estimation_status = 'claimed',
      price_estimation_claim_id = p_claim_id,
      price_estimation_claimed_at = p_now,
      updated_at = p_now
  where kakao_place_id = any(p_kakao_place_ids)
    and estimated_at is null
    and (price_estimation_status = 'pending'
      or price_estimation_claimed_at <= p_now - interval '2 minutes')
  returning public.places.kakao_place_id;
$$;

create or replace function public.complete_place_price_estimation(
  p_kakao_place_id text, p_claim_id uuid, p_min_krw integer, p_max_krw integer,
  p_model text, p_now timestamptz default now()
)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_min_krw < 0 or p_max_krw < p_min_krw or nullif(btrim(p_model), '') is null then
    raise invalid_parameter_value using message = 'invalid_place_price_estimate';
  end if;
  update public.places
  set estimated_min_krw = p_min_krw,
      estimated_max_krw = p_max_krw,
      estimated_at = p_now,
      estimate_model = p_model,
      price_estimation_status = 'estimated',
      price_estimation_claim_id = null,
      price_estimation_claimed_at = null,
      updated_at = p_now
  where kakao_place_id = p_kakao_place_id
    and price_estimation_status = 'claimed'
    and price_estimation_claim_id = p_claim_id;
  return found;
end;
$$;

create or replace function public.release_place_price_estimation_claim(
  p_kakao_place_id text, p_claim_id uuid, p_now timestamptz default now()
)
returns boolean language sql security definer set search_path = public, pg_temp as $$
  with released as (
    update public.places
    set price_estimation_status = 'pending',
        price_estimation_claim_id = null,
        price_estimation_claimed_at = null,
        updated_at = p_now
    where kakao_place_id = p_kakao_place_id
      and price_estimation_status = 'claimed'
      and price_estimation_claim_id = p_claim_id
    returning 1
  )
  select exists(select 1 from released);
$$;

revoke all on function public.claim_place_price_estimation(text[],uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.complete_place_price_estimation(text,uuid,integer,integer,text,timestamptz) from public, anon, authenticated;
revoke all on function public.release_place_price_estimation_claim(text,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.claim_place_price_estimation(text[],uuid,timestamptz) to service_role;
grant execute on function public.complete_place_price_estimation(text,uuid,integer,integer,text,timestamptz) to service_role;
grant execute on function public.release_place_price_estimation_claim(text,uuid,timestamptz) to service_role;

commit;
