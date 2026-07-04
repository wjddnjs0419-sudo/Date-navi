-- 카카오 로컬 실제 장소를 카드에 저장하기 위한 컬럼.
-- location 입력 시에만 채워지므로 모두 nullable.
alter table "public"."date_cards"
  add column if not exists "place_name" text,
  add column if not exists "place_address" text,
  add column if not exists "map_url" text;
