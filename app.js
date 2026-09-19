(function () {
  "use strict";

  // ================= Supabase client =================
  var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var currentUser = null;

  // ================= conjugation model (unchanged from the original tool) =================
  var PERSONS = [
    { key: "yo", label: "yo" },
    { key: "vos", label: "vos" },
    { key: "el", label: "él / ella / ud." },
    { key: "nosotros", label: "nosotros" },
    { key: "ellos", label: "ellos / ellas / uds." }
  ];
  var TENSES = [
    { key: "presente", label: "Presente" },
    { key: "preterito", label: "Pretérito" },
    { key: "imperfecto", label: "Imperfecto" },
    { key: "futuro", label: "Futuro" },
    { key: "condicional", label: "Condicional" }
  ];
  var SUBJ_KEY = "subjPresente";
  var SUBJ_PAST_KEY = "subjPasado";
  var SUBJ_TENSES = [
    { key: SUBJ_KEY, label: "Presente" },
    { key: SUBJ_PAST_KEY, label: "Pasado" }
  ];
  var IMPERATIVE_PERSONS = [
    { key: "vos", label: "vos" },
    { key: "usted", label: "usted" },
    { key: "nosotros", label: "nosotros" },
    { key: "ustedes", label: "ustedes" }
  ];
  var REFLEXIVE_PRONOUNS = { yo: "me", vos: "te", el: "se", nosotros: "nos", ellos: "se" };

  // "Tipo gustar" verbs (gustar, doler, encantar, ...) are grammatically
  // regular but almost never used with the person as the grammatical
  // subject ("yo gusto" is real but rare). In everyday use the thing
  // liked/affected is the subject and the person is a dative object
  // pronoun: "me gusta el café" / "me gustan los perros." So instead of
  // showing each person's own (misleading) conjugated form, each row is
  // relabeled with its dative pronoun/phrase and shows the SAME invariant
  // singular/plural pair, taken from the stored él/ellos forms.
  var GUSTAR_LIKE_PERSON = {
    yo: { pronoun: "me", label: "a mí" },
    vos: { pronoun: "te", label: "a vos" },
    el: { pronoun: "le", label: "a él, ella, ud." },
    nosotros: { pronoun: "nos", label: "a nosotros" },
    ellos: { pronoun: "les", label: "a ellos, ellas, uds." }
  };

  // ================= flashcards =================
  // "Personal" tenses/moods are the ones keyed by the 5-person PERSONS grid
  // (presente..subjPasado). imperativo is a 6th matrix column (it has no
  // "yo" slot). gerundio/participio don't fit the person grid at all — no
  // person distinguishes them — so they're separate standalone toggles.
  var FLASH_PERSONAL_TENSES = TENSES.concat(SUBJ_TENSES);
  var FLASH_MATRIX_COLUMNS = FLASH_PERSONAL_TENSES.concat([{ key: "imperativo", label: "Imperativo" }]);
  // imperativo only has 4 slots (no "yo"); map the same 5-person grid
  // onto them the way the conjugation table already does — el's imperativo
  // is really usted's command, ellos's is really ustedes's.
  var IMPERATIVO_FORM_KEY = { vos: "vos", el: "usted", nosotros: "nosotros", ellos: "ustedes" };
  var IMPERATIVO_DISPLAY = { vos: "vos", el: "usted", nosotros: "nosotros", ellos: "ustedes" };

  function flashCellKey(tenseKey, personKey) { return tenseKey + "|" + personKey; }
  function flashCellSelectable(tenseKey, personKey) { return !(tenseKey === "imperativo" && personKey === "yo"); }
  function flashColumnCellKeys(tenseKey) {
    return PERSONS.filter(function (p) { return flashCellSelectable(tenseKey, p.key); })
      .map(function (p) { return flashCellKey(tenseKey, p.key); });
  }
  function flashRowCellKeys(personKey) {
    return FLASH_MATRIX_COLUMNS.filter(function (col) { return flashCellSelectable(col.key, personKey); })
      .map(function (col) { return flashCellKey(col.key, personKey); });
  }
  function flashAllCellKeys() {
    var keys = [];
    FLASH_MATRIX_COLUMNS.forEach(function (col) { keys = keys.concat(flashColumnCellKeys(col.key)); });
    return keys;
  }

  function verbClass(baseInf) {
    var end = baseInf.slice(-2).toLowerCase();
    return (end === "ar" || end === "er" || end === "ir") ? end : null;
  }

  function regularForm(baseInf, tenseKey, personKey) {
    var klass = verbClass(baseInf);
    if (!klass) return null;
    var stem = baseInf.slice(0, -2);
    var inf = baseInf;

    if (tenseKey === "presente") {
      if (klass === "ar") return { yo: stem + "o", vos: stem + "ás", el: stem + "a", nosotros: stem + "amos", ellos: stem + "an" }[personKey];
      if (klass === "er") return { yo: stem + "o", vos: stem + "és", el: stem + "e", nosotros: stem + "emos", ellos: stem + "en" }[personKey];
      return { yo: stem + "o", vos: stem + "ís", el: stem + "e", nosotros: stem + "imos", ellos: stem + "en" }[personKey];
    }
    if (tenseKey === "preterito") {
      if (klass === "ar") return { yo: stem + "é", vos: stem + "aste", el: stem + "ó", nosotros: stem + "amos", ellos: stem + "aron" }[personKey];
      return { yo: stem + "í", vos: stem + "iste", el: stem + "ió", nosotros: stem + "imos", ellos: stem + "ieron" }[personKey];
    }
    if (tenseKey === "imperfecto") {
      if (klass === "ar") return { yo: stem + "aba", vos: stem + "abas", el: stem + "aba", nosotros: stem + "ábamos", ellos: stem + "aban" }[personKey];
      return { yo: stem + "ía", vos: stem + "ías", el: stem + "ía", nosotros: stem + "íamos", ellos: stem + "ían" }[personKey];
    }
    if (tenseKey === "futuro") {
      return { yo: inf + "é", vos: inf + "ás", el: inf + "á", nosotros: inf + "emos", ellos: inf + "án" }[personKey];
    }
    if (tenseKey === "condicional") {
      return { yo: inf + "ía", vos: inf + "ías", el: inf + "ía", nosotros: inf + "íamos", ellos: inf + "ían" }[personKey];
    }
    if (tenseKey === SUBJ_KEY) {
      if (klass === "ar") return { yo: stem + "e", vos: stem + "es", el: stem + "e", nosotros: stem + "emos", ellos: stem + "en" }[personKey];
      return { yo: stem + "a", vos: stem + "as", el: stem + "a", nosotros: stem + "amos", ellos: stem + "an" }[personKey];
    }
    if (tenseKey === SUBJ_PAST_KEY) {
      // "regular" pretérito imperfecto de subjuntivo (-ra form), from the plain
      // infinitive stem — same convention as the other tenses above: it's the
      // expected shape for a fully regular verb, used only to flag deviations,
      // not the actual irregular-preterite-based stem a real irregular verb uses.
      if (klass === "ar") return { yo: stem + "ara", vos: stem + "aras", el: stem + "ara", nosotros: stem + "áramos", ellos: stem + "aran" }[personKey];
      return { yo: stem + "iera", vos: stem + "ieras", el: stem + "iera", nosotros: stem + "iéramos", ellos: stem + "ieran" }[personKey];
    }
    return null;
  }

  function stripReflexivePronoun(form, personKey, reflexive) {
    if (!reflexive || !form) return form;
    var pron = REFLEXIVE_PRONOUNS[personKey];
    var prefix = pron + " ";
    if (form.toLowerCase().indexOf(prefix) === 0) return form.slice(prefix.length);
    return form;
  }

  function baseInfinitive(infinitive, reflexive) {
    if (!reflexive) return infinitive;
    return (infinitive || "").toLowerCase().replace(/se$/, "");
  }

  function isCellIrregular(data, tenseKey, personKey, actualValue) {
    if (!actualValue) return false;
    var base = baseInfinitive(data.infinitive || "", data.reflexive);
    var expected = regularForm(base, tenseKey, personKey);
    if (expected == null) return false;
    var actual = stripReflexivePronoun(actualValue, personKey, data.reflexive);
    return actual.trim().toLowerCase() !== expected.trim().toLowerCase();
  }

  // Gustar-type verbs (see GUSTAR_LIKE_PERSON above): every person's cell
  // shows the SAME invariant singular/plural pair (from the stored él/ellos
  // forms), just with that row's dative pronoun prefixed — "me gusta /
  // gustan," "le gusta / gustan," etc. — instead of each person's own
  // (misleading) conjugated form. Used by both the detail card and the
  // flashcard deck builder so they stay in sync.
  function gustarCellText(forms, tenseKey, personKey) {
    var sing = (forms[tenseKey] && forms[tenseKey].el) || "";
    var plur = (forms[tenseKey] && forms[tenseKey].ellos) || "";
    if (!sing && !plur) return "—";
    var pronoun = GUSTAR_LIKE_PERSON[personKey].pronoun;
    var parts = [];
    if (sing) parts.push(pronoun + " " + sing);
    if (plur) parts.push(pronoun + " " + plur);
    return parts.join(" / ") || "—";
  }

  // ================= starter verbs (offered to a brand-new account) =================
  var STARTER_VERBS = [
    { infinitive: "ser", definition: "to be (essential)", type: "-er", irregularity: "irregular (total)", pattern: "fully irregular", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: true, forms: { presente: { yo: "soy", vos: "sos", el: "es", nosotros: "somos", ellos: "son" }, preterito: { yo: "fui", vos: "fuiste", el: "fue", nosotros: "fuimos", ellos: "fueron" }, imperfecto: { yo: "era", vos: "eras", el: "era", nosotros: "éramos", ellos: "eran" }, futuro: { yo: "seré", vos: "serás", el: "será", nosotros: "seremos", ellos: "serán" }, condicional: { yo: "sería", vos: "serías", el: "sería", nosotros: "seríamos", ellos: "serían" }, subjPresente: { yo: "sea", vos: "seas", el: "sea", nosotros: "seamos", ellos: "sean" }, subjPasado: { yo: "fuera", vos: "fueras", el: "fuera", nosotros: "fuéramos", ellos: "fueran" }, imperativo: { vos: "sé", usted: "sea", nosotros: "seamos", ustedes: "sean" }, gerundio: "siendo", participio: "sido" } },
    { infinitive: "estar", definition: "to be (state)", type: "-ar", irregularity: "irregular (yo)", pattern: "irregular yo + accents", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: true, forms: { presente: { yo: "estoy", vos: "estás", el: "está", nosotros: "estamos", ellos: "están" }, preterito: { yo: "estuve", vos: "estuviste", el: "estuvo", nosotros: "estuvimos", ellos: "estuvieron" }, imperfecto: { yo: "estaba", vos: "estabas", el: "estaba", nosotros: "estábamos", ellos: "estaban" }, futuro: { yo: "estaré", vos: "estarás", el: "estará", nosotros: "estaremos", ellos: "estarán" }, condicional: { yo: "estaría", vos: "estarías", el: "estaría", nosotros: "estaríamos", ellos: "estarían" }, subjPresente: { yo: "esté", vos: "estés", el: "esté", nosotros: "estemos", ellos: "estén" }, subjPasado: { yo: "estuviera", vos: "estuvieras", el: "estuviera", nosotros: "estuviéramos", ellos: "estuvieran" }, imperativo: { vos: "está", usted: "esté", nosotros: "estemos", ustedes: "estén" }, gerundio: "estando", participio: "estado" } },
    { infinitive: "tener", definition: "to have", type: "-er", irregularity: "cambio de raíz", pattern: "stem-change e→ie + irregular yo", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: true, forms: { presente: { yo: "tengo", vos: "tenés", el: "tiene", nosotros: "tenemos", ellos: "tienen" }, preterito: { yo: "tuve", vos: "tuviste", el: "tuvo", nosotros: "tuvimos", ellos: "tuvieron" }, imperfecto: { yo: "tenía", vos: "tenías", el: "tenía", nosotros: "teníamos", ellos: "tenían" }, futuro: { yo: "tendré", vos: "tendrás", el: "tendrá", nosotros: "tendremos", ellos: "tendrán" }, condicional: { yo: "tendría", vos: "tendrías", el: "tendría", nosotros: "tendríamos", ellos: "tendrían" }, subjPresente: { yo: "tenga", vos: "tengas", el: "tenga", nosotros: "tengamos", ellos: "tengan" }, subjPasado: { yo: "tuviera", vos: "tuvieras", el: "tuviera", nosotros: "tuviéramos", ellos: "tuvieran" }, imperativo: { vos: "tené", usted: "tenga", nosotros: "tengamos", ustedes: "tengan" }, gerundio: "teniendo", participio: "tenido" } },
    { infinitive: "hacer", definition: "to do/make", type: "-er", irregularity: "irregular (yo)", pattern: "irregular yo + irregular preterite", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "hago", vos: "hacés", el: "hace", nosotros: "hacemos", ellos: "hacen" }, preterito: { yo: "hice", vos: "hiciste", el: "hizo", nosotros: "hicimos", ellos: "hicieron" }, imperfecto: { yo: "hacía", vos: "hacías", el: "hacía", nosotros: "hacíamos", ellos: "hacían" }, futuro: { yo: "haré", vos: "harás", el: "hará", nosotros: "haremos", ellos: "harán" }, condicional: { yo: "haría", vos: "harías", el: "haría", nosotros: "haríamos", ellos: "harían" }, subjPresente: { yo: "haga", vos: "hagas", el: "haga", nosotros: "hagamos", ellos: "hagan" }, subjPasado: { yo: "hiciera", vos: "hicieras", el: "hiciera", nosotros: "hiciéramos", ellos: "hicieran" }, imperativo: { vos: "hacé", usted: "haga", nosotros: "hagamos", ustedes: "hagan" }, gerundio: "haciendo", participio: "hecho" } },
    { infinitive: "poder", definition: "to be able to", type: "-er", irregularity: "cambio de raíz", pattern: "stem-change o→ue + irregular preterite", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: true, forms: { presente: { yo: "puedo", vos: "podés", el: "puede", nosotros: "podemos", ellos: "pueden" }, preterito: { yo: "pude", vos: "pudiste", el: "pudo", nosotros: "pudimos", ellos: "pudieron" }, imperfecto: { yo: "podía", vos: "podías", el: "podía", nosotros: "podíamos", ellos: "podían" }, futuro: { yo: "podré", vos: "podrás", el: "podrá", nosotros: "podremos", ellos: "podrán" }, condicional: { yo: "podría", vos: "podrías", el: "podría", nosotros: "podríamos", ellos: "podrían" }, subjPresente: { yo: "pueda", vos: "puedas", el: "pueda", nosotros: "podamos", ellos: "puedan" }, subjPasado: { yo: "pudiera", vos: "pudieras", el: "pudiera", nosotros: "pudiéramos", ellos: "pudieran" }, imperativo: { vos: "podé", usted: "pueda", nosotros: "podamos", ustedes: "puedan" }, gerundio: "pudiendo", participio: "podido" } },
    { infinitive: "decir", definition: "to say/tell", type: "-ir", irregularity: "cambio de raíz", pattern: "stem-change e→i + irregular yo + irregular preterite", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "digo", vos: "decís", el: "dice", nosotros: "decimos", ellos: "dicen" }, preterito: { yo: "dije", vos: "dijiste", el: "dijo", nosotros: "dijimos", ellos: "dijeron" }, imperfecto: { yo: "decía", vos: "decías", el: "decía", nosotros: "decíamos", ellos: "decían" }, futuro: { yo: "diré", vos: "dirás", el: "dirá", nosotros: "diremos", ellos: "dirán" }, condicional: { yo: "diría", vos: "dirías", el: "diría", nosotros: "diríamos", ellos: "dirían" }, subjPresente: { yo: "diga", vos: "digas", el: "diga", nosotros: "digamos", ellos: "digan" }, subjPasado: { yo: "dijera", vos: "dijeras", el: "dijera", nosotros: "dijéramos", ellos: "dijeran" }, imperativo: { vos: "decí", usted: "diga", nosotros: "digamos", ustedes: "digan" }, gerundio: "diciendo", participio: "dicho" } },
    { infinitive: "ir", definition: "to go", type: "-ir", irregularity: "irregular (total)", pattern: "fully irregular", reflexive: false, transitivity: "intransitivo", preposicion: "a", auxiliar: true, forms: { presente: { yo: "voy", vos: "vas", el: "va", nosotros: "vamos", ellos: "van" }, preterito: { yo: "fui", vos: "fuiste", el: "fue", nosotros: "fuimos", ellos: "fueron" }, imperfecto: { yo: "iba", vos: "ibas", el: "iba", nosotros: "íbamos", ellos: "iban" }, futuro: { yo: "iré", vos: "irás", el: "irá", nosotros: "iremos", ellos: "irán" }, condicional: { yo: "iría", vos: "irías", el: "iría", nosotros: "iríamos", ellos: "irían" }, subjPresente: { yo: "vaya", vos: "vayas", el: "vaya", nosotros: "vayamos", ellos: "vayan" }, subjPasado: { yo: "fuera", vos: "fueras", el: "fuera", nosotros: "fuéramos", ellos: "fueran" }, imperativo: { vos: "andá", usted: "vaya", nosotros: "vamos", ustedes: "vayan" }, gerundio: "yendo", participio: "ido" } },
    { infinitive: "venir", definition: "to come", type: "-ir", irregularity: "cambio de raíz", pattern: "stem-change e→ie + irregular yo + irregular preterite", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "vengo", vos: "venís", el: "viene", nosotros: "venimos", ellos: "vienen" }, preterito: { yo: "vine", vos: "viniste", el: "vino", nosotros: "vinimos", ellos: "vinieron" }, imperfecto: { yo: "venía", vos: "venías", el: "venía", nosotros: "veníamos", ellos: "venían" }, futuro: { yo: "vendré", vos: "vendrás", el: "vendrá", nosotros: "vendremos", ellos: "vendrán" }, condicional: { yo: "vendría", vos: "vendrías", el: "vendría", nosotros: "vendríamos", ellos: "vendrían" }, subjPresente: { yo: "venga", vos: "vengas", el: "venga", nosotros: "vengamos", ellos: "vengan" }, subjPasado: { yo: "viniera", vos: "vinieras", el: "viniera", nosotros: "viniéramos", ellos: "vinieran" }, imperativo: { vos: "vení", usted: "venga", nosotros: "vengamos", ustedes: "vengan" }, gerundio: "viniendo", participio: "venido" } },
    { infinitive: "querer", definition: "to want/love", type: "-er", irregularity: "cambio de raíz", pattern: "stem-change e→ie + irregular preterite", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: true, forms: { presente: { yo: "quiero", vos: "querés", el: "quiere", nosotros: "queremos", ellos: "quieren" }, preterito: { yo: "quise", vos: "quisiste", el: "quiso", nosotros: "quisimos", ellos: "quisieron" }, imperfecto: { yo: "quería", vos: "querías", el: "quería", nosotros: "queríamos", ellos: "querían" }, futuro: { yo: "querré", vos: "querrás", el: "querrá", nosotros: "querremos", ellos: "querrán" }, condicional: { yo: "querría", vos: "querrías", el: "querría", nosotros: "querríamos", ellos: "querrían" }, subjPresente: { yo: "quiera", vos: "quieras", el: "quiera", nosotros: "queramos", ellos: "quieran" }, subjPasado: { yo: "quisiera", vos: "quisieras", el: "quisiera", nosotros: "quisiéramos", ellos: "quisieran" }, imperativo: { vos: "queré", usted: "quiera", nosotros: "queramos", ustedes: "quieran" }, gerundio: "queriendo", participio: "querido" } },
    { infinitive: "levantarse", definition: "to get up", type: "-ar", irregularity: "regular", pattern: "regular reflexive", reflexive: true, transitivity: "intransitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "me levanto", vos: "te levantás", el: "se levanta", nosotros: "nos levantamos", ellos: "se levantan" }, preterito: { yo: "me levanté", vos: "te levantaste", el: "se levantó", nosotros: "nos levantamos", ellos: "se levantaron" }, imperfecto: { yo: "me levantaba", vos: "te levantabas", el: "se levantaba", nosotros: "nos levantábamos", ellos: "se levantaban" }, futuro: { yo: "me levantaré", vos: "te levantarás", el: "se levantará", nosotros: "nos levantaremos", ellos: "se levantarán" }, condicional: { yo: "me levantaría", vos: "te levantarías", el: "se levantaría", nosotros: "nos levantaríamos", ellos: "se levantarían" }, subjPresente: { yo: "me levante", vos: "te levantes", el: "se levante", nosotros: "nos levantemos", ellos: "se levanten" }, subjPasado: { yo: "me levantara", vos: "te levantaras", el: "se levantara", nosotros: "nos levantáramos", ellos: "se levantaran" }, imperativo: { vos: "levantate", usted: "se levante", nosotros: "nos levantemos", ustedes: "se levanten" }, gerundio: "levantándose", participio: "levantado" } },
    { infinitive: "haber", definition: "to have (auxiliary)", type: "-er", irregularity: "irregular (total)", pattern: "fully irregular (auxiliary verb)", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: true, forms: { presente: { yo: "he", vos: "has", el: "ha", nosotros: "hemos", ellos: "han" }, preterito: { yo: "hube", vos: "hubiste", el: "hubo", nosotros: "hubimos", ellos: "hubieron" }, imperfecto: { yo: "había", vos: "habías", el: "había", nosotros: "habíamos", ellos: "habían" }, futuro: { yo: "habré", vos: "habrás", el: "habrá", nosotros: "habremos", ellos: "habrán" }, condicional: { yo: "habría", vos: "habrías", el: "habría", nosotros: "habríamos", ellos: "habrían" }, subjPresente: { yo: "haya", vos: "hayas", el: "haya", nosotros: "hayamos", ellos: "hayan" }, subjPasado: { yo: "hubiera", vos: "hubieras", el: "hubiera", nosotros: "hubiéramos", ellos: "hubieran" }, gerundio: "habiendo", participio: "habido", impersonal: { presente: "hay", preterito: "hubo", imperfecto: "había", futuro: "habrá", condicional: "habría", subjPresente: "haya" } } },
    { infinitive: "correr", definition: "to run", type: "-er", irregularity: "regular", pattern: "regular -er", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "corro", vos: "corrés", el: "corre", nosotros: "corremos", ellos: "corren" }, preterito: { yo: "corrí", vos: "corriste", el: "corrió", nosotros: "corrimos", ellos: "corrieron" }, imperfecto: { yo: "corría", vos: "corrías", el: "corría", nosotros: "corríamos", ellos: "corrían" }, futuro: { yo: "correré", vos: "correrás", el: "correrá", nosotros: "correremos", ellos: "correrán" }, condicional: { yo: "correría", vos: "correrías", el: "correría", nosotros: "correríamos", ellos: "correrían" }, subjPresente: { yo: "corra", vos: "corras", el: "corra", nosotros: "corramos", ellos: "corran" }, subjPasado: { yo: "corriera", vos: "corrieras", el: "corriera", nosotros: "corriéramos", ellos: "corrieran" }, imperativo: { vos: "corré", usted: "corra", nosotros: "corramos", ustedes: "corran" }, gerundio: "corriendo", participio: "corrido" } },
    { infinitive: "ver", definition: "to see", type: "-er", irregularity: "irregular (total)", pattern: "irregular imperfect (veía) + irregular participle (visto)", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "veo", vos: "ves", el: "ve", nosotros: "vemos", ellos: "ven" }, preterito: { yo: "vi", vos: "viste", el: "vio", nosotros: "vimos", ellos: "vieron" }, imperfecto: { yo: "veía", vos: "veías", el: "veía", nosotros: "veíamos", ellos: "veían" }, futuro: { yo: "veré", vos: "verás", el: "verá", nosotros: "veremos", ellos: "verán" }, condicional: { yo: "vería", vos: "verías", el: "vería", nosotros: "veríamos", ellos: "verían" }, subjPresente: { yo: "vea", vos: "veas", el: "vea", nosotros: "veamos", ellos: "vean" }, subjPasado: { yo: "viera", vos: "vieras", el: "viera", nosotros: "viéramos", ellos: "vieran" }, imperativo: { vos: "ve", usted: "vea", nosotros: "veamos", ustedes: "vean" }, gerundio: "viendo", participio: "visto" } },
    { infinitive: "subir", definition: "to go up / to climb", type: "-ir", irregularity: "regular", pattern: "regular -ir", reflexive: false, transitivity: "ambos", preposicion: "a", auxiliar: false, forms: { presente: { yo: "subo", vos: "subís", el: "sube", nosotros: "subimos", ellos: "suben" }, preterito: { yo: "subí", vos: "subiste", el: "subió", nosotros: "subimos", ellos: "subieron" }, imperfecto: { yo: "subía", vos: "subías", el: "subía", nosotros: "subíamos", ellos: "subían" }, futuro: { yo: "subiré", vos: "subirás", el: "subirá", nosotros: "subiremos", ellos: "subirán" }, condicional: { yo: "subiría", vos: "subirías", el: "subiría", nosotros: "subiríamos", ellos: "subirían" }, subjPresente: { yo: "suba", vos: "subas", el: "suba", nosotros: "subamos", ellos: "suban" }, subjPasado: { yo: "subiera", vos: "subieras", el: "subiera", nosotros: "subiéramos", ellos: "subieran" }, imperativo: { vos: "subí", usted: "suba", nosotros: "subamos", ustedes: "suban" }, gerundio: "subiendo", participio: "subido" } },
    { infinitive: "saber", definition: "to know (facts/skills)", type: "-er", irregularity: "irregular (yo)", pattern: "irregular yo (sé) + irregular preterite + irregular future stem + irregular subjunctive", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "sé", vos: "sabés", el: "sabe", nosotros: "sabemos", ellos: "saben" }, preterito: { yo: "supe", vos: "supiste", el: "supo", nosotros: "supimos", ellos: "supieron" }, imperfecto: { yo: "sabía", vos: "sabías", el: "sabía", nosotros: "sabíamos", ellos: "sabían" }, futuro: { yo: "sabré", vos: "sabrás", el: "sabrá", nosotros: "sabremos", ellos: "sabrán" }, condicional: { yo: "sabría", vos: "sabrías", el: "sabría", nosotros: "sabríamos", ellos: "sabrían" }, subjPresente: { yo: "sepa", vos: "sepas", el: "sepa", nosotros: "sepamos", ellos: "sepan" }, subjPasado: { yo: "supiera", vos: "supieras", el: "supiera", nosotros: "supiéramos", ellos: "supieran" }, imperativo: { vos: "sabé", usted: "sepa", nosotros: "sepamos", ustedes: "sepan" }, gerundio: "sabiendo", participio: "sabido" } },
    { infinitive: "conocer", definition: "to know (people/places)", type: "-er", irregularity: "irregular (yo)", pattern: "irregular yo (c→zc) + irregular subjunctive", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "conozco", vos: "conocés", el: "conoce", nosotros: "conocemos", ellos: "conocen" }, preterito: { yo: "conocí", vos: "conociste", el: "conoció", nosotros: "conocimos", ellos: "conocieron" }, imperfecto: { yo: "conocía", vos: "conocías", el: "conocía", nosotros: "conocíamos", ellos: "conocían" }, futuro: { yo: "conoceré", vos: "conocerás", el: "conocerá", nosotros: "conoceremos", ellos: "conocerán" }, condicional: { yo: "conocería", vos: "conocerías", el: "conocería", nosotros: "conoceríamos", ellos: "conocerían" }, subjPresente: { yo: "conozca", vos: "conozcas", el: "conozca", nosotros: "conozcamos", ellos: "conozcan" }, subjPasado: { yo: "conociera", vos: "conocieras", el: "conociera", nosotros: "conociéramos", ellos: "conocieran" }, imperativo: { vos: "conocé", usted: "conozca", nosotros: "conozcamos", ustedes: "conozcan" }, gerundio: "conociendo", participio: "conocido" } },
    { infinitive: "usar", definition: "to use", type: "-ar", irregularity: "regular", pattern: "regular -ar", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "uso", vos: "usás", el: "usa", nosotros: "usamos", ellos: "usan" }, preterito: { yo: "usé", vos: "usaste", el: "usó", nosotros: "usamos", ellos: "usaron" }, imperfecto: { yo: "usaba", vos: "usabas", el: "usaba", nosotros: "usábamos", ellos: "usaban" }, futuro: { yo: "usaré", vos: "usarás", el: "usará", nosotros: "usaremos", ellos: "usarán" }, condicional: { yo: "usaría", vos: "usarías", el: "usaría", nosotros: "usaríamos", ellos: "usarían" }, subjPresente: { yo: "use", vos: "uses", el: "use", nosotros: "usemos", ellos: "usen" }, subjPasado: { yo: "usara", vos: "usaras", el: "usara", nosotros: "usáramos", ellos: "usaran" }, imperativo: { vos: "usá", usted: "use", nosotros: "usemos", ustedes: "usen" }, gerundio: "usando", participio: "usado" } },
    { infinitive: "nacer", definition: "to be born", type: "-er", irregularity: "irregular (yo)", pattern: "irregular yo (c→zc) + irregular subjunctive", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "nazco", vos: "nacés", el: "nace", nosotros: "nacemos", ellos: "nacen" }, preterito: { yo: "nací", vos: "naciste", el: "nació", nosotros: "nacimos", ellos: "nacieron" }, imperfecto: { yo: "nacía", vos: "nacías", el: "nacía", nosotros: "nacíamos", ellos: "nacían" }, futuro: { yo: "naceré", vos: "nacerás", el: "nacerá", nosotros: "naceremos", ellos: "nacerán" }, condicional: { yo: "nacería", vos: "nacerías", el: "nacería", nosotros: "naceríamos", ellos: "nacerían" }, subjPresente: { yo: "nazca", vos: "nazcas", el: "nazca", nosotros: "nazcamos", ellos: "nazcan" }, subjPasado: { yo: "naciera", vos: "nacieras", el: "naciera", nosotros: "naciéramos", ellos: "nacieran" }, imperativo: { vos: "nacé", usted: "nazca", nosotros: "nazcamos", ustedes: "nazcan" }, gerundio: "naciendo", participio: "nacido" } },
    { infinitive: "nadar", definition: "to swim", type: "-ar", irregularity: "regular", pattern: "regular -ar", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "nado", vos: "nadás", el: "nada", nosotros: "nadamos", ellos: "nadan" }, preterito: { yo: "nadé", vos: "nadaste", el: "nadó", nosotros: "nadamos", ellos: "nadaron" }, imperfecto: { yo: "nadaba", vos: "nadabas", el: "nadaba", nosotros: "nadábamos", ellos: "nadaban" }, futuro: { yo: "nadaré", vos: "nadarás", el: "nadará", nosotros: "nadaremos", ellos: "nadarán" }, condicional: { yo: "nadaría", vos: "nadarías", el: "nadaría", nosotros: "nadaríamos", ellos: "nadarían" }, subjPresente: { yo: "nade", vos: "nades", el: "nade", nosotros: "nademos", ellos: "naden" }, subjPasado: { yo: "nadara", vos: "nadaras", el: "nadara", nosotros: "nadáramos", ellos: "nadaran" }, imperativo: { vos: "nadá", usted: "nade", nosotros: "nademos", ustedes: "naden" }, gerundio: "nadando", participio: "nadado" } },
    { infinitive: "comer", definition: "to eat", type: "-er", irregularity: "regular", pattern: "regular -er", reflexive: false, transitivity: "ambos", preposicion: "", auxiliar: false, forms: { presente: { yo: "como", vos: "comés", el: "come", nosotros: "comemos", ellos: "comen" }, preterito: { yo: "comí", vos: "comiste", el: "comió", nosotros: "comimos", ellos: "comieron" }, imperfecto: { yo: "comía", vos: "comías", el: "comía", nosotros: "comíamos", ellos: "comían" }, futuro: { yo: "comeré", vos: "comerás", el: "comerá", nosotros: "comeremos", ellos: "comerán" }, condicional: { yo: "comería", vos: "comerías", el: "comería", nosotros: "comeríamos", ellos: "comerían" }, subjPresente: { yo: "coma", vos: "comas", el: "coma", nosotros: "comamos", ellos: "coman" }, subjPasado: { yo: "comiera", vos: "comieras", el: "comiera", nosotros: "comiéramos", ellos: "comieran" }, imperativo: { vos: "comé", usted: "coma", nosotros: "comamos", ustedes: "coman" }, gerundio: "comiendo", participio: "comido" } },
    { infinitive: "dar", definition: "to give", type: "-ar", irregularity: "irregular (yo)", pattern: "irregular preterite (di, dio) + irregular subjunctive (dé)", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "doy", vos: "das", el: "da", nosotros: "damos", ellos: "dan" }, preterito: { yo: "di", vos: "diste", el: "dio", nosotros: "dimos", ellos: "dieron" }, imperfecto: { yo: "daba", vos: "dabas", el: "daba", nosotros: "dábamos", ellos: "daban" }, futuro: { yo: "daré", vos: "darás", el: "dará", nosotros: "daremos", ellos: "darán" }, condicional: { yo: "daría", vos: "darías", el: "daría", nosotros: "daríamos", ellos: "darían" }, subjPresente: { yo: "dé", vos: "des", el: "dé", nosotros: "demos", ellos: "den" }, subjPasado: { yo: "diera", vos: "dieras", el: "diera", nosotros: "diéramos", ellos: "dieran" }, imperativo: { vos: "da", usted: "dé", nosotros: "demos", ustedes: "den" }, gerundio: "dando", participio: "dado" } },
    { infinitive: "llegar", definition: "to arrive", type: "-ar", irregularity: "regular", pattern: "cambio ortográfico g→gu ante e (llegué, llegue)", reflexive: false, transitivity: "intransitivo", preposicion: "a", auxiliar: false, forms: { presente: { yo: "llego", vos: "llegás", el: "llega", nosotros: "llegamos", ellos: "llegan" }, preterito: { yo: "llegué", vos: "llegaste", el: "llegó", nosotros: "llegamos", ellos: "llegaron" }, imperfecto: { yo: "llegaba", vos: "llegabas", el: "llegaba", nosotros: "llegábamos", ellos: "llegaban" }, futuro: { yo: "llegaré", vos: "llegarás", el: "llegará", nosotros: "llegaremos", ellos: "llegarán" }, condicional: { yo: "llegaría", vos: "llegarías", el: "llegaría", nosotros: "llegaríamos", ellos: "llegarían" }, subjPresente: { yo: "llegue", vos: "llegues", el: "llegue", nosotros: "lleguemos", ellos: "lleguen" }, subjPasado: { yo: "llegara", vos: "llegaras", el: "llegara", nosotros: "llegáramos", ellos: "llegaran" }, imperativo: { vos: "llegá", usted: "llegue", nosotros: "lleguemos", ustedes: "lleguen" }, gerundio: "llegando", participio: "llegado" } },
    { infinitive: "pasar", definition: "to happen / to pass by", type: "-ar", irregularity: "regular", pattern: "regular -ar", reflexive: false, transitivity: "ambos", preposicion: "por", auxiliar: false, forms: { presente: { yo: "paso", vos: "pasás", el: "pasa", nosotros: "pasamos", ellos: "pasan" }, preterito: { yo: "pasé", vos: "pasaste", el: "pasó", nosotros: "pasamos", ellos: "pasaron" }, imperfecto: { yo: "pasaba", vos: "pasabas", el: "pasaba", nosotros: "pasábamos", ellos: "pasaban" }, futuro: { yo: "pasaré", vos: "pasarás", el: "pasará", nosotros: "pasaremos", ellos: "pasarán" }, condicional: { yo: "pasaría", vos: "pasarías", el: "pasaría", nosotros: "pasaríamos", ellos: "pasarían" }, subjPresente: { yo: "pase", vos: "pases", el: "pase", nosotros: "pasemos", ellos: "pasen" }, subjPasado: { yo: "pasara", vos: "pasaras", el: "pasara", nosotros: "pasáramos", ellos: "pasaran" }, imperativo: { vos: "pasá", usted: "pase", nosotros: "pasemos", ustedes: "pasen" }, gerundio: "pasando", participio: "pasado" } },
    { infinitive: "deber", definition: "should / to owe", type: "-er", irregularity: "regular", pattern: "regular -er", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: true, forms: { presente: { yo: "debo", vos: "debés", el: "debe", nosotros: "debemos", ellos: "deben" }, preterito: { yo: "debí", vos: "debiste", el: "debió", nosotros: "debimos", ellos: "debieron" }, imperfecto: { yo: "debía", vos: "debías", el: "debía", nosotros: "debíamos", ellos: "debían" }, futuro: { yo: "deberé", vos: "deberás", el: "deberá", nosotros: "deberemos", ellos: "deberán" }, condicional: { yo: "debería", vos: "deberías", el: "debería", nosotros: "deberíamos", ellos: "deberían" }, subjPresente: { yo: "deba", vos: "debas", el: "deba", nosotros: "debamos", ellos: "deban" }, subjPasado: { yo: "debiera", vos: "debieras", el: "debiera", nosotros: "debiéramos", ellos: "debieran" }, imperativo: { vos: "debé", usted: "deba", nosotros: "debamos", ustedes: "deban" }, gerundio: "debiendo", participio: "debido" } },
    { infinitive: "poner", definition: "to put / to place", type: "-er", irregularity: "irregular (yo)", pattern: "irregular yo (pongo) + irregular preterite + irregular future stem + irregular participle (puesto)", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "pongo", vos: "ponés", el: "pone", nosotros: "ponemos", ellos: "ponen" }, preterito: { yo: "puse", vos: "pusiste", el: "puso", nosotros: "pusimos", ellos: "pusieron" }, imperfecto: { yo: "ponía", vos: "ponías", el: "ponía", nosotros: "poníamos", ellos: "ponían" }, futuro: { yo: "pondré", vos: "pondrás", el: "pondrá", nosotros: "pondremos", ellos: "pondrán" }, condicional: { yo: "pondría", vos: "pondrías", el: "pondría", nosotros: "pondríamos", ellos: "pondrían" }, subjPresente: { yo: "ponga", vos: "pongas", el: "ponga", nosotros: "pongamos", ellos: "pongan" }, subjPasado: { yo: "pusiera", vos: "pusieras", el: "pusiera", nosotros: "pusiéramos", ellos: "pusieran" }, imperativo: { vos: "poné", usted: "ponga", nosotros: "pongamos", ustedes: "pongan" }, gerundio: "poniendo", participio: "puesto" } },
    { infinitive: "parecer", definition: "to seem / to appear to", type: "-er", irregularity: "irregular (yo)", pattern: "irregular yo (c→zc) + irregular subjunctive. También verbo \"tipo gustar\": el sujeto es lo que parece, y la persona lleva pronombre de objeto indirecto (me/te/le/nos/les). Ej.: \"Me parece interesante.\"", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: false, gustar_like: true, forms: { presente: { yo: "parezco", vos: "parecés", el: "parece", nosotros: "parecemos", ellos: "parecen" }, preterito: { yo: "parecí", vos: "pareciste", el: "pareció", nosotros: "parecimos", ellos: "parecieron" }, imperfecto: { yo: "parecía", vos: "parecías", el: "parecía", nosotros: "parecíamos", ellos: "parecían" }, futuro: { yo: "pareceré", vos: "parecerás", el: "parecerá", nosotros: "pareceremos", ellos: "parecerán" }, condicional: { yo: "parecería", vos: "parecerías", el: "parecería", nosotros: "pareceríamos", ellos: "parecerían" }, subjPresente: { yo: "parezca", vos: "parezcas", el: "parezca", nosotros: "parezcamos", ellos: "parezcan" }, subjPasado: { yo: "pareciera", vos: "parecieras", el: "pareciera", nosotros: "pareciéramos", ellos: "parecieran" }, imperativo: { vos: "parecé", usted: "parezca", nosotros: "parezcamos", ustedes: "parezcan" }, gerundio: "pareciendo", participio: "parecido" } },
    { infinitive: "quedar", definition: "to stay / to remain", type: "-ar", irregularity: "regular", pattern: "regular -ar", reflexive: false, transitivity: "intransitivo", preposicion: "en", auxiliar: false, forms: { presente: { yo: "quedo", vos: "quedás", el: "queda", nosotros: "quedamos", ellos: "quedan" }, preterito: { yo: "quedé", vos: "quedaste", el: "quedó", nosotros: "quedamos", ellos: "quedaron" }, imperfecto: { yo: "quedaba", vos: "quedabas", el: "quedaba", nosotros: "quedábamos", ellos: "quedaban" }, futuro: { yo: "quedaré", vos: "quedarás", el: "quedará", nosotros: "quedaremos", ellos: "quedarán" }, condicional: { yo: "quedaría", vos: "quedarías", el: "quedaría", nosotros: "quedaríamos", ellos: "quedarían" }, subjPresente: { yo: "quede", vos: "quedes", el: "quede", nosotros: "quedemos", ellos: "queden" }, subjPasado: { yo: "quedara", vos: "quedaras", el: "quedara", nosotros: "quedáramos", ellos: "quedaran" }, imperativo: { vos: "quedá", usted: "quede", nosotros: "quedemos", ustedes: "queden" }, gerundio: "quedando", participio: "quedado" } },
    { infinitive: "creer", definition: "to believe", type: "-er", irregularity: "regular", pattern: "cambio ortográfico i→y (creyó, creyendo)", reflexive: false, transitivity: "transitivo", preposicion: "en", auxiliar: false, forms: { presente: { yo: "creo", vos: "creés", el: "cree", nosotros: "creemos", ellos: "creen" }, preterito: { yo: "creí", vos: "creíste", el: "creyó", nosotros: "creímos", ellos: "creyeron" }, imperfecto: { yo: "creía", vos: "creías", el: "creía", nosotros: "creíamos", ellos: "creían" }, futuro: { yo: "creeré", vos: "creerás", el: "creerá", nosotros: "creeremos", ellos: "creerán" }, condicional: { yo: "creería", vos: "creerías", el: "creería", nosotros: "creeríamos", ellos: "creerían" }, subjPresente: { yo: "crea", vos: "creas", el: "crea", nosotros: "creamos", ellos: "crean" }, subjPasado: { yo: "creyera", vos: "creyeras", el: "creyera", nosotros: "creyéramos", ellos: "creyeran" }, imperativo: { vos: "creé", usted: "crea", nosotros: "creamos", ustedes: "crean" }, gerundio: "creyendo", participio: "creído" } },
    { infinitive: "hablar", definition: "to speak / to talk", type: "-ar", irregularity: "regular", pattern: "regular -ar", reflexive: false, transitivity: "ambos", preposicion: "", auxiliar: false, forms: { presente: { yo: "hablo", vos: "hablás", el: "habla", nosotros: "hablamos", ellos: "hablan" }, preterito: { yo: "hablé", vos: "hablaste", el: "habló", nosotros: "hablamos", ellos: "hablaron" }, imperfecto: { yo: "hablaba", vos: "hablabas", el: "hablaba", nosotros: "hablábamos", ellos: "hablaban" }, futuro: { yo: "hablaré", vos: "hablarás", el: "hablará", nosotros: "hablaremos", ellos: "hablarán" }, condicional: { yo: "hablaría", vos: "hablarías", el: "hablaría", nosotros: "hablaríamos", ellos: "hablarían" }, subjPresente: { yo: "hable", vos: "hables", el: "hable", nosotros: "hablemos", ellos: "hablen" }, subjPasado: { yo: "hablara", vos: "hablaras", el: "hablara", nosotros: "habláramos", ellos: "hablaran" }, imperativo: { vos: "hablá", usted: "hable", nosotros: "hablemos", ustedes: "hablen" }, gerundio: "hablando", participio: "hablado" } },
    { infinitive: "llevar", definition: "to carry / to take", type: "-ar", irregularity: "regular", pattern: "regular -ar", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "llevo", vos: "llevás", el: "lleva", nosotros: "llevamos", ellos: "llevan" }, preterito: { yo: "llevé", vos: "llevaste", el: "llevó", nosotros: "llevamos", ellos: "llevaron" }, imperfecto: { yo: "llevaba", vos: "llevabas", el: "llevaba", nosotros: "llevábamos", ellos: "llevaban" }, futuro: { yo: "llevaré", vos: "llevarás", el: "llevará", nosotros: "llevaremos", ellos: "llevarán" }, condicional: { yo: "llevaría", vos: "llevarías", el: "llevaría", nosotros: "llevaríamos", ellos: "llevarían" }, subjPresente: { yo: "lleve", vos: "lleves", el: "lleve", nosotros: "llevemos", ellos: "lleven" }, subjPasado: { yo: "llevara", vos: "llevaras", el: "llevara", nosotros: "lleváramos", ellos: "llevaran" }, imperativo: { vos: "llevá", usted: "lleve", nosotros: "llevemos", ustedes: "lleven" }, gerundio: "llevando", participio: "llevado" } },
    { infinitive: "dejar", definition: "to leave / to let", type: "-ar", irregularity: "regular", pattern: "regular -ar", reflexive: false, transitivity: "transitivo", preposicion: "de", auxiliar: false, forms: { presente: { yo: "dejo", vos: "dejás", el: "deja", nosotros: "dejamos", ellos: "dejan" }, preterito: { yo: "dejé", vos: "dejaste", el: "dejó", nosotros: "dejamos", ellos: "dejaron" }, imperfecto: { yo: "dejaba", vos: "dejabas", el: "dejaba", nosotros: "dejábamos", ellos: "dejaban" }, futuro: { yo: "dejaré", vos: "dejarás", el: "dejará", nosotros: "dejaremos", ellos: "dejarán" }, condicional: { yo: "dejaría", vos: "dejarías", el: "dejaría", nosotros: "dejaríamos", ellos: "dejarían" }, subjPresente: { yo: "deje", vos: "dejes", el: "deje", nosotros: "dejemos", ellos: "dejen" }, subjPasado: { yo: "dejara", vos: "dejaras", el: "dejara", nosotros: "dejáramos", ellos: "dejaran" }, imperativo: { vos: "dejá", usted: "deje", nosotros: "dejemos", ustedes: "dejen" }, gerundio: "dejando", participio: "dejado" } },
    { infinitive: "seguir", definition: "to follow / to continue", type: "-ir", irregularity: "cambio de raíz", pattern: "cambio de raíz e→i + irregular yo (sigo)", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "sigo", vos: "seguís", el: "sigue", nosotros: "seguimos", ellos: "siguen" }, preterito: { yo: "seguí", vos: "seguiste", el: "siguió", nosotros: "seguimos", ellos: "siguieron" }, imperfecto: { yo: "seguía", vos: "seguías", el: "seguía", nosotros: "seguíamos", ellos: "seguían" }, futuro: { yo: "seguiré", vos: "seguirás", el: "seguirá", nosotros: "seguiremos", ellos: "seguirán" }, condicional: { yo: "seguiría", vos: "seguirías", el: "seguiría", nosotros: "seguiríamos", ellos: "seguirían" }, subjPresente: { yo: "siga", vos: "sigas", el: "siga", nosotros: "sigamos", ellos: "sigan" }, subjPasado: { yo: "siguiera", vos: "siguieras", el: "siguiera", nosotros: "siguiéramos", ellos: "siguieran" }, imperativo: { vos: "seguí", usted: "siga", nosotros: "sigamos", ustedes: "sigan" }, gerundio: "siguiendo", participio: "seguido" } },
    { infinitive: "encontrar", definition: "to find", type: "-ar", irregularity: "cambio de raíz", pattern: "cambio de raíz o→ue", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "encuentro", vos: "encontrás", el: "encuentra", nosotros: "encontramos", ellos: "encuentran" }, preterito: { yo: "encontré", vos: "encontraste", el: "encontró", nosotros: "encontramos", ellos: "encontraron" }, imperfecto: { yo: "encontraba", vos: "encontrabas", el: "encontraba", nosotros: "encontrábamos", ellos: "encontraban" }, futuro: { yo: "encontraré", vos: "encontrarás", el: "encontrará", nosotros: "encontraremos", ellos: "encontrarán" }, condicional: { yo: "encontraría", vos: "encontrarías", el: "encontraría", nosotros: "encontraríamos", ellos: "encontrarían" }, subjPresente: { yo: "encuentre", vos: "encuentres", el: "encuentre", nosotros: "encontremos", ellos: "encuentren" }, subjPasado: { yo: "encontrara", vos: "encontraras", el: "encontrara", nosotros: "encontráramos", ellos: "encontraran" }, imperativo: { vos: "encontrá", usted: "encuentre", nosotros: "encontremos", ustedes: "encuentren" }, gerundio: "encontrando", participio: "encontrado" } },
    { infinitive: "llamar", definition: "to call", type: "-ar", irregularity: "regular", pattern: "regular -ar", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "llamo", vos: "llamás", el: "llama", nosotros: "llamamos", ellos: "llaman" }, preterito: { yo: "llamé", vos: "llamaste", el: "llamó", nosotros: "llamamos", ellos: "llamaron" }, imperfecto: { yo: "llamaba", vos: "llamabas", el: "llamaba", nosotros: "llamábamos", ellos: "llamaban" }, futuro: { yo: "llamaré", vos: "llamarás", el: "llamará", nosotros: "llamaremos", ellos: "llamarán" }, condicional: { yo: "llamaría", vos: "llamarías", el: "llamaría", nosotros: "llamaríamos", ellos: "llamarían" }, subjPresente: { yo: "llame", vos: "llames", el: "llame", nosotros: "llamemos", ellos: "llamen" }, subjPasado: { yo: "llamara", vos: "llamaras", el: "llamara", nosotros: "llamáramos", ellos: "llamaran" }, imperativo: { vos: "llamá", usted: "llame", nosotros: "llamemos", ustedes: "llamen" }, gerundio: "llamando", participio: "llamado" } },
    { infinitive: "llover", definition: "to rain", type: "-er", irregularity: "cambio de raíz", pattern: "verbo impersonal — solo se usa en 3ª persona / forma impersonal (llueve)", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "", vos: "", el: "", nosotros: "", ellos: "" }, preterito: { yo: "", vos: "", el: "", nosotros: "", ellos: "" }, imperfecto: { yo: "", vos: "", el: "", nosotros: "", ellos: "" }, futuro: { yo: "", vos: "", el: "", nosotros: "", ellos: "" }, condicional: { yo: "", vos: "", el: "", nosotros: "", ellos: "" }, subjPresente: { yo: "", vos: "", el: "", nosotros: "", ellos: "" }, gerundio: "lloviendo", participio: "llovido", impersonal: { presente: "llueve", preterito: "llovió", imperfecto: "llovía", futuro: "lloverá", condicional: "llovería", subjPresente: "llueva", subjPasado: "lloviera" } } },
    { infinitive: "nevar", definition: "to snow", type: "-ar", irregularity: "cambio de raíz", pattern: "verbo impersonal — solo se usa en 3ª persona / forma impersonal (nieva)", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "", vos: "", el: "", nosotros: "", ellos: "" }, preterito: { yo: "", vos: "", el: "", nosotros: "", ellos: "" }, imperfecto: { yo: "", vos: "", el: "", nosotros: "", ellos: "" }, futuro: { yo: "", vos: "", el: "", nosotros: "", ellos: "" }, condicional: { yo: "", vos: "", el: "", nosotros: "", ellos: "" }, subjPresente: { yo: "", vos: "", el: "", nosotros: "", ellos: "" }, gerundio: "nevando", participio: "nevado", impersonal: { presente: "nieva", preterito: "nevó", imperfecto: "nevaba", futuro: "nevará", condicional: "nevaría", subjPresente: "nieve", subjPasado: "nevara" } } },
    { infinitive: "irse", definition: "to leave / to go away", type: "-ir", irregularity: "irregular (total)", pattern: "fully irregular (reflexive of ir)", reflexive: true, transitivity: "intransitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "me voy", vos: "te vas", el: "se va", nosotros: "nos vamos", ellos: "se van" }, preterito: { yo: "me fui", vos: "te fuiste", el: "se fue", nosotros: "nos fuimos", ellos: "se fueron" }, imperfecto: { yo: "me iba", vos: "te ibas", el: "se iba", nosotros: "nos íbamos", ellos: "se iban" }, futuro: { yo: "me iré", vos: "te irás", el: "se irá", nosotros: "nos iremos", ellos: "se irán" }, condicional: { yo: "me iría", vos: "te irías", el: "se iría", nosotros: "nos iríamos", ellos: "se irían" }, subjPresente: { yo: "me vaya", vos: "te vayas", el: "se vaya", nosotros: "nos vayamos", ellos: "se vayan" }, subjPasado: { yo: "me fuera", vos: "te fueras", el: "se fuera", nosotros: "nos fuéramos", ellos: "se fueran" }, imperativo: { vos: "andate", usted: "se vaya", nosotros: "vámonos", ustedes: "se vayan" }, gerundio: "yéndose", participio: "ido" } },
    { infinitive: "llamarse", definition: "to be called / to be named", type: "-ar", irregularity: "regular", pattern: "regular reflexive", reflexive: true, transitivity: "intransitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "me llamo", vos: "te llamás", el: "se llama", nosotros: "nos llamamos", ellos: "se llaman" }, preterito: { yo: "me llamé", vos: "te llamaste", el: "se llamó", nosotros: "nos llamamos", ellos: "se llamaron" }, imperfecto: { yo: "me llamaba", vos: "te llamabas", el: "se llamaba", nosotros: "nos llamábamos", ellos: "se llamaban" }, futuro: { yo: "me llamaré", vos: "te llamarás", el: "se llamará", nosotros: "nos llamaremos", ellos: "se llamarán" }, condicional: { yo: "me llamaría", vos: "te llamarías", el: "se llamaría", nosotros: "nos llamaríamos", ellos: "se llamarían" }, subjPresente: { yo: "me llame", vos: "te llames", el: "se llame", nosotros: "nos llamemos", ellos: "se llamen" }, subjPasado: { yo: "me llamara", vos: "te llamaras", el: "se llamara", nosotros: "nos llamáramos", ellos: "se llamaran" }, imperativo: { vos: "llamate", usted: "se llame", nosotros: "nos llamemos", ustedes: "se llamen" }, gerundio: "llamándose", participio: "llamado" } },
    { infinitive: "aprender", definition: "to learn", type: "-er", irregularity: "regular", pattern: "regular -er", reflexive: false, transitivity: "transitivo", preposicion: "a", auxiliar: false, forms: { presente: { yo: "aprendo", vos: "aprendés", el: "aprende", nosotros: "aprendemos", ellos: "aprenden" }, preterito: { yo: "aprendí", vos: "aprendiste", el: "aprendió", nosotros: "aprendimos", ellos: "aprendieron" }, imperfecto: { yo: "aprendía", vos: "aprendías", el: "aprendía", nosotros: "aprendíamos", ellos: "aprendían" }, futuro: { yo: "aprenderé", vos: "aprenderás", el: "aprenderá", nosotros: "aprenderemos", ellos: "aprenderán" }, condicional: { yo: "aprendería", vos: "aprenderías", el: "aprendería", nosotros: "aprenderíamos", ellos: "aprenderían" }, subjPresente: { yo: "aprenda", vos: "aprendas", el: "aprenda", nosotros: "aprendamos", ellos: "aprendan" }, subjPasado: { yo: "aprendiera", vos: "aprendieras", el: "aprendiera", nosotros: "aprendiéramos", ellos: "aprendieran" }, imperativo: { vos: "aprendé", usted: "aprenda", nosotros: "aprendamos", ustedes: "aprendan" }, gerundio: "aprendiendo", participio: "aprendido" } },
    { infinitive: "practicar", definition: "to practice", type: "-ar", irregularity: "regular", pattern: "cambio ortográfico c→qu ante e (practiqué, practique)", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "practico", vos: "practicás", el: "practica", nosotros: "practicamos", ellos: "practican" }, preterito: { yo: "practiqué", vos: "practicaste", el: "practicó", nosotros: "practicamos", ellos: "practicaron" }, imperfecto: { yo: "practicaba", vos: "practicabas", el: "practicaba", nosotros: "practicábamos", ellos: "practicaban" }, futuro: { yo: "practicaré", vos: "practicarás", el: "practicará", nosotros: "practicaremos", ellos: "practicarán" }, condicional: { yo: "practicaría", vos: "practicarías", el: "practicaría", nosotros: "practicaríamos", ellos: "practicarían" }, subjPresente: { yo: "practique", vos: "practiques", el: "practique", nosotros: "practiquemos", ellos: "practiquen" }, subjPasado: { yo: "practicara", vos: "practicaras", el: "practicara", nosotros: "practicáramos", ellos: "practicaran" }, imperativo: { vos: "practicá", usted: "practique", nosotros: "practiquemos", ustedes: "practiquen" }, gerundio: "practicando", participio: "practicado" } },
    { infinitive: "estudiar", definition: "to study", type: "-ar", irregularity: "regular", pattern: "regular -ar", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "estudio", vos: "estudiás", el: "estudia", nosotros: "estudiamos", ellos: "estudian" }, preterito: { yo: "estudié", vos: "estudiaste", el: "estudió", nosotros: "estudiamos", ellos: "estudiaron" }, imperfecto: { yo: "estudiaba", vos: "estudiabas", el: "estudiaba", nosotros: "estudiábamos", ellos: "estudiaban" }, futuro: { yo: "estudiaré", vos: "estudiarás", el: "estudiará", nosotros: "estudiaremos", ellos: "estudiarán" }, condicional: { yo: "estudiaría", vos: "estudiarías", el: "estudiaría", nosotros: "estudiaríamos", ellos: "estudiarían" }, subjPresente: { yo: "estudie", vos: "estudies", el: "estudie", nosotros: "estudiemos", ellos: "estudien" }, subjPasado: { yo: "estudiara", vos: "estudiaras", el: "estudiara", nosotros: "estudiáramos", ellos: "estudiaran" }, imperativo: { vos: "estudiá", usted: "estudie", nosotros: "estudiemos", ustedes: "estudien" }, gerundio: "estudiando", participio: "estudiado" } },
    { infinitive: "escribir", definition: "to write", type: "-ir", irregularity: "regular", pattern: "irregular participle (escrito)", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "escribo", vos: "escribís", el: "escribe", nosotros: "escribimos", ellos: "escriben" }, preterito: { yo: "escribí", vos: "escribiste", el: "escribió", nosotros: "escribimos", ellos: "escribieron" }, imperfecto: { yo: "escribía", vos: "escribías", el: "escribía", nosotros: "escribíamos", ellos: "escribían" }, futuro: { yo: "escribiré", vos: "escribirás", el: "escribirá", nosotros: "escribiremos", ellos: "escribirán" }, condicional: { yo: "escribiría", vos: "escribirías", el: "escribiría", nosotros: "escribiríamos", ellos: "escribirían" }, subjPresente: { yo: "escriba", vos: "escribas", el: "escriba", nosotros: "escribamos", ellos: "escriban" }, subjPasado: { yo: "escribiera", vos: "escribieras", el: "escribiera", nosotros: "escribiéramos", ellos: "escribieran" }, imperativo: { vos: "escribí", usted: "escriba", nosotros: "escribamos", ustedes: "escriban" }, gerundio: "escribiendo", participio: "escrito" } },

    // "gustar-type" verbs: grammatically regular (or ordinarily irregular)
    // verbs that conjugate exactly like any other verb here — the table
    // below is accurate for every person — but that are normally USED with
    // the liked/affected thing as the subject and the person as an indirect
    // object pronoun (me/te/le/nos/les), which is why in practice you'll
    // mostly see them in 3rd person. That usage note goes in the existing
    // "pattern" field so it shows as the same italic note every other verb
    // already gets, with no changes to the detail card itself.
    { infinitive: "gustar", definition: "to be pleasing to / to like", type: "-ar", irregularity: "regular", pattern: "verbo \"tipo gustar\": el sujeto es lo que gusta; la persona lleva pronombre de objeto indirecto (me/te/le/nos/les). Ej.: \"Me gusta el café\" / \"Me gustan los perros\".", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: false, gustar_like: true, forms: { presente: { yo: "gusto", vos: "gustás", el: "gusta", nosotros: "gustamos", ellos: "gustan" }, preterito: { yo: "gusté", vos: "gustaste", el: "gustó", nosotros: "gustamos", ellos: "gustaron" }, imperfecto: { yo: "gustaba", vos: "gustabas", el: "gustaba", nosotros: "gustábamos", ellos: "gustaban" }, futuro: { yo: "gustaré", vos: "gustarás", el: "gustará", nosotros: "gustaremos", ellos: "gustarán" }, condicional: { yo: "gustaría", vos: "gustarías", el: "gustaría", nosotros: "gustaríamos", ellos: "gustarían" }, subjPresente: { yo: "guste", vos: "gustes", el: "guste", nosotros: "gustemos", ellos: "gusten" }, subjPasado: { yo: "gustara", vos: "gustaras", el: "gustara", nosotros: "gustáramos", ellos: "gustaran" }, imperativo: { vos: "gustá", usted: "guste", nosotros: "gustemos", ustedes: "gusten" }, gerundio: "gustando", participio: "gustado" } },
    { infinitive: "encantar", definition: "to delight / to love (something)", type: "-ar", irregularity: "regular", pattern: "verbo \"tipo gustar\" (como \"gustar\", pero más entusiasta). Ej.: \"Me encanta bailar.\"", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: false, gustar_like: true, forms: { presente: { yo: "encanto", vos: "encantás", el: "encanta", nosotros: "encantamos", ellos: "encantan" }, preterito: { yo: "encanté", vos: "encantaste", el: "encantó", nosotros: "encantamos", ellos: "encantaron" }, imperfecto: { yo: "encantaba", vos: "encantabas", el: "encantaba", nosotros: "encantábamos", ellos: "encantaban" }, futuro: { yo: "encantaré", vos: "encantarás", el: "encantará", nosotros: "encantaremos", ellos: "encantarán" }, condicional: { yo: "encantaría", vos: "encantarías", el: "encantaría", nosotros: "encantaríamos", ellos: "encantarían" }, subjPresente: { yo: "encante", vos: "encantes", el: "encante", nosotros: "encantemos", ellos: "encanten" }, subjPasado: { yo: "encantara", vos: "encantaras", el: "encantara", nosotros: "encantáramos", ellos: "encantaran" }, imperativo: { vos: "encantá", usted: "encante", nosotros: "encantemos", ustedes: "encanten" }, gerundio: "encantando", participio: "encantado" } },
    { infinitive: "apasionar", definition: "to be passionate about (something)", type: "-ar", irregularity: "regular", pattern: "verbo \"tipo gustar\": el sujeto es lo que apasiona. Ej.: \"Me apasiona la música.\"", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: false, gustar_like: true, forms: { presente: { yo: "apasiono", vos: "apasionás", el: "apasiona", nosotros: "apasionamos", ellos: "apasionan" }, preterito: { yo: "apasioné", vos: "apasionaste", el: "apasionó", nosotros: "apasionamos", ellos: "apasionaron" }, imperfecto: { yo: "apasionaba", vos: "apasionabas", el: "apasionaba", nosotros: "apasionábamos", ellos: "apasionaban" }, futuro: { yo: "apasionaré", vos: "apasionarás", el: "apasionará", nosotros: "apasionaremos", ellos: "apasionarán" }, condicional: { yo: "apasionaría", vos: "apasionarías", el: "apasionaría", nosotros: "apasionaríamos", ellos: "apasionarían" }, subjPresente: { yo: "apasione", vos: "apasiones", el: "apasione", nosotros: "apasionemos", ellos: "apasionen" }, subjPasado: { yo: "apasionara", vos: "apasionaras", el: "apasionara", nosotros: "apasionáramos", ellos: "apasionaran" }, imperativo: { vos: "apasioná", usted: "apasione", nosotros: "apasionemos", ustedes: "apasionen" }, gerundio: "apasionando", participio: "apasionado" } },
    { infinitive: "interesar", definition: "to interest / to be of interest to", type: "-ar", irregularity: "regular", pattern: "verbo \"tipo gustar\": el sujeto es lo que interesa. Ej.: \"Me interesa la historia.\"", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: false, gustar_like: true, forms: { presente: { yo: "intereso", vos: "interesás", el: "interesa", nosotros: "interesamos", ellos: "interesan" }, preterito: { yo: "interesé", vos: "interesaste", el: "interesó", nosotros: "interesamos", ellos: "interesaron" }, imperfecto: { yo: "interesaba", vos: "interesabas", el: "interesaba", nosotros: "interesábamos", ellos: "interesaban" }, futuro: { yo: "interesaré", vos: "interesarás", el: "interesará", nosotros: "interesaremos", ellos: "interesarán" }, condicional: { yo: "interesaría", vos: "interesarías", el: "interesaría", nosotros: "interesaríamos", ellos: "interesarían" }, subjPresente: { yo: "interese", vos: "intereses", el: "interese", nosotros: "interesemos", ellos: "interesen" }, subjPasado: { yo: "interesara", vos: "interesaras", el: "interesara", nosotros: "interesáramos", ellos: "interesaran" }, imperativo: { vos: "interesá", usted: "interese", nosotros: "interesemos", ustedes: "interesen" }, gerundio: "interesando", participio: "interesado" } },
    { infinitive: "molestar", definition: "to bother / to annoy", type: "-ar", irregularity: "regular", pattern: "verbo \"tipo gustar\": el sujeto es lo que molesta. Ej.: \"Me molesta el ruido.\"", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: false, gustar_like: true, forms: { presente: { yo: "molesto", vos: "molestás", el: "molesta", nosotros: "molestamos", ellos: "molestan" }, preterito: { yo: "molesté", vos: "molestaste", el: "molestó", nosotros: "molestamos", ellos: "molestaron" }, imperfecto: { yo: "molestaba", vos: "molestabas", el: "molestaba", nosotros: "molestábamos", ellos: "molestaban" }, futuro: { yo: "molestaré", vos: "molestarás", el: "molestará", nosotros: "molestaremos", ellos: "molestarán" }, condicional: { yo: "molestaría", vos: "molestarías", el: "molestaría", nosotros: "molestaríamos", ellos: "molestarían" }, subjPresente: { yo: "moleste", vos: "molestes", el: "moleste", nosotros: "molestemos", ellos: "molesten" }, subjPasado: { yo: "molestara", vos: "molestaras", el: "molestara", nosotros: "molestáramos", ellos: "molestaran" }, imperativo: { vos: "molestá", usted: "moleste", nosotros: "molestemos", ustedes: "molesten" }, gerundio: "molestando", participio: "molestado" } },
    { infinitive: "fascinar", definition: "to fascinate", type: "-ar", irregularity: "regular", pattern: "verbo \"tipo gustar\": el sujeto es lo que fascina. Ej.: \"Me fascina esa idea.\"", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: false, gustar_like: true, forms: { presente: { yo: "fascino", vos: "fascinás", el: "fascina", nosotros: "fascinamos", ellos: "fascinan" }, preterito: { yo: "fasciné", vos: "fascinaste", el: "fascinó", nosotros: "fascinamos", ellos: "fascinaron" }, imperfecto: { yo: "fascinaba", vos: "fascinabas", el: "fascinaba", nosotros: "fascinábamos", ellos: "fascinaban" }, futuro: { yo: "fascinaré", vos: "fascinarás", el: "fascinará", nosotros: "fascinaremos", ellos: "fascinarán" }, condicional: { yo: "fascinaría", vos: "fascinarías", el: "fascinaría", nosotros: "fascinaríamos", ellos: "fascinarían" }, subjPresente: { yo: "fascine", vos: "fascines", el: "fascine", nosotros: "fascinemos", ellos: "fascinen" }, subjPasado: { yo: "fascinara", vos: "fascinaras", el: "fascinara", nosotros: "fascináramos", ellos: "fascinaran" }, imperativo: { vos: "fasciná", usted: "fascine", nosotros: "fascinemos", ustedes: "fascinen" }, gerundio: "fascinando", participio: "fascinado" } },
    { infinitive: "faltar", definition: "to be lacking / to miss", type: "-ar", irregularity: "regular", pattern: "verbo \"tipo gustar\": el sujeto es lo que falta. Ej.: \"Me falta tiempo.\"", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: false, gustar_like: true, forms: { presente: { yo: "falto", vos: "faltás", el: "falta", nosotros: "faltamos", ellos: "faltan" }, preterito: { yo: "falté", vos: "faltaste", el: "faltó", nosotros: "faltamos", ellos: "faltaron" }, imperfecto: { yo: "faltaba", vos: "faltabas", el: "faltaba", nosotros: "faltábamos", ellos: "faltaban" }, futuro: { yo: "faltaré", vos: "faltarás", el: "faltará", nosotros: "faltaremos", ellos: "faltarán" }, condicional: { yo: "faltaría", vos: "faltarías", el: "faltaría", nosotros: "faltaríamos", ellos: "faltarían" }, subjPresente: { yo: "falte", vos: "faltes", el: "falte", nosotros: "faltemos", ellos: "falten" }, subjPasado: { yo: "faltara", vos: "faltaras", el: "faltara", nosotros: "faltáramos", ellos: "faltaran" }, imperativo: { vos: "faltá", usted: "falte", nosotros: "faltemos", ustedes: "falten" }, gerundio: "faltando", participio: "faltado" } },
    { infinitive: "doler", definition: "to hurt / to ache", type: "-er", irregularity: "cambio de raíz", pattern: "cambio de raíz o→ue (como \"poder\"), y además verbo \"tipo gustar\": el sujeto es lo que duele. Ej.: \"Me duele la cabeza.\"", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: false, gustar_like: true, forms: { presente: { yo: "duelo", vos: "dolés", el: "duele", nosotros: "dolemos", ellos: "duelen" }, preterito: { yo: "dolí", vos: "doliste", el: "dolió", nosotros: "dolimos", ellos: "dolieron" }, imperfecto: { yo: "dolía", vos: "dolías", el: "dolía", nosotros: "dolíamos", ellos: "dolían" }, futuro: { yo: "doleré", vos: "dolerás", el: "dolerá", nosotros: "doleremos", ellos: "dolerán" }, condicional: { yo: "dolería", vos: "dolerías", el: "dolería", nosotros: "doleríamos", ellos: "dolerían" }, subjPresente: { yo: "duela", vos: "duelas", el: "duela", nosotros: "dolamos", ellos: "duelan" }, subjPasado: { yo: "doliera", vos: "dolieras", el: "doliera", nosotros: "doliéramos", ellos: "dolieran" }, imperativo: { vos: "dolé", usted: "duela", nosotros: "dolamos", ustedes: "duelan" }, gerundio: "doliendo", participio: "dolido" } },
    { infinitive: "importar", definition: "to matter / to be important to", type: "-ar", irregularity: "regular", pattern: "verbo \"tipo gustar\": el sujeto es lo que importa. Ej.: \"No me importa el precio.\"", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: false, gustar_like: true, forms: { presente: { yo: "importo", vos: "importás", el: "importa", nosotros: "importamos", ellos: "importan" }, preterito: { yo: "importé", vos: "importaste", el: "importó", nosotros: "importamos", ellos: "importaron" }, imperfecto: { yo: "importaba", vos: "importabas", el: "importaba", nosotros: "importábamos", ellos: "importaban" }, futuro: { yo: "importaré", vos: "importarás", el: "importará", nosotros: "importaremos", ellos: "importarán" }, condicional: { yo: "importaría", vos: "importarías", el: "importaría", nosotros: "importaríamos", ellos: "importarían" }, subjPresente: { yo: "importe", vos: "importes", el: "importe", nosotros: "importemos", ellos: "importen" }, subjPasado: { yo: "importara", vos: "importaras", el: "importara", nosotros: "importáramos", ellos: "importaran" }, imperativo: { vos: "importá", usted: "importe", nosotros: "importemos", ustedes: "importen" }, gerundio: "importando", participio: "importado" } },
    { infinitive: "aburrir", definition: "to bore", type: "-ir", irregularity: "regular", pattern: "verbo \"tipo gustar\": el sujeto es lo que aburre. Ej.: \"Me aburre esa película.\"", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: false, gustar_like: true, forms: { presente: { yo: "aburro", vos: "aburrís", el: "aburre", nosotros: "aburrimos", ellos: "aburren" }, preterito: { yo: "aburrí", vos: "aburriste", el: "aburrió", nosotros: "aburrimos", ellos: "aburrieron" }, imperfecto: { yo: "aburría", vos: "aburrías", el: "aburría", nosotros: "aburríamos", ellos: "aburrían" }, futuro: { yo: "aburriré", vos: "aburrirás", el: "aburrirá", nosotros: "aburriremos", ellos: "aburrirán" }, condicional: { yo: "aburriría", vos: "aburrirías", el: "aburriría", nosotros: "aburriríamos", ellos: "aburrirían" }, subjPresente: { yo: "aburra", vos: "aburras", el: "aburra", nosotros: "aburramos", ellos: "aburran" }, subjPasado: { yo: "aburriera", vos: "aburrieras", el: "aburriera", nosotros: "aburriéramos", ellos: "aburrieran" }, imperativo: { vos: "aburrí", usted: "aburra", nosotros: "aburramos", ustedes: "aburran" }, gerundio: "aburriendo", participio: "aburrido" } },
    { infinitive: "sorprender", definition: "to surprise", type: "-er", irregularity: "regular", pattern: "verbo \"tipo gustar\": el sujeto es lo que sorprende. Ej.: \"Me sorprende tu actitud.\"", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: false, gustar_like: true, forms: { presente: { yo: "sorprendo", vos: "sorprendés", el: "sorprende", nosotros: "sorprendemos", ellos: "sorprenden" }, preterito: { yo: "sorprendí", vos: "sorprendiste", el: "sorprendió", nosotros: "sorprendimos", ellos: "sorprendieron" }, imperfecto: { yo: "sorprendía", vos: "sorprendías", el: "sorprendía", nosotros: "sorprendíamos", ellos: "sorprendían" }, futuro: { yo: "sorprenderé", vos: "sorprenderás", el: "sorprenderá", nosotros: "sorprenderemos", ellos: "sorprenderán" }, condicional: { yo: "sorprendería", vos: "sorprenderías", el: "sorprendería", nosotros: "sorprenderíamos", ellos: "sorprenderían" }, subjPresente: { yo: "sorprenda", vos: "sorprendas", el: "sorprenda", nosotros: "sorprendamos", ellos: "sorprendan" }, subjPasado: { yo: "sorprendiera", vos: "sorprendieras", el: "sorprendiera", nosotros: "sorprendiéramos", ellos: "sorprendieran" }, imperativo: { vos: "sorprendé", usted: "sorprenda", nosotros: "sorprendamos", ustedes: "sorprendan" }, gerundio: "sorprendiendo", participio: "sorprendido" } }
  ];

  // ================= starter vocabulary (100 common words, offered to a brand-new account) =================
  var STARTER_WORDS = [
    { word: "casa", definition: "house", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "familia", definition: "family", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "amigo", definition: "friend (male)", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "amiga", definition: "friend (female)", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "trabajo", definition: "work / job", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "tiempo", definition: "time / weather", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "día", definition: "day", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "año", definition: "year", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "semana", definition: "week", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "mundo", definition: "world", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "vida", definition: "life", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "mano", definition: "hand", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "agua", definition: "water", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "comida", definition: "food", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "dinero", definition: "money", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "ciudad", definition: "city", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "país", definition: "country", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "calle", definition: "street", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "auto", definition: "car", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "libro", definition: "book", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "mesa", definition: "table", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "silla", definition: "chair", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "puerta", definition: "door", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "ventana", definition: "window", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "cama", definition: "bed", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "ropa", definition: "clothes", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "zapato", definition: "shoe", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "camisa", definition: "shirt", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "sol", definition: "sun", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "luna", definition: "moon", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "cielo", definition: "sky", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "mar", definition: "sea", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "río", definition: "river", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "montaña", definition: "mountain", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "árbol", definition: "tree", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "flor", definition: "flower", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "perro", definition: "dog", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "gato", definition: "cat", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "niño", definition: "boy / child", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "niña", definition: "girl", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "hombre", definition: "man", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "mujer", definition: "woman", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "padre", definition: "father", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "madre", definition: "mother", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "hermano", definition: "brother", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "hermana", definition: "sister", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "hijo", definition: "son", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "hija", definition: "daughter", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "amor", definition: "love", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "música", definition: "music", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "escuela", definition: "school", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "hospital", definition: "hospital", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "mercado", definition: "market", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "teléfono", definition: "phone", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "computadora", definition: "computer", part_of_speech: "sustantivo", gender: "femenino" },

    { word: "bueno", definition: "good", part_of_speech: "adjetivo", gender: "" },
    { word: "malo", definition: "bad", part_of_speech: "adjetivo", gender: "" },
    { word: "grande", definition: "big", part_of_speech: "adjetivo", gender: "" },
    { word: "pequeño", definition: "small", part_of_speech: "adjetivo", gender: "" },
    { word: "nuevo", definition: "new", part_of_speech: "adjetivo", gender: "" },
    { word: "viejo", definition: "old", part_of_speech: "adjetivo", gender: "" },
    { word: "bonito", definition: "pretty", part_of_speech: "adjetivo", gender: "" },
    { word: "feo", definition: "ugly", part_of_speech: "adjetivo", gender: "" },
    { word: "feliz", definition: "happy", part_of_speech: "adjetivo", gender: "" },
    { word: "triste", definition: "sad", part_of_speech: "adjetivo", gender: "" },
    { word: "rápido", definition: "fast", part_of_speech: "adjetivo", gender: "" },
    { word: "lento", definition: "slow", part_of_speech: "adjetivo", gender: "" },
    { word: "fácil", definition: "easy", part_of_speech: "adjetivo", gender: "" },
    { word: "difícil", definition: "difficult", part_of_speech: "adjetivo", gender: "" },
    { word: "caro", definition: "expensive", part_of_speech: "adjetivo", gender: "" },
    { word: "barato", definition: "cheap", part_of_speech: "adjetivo", gender: "" },
    { word: "importante", definition: "important", part_of_speech: "adjetivo", gender: "" },
    { word: "interesante", definition: "interesting", part_of_speech: "adjetivo", gender: "" },
    { word: "fuerte", definition: "strong", part_of_speech: "adjetivo", gender: "" },
    { word: "débil", definition: "weak", part_of_speech: "adjetivo", gender: "" },

    // adjectives for describing people (physical appearance) — from a
    // "describir personas" ELE vocabulary list
    { word: "joven", definition: "young", part_of_speech: "adjetivo", gender: "" },
    { word: "adolescente", definition: "teenage / adolescent", part_of_speech: "adjetivo", gender: "" },
    { word: "adulto", definition: "adult", part_of_speech: "adjetivo", gender: "" },
    { word: "de mediana edad", definition: "middle-aged", part_of_speech: "adjetivo", gender: "" },
    { word: "mayor", definition: "older / elderly", part_of_speech: "adjetivo", gender: "" },
    { word: "anciano", definition: "elderly", part_of_speech: "adjetivo", gender: "" },
    { word: "guapo", definition: "good-looking / handsome", part_of_speech: "adjetivo", gender: "" },
    { word: "atractivo", definition: "attractive", part_of_speech: "adjetivo", gender: "" },
    { word: "agraciado", definition: "attractive / graceful-looking", part_of_speech: "adjetivo", gender: "" },
    { word: "elegante", definition: "elegant", part_of_speech: "adjetivo", gender: "" },
    { word: "distinguido", definition: "distinguished", part_of_speech: "adjetivo", gender: "" },
    { word: "sencillo", definition: "plain / simple (in appearance)", part_of_speech: "adjetivo", gender: "" },
    { word: "desaliñado", definition: "unkempt / disheveled", part_of_speech: "adjetivo", gender: "" },
    { word: "desmejorado", definition: "run-down / looking worse than usual", part_of_speech: "adjetivo", gender: "" },

    { word: "redondo", definition: "round (face)", part_of_speech: "adjetivo", gender: "" },
    { word: "ovalado", definition: "oval (face)", part_of_speech: "adjetivo", gender: "" },
    { word: "cuadrado", definition: "square (face)", part_of_speech: "adjetivo", gender: "" },
    { word: "alargado", definition: "elongated (face)", part_of_speech: "adjetivo", gender: "" },
    { word: "ancho", definition: "wide / broad", part_of_speech: "adjetivo", gender: "" },
    { word: "sonriente", definition: "smiling", part_of_speech: "adjetivo", gender: "" },
    { word: "serio", definition: "serious", part_of_speech: "adjetivo", gender: "" },
    { word: "pensativo", definition: "thoughtful / pensive", part_of_speech: "adjetivo", gender: "" },
    { word: "expresivo", definition: "expressive", part_of_speech: "adjetivo", gender: "" },
    { word: "inexpresivo", definition: "expressionless", part_of_speech: "adjetivo", gender: "" },
    { word: "arrugado", definition: "wrinkled", part_of_speech: "adjetivo", gender: "" },
    { word: "liso", definition: "straight / smooth (hair or skin)", part_of_speech: "adjetivo", gender: "" },
    { word: "grueso", definition: "thick", part_of_speech: "adjetivo", gender: "" },
    { word: "delgado", definition: "thin / slender", part_of_speech: "adjetivo", gender: "" },
    { word: "alegre", definition: "cheerful / happy", part_of_speech: "adjetivo", gender: "" },

    { word: "rubio", definition: "blond", part_of_speech: "adjetivo", gender: "" },
    { word: "moreno", definition: "dark-haired / dark-skinned", part_of_speech: "adjetivo", gender: "" },
    { word: "castaño", definition: "chestnut / brown (hair)", part_of_speech: "adjetivo", gender: "" },
    { word: "pelirrojo", definition: "red-haired", part_of_speech: "adjetivo", gender: "" },
    { word: "canoso", definition: "gray-haired", part_of_speech: "adjetivo", gender: "" },
    { word: "rizado", definition: "curly", part_of_speech: "adjetivo", gender: "" },
    { word: "ondulado", definition: "wavy", part_of_speech: "adjetivo", gender: "" },
    { word: "encrespado", definition: "frizzy", part_of_speech: "adjetivo", gender: "" },
    { word: "recogido", definition: "tied back / up (hair)", part_of_speech: "adjetivo", gender: "" },
    { word: "suelto", definition: "loose / down (hair)", part_of_speech: "adjetivo", gender: "" },
    { word: "despeinado", definition: "disheveled / messy-haired", part_of_speech: "adjetivo", gender: "" },
    { word: "cuidado", definition: "well-groomed / well cared-for", part_of_speech: "adjetivo", gender: "" },
    { word: "calvo", definition: "bald", part_of_speech: "adjetivo", gender: "" },

    { word: "azul", definition: "blue", part_of_speech: "adjetivo", gender: "" },
    { word: "verde", definition: "green", part_of_speech: "adjetivo", gender: "" },
    { word: "marrón", definition: "brown", part_of_speech: "adjetivo", gender: "" },
    { word: "almendrado", definition: "almond-shaped (eyes)", part_of_speech: "adjetivo", gender: "" },
    { word: "rasgado", definition: "slanted / almond-shaped (eyes)", part_of_speech: "adjetivo", gender: "" },
    { word: "brillante", definition: "bright / shiny", part_of_speech: "adjetivo", gender: "" },
    { word: "vivaz", definition: "lively / vivacious", part_of_speech: "adjetivo", gender: "" },
    { word: "penetrante", definition: "piercing (gaze)", part_of_speech: "adjetivo", gender: "" },
    { word: "soñador", definition: "dreamy", part_of_speech: "adjetivo", gender: "" },
    { word: "saltón", definition: "bulging (eyes)", part_of_speech: "adjetivo", gender: "" },
    { word: "hundido", definition: "sunken (eyes)", part_of_speech: "adjetivo", gender: "" },
    { word: "poblado", definition: "bushy (eyebrows)", part_of_speech: "adjetivo", gender: "" },
    { word: "fino", definition: "thin / fine", part_of_speech: "adjetivo", gender: "" },
    { word: "arqueado", definition: "arched (eyebrows)", part_of_speech: "adjetivo", gender: "" },

    { word: "chato", definition: "flat / snub (nose)", part_of_speech: "adjetivo", gender: "" },
    { word: "aguileño", definition: "aquiline / hawk-like (nose)", part_of_speech: "adjetivo", gender: "" },
    { word: "respingón", definition: "upturned (nose)", part_of_speech: "adjetivo", gender: "" },
    { word: "puntiagudo", definition: "pointed", part_of_speech: "adjetivo", gender: "" },
    { word: "carnoso", definition: "full / fleshy (lips)", part_of_speech: "adjetivo", gender: "" },
    { word: "torcido", definition: "crooked (teeth)", part_of_speech: "adjetivo", gender: "" },

    { word: "alto", definition: "tall", part_of_speech: "adjetivo", gender: "" },
    { word: "bajo", definition: "short", part_of_speech: "adjetivo", gender: "" },
    { word: "de estatura media", definition: "average height", part_of_speech: "adjetivo", gender: "" },
    { word: "flaco", definition: "skinny", part_of_speech: "adjetivo", gender: "" },
    { word: "esbelto", definition: "slender", part_of_speech: "adjetivo", gender: "" },
    { word: "gordo", definition: "fat", part_of_speech: "adjetivo", gender: "" },
    { word: "obeso", definition: "obese", part_of_speech: "adjetivo", gender: "" },
    { word: "musculoso", definition: "muscular", part_of_speech: "adjetivo", gender: "" },
    { word: "atlético", definition: "athletic", part_of_speech: "adjetivo", gender: "" },
    { word: "fornido", definition: "well-built / burly", part_of_speech: "adjetivo", gender: "" },
    { word: "robusto", definition: "robust / sturdy", part_of_speech: "adjetivo", gender: "" },
    { word: "corpulento", definition: "heavyset / stocky", part_of_speech: "adjetivo", gender: "" },
    { word: "en forma", definition: "in shape / fit", part_of_speech: "adjetivo", gender: "" },
    { word: "erguido", definition: "upright / straight-postured", part_of_speech: "adjetivo", gender: "" },
    { word: "encorvado", definition: "hunched / stooped", part_of_speech: "adjetivo", gender: "" },

    // adjectives for describing people (personality) — same source list
    { word: "simpático", definition: "nice / friendly", part_of_speech: "adjetivo", gender: "" },
    { word: "agradable", definition: "pleasant", part_of_speech: "adjetivo", gender: "" },
    { word: "cordial", definition: "cordial / warm", part_of_speech: "adjetivo", gender: "" },
    { word: "optimista", definition: "optimistic", part_of_speech: "adjetivo", gender: "" },
    { word: "divertido", definition: "fun", part_of_speech: "adjetivo", gender: "" },
    { word: "gracioso", definition: "funny / witty", part_of_speech: "adjetivo", gender: "" },
    { word: "sociable", definition: "sociable", part_of_speech: "adjetivo", gender: "" },
    { word: "extrovertido", definition: "outgoing / extroverted", part_of_speech: "adjetivo", gender: "" },
    { word: "paciente", definition: "patient", part_of_speech: "adjetivo", gender: "" },
    { word: "tranquilo", definition: "calm", part_of_speech: "adjetivo", gender: "" },
    { word: "generoso", definition: "generous", part_of_speech: "adjetivo", gender: "" },
    { word: "solidario", definition: "supportive / showing solidarity", part_of_speech: "adjetivo", gender: "" },
    { word: "sincero", definition: "sincere", part_of_speech: "adjetivo", gender: "" },
    { word: "honesto", definition: "honest", part_of_speech: "adjetivo", gender: "" },
    { word: "trabajador", definition: "hardworking", part_of_speech: "adjetivo", gender: "" },
    { word: "aplicado", definition: "diligent / studious", part_of_speech: "adjetivo", gender: "" },
    { word: "inteligente", definition: "intelligent", part_of_speech: "adjetivo", gender: "" },
    { word: "listo", definition: "clever / smart", part_of_speech: "adjetivo", gender: "", notes: "Con \"ser\" significa listo/inteligente; con \"estar\" significa preparado/a (ready).", example: "" },
    { word: "creativo", definition: "creative", part_of_speech: "adjetivo", gender: "" },
    { word: "valiente", definition: "brave", part_of_speech: "adjetivo", gender: "" },
    { word: "decidido", definition: "decisive / determined", part_of_speech: "adjetivo", gender: "" },
    { word: "responsable", definition: "responsible", part_of_speech: "adjetivo", gender: "" },
    { word: "organizado", definition: "organized", part_of_speech: "adjetivo", gender: "" },
    { word: "comprensivo", definition: "understanding", part_of_speech: "adjetivo", gender: "" },
    { word: "seguro", definition: "confident / self-assured", part_of_speech: "adjetivo", gender: "", notes: "Según el contexto también significa \"seguro\" (safe/certain).", example: "" },

    { word: "antipático", definition: "unpleasant / unfriendly", part_of_speech: "adjetivo", gender: "" },
    { word: "desagradable", definition: "unpleasant", part_of_speech: "adjetivo", gender: "" },
    { word: "borde", definition: "rude / blunt", part_of_speech: "adjetivo", gender: "", notes: "Coloquial; más frecuente en España que en el uso rioplatense.", example: "" },
    { word: "egoísta", definition: "selfish", part_of_speech: "adjetivo", gender: "" },
    { word: "perezoso", definition: "lazy", part_of_speech: "adjetivo", gender: "" },
    { word: "mentiroso", definition: "lying / a liar", part_of_speech: "adjetivo", gender: "" },
    { word: "pesimista", definition: "pessimistic", part_of_speech: "adjetivo", gender: "" },
    { word: "impaciente", definition: "impatient", part_of_speech: "adjetivo", gender: "" },
    { word: "irresponsable", definition: "irresponsible", part_of_speech: "adjetivo", gender: "" },
    { word: "tímido", definition: "shy", part_of_speech: "adjetivo", gender: "" },
    { word: "introvertido", definition: "introverted", part_of_speech: "adjetivo", gender: "" },
    { word: "inseguro", definition: "insecure", part_of_speech: "adjetivo", gender: "" },
    { word: "nervioso", definition: "nervous", part_of_speech: "adjetivo", gender: "" },
    { word: "aburrido", definition: "boring", part_of_speech: "adjetivo", gender: "", notes: "Con \"ser\" significa aburrido (boring); con \"estar\" significa aburrido/a (bored).", example: "" },
    { word: "gruñón", definition: "grumpy", part_of_speech: "adjetivo", gender: "" },
    { word: "impulsivo", definition: "impulsive", part_of_speech: "adjetivo", gender: "" },

    { word: "bien", definition: "well", part_of_speech: "adverbio", gender: "" },
    { word: "mal", definition: "badly", part_of_speech: "adverbio", gender: "" },
    { word: "muy", definition: "very", part_of_speech: "adverbio", gender: "" },
    { word: "mucho", definition: "a lot / much", part_of_speech: "adverbio", gender: "" },
    { word: "poco", definition: "a little / few", part_of_speech: "adverbio", gender: "" },
    { word: "siempre", definition: "always", part_of_speech: "adverbio", gender: "" },
    { word: "nunca", definition: "never", part_of_speech: "adverbio", gender: "" },
    { word: "ahora", definition: "now", part_of_speech: "adverbio", gender: "" },
    { word: "después", definition: "after / later", part_of_speech: "adverbio", gender: "" },
    { word: "aquí", definition: "here", part_of_speech: "adverbio", gender: "" },
    { word: "acá", definition: "here", part_of_speech: "adverbio", gender: "", notes: "Sinónimo de \"aquí\", pero mucho más frecuente en el uso cotidiano rioplatense.", example: "Vení acá." },
    { word: "allí", definition: "there", part_of_speech: "adverbio", gender: "" },
    { word: "re", definition: "really / super (colloquial intensifier)", part_of_speech: "adverbio", gender: "", notes: "Intensificador coloquial muy usado en Argentina; más informal que \"muy\" y va justo antes del adjetivo.", example: "Está re bueno." },

    { word: "yo", definition: "I", part_of_speech: "pronombre", gender: "" },
    { word: "vos", definition: "you (rioplatense informal)", part_of_speech: "pronombre", gender: "" },
    { word: "nosotros", definition: "we", part_of_speech: "pronombre", gender: "" },
    { word: "esto", definition: "this", part_of_speech: "pronombre", gender: "" },
    { word: "eso", definition: "that", part_of_speech: "pronombre", gender: "" },

    { word: "con", definition: "with", part_of_speech: "preposición", gender: "" },
    { word: "sin", definition: "without", part_of_speech: "preposición", gender: "" },
    { word: "para", definition: "for / in order to", part_of_speech: "preposición", gender: "" },
    { word: "entre", definition: "between", part_of_speech: "preposición", gender: "" },
    { word: "desde", definition: "from / since", part_of_speech: "preposición", gender: "" },

    { word: "y", definition: "and", part_of_speech: "conjunción", gender: "" },
    { word: "pero", definition: "but", part_of_speech: "conjunción", gender: "" },
    { word: "porque", definition: "because", part_of_speech: "conjunción", gender: "" },

    { word: "hola", definition: "hi / hello", part_of_speech: "interjección", gender: "" },
    { word: "chau", definition: "bye", part_of_speech: "interjección", gender: "" }
  ];

  // ================= state =================
  var allVerbs = [];      // [{id, data}]
  var filtered = [];
  var selectedId = null;
  var editingId = null;
  // facet filters: verb matches if, for every facet with a non-empty set,
  // its value is a member of that set (AND across facets, OR within one).
  var activeVerbFilters = { type: new Set(), irregularity: new Set(), transitivity: new Set(), flag: new Set() };

  var allWords = [];      // [{id, data}] — vocabulario (nouns, adjectives, etc.)
  var filteredWords = [];
  var selectedWordId = null;
  var editingWordId = null;
  var activeWordFilters = { pos: new Set(), gender: new Set() };

  // shared lists — see schema.sql for the lists/list_items tables. Each list
  // is a named, curated subset of the user's own verbs or words; items are
  // stored as denormalized snapshots (see rowToList/addItemToList below).
  var allLists = [];      // [{id, data}]
  var selectedListId = null;
  var listPickerTarget = null; // { itemType: "verb"|"word", data } while #list-picker-overlay is open
  var currentShareList = null; // { listId, listName, ownerLabel, items } while previewing a ?share= link

  // When set, narrows the Verbos/Vocabulario tabs (and therefore Tarjetas,
  // which builds its deck from those same filtered/filteredWords arrays —
  // see buildFlashDeck) down to just one saved list's items, so you can
  // come back to a specific word set and study it. Cleared explicitly via
  // the banner's "Salir del filtro" button, not by switching tabs.
  var activeStudyList = null; // { id, name, verbSet: Set<normalized infinitive>, wordSet: Set<normalized word> }

  // flashcards draw from whatever is currently filtered on the Verbos/
  // Vocabulario tabs (the "filtered"/"filteredWords" arrays above), plus
  // their own source toggle and tense/person filters below.
  var activeFlashSources = { verbs: true, words: true };
  // activeFlashCells holds every selected "tenseKey|personKey" grid cell
  // (see FLASH_MATRIX_COLUMNS/flashCellKey above) — starts with everything on.
  var activeFlashCells = new Set(flashAllCellKeys());
  // gerundio/participio have no person axis, so they're plain on/off toggles.
  var activeFlashStandalone = new Set(["gerundio", "participio"]);
  var flashDirection = "def2word"; // or "word2def"
  var flashDeck = [];
  var flashIndex = -1;

  var el = {
    authScreen: document.getElementById("auth-screen"),
    appScreen: document.getElementById("app-screen"),
    tabLogin: document.getElementById("tab-login"),
    tabSignup: document.getElementById("tab-signup"),
    authForm: document.getElementById("auth-form"),
    authEmail: document.getElementById("auth-email"),
    authPassword: document.getElementById("auth-password"),
    authSubmit: document.getElementById("auth-submit"),
    authMsg: document.getElementById("auth-msg"),
    userEmail: document.getElementById("user-email"),
    logoutBtn: document.getElementById("logout-btn"),

    banner: document.getElementById("status-banner"),
    studyFilterBanner: document.getElementById("study-filter-banner"),
    studyFilterText: document.getElementById("study-filter-text"),
    studyFilterClear: document.getElementById("study-filter-clear"),
    search: document.getElementById("search"),
    count: document.getElementById("count"),
    list: document.getElementById("card-list"),
    detail: document.getElementById("detail"),
    dInfinitive: document.getElementById("d-infinitive"),
    dDefinition: document.getElementById("d-definition"),
    dBadges: document.getElementById("d-badges"),
    dPattern: document.getElementById("d-pattern"),
    dPreposicion: document.getElementById("d-preposicion"),
    dTenseRow: document.getElementById("d-tense-row"),
    dConjBody: document.getElementById("d-conj-body"),
    dConjPronounBody: document.getElementById("d-conj-pronoun-body"),
    dConjLegend: document.getElementById("d-conj-legend"),
    dGustarLegend: document.getElementById("d-gustar-legend"),
    dGerundio: document.getElementById("d-gerundio"),
    dParticipio: document.getElementById("d-participio"),
    dEdit: document.getElementById("d-edit"),
    dDelete: document.getElementById("d-delete"),
    toggleAdd: document.getElementById("toggle-add"),
    seedToolbarBtn: document.getElementById("seed-toolbar-btn"),
    form: document.getElementById("verb-form"),
    formTitle: document.getElementById("form-title"),
    formMsg: document.getElementById("form-msg"),
    formCancel: document.getElementById("form-cancel"),
    conjFormTable: document.getElementById("conj-form-table"),
    fInfinitive: document.getElementById("f-infinitive"),
    fDefinition: document.getElementById("f-definition"),
    fType: document.getElementById("f-type"),
    fPattern: document.getElementById("f-pattern"),
    fIrregularity: document.getElementById("f-irregularity"),
    fTransitivity: document.getElementById("f-transitivity"),
    fPreposicion: document.getElementById("f-preposicion"),
    fReflexive: document.getElementById("f-reflexive"),
    fAuxiliar: document.getElementById("f-auxiliar"),
    fGustarLike: document.getElementById("f-gustar-like"),
    fGerundio: document.getElementById("f-gerundio"),
    fParticipio: document.getElementById("f-participio"),
    imperativoFormRow: document.getElementById("imperativo-form-row"),
    verbFilters: document.getElementById("verb-filters"),
    verbFiltersClear: document.getElementById("verb-filters-clear"),

    tabVerbs: document.getElementById("tab-verbs"),
    tabWords: document.getElementById("tab-words"),
    tabFlashcards: document.getElementById("tab-flashcards"),
    verbsPanel: document.getElementById("verbs-panel"),
    wordsPanel: document.getElementById("words-panel"),
    flashcardsPanel: document.getElementById("flashcards-panel"),

    wordSearch: document.getElementById("word-search"),
    wordCount: document.getElementById("word-count"),
    wordList: document.getElementById("word-list"),
    wordDetail: document.getElementById("word-detail"),
    wdWord: document.getElementById("wd-word"),
    wdDefinition: document.getElementById("wd-definition"),
    wdBadges: document.getElementById("wd-badges"),
    wdNotes: document.getElementById("wd-notes"),
    wdExample: document.getElementById("wd-example"),
    wdEdit: document.getElementById("wd-edit"),
    wdDelete: document.getElementById("wd-delete"),
    toggleAddWord: document.getElementById("toggle-add-word"),
    seedWordsToolbarBtn: document.getElementById("seed-words-toolbar-btn"),
    wordForm: document.getElementById("word-form"),
    wordFormTitle: document.getElementById("word-form-title"),
    wordFormMsg: document.getElementById("word-form-msg"),
    wordFormCancel: document.getElementById("word-form-cancel"),
    wfWord: document.getElementById("wf-word"),
    wfDefinition: document.getElementById("wf-definition"),
    wfPos: document.getElementById("wf-pos"),
    wfGender: document.getElementById("wf-gender"),
    wfNotes: document.getElementById("wf-notes"),
    wfExample: document.getElementById("wf-example"),
    wordFilters: document.getElementById("word-filters"),
    wordFiltersClear: document.getElementById("word-filters-clear"),

    flashSrcVerbs: document.getElementById("flash-src-verbs"),
    flashSrcWords: document.getElementById("flash-src-words"),
    flashVerbCount: document.getElementById("flash-verb-count"),
    flashWordCount: document.getElementById("flash-word-count"),
    flashVerbOptions: document.getElementById("flash-verb-options"),
    flashWordOptions: document.getElementById("flash-word-options"),
    flashMatrix: document.getElementById("flash-matrix"),
    flashStandaloneToggles: document.getElementById("flash-standalone-toggles"),
    flashDirDef: document.getElementById("flash-dir-def"),
    flashDirWord: document.getElementById("flash-dir-word"),
    flashSetupMsg: document.getElementById("flash-setup-msg"),
    flashStartBtn: document.getElementById("flash-start-btn"),

    flashOverlay: document.getElementById("flash-overlay"),
    flashCloseBtn: document.getElementById("flash-close-btn"),
    flashProgress: document.getElementById("flash-progress"),
    flashCard: document.getElementById("flash-card"),
    flashFrontMain: document.getElementById("flash-front-main"),
    flashFrontSub: document.getElementById("flash-front-sub"),
    flashBackMain: document.getElementById("flash-back-main"),
    flashBackSub: document.getElementById("flash-back-sub"),
    flashBackBadges: document.getElementById("flash-back-badges"),
    flashPrevBtn: document.getElementById("flash-prev-btn"),
    flashNextBtn: document.getElementById("flash-next-btn"),
    flashArrowPrev: document.getElementById("flash-arrow-prev"),
    flashArrowNext: document.getElementById("flash-arrow-next"),

    tabLists: document.getElementById("tab-lists"),
    listsPanel: document.getElementById("lists-panel"),
    listsList: document.getElementById("lists-list"),
    listsEmptyMsg: document.getElementById("lists-empty-msg"),
    toggleAddList: document.getElementById("toggle-add-list"),
    listForm: document.getElementById("list-form"),
    lfName: document.getElementById("lf-name"),
    listFormCancel: document.getElementById("list-form-cancel"),
    listFormMsg: document.getElementById("list-form-msg"),
    listDetail: document.getElementById("list-detail"),
    ldName: document.getElementById("ld-name"),
    ldMeta: document.getElementById("ld-meta"),
    ldShareRow: document.getElementById("ld-share-row"),
    ldShareLink: document.getElementById("ld-share-link"),
    ldCopyLink: document.getElementById("ld-copy-link"),
    ldNativeShare: document.getElementById("ld-native-share"),
    ldShareMsg: document.getElementById("ld-share-msg"),
    ldVerbsGroup: document.getElementById("ld-verbs-group"),
    ldVerbsItems: document.getElementById("ld-verbs-items"),
    ldWordsGroup: document.getElementById("ld-words-group"),
    ldWordsItems: document.getElementById("ld-words-items"),
    ldStudyBtn: document.getElementById("ld-study-btn"),
    ldShareBtn: document.getElementById("ld-share-btn"),
    ldDelete: document.getElementById("ld-delete"),

    dAddToList: document.getElementById("d-add-to-list"),
    wdAddToList: document.getElementById("wd-add-to-list"),
    addFilteredToList: document.getElementById("add-filtered-to-list"),
    addFilteredWordsToList: document.getElementById("add-filtered-words-to-list"),

    listPickerOverlay: document.getElementById("list-picker-overlay"),
    listPickerCount: document.getElementById("list-picker-count"),
    listPickerMsg: document.getElementById("list-picker-msg"),
    listPickerList: document.getElementById("list-picker-list"),
    listPickerNewName: document.getElementById("list-picker-new-name"),
    listPickerCreateBtn: document.getElementById("list-picker-create-btn"),
    listPickerClose: document.getElementById("list-picker-close"),

    shareOverlay: document.getElementById("share-overlay"),
    shareCloseBtn: document.getElementById("share-close-btn"),
    shareName: document.getElementById("share-name"),
    shareMeta: document.getElementById("share-meta"),
    shareMsg: document.getElementById("share-msg"),
    shareItems: document.getElementById("share-items"),
    shareLoginNote: document.getElementById("share-login-note"),
    shareImportBtn: document.getElementById("share-import-btn"),
    shareImportResult: document.getElementById("share-import-result")
  };

  function showBanner(msg) { el.banner.textContent = msg; el.banner.hidden = false; }
  function clearBanner() { el.banner.hidden = true; }

  function stripAccents(s) { return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function norm(s) { return stripAccents(s).toLowerCase().trim(); }

  // ================= filter chips (shared by verbs + vocabulario) =================
  // A record matches an active-filters map if, for every facet that has at
  // least one active value, the record's value for that facet is among the
  // active ones (facets AND together; multiple values within one facet OR).
  function facetOk(activeFilters, facet, value) {
    var set = activeFilters[facet];
    if (!set || set.size === 0) return true;
    return set.has(value);
  }

  function anyFilterActive(activeFilters) {
    return Object.keys(activeFilters).some(function (f) { return activeFilters[f].size > 0; });
  }

  function wireFilterChips(containerEl, clearBtnEl, activeFilters, onChange) {
    var chips = containerEl.querySelectorAll(".chip");
    for (var i = 0; i < chips.length; i++) {
      (function (chip) {
        var facet = chip.getAttribute("data-facet");
        var value = chip.getAttribute("data-value");
        chip.addEventListener("click", function () {
          var set = activeFilters[facet];
          if (set.has(value)) { set.delete(value); chip.classList.remove("active"); }
          else { set.add(value); chip.classList.add("active"); }
          clearBtnEl.hidden = !anyFilterActive(activeFilters);
          onChange();
        });
      })(chips[i]);
    }
    clearBtnEl.addEventListener("click", function () {
      Object.keys(activeFilters).forEach(function (f) { activeFilters[f].clear(); });
      var activeChips = containerEl.querySelectorAll(".chip.active");
      for (var j = 0; j < activeChips.length; j++) activeChips[j].classList.remove("active");
      clearBtnEl.hidden = true;
      onChange();
    });
  }

  // ================= tense header =================
  function buildTenseHeader() {
    var frag = document.createDocumentFragment();
    TENSES.forEach(function (t) {
      var th = document.createElement("th");
      th.textContent = t.label;
      frag.appendChild(th);
    });
    SUBJ_TENSES.forEach(function (t) {
      var th = document.createElement("th");
      th.textContent = t.label;
      frag.appendChild(th);
    });
    var thImp = document.createElement("th");
    thImp.textContent = "Afirm.";
    frag.appendChild(thImp);
    el.dTenseRow.innerHTML = "";
    el.dTenseRow.appendChild(frag);
  }

  // ================= list =================
  function cardRow(id, data) {
    var li = document.createElement("li");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card-row";

    var inf = document.createElement("span");
    inf.className = "inf";
    inf.textContent = data.infinitive || id;
    btn.appendChild(inf);

    if (data.type) {
      var tb = document.createElement("span");
      tb.className = "badge type";
      tb.textContent = data.type;
      btn.appendChild(tb);
    }
    if (data.irregularity && data.irregularity !== "regular") {
      var ib = document.createElement("span");
      ib.className = "badge irregular";
      ib.textContent = data.irregularity;
      btn.appendChild(ib);
    }

    var def = document.createElement("span");
    def.className = "def";
    def.textContent = data.definition || "";
    btn.appendChild(def);

    btn.addEventListener("click", function () {
      if (selectedId === id) deselectVerb(); else selectVerb(id);
    });
    li.appendChild(btn);
    return li;
  }

  function renderList() {
    var q = norm(el.search.value);
    filtered = allVerbs.filter(function (v) {
      if (q && norm(v.data.infinitive || v.id).indexOf(q) === -1) return false;
      if (!facetOk(activeVerbFilters, "type", v.data.type || "")) return false;
      if (!facetOk(activeVerbFilters, "irregularity", v.data.irregularity || "regular")) return false;
      if (!facetOk(activeVerbFilters, "transitivity", v.data.transitivity || "transitivo")) return false;
      // "flag" chips are independent boolean switches, not OR'd alternatives.
      if (activeVerbFilters.flag.has("reflexive") && !v.data.reflexive) return false;
      if (activeVerbFilters.flag.has("auxiliar") && !v.data.auxiliar) return false;
      if (activeVerbFilters.flag.has("gustarLike") && !v.data.gustar_like) return false;
      if (activeStudyList && !activeStudyList.verbSet.has(norm(v.data.infinitive || ""))) return false;
      return true;
    });
    filtered.sort(function (a, b) {
      return (a.data.infinitive || a.id).localeCompare(b.data.infinitive || b.id, "es");
    });

    el.list.innerHTML = "";
    if (filtered.length === 0) {
      var li = document.createElement("li");
      var note = document.createElement("div");
      note.className = "empty-note";
      var p = document.createElement("p");
      p.textContent = allVerbs.length === 0
        ? "Todavía no hay verbos en tu cuenta."
        : "Ningún infinitivo coincide con “" + el.search.value + "”.";
      note.appendChild(p);
      if (allVerbs.length === 0) {
        var seedBtn = document.createElement("button");
        seedBtn.type = "button";
        seedBtn.className = "seed-btn";
        seedBtn.textContent = "Cargar 42 verbos de ejemplo";
        seedBtn.addEventListener("click", seedStarterVerbs);
        note.appendChild(seedBtn);
      }
      li.appendChild(note);
      el.list.appendChild(li);
    } else {
      filtered.forEach(function (v) { el.list.appendChild(cardRow(v.id, v.data)); });
    }
    // Re-rendering the list rebuilds the <li>s, so a scroll position from
    // before the filter changed can now sit past the end of the (shorter)
    // list. Browsers don't always re-clamp scrollTop right away in that
    // case, which left the box looking empty and stuck until it was
    // manually scrolled back up — resetting it here avoids that.
    el.list.scrollTop = 0;
    el.count.textContent = allVerbs.length ? (filtered.length + " / " + allVerbs.length) : "";
  }

  // ================= detail =================
  function badge(cls, text) {
    var s = document.createElement("span");
    s.className = "badge " + cls;
    s.textContent = text;
    return s;
  }

  function deselectVerb() {
    selectedId = null;
    el.detail.hidden = true;
  }

  function selectVerb(id) {
    selectedId = id;
    var entry = allVerbs.find(function (v) { return v.id === id; });
    if (!entry) { el.detail.hidden = true; return; }
    var data = entry.data;
    var forms = data.forms || {};

    el.dInfinitive.textContent = data.infinitive || id;
    el.dDefinition.textContent = data.definition || "";
    el.dBadges.innerHTML = "";
    if (data.type) el.dBadges.appendChild(badge("type", data.type));
    el.dBadges.appendChild(badge("irregular", data.irregularity || "regular"));
    el.dBadges.appendChild(badge("transitivity", data.transitivity || "transitivo"));
    if (data.reflexive) el.dBadges.appendChild(badge("reflexive", "reflexivo"));
    if (data.auxiliar) el.dBadges.appendChild(badge("auxiliar", "auxiliar"));
    if (data.gustar_like) el.dBadges.appendChild(badge("gustarLike", "dativo"));
    el.dPattern.textContent = data.pattern || "";
    el.dPattern.style.display = data.pattern ? "" : "none";
    el.dPreposicion.textContent = data.preposicion ? "Se usa con la preposición “" + data.preposicion + "”." : "";
    el.dPreposicion.style.display = data.preposicion ? "" : "none";

    var imper = forms.imperativo || {};
    var hasImperativo = IMPERATIVE_PERSONS.some(function (p) { return imper[p.key]; });

    // The imperativo column: vos and nosotros already have their own
    // unambiguous row, so they get a plain value there. yo has no command
    // form at all. él/ella/ud. and ellos/ellas/uds. are rows merged from 3
    // persons that agree in every OTHER mood/tense — but in the imperative
    // only usted/ustedes actually have a command, so those two cells show
    // "— / — / <real form>" rather than one clean value.
    function imperativoCell(personKey) {
      var td = document.createElement("td");
      td.className = "imp-col";
      if (!hasImperativo || personKey === "yo") {
        td.textContent = "—";
        return td;
      }
      if (personKey === "vos") {
        td.textContent = imper.vos || "—";
        return td;
      }
      if (personKey === "nosotros") {
        td.textContent = imper.nosotros || "—";
        return td;
      }
      var realVal = personKey === "el" ? imper.usted : imper.ustedes;
      var dash = document.createElement("span");
      dash.className = "dash";
      dash.textContent = "— / —";
      td.appendChild(dash);
      td.appendChild(document.createTextNode(" / "));
      var real = document.createElement("span");
      real.className = "real";
      real.textContent = realVal || "—";
      td.appendChild(real);
      return td;
    }

    buildTenseHeader();
    el.dConjBody.innerHTML = "";
    el.dConjPronounBody.innerHTML = "";
    if (el.dConjLegend) el.dConjLegend.style.display = data.gustar_like ? "none" : "";
    if (el.dGustarLegend) el.dGustarLegend.style.display = data.gustar_like ? "" : "none";
    PERSONS.forEach(function (p) {
      var prTr = document.createElement("tr");
      var prTh = document.createElement("th");
      prTh.textContent = data.gustar_like ? GUSTAR_LIKE_PERSON[p.key].label : p.label;
      prTr.appendChild(prTh);
      el.dConjPronounBody.appendChild(prTr);

      var tr = document.createElement("tr");
      TENSES.forEach(function (t) {
        var td = document.createElement("td");
        if (data.gustar_like) {
          td.textContent = gustarCellText(forms, t.key, p.key);
        } else {
          var val = (forms[t.key] && forms[t.key][p.key]) || "";
          td.textContent = val || "—";
          if (isCellIrregular(data, t.key, p.key, val)) td.classList.add("irreg");
        }
        tr.appendChild(td);
      });
      SUBJ_TENSES.forEach(function (t) {
        var tdSubj = document.createElement("td");
        if (data.gustar_like) {
          tdSubj.textContent = gustarCellText(forms, t.key, p.key);
        } else {
          var subjVal = (forms[t.key] && forms[t.key][p.key]) || "";
          tdSubj.textContent = subjVal || "—";
          if (isCellIrregular(data, t.key, p.key, subjVal)) tdSubj.classList.add("irreg");
        }
        tr.appendChild(tdSubj);
      });
      tr.appendChild(imperativoCell(p.key));
      el.dConjBody.appendChild(tr);
    });

    var imp = forms.impersonal || {};
    var hasImpersonal = TENSES.concat(SUBJ_TENSES).some(function (t) { return imp[t.key]; });
    if (hasImpersonal) {
      var impPrTr = document.createElement("tr");
      impPrTr.className = "impersonal-row";
      var impPrTh = document.createElement("th");
      impPrTh.textContent = "impersonal";
      impPrTr.appendChild(impPrTh);
      el.dConjPronounBody.appendChild(impPrTr);

      var impTr = document.createElement("tr");
      impTr.className = "impersonal-row";
      TENSES.forEach(function (t) {
        var td = document.createElement("td");
        td.textContent = imp[t.key] || "—";
        impTr.appendChild(td);
      });
      SUBJ_TENSES.forEach(function (t) {
        var impTdSubj = document.createElement("td");
        impTdSubj.textContent = imp[t.key] || "—";
        impTr.appendChild(impTdSubj);
      });
      // impersonal verbs (llover, nevar) have no imperativo at all
      var impTdImp = document.createElement("td");
      impTdImp.className = "imp-col";
      impTdImp.textContent = "—";
      impTr.appendChild(impTdImp);
      el.dConjBody.appendChild(impTr);
    }

    el.dGerundio.textContent = forms.gerundio || "—";
    el.dParticipio.textContent = forms.participio || "—";

    el.detail.hidden = false;
    el.detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    syncConjRowHeights();
    // A second pass a couple frames later catches anything that settles
    // just after this first synchronous one — a font swap finishing, or
    // (see the note on syncConjRowHeights) a mobile browser's automatic
    // text-size boost re-evaluating itself for the newly-inserted cells.
    requestAnimationFrame(function () {
      requestAnimationFrame(syncConjRowHeights);
    });
  }

  // The pronoun column is its own small <table> beside the scrolling tense
  // table (see the note above table.conj-pronouns) rather than a column
  // inside it, specifically to dodge a mobile Safari bug with sticky-in-
  // table columns. The tradeoff: two independent tables lay out their own
  // row heights, so anything that makes one table's natural row height
  // differ ever so slightly from the other's — longer composite cell text
  // (gustar-type verbs' "me gusta / me gustan" is much longer than a plain
  // "gusto"), a webfont finishing its swap-in after this first paint, a
  // sub-pixel border-rounding difference on a real device's screen — lets
  // their rows drift out of sync, and once one row is off every row below
  // it is too, so the pronoun labels stop lining up with their row.
  // Forcing both tables' rows to the same explicit height (the taller of
  // the two, per row) after every render removes the dependency on the
  // two tables agreeing on their own.
  function syncConjRowHeights() {
    var prRows = el.dConjPronounBody.querySelectorAll("tr");
    var teRows = el.dConjBody.querySelectorAll("tr");
    var n = Math.min(prRows.length, teRows.length);
    var i;
    for (i = 0; i < n; i++) {
      prRows[i].style.height = "";
      teRows[i].style.height = "";
    }
    for (i = 0; i < n; i++) {
      var h = Math.max(prRows[i].getBoundingClientRect().height, teRows[i].getBoundingClientRect().height);
      prRows[i].style.height = h + "px";
      teRows[i].style.height = h + "px";
    }
  }

  // ================= add/edit form =================
  function buildConjFormTable() {
    el.conjFormTable.innerHTML = "";
    var thead = document.createElement("thead");
    var htr = document.createElement("tr");
    var th0 = document.createElement("th");
    th0.className = "person-col";
    htr.appendChild(th0);
    TENSES.forEach(function (t) {
      var th = document.createElement("th");
      th.textContent = t.label;
      htr.appendChild(th);
    });
    SUBJ_TENSES.forEach(function (t) {
      var thSubj = document.createElement("th");
      thSubj.textContent = "Subj. " + t.label.toLowerCase();
      htr.appendChild(thSubj);
    });
    thead.appendChild(htr);
    el.conjFormTable.appendChild(thead);

    var tbody = document.createElement("tbody");
    PERSONS.forEach(function (p) {
      var tr = document.createElement("tr");
      var th = document.createElement("th");
      th.textContent = p.label;
      th.className = "person-col";
      tr.appendChild(th);
      TENSES.forEach(function (t) {
        var td = document.createElement("td");
        var inp = document.createElement("input");
        inp.type = "text";
        inp.id = "f-" + t.key + "-" + p.key;
        td.appendChild(inp);
        tr.appendChild(td);
      });
      SUBJ_TENSES.forEach(function (t) {
        var tdSubj = document.createElement("td");
        var inpSubj = document.createElement("input");
        inpSubj.type = "text";
        inpSubj.id = "f-" + t.key + "-" + p.key;
        tdSubj.appendChild(inpSubj);
        tr.appendChild(tdSubj);
      });
      tbody.appendChild(tr);
    });

    var impTr = document.createElement("tr");
    impTr.className = "impersonal-row";
    var impTh = document.createElement("th");
    impTh.className = "person-col";
    impTh.textContent = "impersonal (opcional)";
    impTr.appendChild(impTh);
    TENSES.forEach(function (t) {
      var td = document.createElement("td");
      var inp = document.createElement("input");
      inp.type = "text";
      inp.id = "f-impersonal-" + t.key;
      td.appendChild(inp);
      impTr.appendChild(td);
    });
    SUBJ_TENSES.forEach(function (t) {
      var impTdSubj = document.createElement("td");
      var impInpSubj = document.createElement("input");
      impInpSubj.type = "text";
      impInpSubj.id = "f-impersonal-" + t.key;
      impTdSubj.appendChild(impInpSubj);
      impTr.appendChild(impTdSubj);
    });
    tbody.appendChild(impTr);

    el.conjFormTable.appendChild(tbody);
  }

  function buildImperativoFormRow() {
    el.imperativoFormRow.innerHTML = "";
    IMPERATIVE_PERSONS.forEach(function (p) {
      var field = document.createElement("div");
      field.className = "field";
      var label = document.createElement("label");
      label.setAttribute("for", "f-imperativo-" + p.key);
      label.textContent = p.label;
      var inp = document.createElement("input");
      inp.type = "text";
      inp.id = "f-imperativo-" + p.key;
      field.appendChild(label);
      field.appendChild(inp);
      el.imperativoFormRow.appendChild(field);
    });
  }

  function clearForm() {
    el.fInfinitive.value = "";
    el.fDefinition.value = "";
    el.fType.value = "-ar";
    el.fPattern.value = "";
    el.fIrregularity.value = "regular";
    el.fTransitivity.value = "transitivo";
    el.fPreposicion.value = "";
    el.fReflexive.checked = false;
    el.fAuxiliar.checked = false;
    el.fGustarLike.checked = false;
    el.fGerundio.value = "";
    el.fParticipio.value = "";
    PERSONS.forEach(function (p) {
      TENSES.concat(SUBJ_TENSES).forEach(function (t) {
        var inp = document.getElementById("f-" + t.key + "-" + p.key);
        if (inp) inp.value = "";
      });
    });
    TENSES.concat(SUBJ_TENSES).forEach(function (t) {
      var inp = document.getElementById("f-impersonal-" + t.key);
      if (inp) inp.value = "";
    });
    IMPERATIVE_PERSONS.forEach(function (p) {
      var inp = document.getElementById("f-imperativo-" + p.key);
      if (inp) inp.value = "";
    });
  }

  function fillForm(data) {
    el.fInfinitive.value = data.infinitive || "";
    el.fDefinition.value = data.definition || "";
    el.fType.value = data.type || "-ar";
    el.fPattern.value = data.pattern || "";
    el.fIrregularity.value = data.irregularity || "regular";
    el.fTransitivity.value = data.transitivity || "transitivo";
    el.fPreposicion.value = data.preposicion || "";
    el.fReflexive.checked = !!data.reflexive;
    el.fAuxiliar.checked = !!data.auxiliar;
    el.fGustarLike.checked = !!data.gustar_like;
    var forms = data.forms || {};
    el.fGerundio.value = forms.gerundio || "";
    el.fParticipio.value = forms.participio || "";
    PERSONS.forEach(function (p) {
      TENSES.concat(SUBJ_TENSES).forEach(function (t) {
        var inp = document.getElementById("f-" + t.key + "-" + p.key);
        if (inp) inp.value = (forms[t.key] && forms[t.key][p.key]) || "";
      });
    });
    var imp = forms.impersonal || {};
    TENSES.concat(SUBJ_TENSES).forEach(function (t) {
      var inp = document.getElementById("f-impersonal-" + t.key);
      if (inp) inp.value = imp[t.key] || "";
    });
    var imper = forms.imperativo || {};
    IMPERATIVE_PERSONS.forEach(function (p) {
      var inp = document.getElementById("f-imperativo-" + p.key);
      if (inp) inp.value = imper[p.key] || "";
    });
  }

  function openForm(mode, data) {
    editingId = mode === "edit" ? selectedId : null;
    el.formTitle.textContent = mode === "edit" ? "Editar verbo" : "Agregar verbo";
    el.formMsg.textContent = "";
    if (mode === "edit" && data) fillForm(data); else clearForm();
    el.form.hidden = false;
    el.toggleAdd.hidden = true;
    el.seedToolbarBtn.hidden = true;
    el.fInfinitive.focus();
    el.form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function closeForm() {
    el.form.hidden = true;
    el.toggleAdd.hidden = false;
    el.seedToolbarBtn.hidden = false;
    editingId = null;
    el.formMsg.textContent = "";
  }

  function collectFormData() {
    var forms = {};
    TENSES.forEach(function (t) {
      forms[t.key] = {};
      PERSONS.forEach(function (p) {
        var inp = document.getElementById("f-" + t.key + "-" + p.key);
        forms[t.key][p.key] = inp ? inp.value.trim() : "";
      });
    });
    SUBJ_TENSES.forEach(function (t) {
      forms[t.key] = {};
      PERSONS.forEach(function (p) {
        var inp = document.getElementById("f-" + t.key + "-" + p.key);
        forms[t.key][p.key] = inp ? inp.value.trim() : "";
      });
    });
    forms.gerundio = el.fGerundio.value.trim();
    forms.participio = el.fParticipio.value.trim();

    var imp = {};
    var hasImp = false;
    TENSES.concat(SUBJ_TENSES).forEach(function (t) {
      var inp = document.getElementById("f-impersonal-" + t.key);
      var val = inp ? inp.value.trim() : "";
      imp[t.key] = val;
      if (val) hasImp = true;
    });
    if (hasImp) forms.impersonal = imp;

    var imper = {};
    var hasImper = false;
    IMPERATIVE_PERSONS.forEach(function (p) {
      var inp = document.getElementById("f-imperativo-" + p.key);
      var val = inp ? inp.value.trim() : "";
      imper[p.key] = val;
      if (val) hasImper = true;
    });
    if (hasImper) forms.imperativo = imper;

    return {
      infinitive: el.fInfinitive.value.trim(),
      definition: el.fDefinition.value.trim(),
      type: el.fType.value,
      irregularity: el.fIrregularity.value,
      pattern: el.fPattern.value.trim(),
      transitivity: el.fTransitivity.value,
      preposicion: el.fPreposicion.value.trim(),
      reflexive: el.fReflexive.checked,
      auxiliar: el.fAuxiliar.checked,
      gustar_like: el.fGustarLike.checked,
      forms: forms
    };
  }

  // ================= Supabase-backed data layer =================
  function rowToVerb(row) {
    return {
      id: row.id,
      data: {
        infinitive: row.infinitive,
        definition: row.definition || "",
        type: row.type || "-ar",
        irregularity: row.irregularity || "regular",
        pattern: row.pattern || "",
        transitivity: row.transitivity || "transitivo",
        preposicion: row.preposicion || "",
        reflexive: !!row.reflexive,
        auxiliar: !!row.auxiliar,
        gustar_like: !!row.gustar_like,
        forms: row.forms || {}
      }
    };
  }

  function loadVerbs() {
    return supabaseClient
      .from("verbs")
      .select("*")
      .order("infinitive", { ascending: true })
      .then(function (res) {
        if (res.error) { showBanner("Error al cargar tus verbos: " + res.error.message); return; }
        clearBanner();
        allVerbs = (res.data || []).map(rowToVerb);
        renderList();
        if (selectedId) {
          var still = allVerbs.find(function (v) { return v.id === selectedId; });
          if (still) selectVerb(selectedId); else { el.detail.hidden = true; selectedId = null; }
        }
      });
  }

  function handleSubmit(evt) {
    evt.preventDefault();
    var data = collectFormData();
    if (!data.infinitive) { el.formMsg.textContent = "Falta el infinitivo."; return; }
    el.formMsg.textContent = "Guardando…";

    var query = editingId
      ? supabaseClient.from("verbs").update(data).eq("id", editingId).select().single()
      : supabaseClient.from("verbs").insert(data).select().single();

    query.then(function (res) {
      if (res.error) { el.formMsg.textContent = "Error al guardar: " + res.error.message; return; }
      var savedId = res.data.id;
      closeForm();
      loadVerbs().then(function () { selectVerb(savedId); });
    });
  }

  function handleDelete() {
    if (!selectedId) return;
    if (!window.confirm("¿Eliminar este verbo de tu índice?")) return;
    supabaseClient.from("verbs").delete().eq("id", selectedId).then(function (res) {
      if (res.error) { showBanner("No se pudo eliminar: " + res.error.message); return; }
      el.detail.hidden = true;
      selectedId = null;
      loadVerbs();
    });
  }

  function seedStarterVerbs() {
    var existing = {};
    allVerbs.forEach(function (v) { existing[norm(v.data.infinitive || "")] = true; });
    var toInsert = STARTER_VERBS.filter(function (sv) { return !existing[norm(sv.infinitive)]; });
    if (toInsert.length === 0) {
      showBanner("Ya tenés todos los verbos de ejemplo en tu cuenta.");
      return;
    }
    supabaseClient.from("verbs").insert(toInsert).then(function (res) {
      if (res.error) { showBanner("No se pudieron cargar los verbos de ejemplo: " + res.error.message); return; }
      loadVerbs();
    });
  }

  // ================= vocabulario (general words) =================
  function setMainTab(tab) {
    el.tabVerbs.classList.toggle("active", tab === "verbs");
    el.tabWords.classList.toggle("active", tab === "words");
    el.tabFlashcards.classList.toggle("active", tab === "flashcards");
    el.tabLists.classList.toggle("active", tab === "lists");
    el.verbsPanel.hidden = tab !== "verbs";
    el.wordsPanel.hidden = tab !== "words";
    el.flashcardsPanel.hidden = tab !== "flashcards";
    el.listsPanel.hidden = tab !== "lists";
    if (tab === "flashcards") renderFlashSetup();
    if (tab === "lists") loadLists();
    try { localStorage.setItem("iv-main-tab", tab); } catch (e) {}
  }

  function wordCardRow(id, data) {
    var li = document.createElement("li");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card-row";

    var w = document.createElement("span");
    w.className = "inf";
    w.textContent = data.word || id;
    btn.appendChild(w);

    if (data.partOfSpeech) btn.appendChild(badge("type", data.partOfSpeech));
    if (data.gender) btn.appendChild(badge("gender", data.gender));

    var def = document.createElement("span");
    def.className = "def";
    def.textContent = data.definition || "";
    btn.appendChild(def);

    btn.addEventListener("click", function () {
      if (selectedWordId === id) deselectWord(); else selectWord(id);
    });
    li.appendChild(btn);
    return li;
  }

  function renderWordList() {
    var q = norm(el.wordSearch.value);
    filteredWords = allWords.filter(function (v) {
      if (q && norm(v.data.word || v.id).indexOf(q) === -1) return false;
      if (!facetOk(activeWordFilters, "pos", v.data.partOfSpeech || "")) return false;
      if (!facetOk(activeWordFilters, "gender", v.data.gender || "")) return false;
      if (activeStudyList && !activeStudyList.wordSet.has(norm(v.data.word || ""))) return false;
      return true;
    });
    filteredWords.sort(function (a, b) {
      return (a.data.word || a.id).localeCompare(b.data.word || b.id, "es");
    });

    el.wordList.innerHTML = "";
    if (filteredWords.length === 0) {
      var li = document.createElement("li");
      var note = document.createElement("div");
      note.className = "empty-note";
      var p = document.createElement("p");
      p.textContent = allWords.length === 0
        ? "Todavía no hay palabras en tu vocabulario."
        : "Ninguna palabra coincide con “" + el.wordSearch.value + "”.";
      note.appendChild(p);
      if (allWords.length === 0) {
        var seedWordsBtn = document.createElement("button");
        seedWordsBtn.type = "button";
        seedWordsBtn.className = "seed-btn";
        seedWordsBtn.textContent = "Cargar " + STARTER_WORDS.length + " palabras de ejemplo";
        seedWordsBtn.addEventListener("click", seedStarterWords);
        note.appendChild(seedWordsBtn);
      }
      li.appendChild(note);
      el.wordList.appendChild(li);
    } else {
      filteredWords.forEach(function (v) { el.wordList.appendChild(wordCardRow(v.id, v.data)); });
    }
    // See the matching comment in renderList(): reset scroll position so a
    // filter that shrinks the list can't leave it scrolled past its own end.
    el.wordList.scrollTop = 0;
    el.wordCount.textContent = allWords.length ? (filteredWords.length + " / " + allWords.length) : "";
  }

  function deselectWord() {
    selectedWordId = null;
    el.wordDetail.hidden = true;
  }

  function selectWord(id) {
    selectedWordId = id;
    var entry = allWords.find(function (v) { return v.id === id; });
    if (!entry) { el.wordDetail.hidden = true; return; }
    var data = entry.data;

    el.wdWord.textContent = data.word || id;
    el.wdDefinition.textContent = data.definition || "";
    el.wdBadges.innerHTML = "";
    if (data.partOfSpeech) el.wdBadges.appendChild(badge("type", data.partOfSpeech));
    if (data.gender) el.wdBadges.appendChild(badge("gender", data.gender));
    el.wdNotes.textContent = data.notes || "";
    el.wdNotes.style.display = data.notes ? "" : "none";
    el.wdExample.textContent = data.example || "";
    el.wdExample.style.display = data.example ? "" : "none";

    el.wordDetail.hidden = false;
    el.wordDetail.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function clearWordForm() {
    el.wfWord.value = "";
    el.wfDefinition.value = "";
    el.wfPos.value = "sustantivo";
    el.wfGender.value = "";
    el.wfNotes.value = "";
    el.wfExample.value = "";
  }

  function fillWordForm(data) {
    el.wfWord.value = data.word || "";
    el.wfDefinition.value = data.definition || "";
    el.wfPos.value = data.partOfSpeech || "sustantivo";
    el.wfGender.value = data.gender || "";
    el.wfNotes.value = data.notes || "";
    el.wfExample.value = data.example || "";
  }

  function openWordForm(mode, data) {
    editingWordId = mode === "edit" ? selectedWordId : null;
    el.wordFormTitle.textContent = mode === "edit" ? "Editar palabra" : "Agregar palabra";
    el.wordFormMsg.textContent = "";
    if (mode === "edit" && data) fillWordForm(data); else clearWordForm();
    el.wordForm.hidden = false;
    el.toggleAddWord.hidden = true;
    el.seedWordsToolbarBtn.hidden = true;
    el.wfWord.focus();
    el.wordForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function closeWordForm() {
    el.wordForm.hidden = true;
    el.toggleAddWord.hidden = false;
    el.seedWordsToolbarBtn.hidden = false;
    editingWordId = null;
    el.wordFormMsg.textContent = "";
  }

  function collectWordFormData() {
    return {
      word: el.wfWord.value.trim(),
      definition: el.wfDefinition.value.trim(),
      partOfSpeech: el.wfPos.value,
      gender: el.wfGender.value,
      notes: el.wfNotes.value.trim(),
      example: el.wfExample.value.trim()
    };
  }

  function rowToWord(row) {
    return {
      id: row.id,
      data: {
        word: row.word,
        definition: row.definition || "",
        partOfSpeech: row.part_of_speech || "sustantivo",
        gender: row.gender || "",
        notes: row.notes || "",
        example: row.example || ""
      }
    };
  }

  function loadWords() {
    return supabaseClient
      .from("words")
      .select("*")
      .order("word", { ascending: true })
      .then(function (res) {
        if (res.error) { showBanner("Error al cargar tu vocabulario: " + res.error.message); return; }
        clearBanner();
        allWords = (res.data || []).map(rowToWord);
        renderWordList();
        if (selectedWordId) {
          var still = allWords.find(function (v) { return v.id === selectedWordId; });
          if (still) selectWord(selectedWordId); else { el.wordDetail.hidden = true; selectedWordId = null; }
        }
      });
  }

  function handleWordSubmit(evt) {
    evt.preventDefault();
    var data = collectWordFormData();
    if (!data.word) { el.wordFormMsg.textContent = "Falta la palabra."; return; }
    el.wordFormMsg.textContent = "Guardando…";

    var row = {
      word: data.word,
      definition: data.definition,
      part_of_speech: data.partOfSpeech,
      gender: data.gender,
      notes: data.notes,
      example: data.example
    };

    var query = editingWordId
      ? supabaseClient.from("words").update(row).eq("id", editingWordId).select().single()
      : supabaseClient.from("words").insert(row).select().single();

    query.then(function (res) {
      if (res.error) { el.wordFormMsg.textContent = "Error al guardar: " + res.error.message; return; }
      var savedId = res.data.id;
      closeWordForm();
      loadWords().then(function () { selectWord(savedId); });
    });
  }

  function handleWordDelete() {
    if (!selectedWordId) return;
    if (!window.confirm("¿Eliminar esta palabra de tu vocabulario?")) return;
    supabaseClient.from("words").delete().eq("id", selectedWordId).then(function (res) {
      if (res.error) { showBanner("No se pudo eliminar: " + res.error.message); return; }
      el.wordDetail.hidden = true;
      selectedWordId = null;
      loadWords();
    });
  }

  function seedStarterWords() {
    var existing = {};
    allWords.forEach(function (v) { existing[norm(v.data.word || "")] = true; });
    var toInsert = STARTER_WORDS.filter(function (sw) { return !existing[norm(sw.word)]; });
    if (toInsert.length === 0) {
      showBanner("Ya tenés todas las palabras de ejemplo en tu vocabulario.");
      return;
    }
    supabaseClient.from("words").insert(toInsert).then(function (res) {
      if (res.error) { showBanner("No se pudieron cargar las palabras de ejemplo: " + res.error.message); return; }
      loadWords();
    });
  }

  // ================= flashcards =================
  // The tense/person picker is a clickable grid shaped like the conjugation
  // table itself (persons as rows, tenses as columns, imperativo as a 6th
  // column) rather than two long checkbox lists — a row/column header
  // toggles everyone in that row/column in one click, and the corner button
  // toggles the whole grid, so picking e.g. "just presente and pretérito"
  // takes 2 clicks instead of unchecking 8 boxes one at a time.
  function refreshFlashMatrixVisuals() {
    var cellButtons = el.flashMatrix.querySelectorAll(".flash-matrix-cell");
    cellButtons.forEach(function (btn) {
      btn.classList.toggle("on", activeFlashCells.has(btn.getAttribute("data-cell")));
    });
    var allKeys = flashAllCellKeys();
    var allOn = allKeys.every(function (k) { return activeFlashCells.has(k); });
    var toggleAllBtn = el.flashMatrix.querySelector(".flash-matrix-toggle-all");
    if (toggleAllBtn) toggleAllBtn.textContent = allOn ? "Ninguno" : "Todo";
  }

  function buildFlashMatrix() {
    var table = el.flashMatrix;
    table.innerHTML = "";

    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    var cornerTh = document.createElement("th");
    var cornerBtn = document.createElement("button");
    cornerBtn.type = "button";
    cornerBtn.className = "flash-matrix-toggle-all";
    cornerBtn.addEventListener("click", function () {
      var keys = flashAllCellKeys();
      var allOn = keys.every(function (k) { return activeFlashCells.has(k); });
      if (allOn) activeFlashCells.clear(); else keys.forEach(function (k) { activeFlashCells.add(k); });
      refreshFlashMatrixVisuals();
    });
    cornerTh.appendChild(cornerBtn);
    headRow.appendChild(cornerTh);

    FLASH_MATRIX_COLUMNS.forEach(function (col) {
      var th = document.createElement("th");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "flash-matrix-head";
      btn.textContent = col.label;
      btn.addEventListener("click", function () {
        var keys = flashColumnCellKeys(col.key);
        var allOn = keys.every(function (k) { return activeFlashCells.has(k); });
        keys.forEach(function (k) { if (allOn) activeFlashCells.delete(k); else activeFlashCells.add(k); });
        refreshFlashMatrixVisuals();
      });
      th.appendChild(btn);
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    PERSONS.forEach(function (p) {
      var tr = document.createElement("tr");
      var rowTh = document.createElement("th");
      var rowBtn = document.createElement("button");
      rowBtn.type = "button";
      rowBtn.className = "flash-matrix-head flash-matrix-row-head";
      rowBtn.textContent = p.label;
      rowBtn.addEventListener("click", function () {
        var keys = flashRowCellKeys(p.key);
        var allOn = keys.every(function (k) { return activeFlashCells.has(k); });
        keys.forEach(function (k) { if (allOn) activeFlashCells.delete(k); else activeFlashCells.add(k); });
        refreshFlashMatrixVisuals();
      });
      rowTh.appendChild(rowBtn);
      tr.appendChild(rowTh);

      FLASH_MATRIX_COLUMNS.forEach(function (col) {
        var td = document.createElement("td");
        if (!flashCellSelectable(col.key, p.key)) {
          td.className = "flash-matrix-na";
        } else {
          var key = flashCellKey(col.key, p.key);
          var cellBtn = document.createElement("button");
          cellBtn.type = "button";
          cellBtn.className = "flash-matrix-cell";
          cellBtn.setAttribute("data-cell", key);
          cellBtn.setAttribute("aria-label", p.label + " · " + col.label);
          cellBtn.addEventListener("click", function () {
            if (activeFlashCells.has(key)) activeFlashCells.delete(key); else activeFlashCells.add(key);
            refreshFlashMatrixVisuals();
          });
          td.appendChild(cellBtn);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    refreshFlashMatrixVisuals();
  }

  function buildFlashStandaloneToggles() {
    el.flashStandaloneToggles.innerHTML = "";
    [{ key: "gerundio", label: "Gerundio" }, { key: "participio", label: "Participio" }].forEach(function (item) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = item.label;
      btn.classList.toggle("active", activeFlashStandalone.has(item.key));
      btn.addEventListener("click", function () {
        if (activeFlashStandalone.has(item.key)) activeFlashStandalone.delete(item.key); else activeFlashStandalone.add(item.key);
        btn.classList.toggle("active", activeFlashStandalone.has(item.key));
      });
      el.flashStandaloneToggles.appendChild(btn);
    });
  }

  // A tense column counts as "in play" for an impersonal verb (llover,
  // nevar, haber's "hay") if at least one person is selected for it —
  // impersonal forms have no person of their own to check directly.
  function flashTenseHasAnySelected(tenseKey) {
    return flashColumnCellKeys(tenseKey).some(function (k) { return activeFlashCells.has(k); });
  }

  function renderFlashSetup() {
    el.flashVerbCount.textContent = "(" + filtered.length + ")";
    el.flashWordCount.textContent = "(" + filteredWords.length + ")";
    el.flashVerbOptions.hidden = !activeFlashSources.verbs;
    el.flashWordOptions.hidden = !activeFlashSources.words;

    var noSource = !activeFlashSources.verbs && !activeFlashSources.words;
    el.flashStartBtn.disabled = noSource;
    el.flashSetupMsg.textContent = noSource ? "Activá al menos una fuente (verbos o vocabulario)." : "";
  }

  // A flashcard is { kind: "verb"|"word", data, frontMain, frontSub, backMain, backSub }.
  // frontMain/backMain are the big headline text; the *Sub lines and badges are secondary.
  function buildFlashDeck() {
    var deck = [];

    if (activeFlashSources.verbs) {
      filtered.forEach(function (v) {
        var data = v.data;
        var forms = data.forms || {};
        var def = data.definition || "";
        var inf = data.infinitive || v.id;

        FLASH_PERSONAL_TENSES.forEach(function (t) {
          PERSONS.forEach(function (p) {
            if (!activeFlashCells.has(flashCellKey(t.key, p.key))) return;
            var frontLabel, val;
            if (data.gustar_like) {
              val = gustarCellText(forms, t.key, p.key);
              if (val === "—") return;
              frontLabel = GUSTAR_LIKE_PERSON[p.key].label;
            } else {
              val = (forms[t.key] && forms[t.key][p.key]) || "";
              if (!val) return;
              frontLabel = p.label;
            }
            deck.push({
              kind: "verb", data: data,
              frontMain: inf, frontSub: frontLabel + " · " + t.label.toLowerCase(),
              backMain: val, backSub: def ? "(" + def + ")" : ""
            });
          });
        });

        // impersonal verbs (llover, nevar, haber's "hay"...) have no person —
        // same idea as the extra row the conjugation table shows for them.
        var imp = forms.impersonal || {};
        FLASH_PERSONAL_TENSES.forEach(function (t) {
          if (!flashTenseHasAnySelected(t.key)) return;
          var val = imp[t.key] || "";
          if (!val) return;
          deck.push({
            kind: "verb", data: data,
            frontMain: inf, frontSub: "impersonal · " + t.label.toLowerCase(),
            backMain: val, backSub: def ? "(" + def + ")" : ""
          });
        });

        if (forms.imperativo) {
          Object.keys(IMPERATIVO_FORM_KEY).forEach(function (personKey) {
            if (!activeFlashCells.has(flashCellKey("imperativo", personKey))) return;
            var val = forms.imperativo[IMPERATIVO_FORM_KEY[personKey]] || "";
            if (!val) return;
            deck.push({
              kind: "verb", data: data,
              frontMain: inf, frontSub: IMPERATIVO_DISPLAY[personKey] + " · imperativo",
              backMain: val, backSub: def ? "(" + def + ")" : ""
            });
          });
        }

        ["gerundio", "participio"].forEach(function (key) {
          if (!activeFlashStandalone.has(key)) return;
          var val = forms[key] || "";
          if (!val) return;
          deck.push({
            kind: "verb", data: data,
            frontMain: inf, frontSub: key,
            backMain: val, backSub: def ? "(" + def + ")" : ""
          });
        });
      });
    }

    if (activeFlashSources.words) {
      filteredWords.forEach(function (w) {
        var data = w.data;
        var word = data.word || w.id;
        var def = data.definition || "";
        if (flashDirection === "word2def") {
          deck.push({ kind: "word", data: data, frontMain: word, frontSub: "", backMain: def || "—", backSub: "" });
        } else {
          deck.push({ kind: "word", data: data, frontMain: def || word, frontSub: "", backMain: word, backSub: "" });
        }
      });
    }

    return deck;
  }

  function flashBackBadges(card) {
    var frag = document.createDocumentFragment();
    var data = card.data;
    if (card.kind === "verb") {
      if (data.type) frag.appendChild(badge("type", data.type));
      frag.appendChild(badge("irregular", data.irregularity || "regular"));
      frag.appendChild(badge("transitivity", data.transitivity || "transitivo"));
      if (data.reflexive) frag.appendChild(badge("reflexive", "reflexivo"));
      if (data.auxiliar) frag.appendChild(badge("auxiliar", "auxiliar"));
      if (data.gustar_like) frag.appendChild(badge("gustarLike", "dativo"));
    } else {
      if (data.partOfSpeech) frag.appendChild(badge("type", data.partOfSpeech));
      if (data.gender) frag.appendChild(badge("gender", data.gender));
    }
    return frag;
  }

  function shuffleArray(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function renderFlashCard() {
    if (flashIndex < 0 || flashIndex >= flashDeck.length) return;
    var card = flashDeck[flashIndex];
    // Jump to the new card with the rotation snapped instantly back to 0 —
    // no-anim suspends the CSS transition for one frame so a card that was
    // showing its answer doesn't visibly spin through showing the NEW
    // card's answer face before settling back on its front.
    el.flashCard.classList.add("no-anim");
    el.flashCard.classList.remove("flipped");
    el.flashFrontMain.textContent = card.frontMain;
    el.flashFrontSub.textContent = card.frontSub || "";
    el.flashFrontSub.style.display = card.frontSub ? "" : "none";
    el.flashBackMain.textContent = card.backMain;
    el.flashBackSub.textContent = card.backSub || "";
    el.flashBackSub.style.display = card.backSub ? "" : "none";
    el.flashBackBadges.innerHTML = "";
    el.flashBackBadges.appendChild(flashBackBadges(card));
    el.flashProgress.textContent = (flashIndex + 1) + " / " + flashDeck.length;
    el.flashPrevBtn.disabled = flashIndex === 0;
    el.flashArrowPrev.disabled = flashIndex === 0;
    // force layout so the un-flip above is actually painted before we
    // re-enable the transition on the next frame
    void el.flashCard.offsetWidth;
    requestAnimationFrame(function () {
      el.flashCard.classList.remove("no-anim");
    });
  }

  // Flashcard mode deliberately runs in the OPPOSITE theme from the rest of
  // the app, so it feels like a distinct "mode" rather than more of the same
  // page. "Ambient" here means whatever the app is currently rendering in —
  // either an explicit data-theme on <html>, or (with none set) whatever the
  // OS/browser's prefers-color-scheme currently says.
  function ambientIsDark() {
    var attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark") return true;
    if (attr === "light") return false;
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function startFlashcards() {
    flashDeck = shuffleArray(buildFlashDeck());
    if (flashDeck.length === 0) {
      el.flashSetupMsg.textContent = "No hay tarjetas para esta combinación de filtros — probá activar más tiempos, personas o fuentes.";
      return;
    }
    el.flashSetupMsg.textContent = "";
    flashIndex = 0;
    // only the card itself flips to the opposite theme — the overlay's
    // background, topbar, and controls stay in the app's actual theme.
    el.flashCard.setAttribute("data-theme", ambientIsDark() ? "light" : "dark");
    el.flashOverlay.hidden = false;
    renderFlashCard();
  }

  function nextFlashCard() {
    flashIndex++;
    if (flashIndex >= flashDeck.length) {
      flashDeck = shuffleArray(flashDeck.slice());
      flashIndex = 0;
    }
    renderFlashCard();
  }

  function prevFlashCard() {
    if (flashIndex <= 0) return;
    flashIndex--;
    renderFlashCard();
  }

  function closeFlashcards() {
    el.flashOverlay.hidden = true;
  }

  function toggleFlashFlip() {
    el.flashCard.classList.toggle("flipped");
  }

  // Swiping the card (any of the four directions — up/left = "forward",
  // down/right = "back") follows the finger in real time, like sliding a
  // physical tile, rather than just jumping to the next card once the
  // gesture ends. A tap that never moves past FLASH_DRAG_START_PX is left
  // completely alone here, so the normal tap-to-flip click still fires.
  var FLASH_DRAG_START_PX = 8;
  var FLASH_SWIPE_THRESHOLD_PX = 40;
  var flashTouchStartX = 0, flashTouchStartY = 0;
  var flashDragging = false;
  var flashDragDx = 0, flashDragDy = 0;

  function handleFlashTouchStart(evt) {
    var t = evt.touches[0];
    flashTouchStartX = t.clientX;
    flashTouchStartY = t.clientY;
    flashDragging = false;
    flashDragDx = 0;
    flashDragDy = 0;
  }

  function handleFlashTouchMove(evt) {
    var t = evt.touches[0];
    var dx = t.clientX - flashTouchStartX;
    var dy = t.clientY - flashTouchStartY;
    if (!flashDragging) {
      if (Math.abs(dx) < FLASH_DRAG_START_PX && Math.abs(dy) < FLASH_DRAG_START_PX) return;
      flashDragging = true;
      // suspend the flip transition so the tile tracks the finger 1:1
      // instead of chasing it on a half-second easing curve.
      el.flashCard.classList.add("no-anim");
    }
    evt.preventDefault();
    flashDragDx = dx;
    flashDragDy = dy;
    var flipped = el.flashCard.classList.contains("flipped");
    var tilt = Math.max(-12, Math.min(12, dx * 0.06));
    // Kept subtle on purpose — this is just a faint hint that you're
    // approaching the release threshold, not a fade-out; the tile should
    // stay clearly visible (and clearly "held") through an ordinary drag.
    var fade = Math.max(0.75, 1 - Math.max(Math.abs(dx), Math.abs(dy)) / 500);
    el.flashCard.style.transform =
      "translate(" + dx + "px, " + (dy * 0.4) + "px) rotate(" + tilt + "deg)" +
      (flipped ? " rotateY(180deg)" : "");
    el.flashCard.style.opacity = String(fade);
  }

  // Once the finger lifts, either let the tile finish flying off screen
  // (a real swipe) or spring it back to center (a drag that didn't go far
  // enough) — both as a quick, separate transition from the normal flip
  // animation, cleaned up afterward so later flips go back to that one.
  function settleFlashDrag(exit, isNext) {
    el.flashCard.classList.remove("no-anim");
    el.flashCard.style.transition = exit
      ? "transform 0.32s ease-in, opacity 0.32s ease-in"
      : "transform 0.25s ease-out, opacity 0.25s ease-out";
    if (exit) {
      var horizontal = Math.abs(flashDragDx) >= Math.abs(flashDragDy);
      var flyX = horizontal ? (isNext ? -1 : 1) * window.innerWidth * 0.9 : flashDragDx * 0.5;
      var flyY = horizontal ? flashDragDy * 0.5 : (isNext ? -1 : 1) * window.innerHeight * 0.6;
      // A gentler spin than the drag distance would suggest — enough to
      // read as a toss, not enough to look like a flip or a spill.
      el.flashCard.style.transform = "translate(" + flyX + "px, " + flyY + "px) rotate(" + (isNext ? -8 : 8) + "deg)";
      el.flashCard.style.opacity = "0";
    } else {
      el.flashCard.style.transform = "";
      el.flashCard.style.opacity = "";
    }
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      el.flashCard.removeEventListener("transitionend", finish);
      el.flashCard.style.transition = "";
      el.flashCard.style.transform = "";
      el.flashCard.style.opacity = "";
      if (exit) { if (isNext) nextFlashCard(); else prevFlashCard(); }
    }
    el.flashCard.addEventListener("transitionend", finish);
    setTimeout(finish, 400); // safety net in case transitionend never fires
  }

  function handleFlashTouchEnd(evt) {
    if (!flashDragging) return; // a plain tap — let the click handler flip it
    flashDragging = false;
    evt.preventDefault();
    var absDx = Math.abs(flashDragDx), absDy = Math.abs(flashDragDy);
    var vertical = absDy > absDx;
    var swept = vertical ? absDy > FLASH_SWIPE_THRESHOLD_PX : absDx > FLASH_SWIPE_THRESHOLD_PX;
    var isNext = vertical ? flashDragDy < 0 : flashDragDx < 0;
    // there's no card before the first one, so a "back" swipe there just
    // springs back instead of flying off into nothing.
    if (swept && !isNext && flashIndex <= 0) swept = false;
    settleFlashDrag(swept, isNext);
  }

  function handleFlashTouchCancel() {
    if (!flashDragging) return;
    flashDragging = false;
    settleFlashDrag(false, false);
  }

  // ================= listas compartidas =================
  // A list snapshot's `data` is stored in exactly the same shape as the
  // in-memory verb/word `data` object it was copied from (verb columns
  // untranslated, word fields in the camelCase used elsewhere in this file —
  // see rowToVerb/rowToWord). That means the same badge/render helpers used
  // for the real verb/word detail views can be reused here, and importing a
  // verb snapshot is a straight insert; importing a word snapshot needs the
  // same camelCase→snake_case mapping handleWordSubmit already does.

  function rowToList(row) {
    return {
      id: row.id,
      data: {
        name: row.name,
        ownerLabel: row.owner_label || "",
        shareToken: row.share_token,
        shareEnabled: !!row.share_enabled,
        itemCount: 0
      }
    };
  }

  // A list can hold both verbs and vocabulary together (e.g. everything
  // useful for "la cocina"). Given a verb/word breakdown, show that split;
  // otherwise (before a list's items have been individually loaded) fall
  // back to the plain total.
  function listMetaText(count, verbCount, wordCount) {
    if (verbCount || wordCount) {
      var parts = [];
      if (verbCount) parts.push(verbCount + (verbCount === 1 ? " verbo" : " verbos"));
      if (wordCount) parts.push(wordCount + (wordCount === 1 ? " palabra" : " palabras"));
      return parts.join(" · ");
    }
    return count + (count === 1 ? " ítem" : " ítems");
  }

  function loadLists() {
    return supabaseClient
      .from("lists")
      .select("*, list_items(count)")
      .order("created_at", { ascending: false })
      .then(function (res) {
        if (res.error) { showBanner("Error al cargar tus listas: " + res.error.message); return; }
        clearBanner();
        allLists = (res.data || []).map(function (row) {
          var entry = rowToList(row);
          entry.data.itemCount = (row.list_items && row.list_items[0] && row.list_items[0].count) || 0;
          return entry;
        });
        renderListsPanel();
        if (selectedListId) {
          var still = allLists.find(function (l) { return l.id === selectedListId; });
          if (still) selectListRow(selectedListId); else { el.listDetail.hidden = true; selectedListId = null; }
        }
      });
  }

  function renderListsPanel() {
    el.listsList.innerHTML = "";
    el.listsEmptyMsg.hidden = allLists.length !== 0;
    allLists.forEach(function (l) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "card-row";

      var name = document.createElement("span");
      name.className = "inf";
      name.textContent = l.data.name;
      btn.appendChild(name);

      var count = document.createElement("span");
      count.className = "def";
      count.textContent = listMetaText(l.data.itemCount || 0);
      btn.appendChild(count);

      btn.addEventListener("click", function () {
        if (selectedListId === l.id) { selectedListId = null; el.listDetail.hidden = true; }
        else selectListRow(l.id);
      });
      li.appendChild(btn);
      el.listsList.appendChild(li);
    });
  }

  function listItemRow(row) {
    var li = document.createElement("li");
    var wrap = document.createElement("div");
    wrap.className = "card-row";

    var main = document.createElement("span");
    main.className = "inf";
    main.textContent = row.item_type === "verb" ? (row.data.infinitive || "") : (row.data.word || "");
    wrap.appendChild(main);

    var def = document.createElement("span");
    def.className = "def";
    def.textContent = row.data.definition || "";
    wrap.appendChild(def);

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "icon-btn danger";
    removeBtn.textContent = "Quitar";
    removeBtn.addEventListener("click", function () {
      supabaseClient.from("list_items").delete().eq("id", row.id).then(function (res) {
        if (res.error) { el.ldShareMsg.textContent = "Error: " + res.error.message; return; }
        loadLists();
      });
    });
    wrap.appendChild(removeBtn);

    li.appendChild(wrap);
    return li;
  }

  function selectListRow(id) {
    selectedListId = id;
    var entry = allLists.find(function (l) { return l.id === id; });
    if (!entry) { el.listDetail.hidden = true; return; }
    el.ldName.textContent = entry.data.name;
    el.ldMeta.textContent = listMetaText(entry.data.itemCount || 0);
    el.ldShareRow.hidden = true;
    el.ldShareMsg.textContent = "";
    el.ldVerbsItems.innerHTML = "";
    el.ldWordsItems.innerHTML = "";
    el.ldVerbsGroup.hidden = true;
    el.ldWordsGroup.hidden = true;
    supabaseClient.from("list_items").select("*").eq("list_id", id).then(function (res) {
      if (res.error) { el.ldShareMsg.textContent = "Error al cargar los ítems: " + res.error.message; return; }
      var rows = res.data || [];
      var verbRows = rows.filter(function (r) { return r.item_type === "verb"; });
      var wordRows = rows.filter(function (r) { return r.item_type === "word"; });
      el.ldMeta.textContent = listMetaText(rows.length, verbRows.length, wordRows.length);
      // Shown as two separate groups (rather than one flat list) now that a
      // single list can hold both — e.g. a "La cocina" list mixing kitchen
      // verbs and kitchen nouns reads much more clearly split apart.
      el.ldVerbsGroup.hidden = verbRows.length === 0;
      el.ldWordsGroup.hidden = wordRows.length === 0;
      verbRows.forEach(function (row) { el.ldVerbsItems.appendChild(listItemRow(row)); });
      wordRows.forEach(function (row) { el.ldWordsItems.appendChild(listItemRow(row)); });
    });
    el.listDetail.hidden = false;
    el.listDetail.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function openListForm() {
    el.listForm.hidden = false;
    el.toggleAddList.hidden = true;
    el.lfName.value = "";
    el.listFormMsg.textContent = "";
    el.lfName.focus();
  }

  function closeListForm() {
    el.listForm.hidden = true;
    el.toggleAddList.hidden = false;
    el.listFormMsg.textContent = "";
  }

  function handleListSubmit(evt) {
    evt.preventDefault();
    var name = el.lfName.value.trim();
    if (!name) { el.listFormMsg.textContent = "Falta el nombre."; return; }
    el.listFormMsg.textContent = "Creando…";
    supabaseClient.from("lists").insert({
      name: name,
      owner_label: currentUser ? currentUser.email : ""
    }).select().single().then(function (res) {
      if (res.error) { el.listFormMsg.textContent = "Error al guardar: " + res.error.message; return; }
      var savedId = res.data.id;
      closeListForm();
      loadLists().then(function () { selectListRow(savedId); });
    });
  }

  function handleListDelete() {
    if (!selectedListId) return;
    if (!window.confirm("¿Eliminar esta lista? Esto no borra tus verbos ni palabras, solo la lista compartida.")) return;
    supabaseClient.from("lists").delete().eq("id", selectedListId).then(function (res) {
      if (res.error) { showBanner("No se pudo eliminar: " + res.error.message); return; }
      el.listDetail.hidden = true;
      selectedListId = null;
      loadLists();
    });
  }

  // "Estudiar esta lista" — narrows Verbos/Vocabulario (and so Tarjetas too)
  // down to just this list's items, so a saved word set becomes a place you
  // can come back to and study, not just a static snapshot. Re-fetches the
  // list's items fresh rather than reusing whatever selectListRow already
  // loaded, since that's simpler than threading the fetched rows through.
  function startStudyList(id) {
    var entry = allLists.find(function (l) { return l.id === id; });
    if (!entry) return;
    el.ldShareMsg.textContent = "";
    supabaseClient.from("list_items").select("*").eq("list_id", id).then(function (res) {
      if (res.error) { el.ldShareMsg.textContent = "Error al cargar la lista: " + res.error.message; return; }
      var rows = res.data || [];
      var verbSet = new Set();
      var wordSet = new Set();
      rows.forEach(function (row) {
        if (row.item_type === "verb") verbSet.add(norm(row.data.infinitive || ""));
        else wordSet.add(norm(row.data.word || ""));
      });
      activeStudyList = { id: id, name: entry.data.name, verbSet: verbSet, wordSet: wordSet };
      renderStudyFilterBanner();
      renderList();
      renderWordList();
      setMainTab(verbSet.size ? "verbs" : "words");
    });
  }

  function clearStudyList() {
    activeStudyList = null;
    renderStudyFilterBanner();
    renderList();
    renderWordList();
  }

  function renderStudyFilterBanner() {
    if (!activeStudyList) { el.studyFilterBanner.hidden = true; return; }
    el.studyFilterText.textContent = "Estudiando la lista “" + activeStudyList.name + "”";
    el.studyFilterBanner.hidden = false;
  }

  function handleShareClick() {
    if (!selectedListId) return;
    var entry = allLists.find(function (l) { return l.id === selectedListId; });
    if (!entry) return;
    var link = location.origin + location.pathname + "?share=" + entry.data.shareToken;
    el.ldShareLink.value = link;
    el.ldShareRow.hidden = false;
    el.ldShareMsg.textContent = "";
    // The native share sheet (Messages, Mail, WhatsApp, AirDrop, whatever
    // the OS offers) is only there to offer when the browser actually
    // supports it — mostly phones, not desktop — so it stays hidden
    // otherwise rather than showing a button that would just fail on click.
    el.ldNativeShare.hidden = !navigator.share;
    el.ldShareLink.focus();
    el.ldShareLink.select();
  }

  function handleCopyLink() {
    var link = el.ldShareLink.value;
    if (!link) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function () {
        el.ldShareMsg.textContent = "Enlace copiado.";
      }).catch(function () {
        el.ldShareLink.select();
        el.ldShareMsg.textContent = "No se pudo copiar automáticamente — el enlace ya está seleccionado, copialo con Ctrl/Cmd+C.";
      });
    } else {
      el.ldShareLink.select();
      el.ldShareMsg.textContent = "El enlace ya está seleccionado, copialo con Ctrl/Cmd+C.";
    }
  }

  function handleNativeShare() {
    var link = el.ldShareLink.value;
    if (!link || !navigator.share) return;
    var entry = allLists.find(function (l) { return l.id === selectedListId; });
    var name = entry ? entry.data.name : "lista compartida";
    el.ldShareMsg.textContent = "";
    navigator.share({
      title: "Índice Verbal — " + name,
      text: "Te comparto la lista “" + name + "” de Índice Verbal.",
      url: link
    }).catch(function (err) {
      // AbortError just means the person closed the share sheet without
      // picking anything — not worth surfacing as an error.
      if (err && err.name === "AbortError") return;
      el.ldShareMsg.textContent = "No se pudo compartir: " + ((err && err.message) || err);
    });
  }

  // ---- "agregar a lista" desde el detalle de un verbo/palabra ----

  function openListPicker(itemType, items) {
    if (!items || items.length === 0) {
      showBanner("No hay ítems para agregar con el filtro actual.");
      return;
    }
    listPickerTarget = { itemType: itemType, items: items };
    el.listPickerMsg.textContent = "";
    el.listPickerNewName.value = "";
    el.listPickerCount.textContent = items.length === 1
      ? "Agregando 1 ítem."
      : "Agregando " + items.length + " ítems.";
    // A list can hold verbs and words together, so every list is a valid
    // target regardless of which kind of item this is — e.g. adding
    // vocabulary to a "Cocina" list that already has verbs in it.
    el.listPickerList.innerHTML = "";
    if (allLists.length === 0) {
      var li = document.createElement("li");
      var note = document.createElement("div");
      note.className = "empty-note";
      var p = document.createElement("p");
      p.textContent = "Todavía no tenés ninguna lista — creá una nueva abajo.";
      note.appendChild(p);
      li.appendChild(note);
      el.listPickerList.appendChild(li);
    } else {
      allLists.forEach(function (l) {
        var liEl = document.createElement("li");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "card-row";
        var name = document.createElement("span");
        name.className = "inf";
        name.textContent = l.data.name;
        btn.appendChild(name);
        var count = document.createElement("span");
        count.className = "def";
        count.textContent = listMetaText(l.data.itemCount || 0);
        btn.appendChild(count);
        btn.addEventListener("click", function () { addItemToList(l.id); });
        liEl.appendChild(btn);
        el.listPickerList.appendChild(liEl);
      });
    }
    el.listPickerOverlay.hidden = false;
  }

  function closeListPicker() {
    el.listPickerOverlay.hidden = true;
    listPickerTarget = null;
  }

  // Adds every item currently in listPickerTarget.items to listId, skipping
  // any that are already in that list (matched the same normalized way the
  // shared-list import does) — this is what lets the "agregar filtrados a
  // una lista" toolbar buttons be clicked again after the filter changes
  // without piling up duplicate rows for words already added.
  function addItemToList(listId) {
    if (!listPickerTarget) return;
    var itemType = listPickerTarget.itemType;
    var items = listPickerTarget.items;
    el.listPickerMsg.textContent = "Agregando…";
    // Only dedupe against the target list's existing items of the SAME
    // type — a list mixing verbs and words could otherwise have a word
    // wrongly skipped because its text happens to match an unrelated verb.
    supabaseClient.from("list_items").select("data").eq("list_id", listId).eq("item_type", itemType).then(function (res) {
      if (res.error) { el.listPickerMsg.textContent = "Error: " + res.error.message; return; }
      var existing = {};
      (res.data || []).forEach(function (row) {
        var d = row.data || {};
        existing[norm(d.infinitive || d.word || "")] = true;
      });
      var toInsert = [];
      var skipped = 0;
      items.forEach(function (data) {
        var key = norm(data.infinitive || data.word || "");
        if (existing[key]) { skipped++; return; }
        existing[key] = true; // also guards against dupes within this same batch
        toInsert.push({ list_id: listId, item_type: itemType, data: data });
      });
      if (toInsert.length === 0) {
        el.listPickerMsg.textContent = skipped
          ? "Ya estaban todos en esa lista (" + skipped + ")."
          : "No hay nada para agregar.";
        return;
      }
      supabaseClient.from("list_items").insert(toInsert).then(function (res2) {
        if (res2.error) { el.listPickerMsg.textContent = "Error: " + res2.error.message; return; }
        closeListPicker();
        var msg = toInsert.length === 1 ? "Se agregó 1 ítem a la lista." : "Se agregaron " + toInsert.length + " ítems a la lista.";
        if (skipped) msg += " (" + skipped + " ya estaban.)";
        showBanner(msg);
        loadLists();
      });
    });
  }

  function handleListPickerCreate() {
    if (!listPickerTarget) return;
    var name = el.listPickerNewName.value.trim();
    if (!name) { el.listPickerMsg.textContent = "Poné un nombre para la lista nueva."; return; }
    el.listPickerMsg.textContent = "Creando…";
    supabaseClient.from("lists").insert({
      name: name,
      owner_label: currentUser ? currentUser.email : ""
    }).select().single().then(function (res) {
      if (res.error) { el.listPickerMsg.textContent = "Error al crear: " + res.error.message; return; }
      addItemToList(res.data.id);
    });
  }

  // ---- previsualización + importación de un enlace compartido ----

  function openSharePreview(token) {
    el.shareOverlay.hidden = false;
    el.shareName.textContent = "Cargando…";
    el.shareMeta.textContent = "";
    el.shareMsg.textContent = "";
    el.shareItems.innerHTML = "";
    el.shareImportResult.textContent = "";
    el.shareImportBtn.disabled = false;
    supabaseClient.rpc("get_shared_list", { p_token: token }).then(function (res) {
      if (res.error || !res.data || res.data.length === 0) {
        currentShareList = null;
        el.shareName.textContent = "Enlace no válido";
        el.shareMsg.textContent = "Este enlace no existe o ya no está disponible.";
        el.shareLoginNote.hidden = true;
        el.shareImportBtn.hidden = true;
        return;
      }
      var rows = res.data;
      var first = rows[0];
      currentShareList = {
        listId: first.list_id,
        listName: first.list_name,
        ownerLabel: first.owner_label || "",
        items: rows.map(function (r) { return { itemType: r.item_type, data: r.data }; })
      };
      renderSharePreview();
    });
  }

  function renderSharePreview() {
    if (!currentShareList) return;
    var s = currentShareList;
    el.shareName.textContent = s.listName;
    var verbCount = s.items.filter(function (it) { return it.itemType === "verb"; }).length;
    var wordCount = s.items.filter(function (it) { return it.itemType === "word"; }).length;
    el.shareMeta.textContent = listMetaText(s.items.length, verbCount, wordCount) +
      (s.ownerLabel ? " · compartida por " + s.ownerLabel : "");
    el.shareItems.innerHTML = "";
    s.items.forEach(function (it) {
      var li = document.createElement("li");
      var row = document.createElement("div");
      row.className = "card-row";
      var main = document.createElement("span");
      main.className = "inf";
      main.textContent = it.itemType === "verb" ? (it.data.infinitive || "") : (it.data.word || "");
      row.appendChild(main);
      if (it.itemType === "verb" && it.data.type) row.appendChild(badge("type", it.data.type));
      if (it.itemType === "word" && it.data.partOfSpeech) row.appendChild(badge("type", it.data.partOfSpeech));
      var def = document.createElement("span");
      def.className = "def";
      def.textContent = it.data.definition || "";
      row.appendChild(def);
      li.appendChild(row);
      el.shareItems.appendChild(li);
    });
    el.shareLoginNote.hidden = !!currentUser;
    el.shareImportBtn.hidden = !currentUser;
  }

  function closeSharePreview() {
    el.shareOverlay.hidden = true;
    currentShareList = null;
    try {
      var url = new URL(window.location.href);
      url.searchParams.delete("share");
      window.history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
    } catch (e) {}
  }

  // A shared list can mix verbs and words, so importing has to sort the
  // snapshot items by their own item_type and run each through the matching
  // table's insert (with the same collision-skip rule as before, checked
  // separately per type), then merge the two results into one summary.
  function handleShareImport() {
    if (!currentShareList || !currentUser) return;
    el.shareImportBtn.disabled = true;
    el.shareImportResult.textContent = "Importando…";
    var s = currentShareList;

    var existingInf = {};
    allVerbs.forEach(function (v) { existingInf[norm(v.data.infinitive || "")] = true; });
    var existingWord = {};
    allWords.forEach(function (w) { existingWord[norm(w.data.word || "")] = true; });

    var toInsertV = [], skippedV = [];
    var toInsertW = [], skippedW = [];

    s.items.forEach(function (it) {
      if (it.itemType === "word") {
        var w = it.data.word || "";
        if (existingWord[norm(w)]) { skippedW.push(w); return; }
        existingWord[norm(w)] = true; // guard against dupes within the shared list itself
        toInsertW.push({
          word: it.data.word || "",
          definition: it.data.definition || "",
          part_of_speech: it.data.partOfSpeech || "sustantivo",
          gender: it.data.gender || "",
          notes: it.data.notes || "",
          example: it.data.example || ""
        });
      } else {
        var inf = it.data.infinitive || "";
        if (existingInf[norm(inf)]) { skippedV.push(inf); return; }
        existingInf[norm(inf)] = true;
        toInsertV.push(Object.assign({}, it.data)); // verb data keys already match column names 1:1
      }
    });

    var verbsPromise = toInsertV.length ? supabaseClient.from("verbs").insert(toInsertV) : Promise.resolve({ error: null });
    var wordsPromise = toInsertW.length ? supabaseClient.from("words").insert(toInsertW) : Promise.resolve({ error: null });

    Promise.all([verbsPromise, wordsPromise]).then(function (results) {
      el.shareImportBtn.disabled = false;
      var failed = results.filter(function (r) { return r && r.error; });
      if (failed.length) { el.shareImportResult.textContent = "Error al importar: " + failed[0].error.message; return; }
      if (toInsertV.length) loadVerbs();
      if (toInsertW.length) loadWords();
      var importedCount = toInsertV.length + toInsertW.length;
      var skipped = skippedV.concat(skippedW);
      var msg = "Se importaron " + importedCount + (importedCount === 1 ? " ítem." : " ítems.");
      if (skipped.length) {
        msg += " " + skipped.length + (skipped.length === 1 ? " ya estaba" : " ya estaban") +
          " en tu colección: " + skipped.join(", ") + ".";
      }
      el.shareImportResult.textContent = msg;
    });
  }

  // ================= auth =================
  var authMode = "login";

  function setAuthMode(mode) {
    authMode = mode;
    el.tabLogin.classList.toggle("active", mode === "login");
    el.tabSignup.classList.toggle("active", mode === "signup");
    el.authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
    el.authMsg.textContent = "";
  }

  function renderAuthState() {
    if (currentUser) {
      el.authScreen.hidden = true;
      el.appScreen.hidden = false;
      el.userEmail.textContent = currentUser.email || "";
      loadVerbs();
      loadWords();
      loadLists();
      if (currentShareList) renderSharePreview();
    } else {
      el.authScreen.hidden = false;
      el.appScreen.hidden = true;
      allVerbs = [];
      selectedId = null;
      el.detail.hidden = true;
      el.form.hidden = true;
      el.toggleAdd.hidden = false;
      el.seedToolbarBtn.hidden = false;

      allWords = [];
      filteredWords = [];
      selectedWordId = null;
      editingWordId = null;
      el.wordDetail.hidden = true;
      el.wordForm.hidden = true;
      el.toggleAddWord.hidden = false;
      el.seedWordsToolbarBtn.hidden = false;
      el.wordList.innerHTML = "";
      el.wordCount.textContent = "";

      allLists = [];
      selectedListId = null;
      el.listDetail.hidden = true;
      el.listForm.hidden = true;
      el.toggleAddList.hidden = false;
      el.listsList.innerHTML = "";
      activeStudyList = null;
      renderStudyFilterBanner();
      if (currentShareList) renderSharePreview();
    }
  }

  function handleAuthSubmit(evt) {
    evt.preventDefault();
    el.authMsg.textContent = "";
    var email = el.authEmail.value.trim();
    var password = el.authPassword.value;
    el.authSubmit.disabled = true;

    var action = authMode === "login"
      ? supabaseClient.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
          if (res.error) throw res.error;
        })
      : supabaseClient.auth.signUp({ email: email, password: password }).then(function (res) {
          if (res.error) throw res.error;
          if (res.data && !res.data.session) {
            // setAuthMode() clears authMsg as part of switching tabs, so it
            // has to run BEFORE we set the confirmation text below — doing
            // it in the other order was wiping the message out the instant
            // it appeared, which is why the card seemed to just silently
            // flip to the login tab with no explanation.
            setAuthMode("login");
            el.authMsg.textContent = "Te enviamos un email de confirmación a " + email + ". Confirmá tu cuenta y después iniciá sesión.";
            el.authMsg.style.color = "var(--accent-deep)";
          }
        });

    action.catch(function (err) {
      el.authMsg.style.color = "var(--danger)";
      el.authMsg.textContent = (err && err.message) || String(err);
    }).finally(function () {
      el.authSubmit.disabled = false;
    });
  }

  // ================= wiring =================
  el.tabLogin.addEventListener("click", function () { setAuthMode("login"); });
  el.tabSignup.addEventListener("click", function () { setAuthMode("signup"); });
  el.authForm.addEventListener("submit", handleAuthSubmit);
  el.logoutBtn.addEventListener("click", function () { supabaseClient.auth.signOut(); });

  el.search.addEventListener("input", renderList);
  wireFilterChips(el.verbFilters, el.verbFiltersClear, activeVerbFilters, renderList);
  el.toggleAdd.addEventListener("click", function () { openForm("add"); });
  el.seedToolbarBtn.addEventListener("click", seedStarterVerbs);
  el.formCancel.addEventListener("click", closeForm);
  el.form.addEventListener("submit", handleSubmit);
  el.dEdit.addEventListener("click", function () {
    var entry = allVerbs.find(function (v) { return v.id === selectedId; });
    if (entry) openForm("edit", entry.data);
  });
  el.dDelete.addEventListener("click", handleDelete);
  el.dAddToList.addEventListener("click", function () {
    var entry = allVerbs.find(function (v) { return v.id === selectedId; });
    if (entry) openListPicker("verb", [entry.data]);
  });
  el.addFilteredToList.addEventListener("click", function () {
    openListPicker("verb", filtered.map(function (v) { return v.data; }));
  });

  el.tabVerbs.addEventListener("click", function () { setMainTab("verbs"); });
  el.tabWords.addEventListener("click", function () { setMainTab("words"); });

  el.wordSearch.addEventListener("input", renderWordList);
  wireFilterChips(el.wordFilters, el.wordFiltersClear, activeWordFilters, renderWordList);
  el.toggleAddWord.addEventListener("click", function () { openWordForm("add"); });
  el.seedWordsToolbarBtn.addEventListener("click", seedStarterWords);
  el.wordFormCancel.addEventListener("click", closeWordForm);
  el.wordForm.addEventListener("submit", handleWordSubmit);
  el.wdEdit.addEventListener("click", function () {
    var entry = allWords.find(function (v) { return v.id === selectedWordId; });
    if (entry) openWordForm("edit", entry.data);
  });
  el.wdDelete.addEventListener("click", handleWordDelete);
  el.wdAddToList.addEventListener("click", function () {
    var entry = allWords.find(function (v) { return v.id === selectedWordId; });
    if (entry) openListPicker("word", [entry.data]);
  });
  el.addFilteredWordsToList.addEventListener("click", function () {
    openListPicker("word", filteredWords.map(function (w) { return w.data; }));
  });

  el.tabFlashcards.addEventListener("click", function () { setMainTab("flashcards"); });
  el.flashSrcVerbs.addEventListener("change", function () {
    activeFlashSources.verbs = el.flashSrcVerbs.checked;
    renderFlashSetup();
  });
  el.flashSrcWords.addEventListener("change", function () {
    activeFlashSources.words = el.flashSrcWords.checked;
    renderFlashSetup();
  });
  el.flashDirDef.addEventListener("change", function () { if (el.flashDirDef.checked) flashDirection = "def2word"; });
  el.flashDirWord.addEventListener("change", function () { if (el.flashDirWord.checked) flashDirection = "word2def"; });
  el.flashStartBtn.addEventListener("click", startFlashcards);
  el.flashCloseBtn.addEventListener("click", closeFlashcards);
  el.flashCard.addEventListener("click", toggleFlashFlip);
  el.flashCard.addEventListener("touchstart", handleFlashTouchStart, { passive: true });
  el.flashCard.addEventListener("touchmove", handleFlashTouchMove, { passive: false });
  el.flashCard.addEventListener("touchend", handleFlashTouchEnd);
  el.flashCard.addEventListener("touchcancel", handleFlashTouchCancel);
  el.flashNextBtn.addEventListener("click", nextFlashCard);
  el.flashPrevBtn.addEventListener("click", prevFlashCard);
  el.flashArrowNext.addEventListener("click", nextFlashCard);
  el.flashArrowPrev.addEventListener("click", prevFlashCard);

  el.tabLists.addEventListener("click", function () { setMainTab("lists"); });
  el.toggleAddList.addEventListener("click", openListForm);
  el.listFormCancel.addEventListener("click", closeListForm);
  el.listForm.addEventListener("submit", handleListSubmit);
  el.ldStudyBtn.addEventListener("click", function () {
    if (selectedListId) startStudyList(selectedListId);
  });
  el.ldShareBtn.addEventListener("click", handleShareClick);
  el.ldCopyLink.addEventListener("click", handleCopyLink);
  el.ldNativeShare.addEventListener("click", handleNativeShare);
  el.ldDelete.addEventListener("click", handleListDelete);
  el.studyFilterClear.addEventListener("click", clearStudyList);

  el.listPickerClose.addEventListener("click", closeListPicker);
  el.listPickerCreateBtn.addEventListener("click", handleListPickerCreate);

  el.shareCloseBtn.addEventListener("click", closeSharePreview);
  el.shareImportBtn.addEventListener("click", handleShareImport);

  buildConjFormTable();
  buildImperativoFormRow();
  buildTenseHeader();
  buildFlashMatrix();
  buildFlashStandaloneToggles();

  (function restoreMainTab() {
    var saved = null;
    try { saved = localStorage.getItem("iv-main-tab"); } catch (e) {}
    if (saved === "words") setMainTab("words");
    else if (saved === "flashcards") setMainTab("flashcards");
    else if (saved === "lists") setMainTab("lists");
  })();

  // A ?share=TOKEN link opens the share preview via the public get_shared_list
  // RPC (see schema.sql) regardless of login state — that's what lets a
  // shared list be previewed by someone who doesn't have an account yet.
  (function checkShareLink() {
    var token = null;
    try { token = new URLSearchParams(window.location.search).get("share"); } catch (e) {}
    if (token) openSharePreview(token);
  })();

  supabaseClient.auth.onAuthStateChange(function (_event, session) {
    currentUser = session ? session.user : null;
    renderAuthState();
  });
  supabaseClient.auth.getSession().then(function (res) {
    currentUser = (res.data && res.data.session) ? res.data.session.user : null;
    renderAuthState();
  });

  // The conjugation table's row-height sync (see syncConjRowHeights) runs
  // once when a verb is first shown, but the two independent tables it's
  // syncing can still drift apart afterward: a webfont finishing its
  // swap-in changes text metrics after that first pass, and resizing the
  // window can cross the 640px breakpoint into/out of the mobile font
  // sizes. Re-running the sync after either keeps them lined up.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      if (selectedId && !el.detail.hidden) syncConjRowHeights();
    });
  }
  var resyncConjTimer = null;
  window.addEventListener("resize", function () {
    if (resyncConjTimer) clearTimeout(resyncConjTimer);
    resyncConjTimer = setTimeout(function () {
      if (selectedId && !el.detail.hidden) syncConjRowHeights();
    }, 150);
  });
})();