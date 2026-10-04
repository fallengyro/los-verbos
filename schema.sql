-- voseá — Supabase schema
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
  transitivity text not null default 'transitivo',
  preposicion text default '',
  auxiliar boolean not null default false,
  gustar_like boolean not null default false,
  known boolean not null default false,
  known_forms jsonb not null default '{}'::jsonb,
  forms_en jsonb not null default '{}'::jsonb,
  forms_en_sig text not null default '',
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
-- Irregularity tags — replaces the old plain "irregular" true/false column
-- with one of four kinds, so "type" (ending class: -ar/-er/-ir) and
-- "irregularity" (what KIND of irregular, if any) no longer both try to
-- express "irregular" and collide in the UI. "reflexive" stays its own
-- separate flag, unaffected by this.
--   regular            — follows the standard -ar/-er/-ir pattern throughout
--   cambio de raíz     — regular endings, but the stressed stem vowel
--                        changes (e→ie, o→ue, e→i) in the "boot" forms
--   irregular (yo)     — only the "yo" form breaks the pattern; other
--                        persons stay regular (or nearly so)
--   irregular (total)  — doesn't fit a single clean pattern across most
--                        tenses (ser, ir, haber, and their compounds)
-- ---------------------------------------------------------------------------

alter table public.verbs add column if not exists irregularity text not null default 'regular';

-- Backfill the correct tag for the 42 starter verbs, since the old boolean
-- can't tell us *which* kind of irregular a verb was. This updates by
-- infinitive, so it corrects rows from the starter seed regardless of when
-- they were added; a custom verb you've added yourself that isn't in this
-- list keeps the 'regular' default until you set it from the edit form.
update public.verbs set irregularity = 'irregular (total)'
  where infinitive in ('ser', 'ir', 'irse', 'haber', 'ver');
update public.verbs set irregularity = 'cambio de raíz'
  where infinitive in ('tener', 'poder', 'decir', 'venir', 'querer', 'seguir', 'encontrar', 'llover', 'nevar');
update public.verbs set irregularity = 'irregular (yo)'
  where infinitive in ('estar', 'hacer', 'saber', 'conocer', 'nacer', 'dar', 'poner', 'parecer');
-- everything else (including spelling-only changes like llegar/practicar/creer,
-- and the participle-only escribir) defaults to 'regular', which is already
-- what the column default gives them.

-- "type" used to have a 4th value, "irregular", as a catch-all for verbs
-- that didn't fit -ar/-er/-ir cleanly — but every Spanish infinitive really
-- does end in one of those three, so this straightens out the 4 starter
-- verbs that had been tagged that way.
update public.verbs set type = '-er' where infinitive in ('ser', 'haber');
update public.verbs set type = '-ir' where infinitive in ('ir', 'irse');

alter table public.verbs drop column if exists irregular;

-- ---------------------------------------------------------------------------
-- New tenses/moods: pretérito imperfecto de subjuntivo ("subjPasado", e.g.
-- "hablara") and the affirmative imperative ("imperativo": vos/usted/
-- nosotros/ustedes, e.g. "hablá"). Both live as extra keys inside the
-- existing "forms" jsonb column, so no new columns are needed — this just
-- merges the correct values into each of the 42 starter verbs you already
-- have saved, matched by infinitive. "haber" gets a subjPasado but no
-- imperativo (there is no natural everyday command form for it), and the
-- impersonal weather verbs ("llover", "nevar") get only the one impersonal
-- subjPasado form, since you cannot command the weather. A custom verb
-- you added yourself keeps working exactly as before; it just will not
-- have these two new rows filled in until you add them from the edit form.
-- ---------------------------------------------------------------------------

