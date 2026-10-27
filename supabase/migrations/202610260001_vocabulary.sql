-- Prepared for a future Supabase project. This migration is not run by the static site.
begin;

create or replace function public.vocab_normalize_word(p_word text)
returns text language sql immutable strict set search_path = ''
as $$ select lower(normalize(btrim(regexp_replace(p_word, '\s+', ' ', 'g')), NFKC)) $$;

create table public.words (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null,
  word text not null check (char_length(word) between 1 and 160),
  aliases text[] not null default '{}',
  forgotten boolean not null default false,
  forget_count integer not null default 0 check (forget_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, key),
  unique (id, owner_id),
  check (key <> '' and key = public.vocab_normalize_word(word)),
  check (cardinality(aliases) <= 50)
);

create table public.word_contents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  word_id uuid not null,
  fingerprint text not null,
  pos text not null default '' check (char_length(pos) <= 100),
  meaning text not null default '' check (char_length(meaning) <= 30000),
  phrases text[] not null default '{}' check (cardinality(phrases) <= 200),
  examples text[] not null default '{}' check (cardinality(examples) <= 200),
  raw text not null default '' check (char_length(raw) <= 30000),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  created_at timestamptz not null default now(),
  foreign key (word_id, owner_id) references public.words(id, owner_id) on delete cascade,
  unique (word_id, fingerprint)
);

create index words_owner_forgotten on public.words(owner_id, forgotten);
create index word_contents_owner_word on public.word_contents(owner_id, word_id);
alter table public.words enable row level security;
alter table public.word_contents enable row level security;

create policy words_owner on public.words for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy word_contents_owner on public.word_contents for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke all on public.words, public.word_contents from anon, authenticated;
grant select, insert, update, delete on public.words, public.word_contents to authenticated;

-- A helper for bounded user-provided string arrays. No external dictionary is consulted.
create or replace function public.vocab_string_array(p_value jsonb, p_max_length integer default 4000)
returns text[] language plpgsql immutable set search_path = '' as $$
declare item jsonb; result text[] := '{}'; value text;
begin
  if p_value is null then return result; end if;
  if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 200 then
    raise exception 'Expected an array of at most 200 strings' using errcode = '22023';
  end if;
  for item in select * from jsonb_array_elements(p_value) loop
    if jsonb_typeof(item) <> 'string' then raise exception 'Expected string item' using errcode = '22023'; end if;
    value := btrim(item #>> '{}');
    if char_length(value) > p_max_length then raise exception 'String item is too long' using errcode = '22023'; end if;
    if value <> '' and not value = any(result) then result := array_append(result, value); end if;
  end loop;
  return result;
end $$;

create or replace function public.vocab_merge_sources(p_old jsonb, p_new jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(item order by item->>'id'), '[]'::jsonb)
  from (
    select distinct on (item->>'id') item
    from jsonb_array_elements(coalesce(p_old, '[]'::jsonb) || coalesce(p_new, '[]'::jsonb))
      with ordinality as s(item, position)
    order by item->>'id', position desc
  ) merged
$$;

-- One RPC call is one transaction. A bad entry rolls back the entire batch.
-- Conflict updates preserve forgotten/count; importing again never resets study state.
create or replace function public.vocab_import(p_entries jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner uuid := auth.uid(); entry jsonb; stored_word uuid; display_word text; normalized text;
  entry_aliases text[]; entry_phrases text[]; entry_examples text[]; entry_pos text;
  entry_meaning text; entry_raw text; signature text; source_id text; source_label text;
  source_quote text; source jsonb; new_words integer := 0; new_contents integer := 0; inserted uuid;
begin
  if owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 5000
     or octet_length(p_entries::text) > 8388608 then
    raise exception 'Import expects at most 5000 entries and 8 MB' using errcode = '22023';
  end if;
  for entry in select * from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry->'word') <> 'string' then
      raise exception 'Entry requires a word string' using errcode = '22023';
    end if;
    display_word := btrim(regexp_replace(entry->>'word', '\s+', ' ', 'g'));
    normalized := public.vocab_normalize_word(display_word);
    if normalized = '' or char_length(display_word) > 200 then raise exception 'Invalid word' using errcode = '22023'; end if;
    entry_aliases := public.vocab_string_array(entry->'aliases', 200);
    entry_phrases := public.vocab_string_array(entry->'phrases');
    entry_examples := public.vocab_string_array(entry->'examples');
    if exists (select 1 from jsonb_each(entry) e where e.key in ('pos','meaning','raw','sourceId','sourceLabel','quote') and jsonb_typeof(e.value) <> 'string') then
      raise exception 'Content fields must be strings' using errcode = '22023';
    end if;
    entry_pos := btrim(coalesce(entry->>'pos', ''));
    entry_meaning := btrim(coalesce(entry->>'meaning', ''));
    entry_raw := btrim(coalesce(entry->>'raw', ''));
    if char_length(entry_pos) > 200 or char_length(entry_meaning) > 20000 or char_length(entry_raw) > 30000 then
      raise exception 'Content is too long' using errcode = '22023';
    end if;
    signature := encode(sha256(convert_to(jsonb_build_object('pos',entry_pos,'meaning',entry_meaning,'phrases',entry_phrases,'examples',entry_examples,'raw',entry_raw)::text, 'UTF8')), 'hex');
    source_id := coalesce(nullif(btrim(entry->>'sourceId'), ''), 'import:' || signature);
    source_label := coalesce(nullif(btrim(entry->>'sourceLabel'), ''), '导入');
    source_quote := coalesce(entry->>'quote', '');
    if char_length(source_id) > 3000 or char_length(source_label) > 500 or char_length(source_quote) > 20000 then
      raise exception 'Source is too long' using errcode = '22023';
    end if;
    source := jsonb_build_array(jsonb_build_object('id',source_id,'label',source_label,'quote',source_quote,'collected',true));

    inserted := null;
    insert into public.words(owner_id, key, word, aliases) values (owner, normalized, display_word, entry_aliases)
      on conflict (owner_id, key) do nothing returning id into inserted;
    if inserted is not null then new_words := new_words + 1; end if;
    -- The update acquires a row lock; concurrent collectors merge aliases and content safely.
    update public.words w set
      aliases = (select coalesce(array_agg(distinct a), '{}') from unnest(w.aliases || entry_aliases) a),
      updated_at = now()
      where w.owner_id = owner and w.key = normalized returning w.id into stored_word;
    if stored_word is null then raise exception 'Word no longer available; retry import' using errcode = '40001'; end if;

    inserted := null;
    insert into public.word_contents(owner_id, word_id, fingerprint, pos, meaning, phrases, examples, raw, sources)
      values (owner, stored_word, signature, entry_pos, entry_meaning, entry_phrases, entry_examples, entry_raw, source)
      on conflict (word_id, fingerprint) do nothing returning id into inserted;
    if inserted is not null then new_contents := new_contents + 1; end if;
    update public.word_contents c set sources = public.vocab_merge_sources(c.sources, source)
      where c.owner_id = owner and c.word_id = stored_word and c.fingerprint = signature;
  end loop;
  return jsonb_build_object('addedWords', new_words, 'addedContents', new_contents);
end $$;

create or replace function public.vocab_list()
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',w.id,'key',w.key,'word',w.word,'aliases',w.aliases,'forgotten',w.forgotten,
    'forgetCount',w.forget_count,'createdAt',w.created_at,
    'contents',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'wordId',c.word_id,'pos',c.pos,'meaning',c.meaning,'phrases',c.phrases,
      'examples',c.examples,'raw',c.raw,'sources',c.sources) order by c.created_at,c.id)
      from public.word_contents c where c.word_id = w.id and c.owner_id = auth.uid()), '[]'::jsonb)
    ) order by w.created_at,w.id) from public.words w where w.owner_id = auth.uid()), '[]'::jsonb);
