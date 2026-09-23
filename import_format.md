# voseá — Custom Content Import Format (v1)

Paste this whole document into your preferred LLM, along with the source
material you want turned into study content (a webpage, a PDF, your own
list of words), and ask it to produce one JSON file matching the shape
below. Then point voseá's import screen at that file.

Everything imported lands in **your own** verbs/words/phrases — never the
app's shared starter content — the same as adding an item by hand.

## Top-level shape

```json
{
  "version": 1,
  "list_name": "Petrofísica y Perfilaje de Pozos",
  "verbs": [ /* verb objects, see below */ ],
  "words": [ /* word objects, see below */ ],
  "phrases": [ /* phrase objects, see below */ ]
}
```

- `version` — always `1` for this format. Lets the app detect and reject a
  future incompatible format instead of silently importing garbage.
- `list_name` — optional. If present, every verb/word/phrase below is also
  added to a list with this exact name (a new list is created if none
  matches; an existing one with the same name is added to instead of
  duplicated). Omit this to just add items to your collection without
  creating a list.
- `verbs`, `words` and `phrases` are all optional arrays — include
  whichever you have.

## Verb object shape

```json
{
  "infinitive": "escalar",
  "definition": "to scale (a log curve)",
  "type": "-ar",
  "reflexive": false,
  "irregularity": "regular",
  "pattern": "",
  "transitivity": "transitivo",
  "preposicion": "",
  "auxiliar": false,
  "gustar_like": false,
  "forms": {
    "presente":     { "yo": "escalo",    "vos": "escalás",   "el": "escala",    "nosotros": "escalamos",    "ellos": "escalan" },
    "preterito":    { "yo": "escalé",    "vos": "escalaste", "el": "escaló",    "nosotros": "escalamos",    "ellos": "escalaron" },
    "imperfecto":   { "yo": "escalaba",  "vos": "escalabas", "el": "escalaba",  "nosotros": "escalábamos",  "ellos": "escalaban" },
    "futuro":       { "yo": "escalaré",  "vos": "escalarás", "el": "escalará",  "nosotros": "escalaremos",  "ellos": "escalarán" },
    "condicional":  { "yo": "escalaría", "vos": "escalarías","el": "escalaría", "nosotros": "escalaríamos", "ellos": "escalarían" },
    "subjPresente": { "yo": "escale",    "vos": "escales",   "el": "escale",    "nosotros": "escalemos",    "ellos": "escalen" },
    "subjPasado":   { "yo": "escalara",  "vos": "escalaras", "el": "escalara",  "nosotros": "escaláramos",  "ellos": "escalaran" },
    "imperativo":   { "vos": "escalá", "usted": "escale", "nosotros": "escalemos", "ustedes": "escalen" },
    "gerundio": "escalando",
    "participio": "escalado"
  }
}
```