update public.verbs set forms = forms || '{"subjPasado":{"yo":"fuera","vos":"fueras","el":"fuera","nosotros":"fuéramos","ellos":"fueran"},"imperativo":{"vos":"sé","usted":"sea","nosotros":"seamos","ustedes":"sean"}}'::jsonb where infinitive = 'ser';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"estuviera","vos":"estuvieras","el":"estuviera","nosotros":"estuviéramos","ellos":"estuvieran"},"imperativo":{"vos":"está","usted":"esté","nosotros":"estemos","ustedes":"estén"}}'::jsonb where infinitive = 'estar';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"tuviera","vos":"tuvieras","el":"tuviera","nosotros":"tuviéramos","ellos":"tuvieran"},"imperativo":{"vos":"tené","usted":"tenga","nosotros":"tengamos","ustedes":"tengan"}}'::jsonb where infinitive = 'tener';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"hiciera","vos":"hicieras","el":"hiciera","nosotros":"hiciéramos","ellos":"hicieran"},"imperativo":{"vos":"hacé","usted":"haga","nosotros":"hagamos","ustedes":"hagan"}}'::jsonb where infinitive = 'hacer';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"pudiera","vos":"pudieras","el":"pudiera","nosotros":"pudiéramos","ellos":"pudieran"},"imperativo":{"vos":"podé","usted":"pueda","nosotros":"podamos","ustedes":"puedan"}}'::jsonb where infinitive = 'poder';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"dijera","vos":"dijeras","el":"dijera","nosotros":"dijéramos","ellos":"dijeran"},"imperativo":{"vos":"decí","usted":"diga","nosotros":"digamos","ustedes":"digan"}}'::jsonb where infinitive = 'decir';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"fuera","vos":"fueras","el":"fuera","nosotros":"fuéramos","ellos":"fueran"},"imperativo":{"vos":"andá","usted":"vaya","nosotros":"vamos","ustedes":"vayan"}}'::jsonb where infinitive = 'ir';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"viniera","vos":"vinieras","el":"viniera","nosotros":"viniéramos","ellos":"vinieran"},"imperativo":{"vos":"vení","usted":"venga","nosotros":"vengamos","ustedes":"vengan"}}'::jsonb where infinitive = 'venir';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"quisiera","vos":"quisieras","el":"quisiera","nosotros":"quisiéramos","ellos":"quisieran"},"imperativo":{"vos":"queré","usted":"quiera","nosotros":"queramos","ustedes":"quieran"}}'::jsonb where infinitive = 'querer';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"me levantara","vos":"te levantaras","el":"se levantara","nosotros":"nos levantáramos","ellos":"se levantaran"},"imperativo":{"vos":"levantate","usted":"se levante","nosotros":"nos levantemos","ustedes":"se levanten"}}'::jsonb where infinitive = 'levantarse';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"hubiera","vos":"hubieras","el":"hubiera","nosotros":"hubiéramos","ellos":"hubieran"}}'::jsonb where infinitive = 'haber';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"corriera","vos":"corrieras","el":"corriera","nosotros":"corriéramos","ellos":"corrieran"},"imperativo":{"vos":"corré","usted":"corra","nosotros":"corramos","ustedes":"corran"}}'::jsonb where infinitive = 'correr';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"viera","vos":"vieras","el":"viera","nosotros":"viéramos","ellos":"vieran"},"imperativo":{"vos":"ve","usted":"vea","nosotros":"veamos","ustedes":"vean"}}'::jsonb where infinitive = 'ver';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"subiera","vos":"subieras","el":"subiera","nosotros":"subiéramos","ellos":"subieran"},"imperativo":{"vos":"subí","usted":"suba","nosotros":"subamos","ustedes":"suban"}}'::jsonb where infinitive = 'subir';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"supiera","vos":"supieras","el":"supiera","nosotros":"supiéramos","ellos":"supieran"},"imperativo":{"vos":"sabé","usted":"sepa","nosotros":"sepamos","ustedes":"sepan"}}'::jsonb where infinitive = 'saber';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"conociera","vos":"conocieras","el":"conociera","nosotros":"conociéramos","ellos":"conocieran"},"imperativo":{"vos":"conocé","usted":"conozca","nosotros":"conozcamos","ustedes":"conozcan"}}'::jsonb where infinitive = 'conocer';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"usara","vos":"usaras","el":"usara","nosotros":"usáramos","ellos":"usaran"},"imperativo":{"vos":"usá","usted":"use","nosotros":"usemos","ustedes":"usen"}}'::jsonb where infinitive = 'usar';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"naciera","vos":"nacieras","el":"naciera","nosotros":"naciéramos","ellos":"nacieran"},"imperativo":{"vos":"nacé","usted":"nazca","nosotros":"nazcamos","ustedes":"nazcan"}}'::jsonb where infinitive = 'nacer';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"nadara","vos":"nadaras","el":"nadara","nosotros":"nadáramos","ellos":"nadaran"},"imperativo":{"vos":"nadá","usted":"nade","nosotros":"nademos","ustedes":"naden"}}'::jsonb where infinitive = 'nadar';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"comiera","vos":"comieras","el":"comiera","nosotros":"comiéramos","ellos":"comieran"},"imperativo":{"vos":"comé","usted":"coma","nosotros":"comamos","ustedes":"coman"}}'::jsonb where infinitive = 'comer';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"diera","vos":"dieras","el":"diera","nosotros":"diéramos","ellos":"dieran"},"imperativo":{"vos":"da","usted":"dé","nosotros":"demos","ustedes":"den"}}'::jsonb where infinitive = 'dar';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"llegara","vos":"llegaras","el":"llegara","nosotros":"llegáramos","ellos":"llegaran"},"imperativo":{"vos":"llegá","usted":"llegue","nosotros":"lleguemos","ustedes":"lleguen"}}'::jsonb where infinitive = 'llegar';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"pasara","vos":"pasaras","el":"pasara","nosotros":"pasáramos","ellos":"pasaran"},"imperativo":{"vos":"pasá","usted":"pase","nosotros":"pasemos","ustedes":"pasen"}}'::jsonb where infinitive = 'pasar';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"debiera","vos":"debieras","el":"debiera","nosotros":"debiéramos","ellos":"debieran"},"imperativo":{"vos":"debé","usted":"deba","nosotros":"debamos","ustedes":"deban"}}'::jsonb where infinitive = 'deber';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"pusiera","vos":"pusieras","el":"pusiera","nosotros":"pusiéramos","ellos":"pusieran"},"imperativo":{"vos":"poné","usted":"ponga","nosotros":"pongamos","ustedes":"pongan"}}'::jsonb where infinitive = 'poner';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"pareciera","vos":"parecieras","el":"pareciera","nosotros":"pareciéramos","ellos":"parecieran"},"imperativo":{"vos":"parecé","usted":"parezca","nosotros":"parezcamos","ustedes":"parezcan"}}'::jsonb where infinitive = 'parecer';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"quedara","vos":"quedaras","el":"quedara","nosotros":"quedáramos","ellos":"quedaran"},"imperativo":{"vos":"quedá","usted":"quede","nosotros":"quedemos","ustedes":"queden"}}'::jsonb where infinitive = 'quedar';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"creyera","vos":"creyeras","el":"creyera","nosotros":"creyéramos","ellos":"creyeran"},"imperativo":{"vos":"creé","usted":"crea","nosotros":"creamos","ustedes":"crean"}}'::jsonb where infinitive = 'creer';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"hablara","vos":"hablaras","el":"hablara","nosotros":"habláramos","ellos":"hablaran"},"imperativo":{"vos":"hablá","usted":"hable","nosotros":"hablemos","ustedes":"hablen"}}'::jsonb where infinitive = 'hablar';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"llevara","vos":"llevaras","el":"llevara","nosotros":"lleváramos","ellos":"llevaran"},"imperativo":{"vos":"llevá","usted":"lleve","nosotros":"llevemos","ustedes":"lleven"}}'::jsonb where infinitive = 'llevar';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"dejara","vos":"dejaras","el":"dejara","nosotros":"dejáramos","ellos":"dejaran"},"imperativo":{"vos":"dejá","usted":"deje","nosotros":"dejemos","ustedes":"dejen"}}'::jsonb where infinitive = 'dejar';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"siguiera","vos":"siguieras","el":"siguiera","nosotros":"siguiéramos","ellos":"siguieran"},"imperativo":{"vos":"seguí","usted":"siga","nosotros":"sigamos","ustedes":"sigan"}}'::jsonb where infinitive = 'seguir';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"encontrara","vos":"encontraras","el":"encontrara","nosotros":"encontráramos","ellos":"encontraran"},"imperativo":{"vos":"encontrá","usted":"encuentre","nosotros":"encontremos","ustedes":"encuentren"}}'::jsonb where infinitive = 'encontrar';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"llamara","vos":"llamaras","el":"llamara","nosotros":"llamáramos","ellos":"llamaran"},"imperativo":{"vos":"llamá","usted":"llame","nosotros":"llamemos","ustedes":"llamen"}}'::jsonb where infinitive = 'llamar';
update public.verbs set forms = jsonb_set(forms, '{impersonal,subjPasado}', '"lloviera"'::jsonb) where infinitive = 'llover';
update public.verbs set forms = jsonb_set(forms, '{impersonal,subjPasado}', '"nevara"'::jsonb) where infinitive = 'nevar';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"me fuera","vos":"te fueras","el":"se fuera","nosotros":"nos fuéramos","ellos":"se fueran"},"imperativo":{"vos":"andate","usted":"se vaya","nosotros":"vámonos","ustedes":"se vayan"}}'::jsonb where infinitive = 'irse';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"me llamara","vos":"te llamaras","el":"se llamara","nosotros":"nos llamáramos","ellos":"se llamaran"},"imperativo":{"vos":"llamate","usted":"se llame","nosotros":"nos llamemos","ustedes":"se llamen"}}'::jsonb where infinitive = 'llamarse';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"aprendiera","vos":"aprendieras","el":"aprendiera","nosotros":"aprendiéramos","ellos":"aprendieran"},"imperativo":{"vos":"aprendé","usted":"aprenda","nosotros":"aprendamos","ustedes":"aprendan"}}'::jsonb where infinitive = 'aprender';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"practicara","vos":"practicaras","el":"practicara","nosotros":"practicáramos","ellos":"practicaran"},"imperativo":{"vos":"practicá","usted":"practique","nosotros":"practiquemos","ustedes":"practiquen"}}'::jsonb where infinitive = 'practicar';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"estudiara","vos":"estudiaras","el":"estudiara","nosotros":"estudiáramos","ellos":"estudiaran"},"imperativo":{"vos":"estudiá","usted":"estudie","nosotros":"estudiemos","ustedes":"estudien"}}'::jsonb where infinitive = 'estudiar';
update public.verbs set forms = forms || '{"subjPasado":{"yo":"escribiera","vos":"escribieras","el":"escribiera","nosotros":"escribiéramos","ellos":"escribieran"},"imperativo":{"vos":"escribí","usted":"escriba","nosotros":"escribamos","ustedes":"escriban"}}'::jsonb where infinitive = 'escribir';

