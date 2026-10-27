-- Atomic, per-user vocabulary sync. Apply after 202610260001_vocabulary.sql.
-- The public API receives a verified user JWT; no caller-supplied owner id is trusted.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.vocab_sync_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);
create table public.vocab_sync_operations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  revision bigint not null check (revision > 0),
  created_at timestamptz not null default now(),
  primary key (owner_id, operation_id)
);
alter table public.vocab_sync_state enable row level security;
alter table public.vocab_sync_operations enable row level security;
revoke all on public.vocab_sync_state, public.vocab_sync_operations from public, anon, authenticated;

-- Reads remain available through the user's RLS policy. All writes go through
-- version-checked RPCs, so a direct table request cannot bypass the revision.
revoke insert, update, delete on public.words, public.word_contents from authenticated;
revoke execute on function public.vocab_import(jsonb), public.vocab_set_forgotten(uuid,boolean),
  public.vocab_uncollect(text), public.vocab_delete(uuid) from authenticated;

-- Replaces one complete word, retaining its UUID by normalized key and retaining
-- unchanged content UUIDs by fingerprint. Missing contents and false collection
-- flags are intentional and must not be merged back from an older device.
create function private.vocab_put_word(p_owner uuid, p_item jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  display_word text; normalized text; aliases text[]; forgotten boolean;
  forget_count integer; created_at timestamptz; stored_word uuid;
  item jsonb; source jsonb; sources jsonb; source_ids text[];
  pos text; meaning text; raw text; phrases text[]; examples text[];
  signature text; signatures text[] := '{}'; source_id text; source_label text; source_quote text;
begin
  if jsonb_typeof(p_item) <> 'object' or jsonb_typeof(p_item->'word') <> 'string' then
    raise exception 'Word object required' using errcode = '22023';
  end if;
  display_word := btrim(regexp_replace(p_item->>'word', '\s+', ' ', 'g'));
  normalized := public.vocab_normalize_word(display_word);
  if normalized = '' or char_length(display_word) > 160 or display_word ~ '[[:cntrl:]]' then
    raise exception 'Invalid word' using errcode = '22023';
  end if;
  if p_item ? 'key' and (jsonb_typeof(p_item->'key') <> 'string' or p_item->>'key' <> normalized) then
    raise exception 'Word key does not match word' using errcode = '22023';
  end if;
  if jsonb_typeof(p_item->'aliases') <> 'array' or jsonb_array_length(p_item->'aliases') > 50 then
    raise exception 'Invalid aliases' using errcode = '22023';
  end if;
  aliases := public.vocab_string_array(p_item->'aliases', 160);
  aliases := array(select a from unnest(aliases) a where public.vocab_normalize_word(a) <> normalized);
  if jsonb_typeof(p_item->'forgotten') <> 'boolean'
     or jsonb_typeof(p_item->'forgetCount') <> 'number'
     or (p_item->>'forgetCount') !~ '^[0-9]{1,10}$'
     or (p_item->>'forgetCount')::numeric > 1000000000 then
    raise exception 'Invalid learning state' using errcode = '22023';
  end if;
  forgotten := (p_item->>'forgotten')::boolean;
  forget_count := (p_item->>'forgetCount')::integer;
  if jsonb_typeof(p_item->'createdAt') <> 'string' then
    raise exception 'Invalid creation date' using errcode = '22023';
  end if;
  created_at := (p_item->>'createdAt')::timestamptz;
  if jsonb_typeof(p_item->'contents') <> 'array'
     or jsonb_array_length(p_item->'contents') > 150000 then
    raise exception 'Invalid contents' using errcode = '22023';
  end if;

  insert into public.words(owner_id, key, word, aliases, forgotten, forget_count, created_at)
    values (p_owner, normalized, display_word, aliases, forgotten, forget_count, created_at)
    on conflict (owner_id, key) do update set
      word = excluded.word, aliases = excluded.aliases,
      forgotten = excluded.forgotten, forget_count = excluded.forget_count,
      created_at = excluded.created_at, updated_at = now()
    returning id into stored_word;

  for item in select * from jsonb_array_elements(p_item->'contents') loop
    if jsonb_typeof(item) <> 'object'
       or jsonb_typeof(item->'pos') <> 'string'
       or jsonb_typeof(item->'meaning') <> 'string'
       or jsonb_typeof(item->'raw') <> 'string'
       or jsonb_typeof(item->'phrases') <> 'array'
       or jsonb_typeof(item->'examples') <> 'array'
       or jsonb_typeof(item->'sources') <> 'array'
       or jsonb_array_length(item->'sources') > 500 then
      raise exception 'Invalid content object' using errcode = '22023';
    end if;
    pos := btrim(item->>'pos'); meaning := btrim(item->>'meaning'); raw := btrim(item->>'raw');
    phrases := public.vocab_string_array(item->'phrases', 5000);
    examples := public.vocab_string_array(item->'examples', 5000);
    if char_length(pos) > 100 or char_length(meaning) > 30000 or char_length(raw) > 30000 then
      raise exception 'Content is too long' using errcode = '22023';
    end if;
    signature := encode(sha256(convert_to(jsonb_build_object(
      'pos', pos, 'meaning', meaning,
      'phrases', (select coalesce(array_agg(value order by value), '{}'::text[]) from unnest(phrases) value),
      'examples', (select coalesce(array_agg(value order by value), '{}'::text[]) from unnest(examples) value),
      'raw', raw)::text, 'UTF8')), 'hex');
    if signature = any(signatures) then
      raise exception 'Duplicate content in word' using errcode = '22023';
    end if;
    signatures := array_append(signatures, signature);
    sources := '[]'::jsonb; source_ids := '{}';
    for source in select * from jsonb_array_elements(item->'sources') loop
      if jsonb_typeof(source) <> 'object' or jsonb_typeof(source->'id') <> 'string'
         or jsonb_typeof(source->'label') <> 'string'
         or jsonb_typeof(source->'quote') <> 'string'
         or jsonb_typeof(source->'collected') <> 'boolean' then
        raise exception 'Invalid source' using errcode = '22023';
      end if;
      source_id := btrim(source->>'id');
      source_label := btrim(source->>'label');
      source_quote := btrim(source->>'quote');
      if source_id = '' or char_length(source_id) > 1000
         or char_length(source_label) > 500 or char_length(source_quote) > 30000
         or source_id = any(source_ids) then
        raise exception 'Invalid or duplicate source id' using errcode = '22023';
      end if;
      source_ids := array_append(source_ids, source_id);
      sources := sources || jsonb_build_array(jsonb_build_object(
        'id', source_id, 'label', source_label, 'quote', source_quote,
        'collected', (source->>'collected')::boolean));
    end loop;
    insert into public.word_contents(owner_id, word_id, fingerprint, pos, meaning, phrases, examples, raw, sources)
      values (p_owner, stored_word, signature, pos, meaning, phrases, examples, raw, sources)
      on conflict (word_id, fingerprint) do update set
        pos = excluded.pos, meaning = excluded.meaning, phrases = excluded.phrases,
        examples = excluded.examples, raw = excluded.raw, sources = excluded.sources;
  end loop;
  delete from public.word_contents
    where owner_id = p_owner and word_id = stored_word and not (fingerprint = any(signatures));
  return stored_word;
end $$;
revoke all on function private.vocab_put_word(uuid,jsonb) from public, anon, authenticated;

create function public.vocab_sync_head()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner uuid := auth.uid(); current_revision bigint;
begin
  if owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select revision into current_revision from public.vocab_sync_state where owner_id = owner;
  return jsonb_build_object('revision', coalesce(current_revision, 0));
end $$;

create function public.vocab_sync_snapshot()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner uuid := auth.uid(); current_revision bigint; rows jsonb;
begin
  if owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  insert into public.vocab_sync_state(owner_id) values (owner) on conflict do nothing;
  -- Keep revision and words from the same committed state.
  select revision into current_revision from public.vocab_sync_state
    where owner_id = owner for share;
  rows := public.vocab_list();
  return jsonb_build_object('revision', current_revision,
    'backup', jsonb_build_object('format', 'ielts-vocabulary', 'version', 1, 'words', rows));
end $$;

create function public.vocab_sync_mutate(p_base_revision bigint, p_operation_id uuid, p_operations jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := auth.uid(); current_revision bigint; prior_revision bigint; next_revision bigint;
  operation jsonb; kind text; normalized text; new_key text; new_word text; source_id text;
  changed integer;
begin
  if owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_base_revision is null or p_base_revision < 0 or p_operation_id is null
     or jsonb_typeof(p_operations) <> 'array' or jsonb_array_length(p_operations) = 0
     or jsonb_array_length(p_operations) > 500 or octet_length(p_operations::text) > 8388608 then
    raise exception 'Invalid sync operation batch' using errcode = '22023';
  end if;
  insert into public.vocab_sync_state(owner_id) values (owner) on conflict do nothing;
  select revision into current_revision from public.vocab_sync_state where owner_id = owner for update;
  select revision into prior_revision from public.vocab_sync_operations
    where owner_id = owner and operation_id = p_operation_id;
  if prior_revision is not null then return jsonb_build_object('revision', prior_revision); end if;
  if current_revision <> p_base_revision then
    raise exception 'Revision conflict' using errcode = '40001';
  end if;
  for operation in select * from jsonb_array_elements(p_operations) loop
    kind := operation->>'type';
    if jsonb_typeof(operation) <> 'object' then
      raise exception 'Invalid operation' using errcode = '22023';
    elsif kind = 'upsert' then
      perform private.vocab_put_word(owner, operation->'word');
    elsif kind = 'rename' then
      if jsonb_typeof(operation->'oldKey') <> 'string'
         or jsonb_typeof(operation->'word') <> 'object'
         or jsonb_typeof(operation->'word'->'word') <> 'string' then
        raise exception 'Invalid rename' using errcode = '22023';
      end if;
      normalized := public.vocab_normalize_word(operation->>'oldKey');
      new_word := btrim(regexp_replace(operation->'word'->>'word', '\s+', ' ', 'g'));
      new_key := public.vocab_normalize_word(new_word);
      if normalized = '' or new_key = '' or char_length(new_word) > 160
         or new_word ~ '[[:cntrl:]]' then
        raise exception 'Invalid rename' using errcode = '22023';
      end if;
      if normalized <> new_key and exists (
        select 1 from public.words where owner_id = owner and key = new_key) then
        raise exception 'Target word already exists' using errcode = '22023';
      end if;
      update public.words set key = new_key, word = new_word, updated_at = now()
        where owner_id = owner and key = normalized;
      get diagnostics changed = row_count;
      if changed = 0 then raise exception 'Word to rename no longer exists' using errcode = '22023'; end if;
      perform private.vocab_put_word(owner, operation->'word');
    elsif kind = 'delete' then
      if jsonb_typeof(operation->'key') <> 'string' then
        raise exception 'Invalid deletion key' using errcode = '22023';
      end if;
      normalized := public.vocab_normalize_word(operation->>'key');
      if normalized = '' then raise exception 'Invalid deletion key' using errcode = '22023'; end if;
      delete from public.words where owner_id = owner and key = normalized;
    elsif kind = 'forget' then
      if jsonb_typeof(operation->'key') <> 'string'
         or jsonb_typeof(operation->'forgotten') <> 'boolean' then
        raise exception 'Invalid forgetting operation' using errcode = '22023';
      end if;
      normalized := public.vocab_normalize_word(operation->>'key');
      if normalized = '' then raise exception 'Invalid forgetting key' using errcode = '22023'; end if;
      update public.words set forgotten = (operation->>'forgotten')::boolean,
        forget_count = least(1000000000, forget_count + case when (operation->>'forgotten')::boolean then 1 else 0 end),
        updated_at = now() where owner_id = owner and key = normalized;
      get diagnostics changed = row_count;
      if changed = 0 then raise exception 'Word no longer exists' using errcode = '22023'; end if;
    elsif kind = 'uncollect' then
      if jsonb_typeof(operation->'sourceId') <> 'string' then
        raise exception 'Invalid source id' using errcode = '22023';
      end if;
      source_id := btrim(operation->>'sourceId');
      if source_id = '' or char_length(source_id) > 1000 then
        raise exception 'Invalid source id' using errcode = '22023';
      end if;
      update public.word_contents c set sources = (
        select jsonb_agg(case when s.item->>'id' = source_id
          then s.item || '{"collected":false}'::jsonb else s.item end order by s.position)
        from jsonb_array_elements(c.sources) with ordinality s(item, position)
      ) where c.owner_id = owner and exists (
        select 1 from jsonb_array_elements(c.sources) s
        where s->>'id' = source_id and s->>'collected' = 'true');
    else
      raise exception 'Unknown sync operation' using errcode = '22023';
    end if;
  end loop;
  if (select count(*) from public.words where owner_id = owner) > 50000
     or (select count(*) from public.word_contents where owner_id = owner) > 150000 then
    raise exception 'Vocabulary limit exceeded' using errcode = '22023';
  end if;
  update public.vocab_sync_state set revision = revision + 1, updated_at = now()
    where owner_id = owner returning revision into next_revision;
  insert into public.vocab_sync_operations(owner_id, operation_id, revision)
    values (owner, p_operation_id, next_revision);
  return jsonb_build_object('revision', next_revision);
end $$;

-- Used only for first migration into an empty cloud account. Later backup imports
-- should use word-level upserts so they cannot silently discard remote changes.
create function public.vocab_sync_replace(p_base_revision bigint, p_operation_id uuid, p_backup jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := auth.uid(); current_revision bigint; prior_revision bigint; next_revision bigint;
  item jsonb; word_key text; keys text[] := '{}'; total_contents integer := 0;
begin
  if owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_base_revision is null or p_base_revision < 0 or p_operation_id is null
     or jsonb_typeof(p_backup) <> 'object' or p_backup->>'format' <> 'ielts-vocabulary'
     or p_backup->>'version' <> '1' or jsonb_typeof(p_backup->'words') <> 'array'
     or jsonb_array_length(p_backup->'words') > 50000
     or octet_length(p_backup::text) > 8388608 then
    raise exception 'Invalid vocabulary backup' using errcode = '22023';
  end if;
  insert into public.vocab_sync_state(owner_id) values (owner) on conflict do nothing;
  select revision into current_revision from public.vocab_sync_state where owner_id = owner for update;
  select revision into prior_revision from public.vocab_sync_operations
    where owner_id = owner and operation_id = p_operation_id;
  if prior_revision is not null then return jsonb_build_object('revision', prior_revision); end if;
  if current_revision <> p_base_revision then
    raise exception 'Revision conflict' using errcode = '40001';
  end if;
  if current_revision <> 0 or exists (select 1 from public.words where owner_id = owner) then
    raise exception 'Full replace is only for an empty cloud account' using errcode = '22023';
  end if;
  for item in select * from jsonb_array_elements(p_backup->'words') loop
    if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'word') <> 'string'
       or jsonb_typeof(item->'contents') <> 'array' then
      raise exception 'Invalid word in backup' using errcode = '22023';
    end if;
    word_key := public.vocab_normalize_word(item->>'word');
    if word_key = any(keys) then raise exception 'Duplicate word in backup' using errcode = '22023'; end if;
    keys := array_append(keys, word_key);
    total_contents := total_contents + jsonb_array_length(item->'contents');
    if total_contents > 150000 then raise exception 'Too many contents' using errcode = '22023'; end if;
    perform private.vocab_put_word(owner, item);
  end loop;
  update public.vocab_sync_state set revision = revision + 1, updated_at = now()
    where owner_id = owner returning revision into next_revision;
  insert into public.vocab_sync_operations(owner_id, operation_id, revision)
    values (owner, p_operation_id, next_revision);
  return jsonb_build_object('revision', next_revision);
end $$;

revoke all on function public.vocab_sync_head(), public.vocab_sync_snapshot(),
  public.vocab_sync_mutate(bigint,uuid,jsonb), public.vocab_sync_replace(bigint,uuid,jsonb)
  from public, anon;
grant execute on function public.vocab_sync_head(), public.vocab_sync_snapshot(),
  public.vocab_sync_mutate(bigint,uuid,jsonb), public.vocab_sync_replace(bigint,uuid,jsonb)
  to authenticated;

commit;
