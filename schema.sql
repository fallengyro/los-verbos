-- Índice Verbal — Supabase schema
--
-- In your Supabase project: Database → SQL Editor → New query, paste this
-- whole file, and click Run. It creates the "verbs" and "words" tables and
-- the row-level security policies that keep each signed-in user's rows
-- private to them (nobody, including you as project owner, can query
-- another user's rows through the public API — RLS enforces this at the
-- database level). Every statement is safe to run again later (create-if-
-- not-exists tables/indexes, drop-then-recreate policies), so re-running
-- this whole file after a future update won't error on things that already
-- exist.

create extension if not exists pgcrypto;

create table if not exists public.verbs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  infinitive text not null,
  definition text default '',
  type text default '-ar',
  irregular boolean not null default false,
  pattern text default '',
  reflexive boolean not null default false,
  forms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.verbs enable row level security;

-- Each policy checks the row's user_id against the calling user's own id
-- (auth.uid()), so a signed-in user can only ever see or touch their own rows.
-- "drop ... if exists" first makes this whole file safe to run again.
drop policy if exists "select own verbs" on public.verbs;
create policy "select own verbs" on public.verbs
  for select using (auth.uid() = user_id);

drop policy if exists "insert own verbs" on public.verbs;
create policy "insert own verbs" on public.verbs
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own verbs" on public.verbs;
create policy "update own verbs" on public.verbs
  for update using (auth.uid() = user_id);

drop policy if exists "delete own verbs" on public.verbs;
create policy "delete own verbs" on public.verbs
  for delete using (auth.uid() = user_id);

create index if not exists verbs_user_id_idx on public.verbs (user_id);

-- ---------------------------------------------------------------------------
-- Vocabulario — general words (nouns, adjectives, adverbs...), kept separate
-- from verb conjugations. Same private-per-user pattern as "verbs" above.
-- ---------------------------------------------------------------------------

create table if not exists public.words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  word text not null,
  definition text default '',
  part_of_speech text default 'sustantivo',
  gender text default '',
  created_at timestamptz not null default now()
);

alter table public.words enable row level security;

drop policy if exists "select own words" on public.words;
create policy "select own words" on public.words
  for select using (auth.uid() = user_id);

drop policy if exists "insert own words" on public.words;
create policy "insert own words" on public.words
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own words" on public.words;
create policy "update own words" on public.words
  for update using (auth.uid() = user_id);

drop policy if exists "delete own words" on public.words;
create policy "delete own words" on public.words
  for delete using (auth.uid() = user_id);

create index if not exists words_user_id_idx on public.words (user_id);