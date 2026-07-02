-- 카드(date_cards) 없이 카메라 버튼으로 바로 남기는 자유 추억 지원.
alter table public.date_memories
  alter column card_id drop not null;

alter table public.date_memories
  add column if not exists title text;
