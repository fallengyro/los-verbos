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
  transitivity text not null default 'transitivo',
  preposicion text default '',
  auxiliar boolean not null default false,
  gustar_like boolean not null default false,
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