Field notes:
- `type` — one of `-ar` / `-er` / `-ir`, must match the infinitive's ending.
- `irregularity` — one of `regular` / `cambio de raíz` / `irregular (yo)` / `irregular (total)`.
- `pattern` — a short free-text note on what's irregular (e.g. `"e→i en formas acentuadas"`), blank if fully regular.
- `transitivity` — one of `transitivo` / `intransitivo` / `ambos`.
- `preposicion` — a fixed preposition the verb idiomatically takes (`"a"`, `"de"`, `"en"`...), or `""`.
- `forms` — every tense object must have all five persons: `yo`, `vos`, `el`, `nosotros`, `ellos`. `imperativo` has only `vos`/`usted`/`nosotros`/`ustedes` (no `yo` — you can't command yourself). `gerundio` and `participio` are plain strings, not person tables.
- Impersonal weather verbs (`llover`, `nevar`) skip the person tables entirely and use `"forms": { "impersonal": { "presente": "llueve", "subjPasado": "lloviera", ... } }` instead — there's no "yo llueve."
- Reflexive verbs (e.g. `levantarse`) write `forms` WITH the reflexive pronoun already baked into every single-table cell (`"yo": "me levanto"`, NOT just `"levanto"`) — the app displays exactly what's stored here, it does not add the pronoun itself at display time. `imperativo` includes it too, wherever it attaches: enclitic on `vos` (`"vos": "levantate"`), proclitic on the other three (`"usted": "se levante"`, `"nosotros": "nos levantemos"`, `"ustedes": "se levanten"`).

## Word object shape

```json
{
  "word": "porosidad",
  "definition": "porosity",
  "part_of_speech": "sustantivo",
  "gender": "femenino",
  "notes": "petrofísica — measured via density or sonic logs",
  "example": ""
}
```

- `part_of_speech` — one of `sustantivo` / `adjetivo` / `adverbio` / `pronombre` / `preposición` / `conjunción` / `interjección`.
- `gender` — one of `masculino` / `femenino` / `neutro` / `""` (blank for anything ungendered, e.g. most adverbs).
- `notes` and `example` are both optional free text; `example` is a Spanish sentence using the word, if you want one.

## Phrase object shape

Short common phrases/expressions — kept separate from single-word
vocabulary because a phrase doesn't have one part of speech or gender.
Instead it has its own two facets: what it's *for* (`function`) and how
formal/slangy it is (`register`).

```json
{
  "phrase": "Dale",
  "definition": "okay / sure / sounds good",
  "function": "acuerdo",
  "register": "coloquial",
  "idiomatic": true,
  "literal": "give it / go",
  "notes": "",
  "example": ""
}
```

- `function` — the phrase's communicative role, one of `saludo` (greeting) / `despedida` (farewell) / `cortesía` (courtesy — please, thanks, excuse me) / `acuerdo` (agreement) / `desacuerdo` (disagreement) / `sorpresa` (surprise/reaction) / `pregunta` (question) / `muletilla` (filler/discourse marker) / `otro` (other).
- `register` — one of `neutro` (standard, textbook-safe) / `coloquial` (everyday informal) / `lunfardo` (Buenos Aires-specific slang).
- `idiomatic` — `true` if the meaning isn't guessable word-by-word (e.g. "ni en pedo" doesn't mean anything about being drunk), `false` if it's a plain, literal combination of words.
- `literal` — only meaningful when `idiomatic` is `true`: a short word-by-word gloss, so both the real meaning and the literal words are visible. Leave `""` when `idiomatic` is `false`.
- `notes` and `example` are both optional free text, same as for words.

## ⚠️ Dialect requirement — this app uses Rioplatense Spanish (voseo)

Every verb form below MUST use **vos**, never tú. This is the single
most common mistake a general-purpose LLM makes here, so check it
carefully — a wrong-but-fluent "tú" conjugation will look completely
plausible and still be wrong for this app:

- Present tense **does not diphthongize** for vos, even for stem-changing
  verbs: **vos podés** (not "puedés"), **vos mostrás** (not "muestrás"),
  **vos pedís** (not "pidís"), **vos medís** (not "midís"). Stress falls
  on the ending, not the stem — so vos present tense is always the
  "regular-looking" stem plus `-ás`/`-és`/`-ís`.
- Affirmative vos imperative = the infinitive's stem + its final accented
  vowel, no `-s`: **hablá, comé, viví, tené, poné, vení, decí** — never
  the tú-form (habla, ven, di).
- Preterite, imperfecto, futuro, condicional, and both subjunctives all
  use the vos-shaped ending shown in the example above (which mirrors
  "tú" minus the final `-s` for most tenses, except present and imperative
  where the difference is larger).
- Compounds of irregular verbs keep the irregularity: **obtener → obtengo,
  obtuve, obtendré** (not a regular pattern), because it's built on
  "tener." Same logic for any verb built on **poner**, **venir**,
  **decir**, etc.
- Phrases should also reflect real rioplatense usage (e.g. "¿Vos querés
  algo?" not "¿Tú quieres algo?") — a phrase generated by an LLM defaulting
  to Spain/Mexico Spanish will read as noticeably foreign here.

## What the app checks before saving anything

- The file must be valid JSON matching this shape, or the whole import is
  rejected with an error — nothing partial gets written.
- Every verb's `forms` must have all required tense/person cells filled in.
- Before you confirm the import, you'll see a preview of every parsed
  verb/word/phrase. For verbs, any cell that doesn't match the app's own
  built-in *regular* conjugation pattern is highlighted — same highlight
  used everywhere else in the app for irregular verbs. If you marked
  something `"irregularity": "regular"` and cells still light up, that's
  the LLM having made a mistake; fix it before confirming.
- Duplicates are matched by infinitive/word/phrase (case- and
  accent-insensitive), same as the existing "add to list" flow — importing
  the same file twice won't create duplicate rows.