end $$;

create or replace function public.vocab_set_forgotten(p_word_id uuid, p_forgotten boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_forgotten is null then raise exception 'forgotten must be boolean' using errcode = '22023'; end if;
  update public.words set forgotten = p_forgotten,
    forget_count = forget_count + case when p_forgotten then 1 else 0 end, updated_at = now()
    where id = p_word_id and owner_id = auth.uid();
  get diagnostics changed = row_count;
  return changed > 0;
end $$;

create or replace function public.vocab_uncollect(p_source_id text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_source_id is null or p_source_id = '' or char_length(p_source_id) > 3000 then raise exception 'Invalid source id' using errcode = '22023'; end if;
  update public.word_contents c set sources = (
    select jsonb_agg(case when s.item->>'id' = p_source_id then s.item || '{"collected":false}'::jsonb else s.item end order by s.position)
    from jsonb_array_elements(c.sources) with ordinality s(item, position)
  ) where c.owner_id = auth.uid() and exists (
    select 1 from jsonb_array_elements(c.sources) s where s->>'id' = p_source_id and s->>'collected' = 'true'
  );
  get diagnostics changed = row_count;
  return changed;
end $$;

create or replace function public.vocab_delete(p_word_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  delete from public.words where id = p_word_id and owner_id = auth.uid();
  get diagnostics changed = row_count;
  return changed > 0;
end $$;

revoke all on function public.vocab_normalize_word(text), public.vocab_string_array(jsonb,integer), public.vocab_merge_sources(jsonb,jsonb), public.vocab_import(jsonb), public.vocab_list(), public.vocab_set_forgotten(uuid,boolean), public.vocab_uncollect(text), public.vocab_delete(uuid) from public, anon;
grant execute on function public.vocab_normalize_word(text), public.vocab_string_array(jsonb,integer), public.vocab_merge_sources(jsonb,jsonb), public.vocab_import(jsonb), public.vocab_list(), public.vocab_set_forgotten(uuid,boolean), public.vocab_uncollect(text), public.vocab_delete(uuid) to authenticated;

commit;