-- ---------------------------------------------------------------------------
-- Three more verb tags:
--   transitivity  — transitivo / intransitivo / ambos (takes a direct object,
--                   doesn't, or commonly does both — e.g. "comer algo" vs.
--                   "¿comiste?")
--   preposicion   — a fixed preposition the verb idiomatically pairs with,
--                   where the preposition changes or narrows the meaning
--                   (creer EN algo, dejar DE hacer algo, ir A + infinitivo).
--                   Free text, blank when there's no single fixed one.
--   auxiliar      — true for verbs that combine with an infinitive/gerundio/
--                   participio to build another construction rather than
--                   standing alone (haber + participio, ir a + infinitivo,
--                   estar + gerundio, poder/deber/querer + infinitivo,
--                   tener que + infinitivo, ser + participio for the passive).
-- ---------------------------------------------------------------------------

alter table public.verbs add column if not exists transitivity text not null default 'transitivo';
alter table public.verbs add column if not exists preposicion text default '';
alter table public.verbs add column if not exists auxiliar boolean not null default false;

update public.verbs set transitivity = 'intransitivo'
  where infinitive in ('ser', 'estar', 'ir', 'venir', 'levantarse', 'haber', 'correr', 'nacer', 'nadar',
                        'llegar', 'parecer', 'quedar', 'llover', 'nevar', 'irse', 'llamarse');
update public.verbs set transitivity = 'ambos'
  where infinitive in ('subir', 'comer', 'pasar', 'hablar');
-- everything else (decir, tener, hacer, poder, querer, ver, saber, conocer,
-- usar, dar, deber, poner, creer, llevar, dejar, seguir, encontrar, llamar,
-- aprender, practicar, estudiar, escribir) keeps the 'transitivo' default.

update public.verbs set preposicion = 'a' where infinitive in ('ir', 'llegar', 'subir', 'aprender');
update public.verbs set preposicion = 'de' where infinitive = 'dejar';
update public.verbs set preposicion = 'en' where infinitive in ('quedar', 'creer');
update public.verbs set preposicion = 'por' where infinitive = 'pasar';

update public.verbs set auxiliar = true
  where infinitive in ('ser', 'estar', 'tener', 'poder', 'ir', 'querer', 'haber', 'deber');

-- ---------------------------------------------------------------------------
-- gustar_like — a fourth tag for "gustar-type" verbs: grammatically regular
-- (or ordinarily irregular) verbs that conjugate normally in every person,
-- but that are typically USED with the liked/affected thing as the subject
-- and the person as an indirect-object pronoun (me/te/le/nos/les) instead
-- of as the subject — "Me gusta el café," not "Yo gusto el café." The
-- conjugation table doesn't capture that, which is exactly why this is a
-- separate filterable flag rather than a value inside "irregularity" or
-- "transitivity".
-- ---------------------------------------------------------------------------

alter table public.verbs add column if not exists gustar_like boolean not null default false;

update public.verbs set gustar_like = true
  where infinitive in ('gustar', 'encantar', 'apasionar', 'interesar', 'molestar', 'fascinar',
                        'faltar', 'doler', 'importar', 'parecer', 'aburrir', 'sorprender');

-- ---------------------------------------------------------------------------
-- also_personal_use — only meaningful when gustar_like is also true. Some
-- gustar-type verbs (parecer being the clearest example: "Me parece
-- interesante" is dative, but "Vos parecés cansado" is an equally common
-- use of the exact same stored forms, with the experiencer as the
-- grammatical SUBJECT rather than a dative object) genuinely have both
-- readings in everyday use, unlike gustar/doler/etc. which are dative-only
-- in practice. This flag lets the detail card offer a personal-use/dative-
-- use tab for just those verbs, without touching the stored forms or
-- gustar_like itself. Defaults to false for every verb, gustar-type or
-- not — an explicit per-verb opt-in, not a blanket change.
--
-- Named "personal" rather than "normal": both constructions are equally
-- grammatical, so calling one of them "normal" wrongly implies the other
-- (dative) is somehow deficient. "Personal" names the actual grammatical
-- distinction — the experiencer surfaces as a personal subject instead of
-- a dative object — without ranking one use over the other.
-- ---------------------------------------------------------------------------

alter table public.verbs add column if not exists also_personal_use boolean not null default false;

-- One-time rename from an earlier column called also_normal_use, for
-- accounts that already ran that version of this file. Safe to run
-- whether or not that column ever existed.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'verbs' and column_name = 'also_normal_use'
  ) then
    execute 'update public.verbs set also_personal_use = also_normal_use';
    execute 'alter table public.verbs drop column also_normal_use';
  end if;
end $$;

update public.verbs set also_personal_use = true where infinitive = 'parecer';

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
  notes text default '',
  example text default '',
  known boolean not null default false,
  created_at timestamptz not null default now()
);

-- for accounts whose "words" table predates the notes/example columns
alter table public.words add column if not exists notes text default '';
alter table public.words add column if not exists example text default '';

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

