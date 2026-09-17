-- Índice Verbal — Supabase schema
--
-- One-time setup. In your Supabase project: Database → SQL Editor → New query,
-- paste this whole file, and click Run. It creates the "verbs" table and the
-- row-level security policies that keep each signed-in user's list private to
-- them (nobody, including you as project owner, can query another user's
-- rows through the public API — RLS enforces this at the database level).

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
create policy "select own verbs" on public.verbs
  for select using (auth.uid() = user_id);

create policy "insert own verbs" on public.verbs
  for insert with check (auth.uid() = user_id);

create policy "update own verbs" on public.verbs
  for update using (auth.uid() = user_id);

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

create policy "select own words" on public.words
  for select using (auth.uid() = user_id);

create policy "insert own words" on public.words
  for insert with check (auth.uid() = user_id);

create policy "update own words" on public.words
  for update using (auth.uid() = user_id);

create policy "delete own words" on public.words
  for delete using (auth.uid() = user_id);

create index if not exists words_user_id_idx on public.words (user_id);
