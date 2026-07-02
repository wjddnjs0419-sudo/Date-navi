-- 추억 카드 사진 저장용 컬럼 + 공개 버킷. 경로 규약: {user_id}/<파일명>
alter table public.date_memories
  add column if not exists photo_url text;

insert into storage.buckets (id, name, public)
values ('memories', 'memories', true)
on conflict (id) do update set public = true;

drop policy if exists "memories_read_public" on storage.objects;
create policy "memories_read_public" on storage.objects
  for select to public
  using (bucket_id = 'memories');

drop policy if exists "memories_insert_own" on storage.objects;
create policy "memories_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'memories' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "memories_update_own" on storage.objects;
create policy "memories_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'memories' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'memories' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "memories_delete_own" on storage.objects;
create policy "memories_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'memories' and (storage.foldername(name))[1] = auth.uid()::text);