-- ---------------------------------------------------------------------------
-- Frases — short common phrases/expressions, kept separate from single-word
-- vocabulary. Verbs get grammatical tags (irregularity, transitivity...);
-- words get part_of_speech/gender; a phrase doesn't have a single part of
-- speech or grammatical gender, so instead of stretching "words" to cover
-- it, phrases get their own facets — the ones actually useful for filtering
-- a phrase collection:
--   function  — its communicative role: saludo / despedida / cortesía /
--               acuerdo / desacuerdo / sorpresa / pregunta / muletilla /
--               otro. This is the phrase equivalent of a word's
--               part_of_speech — the one facet that organizes the content.
--   register  — neutro / coloquial / lunfardo. Genuinely useful in Buenos
--               Aires specifically, where textbook Spanish and everyday
--               street Spanish diverge a lot.
--   idiomatic + literal — mirrors the also_personal_use pattern above
--               (a boolean flag, plus a field only meaningful when it's
--               true): idiomatic marks a phrase whose meaning isn't
--               guessable word-by-word (e.g. "ni en pedo"), and literal
--               holds the word-by-word gloss for just those, blank
--               otherwise.
-- Same private-per-user RLS pattern as verbs/words above.
-- ---------------------------------------------------------------------------

create table if not exists public.phrases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  phrase text not null,
  definition text default '',
  function text not null default 'otro',
  register text not null default 'neutro',
  idiomatic boolean not null default false,
  literal text default '',
  notes text default '',
  example text default '',
  known boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.phrases enable row level security;

drop policy if exists "select own phrases" on public.phrases;
create policy "select own phrases" on public.phrases
  for select using (auth.uid() = user_id);

drop policy if exists "insert own phrases" on public.phrases;
create policy "insert own phrases" on public.phrases
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own phrases" on public.phrases;
create policy "update own phrases" on public.phrases
  for update using (auth.uid() = user_id);

drop policy if exists "delete own phrases" on public.phrases;
create policy "delete own phrases" on public.phrases
  for delete using (auth.uid() = user_id);

create index if not exists phrases_user_id_idx on public.phrases (user_id);

-- ---------------------------------------------------------------------------
-- Self-assessed mastery flag ("known" / "sabido" — 2026-09-28, mason's
-- wife's ask while drilling flashcards off an imported list). Deliberately
-- binary, not a spectrum: an item is either marked known ("Sabido") or not
-- yet, with "not yet" as the default for every existing and future row.
-- Reuses the same boolean-flag filter machinery as reflexive/auxiliar/
-- gustar_like/idiomatic above (app.js's flagOk()-based "Sabido" chip), and
-- is set from a single on/off toggle under each flashcard and on each
-- detail page (app.js's setItemKnown()).
--
-- This is per-person PROGRESS, not part of the content. It needs no table
-- of its own: every verbs/words/phrases row already belongs to exactly one
-- user (RLS above), so each person's "known" lives on their own copy. The
-- only way content crosses between accounts is via list_items snapshots
-- (sharing a list, then importing it), and app.js strips "known" out of
-- every snapshot and every shared-list import (listSnapshot()), so the
-- recipient always starts at "todavía no". The one-time update at the end
-- of this block cleans any snapshot written by the first version of this
-- feature, before that stripping existed.
--
-- The three `create table` blocks above already include this column
-- directly for a brand-new install; these three statements are what
-- actually add it to an existing database like this one.
-- ---------------------------------------------------------------------------

alter table public.verbs add column if not exists known boolean not null default false;
alter table public.words add column if not exists known boolean not null default false;
alter table public.phrases add column if not exists known boolean not null default false;

-- Per-form marks for verbs (2026-09-28, same day): a verb flashcard is one
-- conjugated form, so its Sabido toggle marks just that form, stored here as
-- { "<formKey>": true } — e.g. {"presente|yo": true, "imperativo|vos": true,
-- "gerundio": true}. Independent of `known` above (the whole-verb mark); a
-- card counts as known if either is set. Per-person progress like `known`,
-- so also stripped from list snapshots (app.js listSnapshot()).
alter table public.verbs add column if not exists known_forms jsonb not null default '{}'::jsonb;

-- English for each conjugated form (2026-09-28): { "<formKey>": "I have" },
-- same keys as known_forms, written by the verb-gloss Edge Function via
-- app.js (generateVerbGloss) so a verb flashcard's answer side can show
-- "(I have)" under "tengo" instead of the infinitive's definition.
-- forms_en_sig fingerprints the forms/definition the glosses were made
-- from; the app regenerates only when it no longer matches. Unlike known /
-- known_forms this is CONTENT, not progress, so it's kept in list
-- snapshots — a shared verb arrives with its English already filled in.
alter table public.verbs add column if not exists forms_en jsonb not null default '{}'::jsonb;
alter table public.verbs add column if not exists forms_en_sig text not null default '';

-- Usage notes + an example sentence for verbs (added 2026-10-01), the same
-- two optional fields words and phrases already have. mason: verbs need a
-- note/example "to help indicate alternative usage as with the
-- vocabulary" — a verb's definition is its everyday meaning, and the
-- sense a list uses it in (correr un perfil, picar topes) goes here.
alter table public.verbs add column if not exists notes text default '';
alter table public.verbs add column if not exists example text default '';

-- Shared, app-wide "truth" for verb English (2026-09-28, mason: "the first
-- instance of a verb on the server is truth and the translated
-- conjugations use that version of the infinitive definition (even if the
-- user has entered a different definition on their account)"). One row per
-- (infinitive, mode) — mode 'gustar' when the card shows "me parece / me
-- parecen", 'personal' when it shows "parezco" — holding the definition of
-- whoever created it first plus the English for every form seen so far.
-- The verb-gloss Edge Function reads it first and only asks Claude for
-- forms it doesn't have yet (always with the canonical definition); each
-- account then keeps its own copy in verbs.forms_en above.
-- No RLS policies on purpose: only the Edge Function (service role, which
-- bypasses RLS) can read or write it — so no app user can change the
-- truth. To correct a bad gloss, edit the row here in the dashboard (Table
-- Editor → verb_gloss_canon), then bump VERB_GLOSS_VERSION in app.js so
-- every account's stored copy refreshes from it (cache hits, no cost).
create table if not exists public.verb_gloss_canon (
  infinitive_key text not null,
  mode text not null default 'personal' check (mode in ('personal', 'gustar')),
  definition text not null default '',
  glosses jsonb not null default '{}'::jsonb,
  forms_es jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (infinitive_key, mode)
);

alter table public.verb_gloss_canon enable row level security;

-- Insert-or-merge in one atomic statement. `excluded.glosses || c.glosses`
-- lets EXISTING keys win (jsonb || takes the right-hand value on a
-- clash), so the first gloss stored for a form is never overwritten, even
-- if two requests race. The definition is only ever set on insert.
create or replace function public.verb_gloss_merge(
  p_key text, p_mode text, p_definition text, p_glosses jsonb, p_forms_es jsonb, p_user uuid
) returns public.verb_gloss_canon
language sql
as $$
  insert into public.verb_gloss_canon as c (infinitive_key, mode, definition, glosses, forms_es, created_by)
  values (p_key, p_mode, coalesce(p_definition, ''), coalesce(p_glosses, '{}'::jsonb), coalesce(p_forms_es, '{}'::jsonb), p_user)
  on conflict (infinitive_key, mode) do update
    set glosses = excluded.glosses || c.glosses,
        forms_es = excluded.forms_es || c.forms_es,
        updated_at = now()
  returning *;
$$;

revoke all on function public.verb_gloss_merge(text, text, text, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.verb_gloss_merge(text, text, text, jsonb, jsonb, uuid) to service_role;

-- One-time cleanup (safe to re-run — matches nothing once clean): remove
-- "known" from any list snapshot that captured it. `data - 'known'` drops
-- that one key from the jsonb and leaves everything else untouched. Must run
-- AFTER the list_items table exists; it's declared further down in this
-- file, so on a brand-new install this runs against a table that doesn't
-- exist yet — hence the to_regclass() guard.
do $$
begin
  if to_regclass('public.list_items') is not null then
    update public.list_items set data = data - 'known' - 'known_forms'
      where data ? 'known' or data ? 'known_forms';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Shared lists — a named, curated subset of your own verbs/words that you can
-- hand to someone else (your wife, a friend) via a link, without giving them
-- any access to the rest of your account.
--
-- Sharing works on SNAPSHOTS, not live references: when you add a verb/word
-- to a list, its data is copied into list_items.data as-is at that moment.
-- This keeps the RLS story simple (a shared list never has to reach into
-- your private "verbs"/"words" tables to render), and it means a shared list
-- is a stable, intentional set rather than a moving target that changes
-- underneath the recipient if you later edit your own copy.
--
-- Recipients read a list through the get_shared_list() function below, NOT
-- through a table policy — see the comment above that function for why.
-- ---------------------------------------------------------------------------

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  owner_label text default '',
  share_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  share_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Lists originally had a "kind" column restricting a list to only verbs or
-- only words. Dropped: a list is just a named bag of list_items, and each
-- item already carries its own item_type ('verb'/'word'), so a single list
-- (e.g. "Cocina") can hold both the verbs and the vocabulary that matter for
-- that setting. Safe to run even on a fresh install, where the column was
-- never created in the first place.
alter table public.lists drop column if exists kind;

alter table public.lists enable row level security;

-- Only the owner can see/manage their own lists through the normal table
-- policies. This is deliberately NOT where sharing happens (see above).
drop policy if exists "select own lists" on public.lists;
create policy "select own lists" on public.lists
  for select using (auth.uid() = user_id);

drop policy if exists "insert own lists" on public.lists;
create policy "insert own lists" on public.lists
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own lists" on public.lists;
create policy "update own lists" on public.lists
  for update using (auth.uid() = user_id);

drop policy if exists "delete own lists" on public.lists;
create policy "delete own lists" on public.lists
  for delete using (auth.uid() = user_id);

create index if not exists lists_user_id_idx on public.lists (user_id);

create table if not exists public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  item_type text not null check (item_type in ('verb', 'word')),
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- Widen the item_type check to allow 'phrase' too, for accounts whose
-- list_items table was created before phrases existed. Postgres won't let
-- an existing check constraint be altered in place, so the old one is
-- dropped and recreated with the extra value — safe to run whether or not
-- the table was just created fresh above (which already gets the wider
-- constraint some Postgres versions don't accept as identical, hence
-- re-stating it explicitly rather than assuming the inline check already
-- matches).
alter table public.list_items drop constraint if exists list_items_item_type_check;
alter table public.list_items add constraint list_items_item_type_check
  check (item_type in ('verb', 'word', 'phrase'));

alter table public.list_items enable row level security;

-- A list_item's own row has no user_id, so its policies check ownership by
-- looking up the parent list instead.
drop policy if exists "select own list items" on public.list_items;
create policy "select own list items" on public.list_items
  for select using (exists (
    select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()
  ));

drop policy if exists "insert own list items" on public.list_items;
create policy "insert own list items" on public.list_items
  for insert with check (exists (
    select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()
  ));

drop policy if exists "delete own list items" on public.list_items;
create policy "delete own list items" on public.list_items
  for delete using (exists (
    select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()
  ));

create index if not exists list_items_list_id_idx on public.list_items (list_id);

-- Reading a SHARED list (one you don't own) deliberately does NOT go through
-- a table-level RLS policy. A policy like "using (share_enabled = true)"
-- would make every enabled shared list on the whole site readable by anyone
-- holding the anon key, not just people who were actually given the link —
-- RLS can't tell "the caller filtered by the right token" from "the caller
-- listed the whole table," it only sees the row. A security-definer function
-- that takes the token as an argument and does the equality check itself
-- doesn't have that problem: it only ever returns the one list matching the
-- exact token you pass in, so knowing the (long, random) token is genuinely
-- required, the same way a link with a secret path segment would be.
-- Postgres won't let create-or-replace change a function's return columns,
-- so the old (kind-including) signature is dropped first — safe to run
-- whether or not that version was ever installed.
drop function if exists public.get_shared_list(text);

create function public.get_shared_list(p_token text)
returns table (
  list_id uuid,
  list_name text,
  owner_label text,
  item_type text,
  data jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select l.id, l.name, l.owner_label, i.item_type, i.data
  from public.lists l
  join public.list_items i on i.list_id = l.id
  where l.share_token = p_token and l.share_enabled = true;
$$;

grant execute on function public.get_shared_list(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Per-user app settings. For now this is just the UI language — separate
-- from the language of your verbs/vocabulary, which always stays Spanish
-- (that's the material being studied). This only controls the app's own
-- instructional text: labels, buttons, badges/tags, empty states, and so
-- on, so a newer learner can read the interface itself in English while a
-- more advanced one can keep it in Castellano.
--
-- One row per user, so user_id is the primary key here (not a separate id
-- column with a user_id foreign key like the other tables) — there's only
-- ever one settings row per person, upserted in place rather than inserted
-- fresh each time.
-- ---------------------------------------------------------------------------

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lang text not null default 'en' check (lang in ('en', 'es')),
  updated_at timestamptz not null default now()
);

-- Changed 2026-09-26 (mason's ask): the app's default UI language is now
-- English, not Spanish. This only matters for a signed-in account that has
-- never touched Settings, and only sets what a brand-new row gets — it does
-- NOT touch any row that already exists (so it won't silently flip anyone's
-- already-chosen language preference). The `create table if not exists`
-- above won't re-run against an existing database, hence this separate
-- `alter column ... set default`, safe to re-run. See app.js's
-- LANG_LOCAL_KEY/loadUserSettings() for the two matching client-side
-- defaults that changed alongside this one.
alter table public.user_settings alter column lang set default 'en';

-- Added 2026-09-25, alongside moving the flashcard voice picker into the
-- Settings modal: which Azure Rioplatense voice (see the tts-cache bucket
-- below) a person hears is now an account-level preference synced the same
-- way `lang` is, rather than a device-only localStorage value — see
-- setTtsVoice()/loadUserSettings() in app.js.
alter table public.user_settings
  add column if not exists tts_voice text not null default 'elena' check (tts_voice in ('elena', 'tomas'));

alter table public.user_settings enable row level security;

drop policy if exists "select own settings" on public.user_settings;
create policy "select own settings" on public.user_settings
  for select using (auth.uid() = user_id);

drop policy if exists "insert own settings" on public.user_settings;
create policy "insert own settings" on public.user_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own settings" on public.user_settings;
create policy "update own settings" on public.user_settings
  for update using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Text-to-speech audio cache (added 2026-09-25). Holds one .mp3 per unique
-- (voice, text) pair ever spoken by the app — see supabase/functions/tts/
-- and the project brief's "Planned feature: Text-to-speech" section for the
-- full design. No table is needed for this: the Edge Function content-
-- addresses each clip by a hash of voice+text as its Storage path, so the
-- existence of that path IS the cache entry.
--
-- Marked public so a cached clip's URL can be played directly by <audio>/
-- new Audio() with no auth round-trip — Supabase serves a public bucket's
-- objects without checking storage.objects RLS at all, which is why no
-- select policy is added below. No insert/update/delete policy is added
-- either: the only writer is the tts Edge Function, which uses the
-- service-role/secret key and so bypasses RLS entirely — ordinary users
-- (anon or authenticated) get no direct write access to this bucket.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('tts-cache', 'tts-cache', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Backup / delete / restore of a person's own content (added 2026-10-01,
-- mason: "If the user backs up it creates a restorable version of their
-- content on the server including 'known' tags. If they delete then it
-- deletes their content in the app but not their restore. If they restore
-- and they have content in the app that is redundant then the user has to
-- choose if it should overwrite with the restore or prefer the 'active'
-- content.") Settings → Respaldo in the app calls the four functions below.
--
-- One backup per person (a new backup replaces the old one). It holds that
-- person's verbs, words, phrases and lists (with their items), including
-- Sabido (known / known_forms) and the stored English per form — unlike a
-- shared list, which never carries known. Settings (language, voice) are
-- not content and are left out. Everything runs in SQL, so each operation
-- is a single transaction: a restore that fails halfway changes nothing.
--
-- The functions are SECURITY INVOKER: they run as the signed-in caller, so
-- the normal per-user RLS policies still apply to every row they touch,
-- and auth.uid() scopes each statement to that person.
--
-- "Redundant" = same infinitive / word / phrase, matched the way the app's
-- import does (case-, accent- and surrounding-space-insensitive, see
-- vosea_norm). Lists are matched by name the same way.
--
-- If a column is ever added to verbs/words/phrases/lists, add it to the
-- column lists in vosea_restore_content() too (backups store whole rows,
-- so older backups simply lack the new key and get its default).
-- ---------------------------------------------------------------------------

create table if not exists public.content_backups (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null,
  counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.content_backups enable row level security;

drop policy if exists "select own backup" on public.content_backups;
create policy "select own backup" on public.content_backups
  for select using (auth.uid() = user_id);

drop policy if exists "insert own backup" on public.content_backups;
create policy "insert own backup" on public.content_backups
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own backup" on public.content_backups;
create policy "update own backup" on public.content_backups
  for update using (auth.uid() = user_id);

drop policy if exists "delete own backup" on public.content_backups;
create policy "delete own backup" on public.content_backups
  for delete using (auth.uid() = user_id);

create or replace function public.vosea_norm(s text)
returns text
language sql
immutable
as $$
  select lower(btrim(translate(coalesce(s, ''),
    'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç',
    'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc')));
$$;

-- Current content, as jsonb rows without id / user_id / created_at.
create or replace function public.vosea_backup_content()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v jsonb; w jsonb; p jsonb; l jsonb; c jsonb;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) - 'id' - 'user_id' - 'created_at' order by x.created_at), '[]') into v from public.verbs x where x.user_id = uid;
  select coalesce(jsonb_agg(to_jsonb(x) - 'id' - 'user_id' - 'created_at' order by x.created_at), '[]') into w from public.words x where x.user_id = uid;
  select coalesce(jsonb_agg(to_jsonb(x) - 'id' - 'user_id' - 'created_at' order by x.created_at), '[]') into p from public.phrases x where x.user_id = uid;
  select coalesce(jsonb_agg(jsonb_build_object(
      'name', x.name, 'owner_label', x.owner_label, 'share_token', x.share_token, 'share_enabled', x.share_enabled,
      'items', coalesce((select jsonb_agg(jsonb_build_object('item_type', i.item_type, 'data', i.data) order by i.created_at)
                         from public.list_items i where i.list_id = x.id), '[]'))
      order by x.created_at), '[]') into l from public.lists x where x.user_id = uid;
  c := jsonb_build_object('verbs', jsonb_array_length(v), 'words', jsonb_array_length(w),
                          'phrases', jsonb_array_length(p), 'lists', jsonb_array_length(l));
  -- Never replace a backup with an empty one (e.g. backing up right after
  -- deleting everything would otherwise wipe out the only copy).
  if (c->>'verbs')::int + (c->>'words')::int + (c->>'phrases')::int + (c->>'lists')::int = 0 then
    raise exception 'nothing_to_backup';
  end if;
  insert into public.content_backups (user_id, data, counts, created_at)
  values (uid, jsonb_build_object('version', 1, 'verbs', v, 'words', w, 'phrases', p, 'lists', l), c, now())
  on conflict (user_id) do update set data = excluded.data, counts = excluded.counts, created_at = excluded.created_at;
  return c || jsonb_build_object('created_at', now());
end;
$$;

-- Deletes the caller's verbs, words, phrases and lists (list items go with
-- their lists). The backup is NOT touched.
create or replace function public.vosea_delete_content()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  nv int; nw int; np int; nl int;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  delete from public.lists where user_id = uid;   get diagnostics nl = row_count;
  delete from public.verbs where user_id = uid;   get diagnostics nv = row_count;
  delete from public.words where user_id = uid;   get diagnostics nw = row_count;
  delete from public.phrases where user_id = uid; get diagnostics np = row_count;
  return jsonb_build_object('verbs', nv, 'words', nw, 'phrases', np, 'lists', nl);
end;
$$;

-- What a restore would do: the backup's date and counts, plus how many of
-- its items already exist in the app (the ones the person must decide on).
create or replace function public.vosea_restore_preview()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  b record;
  cv int; cw int; cp int; cl int;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into b from public.content_backups where user_id = uid;
  if not found then return jsonb_build_object('exists', false); end if;
  select count(*) into cv from jsonb_array_elements(b.data->'verbs') r
    where exists (select 1 from public.verbs x where x.user_id = uid and vosea_norm(x.infinitive) = vosea_norm(r->>'infinitive'));
  select count(*) into cw from jsonb_array_elements(b.data->'words') r
    where exists (select 1 from public.words x where x.user_id = uid and vosea_norm(x.word) = vosea_norm(r->>'word'));
  select count(*) into cp from jsonb_array_elements(b.data->'phrases') r
    where exists (select 1 from public.phrases x where x.user_id = uid and vosea_norm(x.phrase) = vosea_norm(r->>'phrase'));
  select count(*) into cl from jsonb_array_elements(b.data->'lists') r
    where exists (select 1 from public.lists x where x.user_id = uid and vosea_norm(x.name) = vosea_norm(r->>'name'));
  return jsonb_build_object('exists', true, 'created_at', b.created_at, 'counts', b.counts,
    'conflicts', jsonb_build_object('verbs', cv, 'words', cw, 'phrases', cp, 'lists', cl));
end;
$$;

-- p_prefer: 'backup' (an item that already exists is overwritten with the
-- backup's version, Sabido included) or 'active' (it is left as it is).
-- Items not in the app are always added. Lists: a missing list is
-- recreated (keeping its old share link when that's still free); a list
-- that exists gets the backup's missing items added, and with 'backup' the
-- items it shares with the backup are replaced by the backup's snapshots.
create or replace function public.vosea_restore_content(p_prefer text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  b record;
  r jsonb; it jsonb;
  rv public.verbs; rw public.words; rp public.phrases;
  ins int := 0; ovw int := 0; kept int := 0;
  lnew int := 0; lmerged int := 0; iadd int := 0;
  lid uuid; tok text; ikey text; n int;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_prefer is null or p_prefer not in ('backup', 'active') then raise exception 'bad_prefer'; end if;
  select * into b from public.content_backups where user_id = uid;
  if not found then raise exception 'no_backup'; end if;

  for r in select * from jsonb_array_elements(b.data->'verbs') loop
    rv := jsonb_populate_record(null::public.verbs, r);
    select count(*) into n from public.verbs x where x.user_id = uid and vosea_norm(x.infinitive) = vosea_norm(rv.infinitive);
    if n = 0 then
      insert into public.verbs (user_id, infinitive, definition, notes, example, type, irregularity, pattern, reflexive, transitivity,
                                preposicion, auxiliar, gustar_like, also_personal_use, known, known_forms, forms_en, forms_en_sig, forms)
      values (uid, rv.infinitive, coalesce(rv.definition, ''), coalesce(rv.notes, ''), coalesce(rv.example, ''), coalesce(rv.type, '-ar'),
              coalesce(rv.irregularity, 'regular'), coalesce(rv.pattern, ''), coalesce(rv.reflexive, false),
              coalesce(rv.transitivity, 'transitivo'), coalesce(rv.preposicion, ''), coalesce(rv.auxiliar, false),
              coalesce(rv.gustar_like, false), coalesce(rv.also_personal_use, false), coalesce(rv.known, false),
              coalesce(rv.known_forms, '{}'), coalesce(rv.forms_en, '{}'), coalesce(rv.forms_en_sig, ''), coalesce(rv.forms, '{}'));
      ins := ins + 1;
    elsif p_prefer = 'backup' then
      update public.verbs x set definition = coalesce(rv.definition, ''), notes = coalesce(rv.notes, ''),
        example = coalesce(rv.example, ''), type = coalesce(rv.type, '-ar'),
        irregularity = coalesce(rv.irregularity, 'regular'),
        pattern = coalesce(rv.pattern, ''), reflexive = coalesce(rv.reflexive, false),
        transitivity = coalesce(rv.transitivity, 'transitivo'), preposicion = coalesce(rv.preposicion, ''),
        auxiliar = coalesce(rv.auxiliar, false), gustar_like = coalesce(rv.gustar_like, false),
        also_personal_use = coalesce(rv.also_personal_use, false), known = coalesce(rv.known, false),
        known_forms = coalesce(rv.known_forms, '{}'), forms_en = coalesce(rv.forms_en, '{}'),
        forms_en_sig = coalesce(rv.forms_en_sig, ''), forms = coalesce(rv.forms, '{}')
      where x.user_id = uid and vosea_norm(x.infinitive) = vosea_norm(rv.infinitive);
      ovw := ovw + 1;
    else
      kept := kept + 1;
    end if;
  end loop;

  for r in select * from jsonb_array_elements(b.data->'words') loop
    rw := jsonb_populate_record(null::public.words, r);
    select count(*) into n from public.words x where x.user_id = uid and vosea_norm(x.word) = vosea_norm(rw.word);
    if n = 0 then
      insert into public.words (user_id, word, definition, part_of_speech, gender, notes, example, known)
      values (uid, rw.word, coalesce(rw.definition, ''), coalesce(rw.part_of_speech, 'sustantivo'), coalesce(rw.gender, ''),
              coalesce(rw.notes, ''), coalesce(rw.example, ''), coalesce(rw.known, false));
      ins := ins + 1;
    elsif p_prefer = 'backup' then
      update public.words x set definition = coalesce(rw.definition, ''), part_of_speech = coalesce(rw.part_of_speech, 'sustantivo'),
        gender = coalesce(rw.gender, ''), notes = coalesce(rw.notes, ''), example = coalesce(rw.example, ''), known = coalesce(rw.known, false)
      where x.user_id = uid and vosea_norm(x.word) = vosea_norm(rw.word);
      ovw := ovw + 1;
    else
      kept := kept + 1;
    end if;
  end loop;

  for r in select * from jsonb_array_elements(b.data->'phrases') loop
    rp := jsonb_populate_record(null::public.phrases, r);
    select count(*) into n from public.phrases x where x.user_id = uid and vosea_norm(x.phrase) = vosea_norm(rp.phrase);
    if n = 0 then
      insert into public.phrases (user_id, phrase, definition, function, register, idiomatic, literal, notes, example, known)
      values (uid, rp.phrase, coalesce(rp.definition, ''), coalesce(rp.function, 'otro'), coalesce(rp.register, 'neutro'),
              coalesce(rp.idiomatic, false), coalesce(rp.literal, ''), coalesce(rp.notes, ''), coalesce(rp.example, ''), coalesce(rp.known, false));
      ins := ins + 1;
    elsif p_prefer = 'backup' then
      update public.phrases x set definition = coalesce(rp.definition, ''), function = coalesce(rp.function, 'otro'),
        register = coalesce(rp.register, 'neutro'), idiomatic = coalesce(rp.idiomatic, false), literal = coalesce(rp.literal, ''),
        notes = coalesce(rp.notes, ''), example = coalesce(rp.example, ''), known = coalesce(rp.known, false)
      where x.user_id = uid and vosea_norm(x.phrase) = vosea_norm(rp.phrase);
      ovw := ovw + 1;
    else
      kept := kept + 1;
    end if;
  end loop;

  for r in select * from jsonb_array_elements(b.data->'lists') loop
    select x.id into lid from public.lists x where x.user_id = uid and vosea_norm(x.name) = vosea_norm(r->>'name') order by x.created_at limit 1;
    if lid is null then
      tok := r->>'share_token';
      if tok is null or exists (select 1 from public.lists x where x.share_token = tok) then
        insert into public.lists (user_id, name, owner_label, share_enabled)
        values (uid, r->>'name', coalesce(r->>'owner_label', ''), coalesce((r->>'share_enabled')::boolean, true)) returning id into lid;
      else
        insert into public.lists (user_id, name, owner_label, share_token, share_enabled)
        values (uid, r->>'name', coalesce(r->>'owner_label', ''), tok, coalesce((r->>'share_enabled')::boolean, true)) returning id into lid;
      end if;
      lnew := lnew + 1;
    else
      lmerged := lmerged + 1;
    end if;
    for it in select * from jsonb_array_elements(coalesce(r->'items', '[]')) loop
      ikey := vosea_norm(coalesce(it->'data'->>'infinitive', it->'data'->>'word', it->'data'->>'phrase'));
      if exists (select 1 from public.list_items i where i.list_id = lid and i.item_type = it->>'item_type'
                 and vosea_norm(coalesce(i.data->>'infinitive', i.data->>'word', i.data->>'phrase')) = ikey) then
        if p_prefer = 'backup' then
          delete from public.list_items i where i.list_id = lid and i.item_type = it->>'item_type'
            and vosea_norm(coalesce(i.data->>'infinitive', i.data->>'word', i.data->>'phrase')) = ikey;
          insert into public.list_items (list_id, item_type, data) values (lid, it->>'item_type', it->'data');
        end if;
      else
        insert into public.list_items (list_id, item_type, data) values (lid, it->>'item_type', it->'data');
        iadd := iadd + 1;
      end if;
    end loop;
    lid := null;
  end loop;

  return jsonb_build_object('inserted', ins, 'overwritten', ovw, 'kept', kept,
                            'lists_created', lnew, 'lists_merged', lmerged, 'list_items_added', iadd);
end;
$$;

revoke execute on function public.vosea_backup_content() from public, anon;
revoke execute on function public.vosea_delete_content() from public, anon;
revoke execute on function public.vosea_restore_preview() from public, anon;
revoke execute on function public.vosea_restore_content(text) from public, anon;
grant execute on function public.vosea_backup_content() to authenticated;
grant execute on function public.vosea_delete_content() to authenticated;
grant execute on function public.vosea_restore_preview() to authenticated;
grant execute on function public.vosea_restore_content(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Practice log (2026-10-03)
--
-- One row per card shown in a flashcard deck: what it was, how you answered
-- (the Otra vez / Bien switch under the card, optional), and how you got
-- there (time to flip, time on each face, audio plays, coming back to it).
-- It is the history the coming Progreso tab and "Tu historial" panels are
-- built from, so it starts collecting before any of that UI exists.
--
-- Rows are written by the app in small batches, each with a client-made id,
-- so a batch that is re-sent after a dropped connection is simply ignored
-- the second time (insert ... on conflict do nothing).
--
-- item_key is the item's Spanish text, normalised the same way backups
-- match items (vosea_norm), so history still lines up with a word after a
-- delete + restore gives it a new id.
--
-- Private per user, like everything else. Not part of backup/restore, and
-- "Borrar contenido" leaves it alone.
create table if not exists public.practice_log (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null,
  shown_at timestamptz not null,
  item_kind text not null check (item_kind in ('verb', 'word', 'phrase')),
  item_id uuid,
  item_key text not null default '',
  form_key text,
  mode text not null default 'leer',
  direction text,
  pass integer not null default 1,
  position integer not null default 0,
  revisit boolean not null default false,
  grade text check (grade in ('bien', 'otra')),
  grade_auto boolean not null default false,
  grade_changes integer not null default 0,
  flipped boolean not null default false,
  flips integer not null default 0,
  ms_to_flip integer,
  ms_front integer not null default 0,
  ms_back integer not null default 0,
  audio_plays integer not null default 0,
  known_before boolean not null default false,
  known_after boolean not null default false,
  device text,
  created_at timestamptz not null default now()
);

alter table public.practice_log enable row level security;

drop policy if exists "select own practice" on public.practice_log;
create policy "select own practice" on public.practice_log
  for select using (auth.uid() = user_id);

drop policy if exists "insert own practice" on public.practice_log;
create policy "insert own practice" on public.practice_log
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete own practice" on public.practice_log;
create policy "delete own practice" on public.practice_log
  for delete using (auth.uid() = user_id);

create index if not exists practice_log_user_shown_idx on public.practice_log (user_id, shown_at desc);
create index if not exists practice_log_user_item_idx on public.practice_log (user_id, item_kind, item_key);

-- Hablar (2026-10-04): details of a spoken answer, on rows with
-- mode = 'hablar' — what Azure heard, its es-AR pronunciation scores, the
-- grade the app suggested and by which rule, recording length and wait.
-- Combined with `grade` (what you ended up with) and `grade_auto` (whether
-- you left the suggestion as it was), this is what the Bien/Otra vez
-- thresholds get re-tuned from. Never contains audio.
alter table public.practice_log add column if not exists speech jsonb;
