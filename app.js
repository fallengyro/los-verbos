(function () {
  "use strict";

  // ================= Supabase client =================
  var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var currentUser = null;

  // ================= i18n (app chrome only — see note below) =================
  // This app draws a hard line between two different "languages":
  //   - The CONTENT being studied (verb infinitives, word entries,
  //     definitions, examples, notes) is always Spanish — that's the whole
  //     point of the app, and translating it would defeat the purpose.
  //   - The app's own CHROME (labels, buttons, headings, hints, empty
  //     states, badges/tags, status messages) is what this setting
  //     controls, so a newer learner can navigate the interface in
  //     English while what they're studying stays in Spanish.
  //
  // One deliberate exception inside "chrome": the person/pronoun labels in
  // the conjugation tables (yo, vos, él/ella/ud., nosotros, ellos/ellas/
  // uds., usted, ustedes) are left in Spanish in BOTH languages. Those
  // pronouns — vos especially — are themselves the thing this app exists
  // to teach (rioplatense voseo), so translating them away would remove
  // exactly the information a learner most needs to see. Tense/mood names
  // (Presente, Pretérito, Subjuntivo...) are translated, though, since
  // those function as organizing labels rather than content to memorize.
  //
  // LANG_LOCAL_KEY is a fast, device-level guess used only to avoid a
  // flash of the wrong language before the account's real (Supabase-
  // synced) preference loads — see loadUserSettings(). Default is "en"
  // (2026-09-26, mason's ask) — see loadUserSettings()/schema.sql for the
  // other two places this same default lives.
  var LANG_LOCAL_KEY = "iv-lang";
  var currentLang = (function () {
    try {
      var saved = localStorage.getItem(LANG_LOCAL_KEY);
      return (saved === "en" || saved === "es") ? saved : "en";
    } catch (e) {
      return "en";
    }
  })();

  // ================= Text-to-speech (flashcards only, for now) =================
  // Azure's two Rioplatense voices, behind a short key so the rest of the
  // code never juggles the full "es-AR-...Neural" strings — see the
  // project brief's "Feature: Text-to-speech" section for why Azure/these
  // specific voices were chosen. As of 2026-09-25 the choice of voice is an
  // account-level preference synced via user_settings.tts_voice, the same
  // pattern as currentLang/LANG_LOCAL_KEY above — TTS_VOICE_LOCAL_KEY here
  // is likewise just a fast device-level guess used to avoid picking the
  // wrong voice before loadUserSettings() returns the real, synced value.
  var TTS_VOICES = { elena: "es-AR-ElenaNeural", tomas: "es-AR-TomasNeural" };
  var TTS_VOICE_LOCAL_KEY = "iv-tts-voice";
  var ttsVoiceKey = (function () {
    try {
      var saved = localStorage.getItem(TTS_VOICE_LOCAL_KEY);
      return (saved === "elena" || saved === "tomas") ? saved : "elena";
    } catch (e) {
      return "elena";
    }
  })();
  var ttsAudioEl = null; // lazily created single <audio> element, reused for every play
  var ttsInFlight = false; // guards against overlapping requests from rapid double-taps
  var raeLookupInFlight = false; // guards lookupInRae() against overlapping requests from rapid double-taps on "Buscar en RAE"
  var ttsActiveEl = null; // whichever button/cell currently has the .tts-active chasing-border ring on it, so a later tap on something else can clear it first — see playTts()
  var ttsPrefetched = {}; // "voiceKey\u0000text" -> true, so prefetchTts() never re-fetches the same clip twice in a session
  var warmTtsCacheRunning = false; // true only while warmTtsCache() is actively driving selectVerb() itself — see prefetchTts()
  // Quiet mode (2026-09-29): mason, drilling on a plane — a Settings toggle
  // that mutes all pronunciation audio and swaps the speaker icon for a
  // muted one. Device-local on purpose (unlike the voice, which is synced
  // to the account): it's about where this phone is right now, so turning
  // it on in a plane shouldn't also silence the other person's device.
  var QUIET_MODE_LOCAL_KEY = "iv-quiet-mode";
  var quietMode = (function () {
    try { return localStorage.getItem(QUIET_MODE_LOCAL_KEY) === "1"; } catch (e) { return false; }
  })();
  var quietTapCount = 0, quietTapTimer = null, quietToastTimer = null;

  var I18N = {
    es: {
      app_tagline: "rioplatense · voseo",
      auth_login_tab: "Iniciar sesión",
      auth_signup_tab: "Crear cuenta",
      auth_email_label: "Email",
      auth_password_label: "Contraseña",
      auth_submit_login: "Entrar",
      logout_btn: "Cerrar sesión",
      acct_menu_aria: "Menú de cuenta",
      nav_verbs: "Verbos",
      nav_words: "Vocabulario",
      nav_phrases: "Frases",
      nav_flashcards: "Tarjetas",
      nav_lists: "Listas",
      offline_banner: "Sin conexión — mostrando lo último guardado ({age}).",
      cache_age_moment: "hace un momento",
      cache_age_minutes: "hace {n} minuto",
      cache_age_minutes_pl: "hace {n} minutos",
      cache_age_hours: "hace {n} hora",
      cache_age_hours_pl: "hace {n} horas",
      cache_age_days: "hace {n} día",
      cache_age_days_pl: "hace {n} días",
      verb_search_placeholder: "Escribí un infinitivo… (ej. querer)",
      chip_group_type: "Tipo",
      chip_group_irregularity: "Irregularidad",
      chip_group_transitivity: "Transitividad",
      chip_group_flags: "Marcas",
      chip_group_category: "Categoría",
      chip_group_gender: "Género",
      chip_group_function: "Función",
      chip_group_register: "Registro",
      chip_group_list: "Listas",
      chip_hint_exclude: "Tocá un chip para incluir, dos veces para excluir",
      hidden_count_s: "{n} resultado oculto por tus exclusiones",
      hidden_count_pl: "{n} resultados ocultos por tus exclusiones",
      show_all_btn: "Mostrar todo",
      lists_trigger_prefix: "Listas: ",
      lists_included_pl: "{n} incluidas",
      lists_excluded_s: "{n} excluida",
      lists_excluded_pl: "{n} excluidas",
      list_filter_title: "Filtrar por lista",
      list_filter_hint: "Tocá para incluir, dos veces para excluir. Los cambios se aplican al instante.",
      list_filter_search_placeholder: "Buscar una lista…",
      list_filter_clear_selection: "Limpiar selección",
      list_filter_no_matches: "Ninguna lista coincide con “{q}”.",
      filters_clear: "Limpiar filtros",
      // "Filtrar por esta lista" (Listas panel row) + the two list-aware
      // empty-tab messages — added 2026-09-27 for the shared-list-filter
      // feature (see handoff doc). One pair per content type because
      // Spanish noun/adjective agreement ("oculto"/"oculta", "verbo"/
      // "verbos") can't be parameterized the way the generic
      // hidden_count_s/pl strings above are.
      btn_filter_to_list: "Filtrar por esta lista",
      empty_list_clear_filters_btn: "Quitar los demás filtros",
      empty_list_no_verbs: "Esta lista no tiene verbos.",
      empty_list_hidden_verbs_s: "Hay {n} verbo de esta lista oculto por otros filtros.",
      empty_list_hidden_verbs_pl: "Hay {n} verbos de esta lista ocultos por otros filtros.",
      empty_list_no_words: "Esta lista no tiene palabras.",
      empty_list_hidden_words_s: "Hay {n} palabra de esta lista oculta por otros filtros.",
      empty_list_hidden_words_pl: "Hay {n} palabras de esta lista ocultas por otros filtros.",
      empty_list_no_phrases: "Esta lista no tiene frases.",
      empty_list_hidden_phrases_s: "Hay {n} frase de esta lista oculta por otros filtros.",
      empty_list_hidden_phrases_pl: "Hay {n} frases de esta lista ocultas por otros filtros.",
      conj_hint: "deslizá para ver todos los tiempos →",
      conj_tap_hint: "Tocá cualquier forma para escucharla",
      mood_indicativo: "Indicativo",
      mood_subjuntivo: "Subjuntivo",
      mood_imperativo: "Imperativo",
      conj_legend_irregular: "se aparta del patrón regular",
      conj_legend_gustar: "a quién le pasa (no quién actúa) — la forma cambia solo si lo que gusta/afecta es singular o plural",
      tile_gerundio: "Gerundio",
      tile_participio: "Participio",
      btn_add_to_list: "Agregar a lista",
      btn_edit: "Editar",
      btn_delete: "Eliminar",
      btn_add_verb_toggle: "+ Agregar verbo",
      seed_verbs_btn: "Cargar verbos de ejemplo",
      btn_add_filtered_to_list: "Agregar filtrados a una lista",
      form_title_add_verb: "Agregar verbo",
      label_infinitivo: "Infinitivo",
      label_definicion: "Definición",
      label_patron: "Patrón de irregularidad",
      label_notas_verbo: "Notas de uso",
      placeholder_notas_verbo: "ej. en perfilaje: «correr un perfil» = to run a log",
      placeholder_ejemplo_verbo: "ej. Corrí diez kilómetros. / Corrimos el perfil a la noche.",
      label_preposicion: "Preposición fija",
      placeholder_preposicion: "ej. en, de, a",
      check_reflexivo: "¿Reflexivo?",
      check_auxiliar: "¿Auxiliar / modal?",
      check_gustar: "¿Tipo gustar?",
      check_also_personal_use: "¿También tiene uso personal (no dativo)?",
      gustar_tab_personal: "Uso personal",
      gustar_tab_dativo: "Uso dativo",
      impersonal_optional: "impersonal (opcional)",
      imperativo_afirmativo: "Imperativo afirmativo (opcional)",
      btn_save: "Guardar",
      btn_cancel: "Cancelar",
      word_search_placeholder: "Escribí una palabra… (ej. mesa)",
      btn_add_word_toggle: "+ Agregar palabra",
      seed_words_btn: "Cargar palabras de ejemplo",
      form_title_add_word: "Agregar palabra",
      label_palabra: "Palabra",
      label_categoria_gramatical: "Categoría gramatical",
      label_notas: "Notas / excepciones",
      placeholder_notas: "ej. femenino, pero usa “el”: el agua",
      label_ejemplo: "Oración de ejemplo",
      placeholder_ejemplo: "ej. Tomo mucha agua todos los días.",
      phrase_search_placeholder: "Escribí una frase… (ej. dale)",
      btn_add_phrase_toggle: "+ Agregar frase",
      seed_phrases_btn: "Cargar frases de ejemplo",
      form_title_add_phrase: "Agregar frase",
      form_title_edit_phrase: "Editar frase",
      label_frase: "Frase",
      label_funcion: "Función",
      label_registro: "Registro",
      register_neutro: "neutro",
      register_coloquial: "coloquial",
      register_lunfardo: "lunfardo",
      check_idiomatic: "¿Es idiomática (no se traduce palabra por palabra)?",
      label_literal: "Traducción literal",
      placeholder_literal: "ej. “ni siquiera borracho/a” (uso real: de ninguna manera)",
      flash_title: "Modo tarjetas",
      flash_setup_note: "Las tarjetas se generan a partir de lo que esté filtrado ahora mismo en las pestañas Verbos, Vocabulario y Frases.",
      flash_group_times: "Tiempos, modos y personas",
      flash_group_pick: "¿Qué querés practicar?",
      flash_pick_all: "Todo",
      flash_pick_none: "Nada",
      flash_preset_presente: "Presente",
      flash_preset_pasados: "Pasados",
      flash_preset_futuro: "Futuro",
      flash_preset_condicional: "Condicional",
      flash_preset_subjuntivo: "Subjuntivo",
      flash_preset_imperativo: "Imperativo",
      flash_preset_nonpersonal: "Gerundio y participio",
      flash_custom_toggle: "Personalizar tiempos y personas",
      flash_custom_persons: "Personas (en los tiempos elegidos)",
      flash_deck_count: "{n} tarjetas",
      flash_deck_count_1: "1 tarjeta",
      flash_matrix_hint: "Tocá una celda para esa combinación, o un encabezado para toda la fila o columna.",
      flash_group_direction: "Dirección de la tarjeta",
      flash_dir_def2word: "Definición → palabra",
      flash_dir_word2def: "Palabra → definición",
      flash_start_btn: "Empezar",
      flash_no_source: "Activá al menos una fuente (verbos, vocabulario o frases).",
      flash_no_cards: "No hay tarjetas para esta combinación de filtros — probá activar más tiempos, personas o fuentes.",
      close: "Cerrar",
      share_label_shared_list: "Lista compartida",
      flash_hint: "Tocá la tarjeta para dar vuelta · deslizá para cambiar",
      flash_prev: "‹ Anterior",
      flash_next: "Siguiente ›",
      flash_arrow_prev_aria: "Anterior",
      flash_arrow_next_aria: "Siguiente",
      known_toggle: "Sabido",
      grade_otra: "Otra vez",
      flash_mode_speak: "Hablar",
      flash_mode_note_speak: "Ves el significado y lo decís en español: tocá el micrófono, hablá y tocá de nuevo. La tarjeta se da vuelta sola con lo que escuchó y una nota sugerida, que podés cambiar.",
      flash_autoplay_note_speak: "Si está prendido, la respuesta suena cuando la tarjeta se da vuelta.",
      speak_unsupported: "Este navegador no puede grabar audio, así que «Hablar» no funciona acá.",
      speak_mic_aria: "Grabar tu respuesta",
      speak_stop_aria: "Terminar de grabar",
      speak_mic_denied: "No hay permiso para el micrófono. Habilitalo en la configuración del navegador.",
      speak_mic_error: "No se pudo usar el micrófono.",
      speak_said: "Dijiste:",
      speak_play_aria: "Escuchar tu grabación",
      speak_nothing: "No se escuchó nada",
      speak_error: "No se pudo analizar",
      update_toast_text: "Hay una versión nueva de voseá.",
      update_toast_btn: "Actualizar",
      update_toast_later: "Más tarde",
      grade_bien: "Bien",
      grade_group_aria: "Cómo te fue con esta tarjeta",
      flash_tally: "{b} bien · {o} otra vez",
      nav_progress: "Progreso",
      nav_topics: "Temas",
      nav_play: "Jugar",
      pt_name: "Partida",
      pt_row_def: "Sin fin: lo que te toca repasar, lo que te cuesta, cosas nuevas y temas. Cada tarjeta sube de Leer a Escuchar a Hablar a medida que la sabés.",
      pt_row_def_quiet: "Sin fin. Con el modo silencio activado, todas las tarjetas quedan en Leer.",
      pt_row_stat: "más larga: {cards} · combo: {best}",
      pt_row_stat_cards: "más larga: {cards}",
      pt_soon: "pronto",
      pt_crono_name: "Contrarreloj",
      pt_crono_def: "60 segundos, todas las que puedas.",
      pt_reto_name: "Te reto",
      pt_reto_def: "La misma tanda para los dos.",
      pt_nothing: "Todavía no hay nada para jugar: agregá verbos, palabras o frases, o practicá un tema.",
      pt_end: "Terminar",
      pt_why_due: "Para repasar",
      pt_why_hard: "Te cuesta",
      pt_why_new: "Nueva",
      pt_why_topic: "Tema",
      pt_why_up: "Sube",
      pt_why_again: "Otra vez",
      pt_why_back: "Vuelve",
      pt_note_up: "**Bien** → vuelve en unas tarjetas, en **{mode}**",
      pt_note_done: "**Bien** → lista por esta partida",
      pt_note_down: "**Otra vez** → vuelve pronto, en **{mode}**",
      pt_note_again: "**Otra vez** → vuelve pronto",
      pt_sum_title: "Partida terminada",
      pt_sum_title_good: "¡Buena partida!",
      pt_sum_today: "Hoy: {n} de {goal} tarjetas",
      pt_sum_today_met: "Hoy: {n} de {goal} ✓ · racha de {days} días",
      pt_sum_today_met_one: "Hoy: {n} de {goal} ✓ · racha de 1 día",
      pt_sum_cards: "tarjetas",
      pt_sum_min: "jugando",
      pt_sum_bien: "bien",
      pt_sum_best: "Bien seguidos hablando",
      pt_sum_ladder: "Dónde quedaron",
      pt_sum_ladder_note: "{n} llegaron a {mode} en esta partida.",
      pt_sum_ladder_note_one: "1 llegó a {mode} en esta partida.",
      pt_sum_ladder_note_zero: "Ninguna llegó a {mode} todavía: dale un rato más.",
      pt_sum_ladder_quiet: "Modo silencio: todas quedaron en Leer.",
      pt_sum_missed: "Te costaron",
      pt_sum_review: "Repasar estas {n}",
      pt_sum_review_one: "Repasar esta",
      pt_sum_won: "Ganaste",
      play_combo_hud: "seguidos",
      play_combo_aria: "{n} Bien seguidos",
      play_how_racha: "racha {n}",
      play_how_hablar: "{n} hablando",
      play_how_combo: "{n} seguidos",
      play_how_otro: "premio",
      play_kick_racha: "¡{n} días seguidos!",
      play_kick_hablar: "¡{n} Bien hablando!",
      play_kick_combo: "¡{n} Bien seguidos!",
      play_kick_otro: "¡Premio!",
      play_album_done_title: "¡Álbum completo!",
      play_album_done_text: "Ya tenés todo el álbum. Pronto, más.",
      play_added_word: "Ya está en tu **Vocabulario** · lista «{list}»",
      play_added_phrase: "Ya está en tus **Frases** · lista «{list}»",
      play_keep_playing: "Seguir jugando",
      play_to_album: "Ver el álbum",
      play_listen: "Escuchar",
      play_days_one: "día seguido",
      play_days: "días seguidos",
      play_today: "hoy: {n} de {goal} tarjetas",
      play_today_met: "hoy: {n} de {goal} ✓",
      play_free_day: "Día libre",
      play_next_keep: "Te faltan **{n} tarjetas** hoy para seguir la racha.",
      play_next_keep_one: "Te falta **1 tarjeta** hoy para seguir la racha.",
      play_next_start: "Hacé **{n} tarjetas** hoy para empezar una racha.",
      play_next_start_one: "Hacé **1 tarjeta** hoy para empezar una racha.",
      play_next_reward: "Próximo premio: **{n} días más** de racha.",
      play_next_reward_one: "Próximo premio: **mañana**, si seguís la racha.",
      play_goal_label: "Meta diaria",
      play_racha_rule: "Cuenta cada tarjeta que diste vuelta o calificaste, en cualquier modo. Tenés un día libre por semana.",
      play_today_title: "Hoy, hablando",
      play_today_sub: "Premios en Hablar: cuenta la nota automática. Cada uno, una vez por día.",
      play_goal_session: "{n} Bien en una sesión",
      play_goal_combo: "{n} Bien seguidos",
      play_won_today: "¡ganado!",
      play_speak_btn: "Practicar hablando",
      play_quiet_note: "Hablar no está disponible en modo silencio.",
      play_album_title: "Tu álbum",
      play_album_entry: "Cosas de acá: {n} de {total} · se suman a tu Vocabulario y tus Frases",
      play_album_desc: "Cosas de acá que ganaste jugando. Cada una ya está en tu Vocabulario o tus Frases, en la lista «{list}». {n} de {total}.",
      play_album_left: "Quedan {n} por descubrir.",
      play_album_how: "Cómo se ganan",
      play_album_back: "‹ Jugar",
      play_rule_racha: "Racha de {a}, {b}, {c}… días",
      play_rule_session: "{a} Bien hablando en una sesión (y {b})",
      play_rule_combo: "{n} Bien seguidos hablando",
      play_rule_fine: "En Hablar cuenta la nota automática, no la que cambiás vos. Cada premio de Hablar se gana una vez por día. Pronto: récords de Contrarreloj y retos.",
      play_stat_days: "{n} días",
      play_stat_days_one: "1 día",
      play_stat_racha: "de racha (mejor: {n})",
      play_stat_longest: "tarjetas, tu sesión más larga",
      play_stat_combo: "Bien seguidos hablando (mejor)",
      play_stat_album_n: "{n} de {total}",
      play_stat_album: "en tu álbum",
      play_go_btn: "Ir a Jugar",
      topics_intro: "Temas para practicar algo puntual. No suman nada a tus verbos, vocabulario ni frases.",
      topic_what: "¿Qué practicar?",
      topic_start: "Practicar",
      topic_count: "{n} tarjetas",
      topic_pick_one: "Elegí al menos un tramo.",
      topic_sentences: "Ver oraciones",
      topic_also: "también: {x}",
      topic_note_read: "Ves el frente, lo decís para vos y das vuelta para ver la respuesta.",
      topic_note_listen: "El frente es solo audio: escuchás y das vuelta para verlo escrito.",
      topic_note_speak: "Lo decís en voz alta: tocá el micrófono, hablá y tocá de nuevo.",
      topic_h_none: "Todavía no practicaste este tema.",
      topic_h_cards: "{n} tarjetas",
      topic_h_cards_1: "1 tarjeta",
      topic_h_firm_sub: "tramos firmes",
      topic_h_learned_sub: "oraciones aprendidas",
      topic_h_ranges: "Por tramo",
      topic_h_hard: "Te cuestan",
      topic_h_hard_btn: "Practicar estos",
      topic_s_none: "sin practicar",
      topic_s_few: "poco",
      topic_s_weak: "flojo",
      topic_s_ok: "bien",
      topic_s_firm: "firme",
      topic_firm_of: "{b} de {n} tramos firmes",
      topic_learned_of: "{b} de {n}",
      prog_topics_title: "Temas",
      flash_done_text_practice: "¡Listo! Todas salieron bien.",
      msg_nada_para_practicar: "No hay nada para practicar ahí.",
      prog_loading: "Cargando tu historial…",
      prog_error: "No se pudo cargar tu historial del servidor; por ahora se ve solo lo de este dispositivo.",
      prog_intro_title: "Tu progreso",
      prog_intro_text: "Todavía no hay tarjetas calificadas. Cuando practiques, dale vuelta a cada tarjeta y marcá «Bien» u «Otra vez»: con eso, acá vas a ver qué te toca repasar, qué te cuesta y cómo vas avanzando.",
      prog_due_title: "Para repasar hoy",
      prog_card_1: "tarjeta",
      prog_card_n: "tarjetas",
      prog_due_missed: "{n} que fallaste la última vez",
      prog_due_time: "unos {n} min a tu ritmo",
      prog_due_btn: "Repasar ahora",
      prog_due_none: "Nada para repasar hoy. Lo que califiques vuelve acá cuando le toque.",
      prog_week_title: "Esta semana",
      prog_week_goal: "Meta: {goal} días · vas {n}",
      prog_days: "L,M,M,J,V,S,D",
      prog_stat_cards: "tarjetas",
      prog_stat_min: "practicando",
      prog_stat_bien: "bien",
      prog_stat_resp: "en dar vuelta",
      prog_struggle_title: "Te cuestan",
      prog_struggle_sub: "Las que más fallaste en las últimas dos semanas · la más reciente a la derecha",
      prog_struggle_btn: "Practicar estas {n}",
      prog_struggle_save: "Guardar como lista",
      prog_struggle_list_name: "Me cuestan · {date}",
      prog_struggle_saved: "Creaste la lista «{name}» con {n} ítems.",
      prog_x_of_y: "{b} de {n}",
      prog_grid_title: "Verbos por tiempo y persona",
      prog_grid_sub: "% bien en todos tus verbos (últimos 60 días) · tocá una celda para practicarla",
      prog_grid_none: "sin practicar",
      prog_grid_cell_aria: "{tense}, {person}: {pct}% bien en {n} respuestas",
      prog_grid_cell_none: "{tense}, {person}: sin practicar",
      prog_person_yo: "yo",
      prog_person_vos: "vos",
      prog_person_el: "él",
      prog_person_nosotros: "nos.",
      prog_person_ellos: "ellos",
      prog_tense_presente: "Presente",
      prog_tense_preterito: "Pretérito",
      prog_tense_imperfecto: "Imperfecto",
      prog_tense_futuro: "Futuro",
      prog_tense_condicional: "Condicional",
      prog_tense_subjPresente: "Subj. presente",
      prog_tense_subjPasado: "Subj. pasado",
      prog_tense_imperativo: "Imperativo",
      prog_learned_title: "Lo que ya aprendiste",
      prog_learned_sub: "Aprendida = salió bien en repasos espaciados (no solo hoy)",
      prog_learned_words: "palabras",
      prog_learned_forms: "formas verbales",
      prog_learned_phrases: "frases",
      prog_learned_new: "En verde: nuevas esta semana",
      prog_spark_from: "hace 8 semanas",
      prog_spark_to: "hoy · {n}",
      prog_spark_aria: "Aprendidas en las últimas 8 semanas: de {a} a {b}",
      prog_lists_title: "Listas",
      prog_lists_sub: "Tocá una lista para practicar lo que te falta",
      prog_lists_count: "{l} de {n} aprendidas",
      prog_lists_done: "¡Ya aprendiste toda esta lista!",
      prog_key_learned: "aprendidas",
      prog_key_progress: "en camino",
      prog_known_title: "¿Todavía sabidas?",
      prog_known_sub: "Las marcaste como sabidas, pero la última vez salieron «Otra vez»",
      prog_known_btn: "Revisarlas",
      last_session_title: "Última sesión · {when}",
      last_session_today: "hoy {time}",
      last_session_yesterday: "ayer {time}",
      last_session_cards: "{n} tarjetas",
      last_session_cards_1: "1 tarjeta",
      last_session_min: "{n} min",
      last_session_bien: "{n} bien",
      last_session_otra: "{n} otra vez",
      last_session_btn: "Repasar las {n} que costaron",
      last_session_btn_1: "Repasar la que costó",
      history_toggle: "Tu historial",
      history_none: "Todavía no aparece en tus tarjetas.",
      history_seen: "{n} veces",
      history_seen_1: "1 vez",
      history_seen_sub: "en tarjetas, en {d} días",
      history_seen_sub_1: "en tarjetas, en 1 día",
      history_grade_sub: "bien",
      history_no_grades: "sin calificar todavía",
      history_flip_sub: "tardás en dar vuelta (promedio)",
      history_next_sub: "próximo repaso",
      history_next_today: "hoy",
      history_next_tomorrow: "mañana",
      history_next_days: "en {n} días",
      history_forms_sub: "formas aprendidas (de las practicadas)",
      history_last: "últimas {n} · la más reciente a la derecha",
      list_meta_learned: " · {n} aprendidos",
      list_meta_learned_1: " · 1 aprendido",
      known_toggle_aria_on: "Sabido — tocá para desmarcar",
      known_toggle_aria_off: "Marcar como sabido",
      known_mark_aria: "Sabido",
      known_form_title: "Marcaste esta forma como sabida",
      conj_legend_known: "formas que marcaste como sabidas en las tarjetas",
      flash_done_title: "¡Listo!",
      flash_done_text: "Marcaste todas las tarjetas como sabidas.",
      flash_done_text_review: "No quedan tarjetas sabidas para repasar.",
      tts_play_aria: "Escuchar pronunciación",
      tts_error: "No se pudo reproducir el audio. Probá de nuevo.",
      tts_voice_elena_aria: "Voz: Elena",
      tts_voice_tomas_aria: "Voz: Tomás",
      btn_rae_lookup: "Buscar en RAE",
      rae_lookup_looking_up: "Buscando…",
      rae_lookup_not_found: "No se encontró en el DLE. Completá los campos a mano.",
      rae_lookup_filled: "Campos completados desde el DLE — revisalos antes de guardar.",
      rae_lookup_maybe_irregular: "Algunas de las formas que trajo el DLE no coinciden con la conjugación regular esperada — probablemente este verbo sea irregular; revisá el patrón y la Irregularidad.",
      rae_lookup_translation_unavailable: " La traducción automática no está disponible ahora, así que la definición quedó en español.",
      rae_lookup_error: "No se pudo consultar el DLE ahora. Probá de nuevo.",
      rae_lookup_daily_limit: "Llegaste al límite de búsquedas de hoy. Mañana podés seguir.",
      lists_intro: "Armá una lista con los verbos, las palabras y las frases que quieras de tu índice — podés mezclarlos, por ejemplo todo lo útil para \"la cocina\" — y compartila con un enlace. Quien lo abra puede ver la lista e importarla a su propia cuenta, sin tocar el resto de tus datos.",
      lists_empty: "Todavía no creaste ninguna lista.",
      btn_create_list_toggle: "+ Crear lista",
      list_form_title: "Nueva lista",
      label_nombre: "Nombre",
      placeholder_list_name: "ej. La cocina",
      btn_create: "Crear",
      btn_copy_link: "Copiar enlace",
      btn_native_share: "Compartir…",
      btn_share: "Compartir",
      btn_delete_list: "Eliminar lista",
      list_picker_new_label: "O creá una lista nueva",
      placeholder_new_list_name: "ej. Adjetivos de comida",
      btn_create_and_add: "Crear y agregar",
      share_login_note: "Iniciá sesión o creá una cuenta para importar esta lista a tu índice.",
      btn_import: "Importar a mi colección",
      settings_title: "Configuración",
      settings_lang_label: "Idioma de la app",
      settings_lang_note: "Esto solo cambia el texto de la app — tus verbos y vocabulario siempre quedan en español.",
      settings_voice_label: "Voz de pronunciación",
      settings_voice_note: "La voz que escuchás al tocar el parlante en las flashcards.",
      flash_group_mode: "Cómo practicar",
      flash_mode_read: "Leer",
      flash_mode_listen: "Escuchar",
      flash_mode_note_read: "Leés el frente y das vuelta para ver la respuesta.",
      flash_mode_note_listen: "El frente es solo audio: escuchás la palabra (o la forma del verbo) y das vuelta para verla escrita, con su significado.",
      flash_mode_note_quiet: "El modo silencio está activado, así que «Escuchar» y «Hablar» no están disponibles. Podés desactivarlo en Configuración.",
      flash_autoplay: "Reproducir el audio solo",
      flash_autoplay_note: "El español suena apenas aparece (al frente, o al dar vuelta).",
      flash_autoplay_note_listen: "En «Escuchar» siempre suena.",
      flash_autoplay_note_quiet: "Silenciado por el modo silencio.",
      flash_listen_aria: "Escuchar otra vez",
      settings_quiet_label: "Modo silencio",
      settings_quiet_off: "Apagado",
      settings_quiet_on: "Activado",
      settings_quiet_note: "Silencia toda la pronunciación de la app (por ejemplo, en un avión). Solo en este dispositivo.",
      settings_backup_label: "Respaldo",
      settings_backup_note: "Guarda en el servidor una copia de tus verbos, palabras, frases y listas, incluido lo marcado como sabido. Hay un solo respaldo: uno nuevo reemplaza al anterior.",
      backup_create: "Crear respaldo",
      backup_restore: "Restaurar…",
      backup_delete: "Borrar mi contenido…",
      backup_cancel: "Cancelar",
      backup_none: "Todavía no hiciste un respaldo.",
      backup_last: "Último respaldo: {date} — {summary}.",
      backup_loading: "Buscando tu respaldo…",
      backup_unavailable: "El respaldo todavía no está disponible (falta actualizar la base de datos).",
      backup_unit_verb: "verbo|verbos", backup_unit_word: "palabra|palabras", backup_unit_phrase: "frase|frases", backup_unit_list: "lista|listas",
      backup_and: "y", backup_nothing: "nada",
      backup_prefer_backup: "Usar el respaldo",
      backup_prefer_backup_sub: "reemplaza lo que tenés en la app (incluido lo marcado como sabido)",
      backup_prefer_active: "Conservar lo de la app",
      backup_prefer_active_sub: "solo agrega lo que falta",
      backup_replace_text: "Esto reemplaza tu respaldo del {date} ({summary}) con lo que tenés ahora en la app ({current}).",
      backup_replace_confirm: "Reemplazar respaldo",
      backup_working: "Un momento…",
      backup_done: "Listo: respaldo guardado ({summary}).",
      backup_err_empty: "No hay nada para respaldar: tu cuenta no tiene contenido.",
      backup_delete_text: "Se van a borrar de la app {current}. Tu respaldo no se toca.",
      backup_delete_has_backup: "Tu respaldo es del {date} ({summary}).",
      backup_delete_no_backup: "Ojo: no tenés respaldo, así que no vas a poder recuperarlo.",
      backup_delete_word: "BORRAR",
      backup_delete_type: "Escribí BORRAR para confirmar:",
      backup_delete_confirm: "Borrar todo",
      backup_deleted: "Se borró tu contenido ({summary}). Podés recuperarlo con «Restaurar…».",
      backup_restore_text: "Respaldo del {date}: {summary}.",
      backup_restore_conflicts: "{n} ya están en la app. ¿Qué versión querés?",
      backup_restore_no_conflicts: "Nada de esto está en la app ahora: se agrega todo.",
      backup_restore_confirm: "Restaurar",
      backup_restored: "Restaurado: {ins} agregados, {ovw} reemplazados por el respaldo, {kept} sin cambios.",
      backup_err_none: "No hay ningún respaldo para restaurar.",
      quiet_toast_text: "El modo silencio está activado. Podés desactivarlo en Configuración.",
      quiet_toast_settings: "Configuración",
      tts_muted_aria: "Audio silenciado (modo silencio)",
      remove_btn: "Quitar",
      empty_no_verbs: "Todavía no hay verbos en tu cuenta.",
      empty_no_verb_match: "Ningún infinitivo coincide con “{q}”.",
      empty_no_words: "Todavía no hay palabras en tu vocabulario.",
      empty_no_word_match: "Ninguna palabra coincide con “{q}”.",
      empty_no_phrases: "Todavía no hay frases en tu colección.",
      empty_no_phrase_match: "Ninguna frase coincide con “{q}”.",
      empty_no_lists: "Todavía no tenés ninguna lista — creá una nueva abajo.",
      msg_falta_infinitivo: "Falta el infinitivo.",
      msg_guardando: "Guardando…",
      msg_error_guardar: "Error al guardar: {msg}",
      confirm_delete_verb: "¿Eliminar este verbo de tu índice?",
      msg_no_pudo_eliminar: "No se pudo eliminar: {msg}",
      msg_ya_tenes_verbos_ejemplo: "Ya tenés todos los verbos de ejemplo en tu cuenta.",
      msg_no_pudieron_cargar_verbos: "No se pudieron cargar los verbos de ejemplo: {msg}",
      msg_error_cargar_verbos: "Error al cargar tus verbos: {msg}",
      msg_falta_palabra: "Falta la palabra.",
      msg_error_cargar_vocab: "Error al cargar tu vocabulario: {msg}",
      confirm_delete_word: "¿Eliminar esta palabra de tu vocabulario?",
      msg_ya_tenes_palabras_ejemplo: "Ya tenés todas las palabras de ejemplo en tu vocabulario.",
      msg_no_pudieron_cargar_palabras: "No se pudieron cargar las palabras de ejemplo: {msg}",
      msg_falta_frase: "Falta la frase.",
      msg_error_cargar_frases: "Error al cargar tus frases: {msg}",
      confirm_delete_phrase: "¿Eliminar esta frase de tu colección?",
      msg_ya_tenes_frases_ejemplo: "Ya tenés todas las frases de ejemplo en tu colección.",
      msg_no_pudieron_cargar_frases: "No se pudieron cargar las frases de ejemplo: {msg}",
      msg_error_cargar_listas: "Error al cargar tus listas: {msg}",
      msg_error_generic: "Error: {msg}",
      msg_error_cargar_items: "Error al cargar los ítems: {msg}",
      msg_falta_nombre: "Falta el nombre.",
      msg_creando: "Creando…",
      confirm_delete_list: "¿Eliminar esta lista? Esto no borra tus verbos ni palabras, solo la lista compartida.",
      msg_error_cargar_lista: "Error al cargar la lista: {msg}",
      msg_enlace_copiado: "Enlace copiado.",
      msg_no_pudo_copiar: "No se pudo copiar automáticamente — el enlace ya está seleccionado, copialo con Ctrl/Cmd+C.",
      msg_enlace_seleccionado: "El enlace ya está seleccionado, copialo con Ctrl/Cmd+C.",
      msg_no_pudo_compartir: "No se pudo compartir: {msg}",
      msg_no_items_filtro: "No hay ítems para agregar con el filtro actual.",
      msg_agregando: "Agregando…",
      msg_ya_estaban_todos: "Ya estaban todos en esa lista ({n}).",
      msg_nada_para_agregar: "No hay nada para agregar.",
      msg_agrego_1: "Se agregó 1 ítem a la lista.",
      msg_agregaron_n: "Se agregaron {n} ítems a la lista.",
      msg_ya_estaban_paren: " ({n} ya estaban.)",
      msg_poner_nombre: "Poné un nombre para la lista nueva.",
      msg_error_crear: "Error al crear: {msg}",
      msg_cargando: "Cargando…",
      msg_enlace_invalido: "Enlace no válido",
      msg_enlace_no_existe: "Este enlace no existe o ya no está disponible.",
      msg_importando: "Importando…",
      msg_error_importar: "Error al importar: {msg}",
      msg_imported_prefix: "Se importaron {n}",
      unit_item_singular: " ítem.",
      unit_item_plural: " ítems.",
      msg_ya_estaba_singular: " ya estaba",
      msg_ya_estaban_plural: " ya estaban",
      msg_en_tu_coleccion: " en tu colección: {list}.",
      msg_no_pudo_crear_lista_cuenta: " No se pudo crear la lista en tu cuenta: {msg}",
      msg_lista_creada_sin_items: " La lista se creó pero no se pudieron agregar sus ítems: {msg}",
      msg_se_creo_lista: " Se creó la lista “{name}” en tu cuenta.",
      msg_email_confirmacion: "Te enviamos un email de confirmación a {email}. Confirmá tu cuenta y después iniciá sesión.",
      preposicion_note: "Se usa con la preposición “{prep}”.",
      th_imp_abbrev: "Afirm.",
      unit_verbo_s: " verbo",
      unit_verbo_pl: " verbos",
      unit_palabra_s: " palabra",
      unit_palabra_pl: " palabras",
      unit_frase_s: " frase",
      unit_frase_pl: " frases",
      unit_item_bare_s: " ítem",
      unit_item_bare_pl: " ítems",
      share_fallback_name: "lista compartida",
      share_native_text: "Te comparto la lista “{name}” de voseá.",
      share_shared_by: " · compartida por {label}",
      btn_import_json_toggle: "Importar contenido (JSON)",
      import_json_title: "Importar contenido desde JSON",
      import_json_intro: "Pegá o subí un archivo JSON con verbos y/o palabras que sigan el formato de voseá. Nada se guarda hasta que confirmes la importación.",
      import_spec_summary: "Ver / copiar la especificación del formato",
      btn_copy_spec: "Copiar especificación",
      import_json_file_label: "Elegir archivo .json",
      import_json_textarea_label: "O pegá el JSON acá",
      import_json_placeholder: "Pegá acá el JSON con tus verbos y palabras…",
      btn_validate_import: "Validar",
      import_json_errors_heading: "Errores bloqueantes",
      import_json_warnings_heading: "Avisos",
      import_json_preview_heading: "Se importará",
      btn_confirm_import: "Confirmar importación",
      import_json_no_content: "Pegá el JSON o elegí un archivo para validar.",
      import_json_parse_error: "El JSON no es válido: {msg}",
      import_err_not_object: "El JSON debe ser un objeto.",
      import_err_bad_version: "Versión de formato no admitida (se esperaba version: 1). Se rechazó todo el archivo.",
      import_err_verbs_not_array: "\"verbs\" debe ser un array.",
      import_err_words_not_array: "\"words\" debe ser un array.",
      import_err_phrases_not_array: "\"phrases\" debe ser un array.",
      import_json_summary_line: "Se analizaron {v} verbo(s), {w} palabra(s) y {p} frase(s); {e} error(es) bloqueante(s); {warn} aviso(s).",
      import_json_nothing: "No hay verbos, palabras ni frases válidos para importar.",
      import_err_verb_missing_infinitive: "verbo #{n}: falta el infinitivo.",
      import_err_verb_bad_type: "verbo #{n} ({inf}): \"type\" debe ser -ar, -er o -ir.",
      import_err_verb_type_mismatch: "verbo #{n} ({inf}): el tipo \"{type}\" no coincide con la terminación del infinitivo.",
      import_err_verb_bad_irregularity: "verbo #{n} ({inf}): valor de \"irregularity\" no válido.",
      import_err_verb_bad_transitivity: "verbo #{n} ({inf}): valor de \"transitivity\" no válido.",
      import_err_verb_missing_forms: "verbo #{n} ({inf}): falta el objeto \"forms\".",
      import_err_verb_missing_field: "verbo #{n} ({inf}): falta {field}.",
      import_warn_verb_cells: "verbo #{n} ({inf}): se declaró \"regular\" pero hay celdas marcadas que no coinciden con el patrón regular — revisalas.",
      import_err_word_missing: "palabra #{n}: falta \"word\" o \"definition\".",
      import_err_word_bad_pos: "palabra #{n} ({word}): valor de \"part_of_speech\" no válido.",
      import_err_word_bad_gender: "palabra #{n} ({word}): valor de \"gender\" no válido.",
      import_err_phrase_missing: "frase #{n}: falta \"phrase\" o \"definition\".",
      import_err_phrase_bad_function: "frase #{n} ({phrase}): valor de \"function\" no válido.",
      import_err_phrase_bad_register: "frase #{n} ({phrase}): valor de \"register\" no válido.",
      import_json_result_summary: "Se importaron {vIns} verbo(s), {wIns} palabra(s) y {pIns} frase(s) nueva(s); se omitieron {vSkip} verbo(s), {wSkip} palabra(s) y {pSkip} frase(s) que ya tenías.",
      import_json_result_list_created: " Se creó la lista “{name}”.",
      import_json_result_list_added: " Se agregaron a la lista “{name}”: {added} ítem(s) ({already} ya estaban).",
      import_json_result_list_error: " No se pudo procesar la lista: {msg}"
    },
    en: {
      app_tagline: "Rioplatense Spanish · voseo",
      auth_login_tab: "Log in",
      auth_signup_tab: "Create account",
      auth_email_label: "Email",
      auth_password_label: "Password",
      auth_submit_login: "Log in",
      logout_btn: "Log out",
      acct_menu_aria: "Account menu",
      nav_verbs: "Verbs",
      nav_words: "Vocabulary",
      nav_phrases: "Phrases",
      nav_flashcards: "Flashcards",
      nav_lists: "Lists",
      offline_banner: "Offline — showing what was last saved ({age}).",
      cache_age_moment: "just now",
      cache_age_minutes: "{n} minute ago",
      cache_age_minutes_pl: "{n} minutes ago",
      cache_age_hours: "{n} hour ago",
      cache_age_hours_pl: "{n} hours ago",
      cache_age_days: "{n} day ago",
      cache_age_days_pl: "{n} days ago",
      verb_search_placeholder: "Type an infinitive… (e.g. querer)",
      chip_group_type: "Type",
      chip_group_irregularity: "Irregularity",
      chip_group_transitivity: "Transitivity",
      chip_group_flags: "Flags",
      chip_group_category: "Category",
      chip_group_gender: "Gender",
      chip_group_function: "Function",
      chip_group_register: "Register",
      chip_group_list: "Lists",
      chip_hint_exclude: "Tap a chip to include, twice to exclude",
      hidden_count_s: "{n} result hidden by your excludes",
      hidden_count_pl: "{n} results hidden by your excludes",
      show_all_btn: "Show all",
      lists_trigger_prefix: "Lists: ",
      lists_included_pl: "{n} included",
      lists_excluded_s: "{n} excluded",
      lists_excluded_pl: "{n} excluded",
      list_filter_title: "Filter by list",
      list_filter_hint: "Tap to include, tap twice to exclude. Changes apply instantly.",
      list_filter_search_placeholder: "Search for a list…",
      list_filter_clear_selection: "Clear selection",
      list_filter_no_matches: "No lists match “{q}”.",
      filters_clear: "Clear filters",
      btn_filter_to_list: "Filter to this list",
      empty_list_clear_filters_btn: "Clear the other filters",
      empty_list_no_verbs: "This list has no verbs.",
      empty_list_hidden_verbs_s: "There's {n} verb from this list hidden by other filters.",
      empty_list_hidden_verbs_pl: "There are {n} verbs from this list hidden by other filters.",
      empty_list_no_words: "This list has no words.",
      empty_list_hidden_words_s: "There's {n} word from this list hidden by other filters.",
      empty_list_hidden_words_pl: "There are {n} words from this list hidden by other filters.",
      empty_list_no_phrases: "This list has no phrases.",
      empty_list_hidden_phrases_s: "There's {n} phrase from this list hidden by other filters.",
      empty_list_hidden_phrases_pl: "There are {n} phrases from this list hidden by other filters.",
      conj_hint: "swipe to see all tenses →",
      conj_tap_hint: "Tap any form to hear it",
      mood_indicativo: "Indicative",
      mood_subjuntivo: "Subjunctive",
      mood_imperativo: "Imperative",
      conj_legend_irregular: "differs from the regular pattern",
      conj_legend_gustar: "who it happens to (not who acts) — the form only changes if the thing liked/affecting is singular or plural",
      tile_gerundio: "Gerund",
      tile_participio: "Participle",
      btn_add_to_list: "Add to list",
      btn_edit: "Edit",
      btn_delete: "Delete",
      btn_add_verb_toggle: "+ Add verb",
      seed_verbs_btn: "Load example verbs",
      btn_add_filtered_to_list: "Add filtered to a list",
      form_title_add_verb: "Add verb",
      label_infinitivo: "Infinitive",
      label_definicion: "Definition",
      label_patron: "Irregularity pattern",
      label_notas_verbo: "Usage notes",
      placeholder_notas_verbo: "e.g. in logging: «correr un perfil» = to run a log",
      placeholder_ejemplo_verbo: "e.g. Corrí diez kilómetros. / Corrimos el perfil a la noche.",
      label_preposicion: "Fixed preposition",
      placeholder_preposicion: "e.g. en, de, a",
      check_reflexivo: "Reflexive?",
      check_auxiliar: "Auxiliary / modal?",
      check_gustar: "Gustar-type?",
      check_also_personal_use: "Also has a personal-subject (non-dative) use?",
      gustar_tab_personal: "Personal use",
      gustar_tab_dativo: "Dative use",
      impersonal_optional: "impersonal (optional)",
      imperativo_afirmativo: "Affirmative imperative (optional)",
      btn_save: "Save",
      btn_cancel: "Cancel",
      word_search_placeholder: "Type a word… (e.g. mesa)",
      btn_add_word_toggle: "+ Add word",
      seed_words_btn: "Load example words",
      form_title_add_word: "Add word",
      label_palabra: "Word",
      label_categoria_gramatical: "Part of speech",
      label_notas: "Notes / exceptions",
      placeholder_notas: "e.g. feminine, but uses “el”: el agua",
      label_ejemplo: "Example sentence",
      placeholder_ejemplo: "e.g. Tomo mucha agua todos los días.",
      phrase_search_placeholder: "Type a phrase… (e.g. dale)",
      btn_add_phrase_toggle: "+ Add phrase",
      seed_phrases_btn: "Load example phrases",
      form_title_add_phrase: "Add phrase",
      form_title_edit_phrase: "Edit phrase",
      label_frase: "Phrase",
      label_funcion: "Function",
      label_registro: "Register",
      register_neutro: "neutral",
      register_coloquial: "colloquial",
      register_lunfardo: "lunfardo (BA slang)",
      check_idiomatic: "Is it idiomatic (doesn't translate word-for-word)?",
      label_literal: "Literal translation",
      placeholder_literal: "e.g. “not even drunk” (actual meaning: no way)",
      flash_title: "Flashcard mode",
      flash_setup_note: "Flashcards are built from whatever is currently filtered in the Verbs, Vocabulary and Phrases tabs.",
      flash_group_times: "Tenses, moods and persons",
      flash_group_pick: "What do you want to practice?",
      flash_pick_all: "All",
      flash_pick_none: "None",
      flash_preset_presente: "Present",
      flash_preset_pasados: "Past tenses",
      flash_preset_futuro: "Future",
      flash_preset_condicional: "Conditional",
      flash_preset_subjuntivo: "Subjunctive",
      flash_preset_imperativo: "Imperative",
      flash_preset_nonpersonal: "Gerund & participle",
      flash_custom_toggle: "Customize tenses and persons",
      flash_custom_persons: "Persons (in the chosen tenses)",
      flash_deck_count: "{n} cards",
      flash_deck_count_1: "1 card",
      flash_matrix_hint: "Tap a cell for that combination, or a header for the whole row or column.",
      flash_group_direction: "Card direction",
      flash_dir_def2word: "Definition → word",
      flash_dir_word2def: "Word → definition",
      flash_start_btn: "Start",
      flash_no_source: "Turn on at least one source (verbs, vocabulary or phrases).",
      flash_no_cards: "There are no cards for this filter combination — try enabling more tenses, persons or sources.",
      close: "Close",
      share_label_shared_list: "Shared list",
      flash_hint: "Tap the card to flip · swipe to change",
      flash_prev: "‹ Previous",
      flash_next: "Next ›",
      flash_arrow_prev_aria: "Previous",
      flash_arrow_next_aria: "Next",
      known_toggle: "Known",
      grade_otra: "Again",
      flash_mode_speak: "Speak",
      flash_mode_note_speak: "You see the meaning and say it in Spanish: tap the mic, speak, tap again. The card turns over by itself with what it heard and a suggested grade you can change.",
      flash_autoplay_note_speak: "When on, the answer plays as the card turns over.",
      speak_unsupported: "This browser can't record audio, so Speak won't work here.",
      speak_mic_aria: "Record your answer",
      speak_stop_aria: "Stop recording",
      speak_mic_denied: "No microphone permission. Allow it in your browser settings.",
      speak_mic_error: "Couldn't use the microphone.",
      speak_said: "You said:",
      speak_play_aria: "Play your recording",
      speak_nothing: "Nothing heard",
      speak_error: "Couldn't check it",
      update_toast_text: "A new version of voseá is ready.",
      update_toast_btn: "Update",
      update_toast_later: "Later",
      grade_bien: "Got it",
      grade_group_aria: "How this card went",
      flash_tally: "{b} got it · {o} again",
      nav_progress: "Progress",
      nav_topics: "Topics",
      nav_play: "Play",
      pt_name: "Game",
      pt_row_def: "Endless: what's due, what you've been missing, new things and topics. Each card climbs from Read to Listen to Speak as you get it.",
      pt_row_def_quiet: "Endless. With quiet mode on, every card stays in Read.",
      pt_row_stat: "longest: {cards} · run: {best}",
      pt_row_stat_cards: "longest: {cards}",
      pt_soon: "soon",
      pt_crono_name: "Against the clock",
      pt_crono_def: "60 seconds, as many as you can.",
      pt_reto_name: "Challenge",
      pt_reto_def: "The same cards for both of you.",
      pt_nothing: "Nothing to play yet: add some verbs, words or phrases, or practise a topic.",
      pt_end: "Finish",
      pt_why_due: "Due",
      pt_why_hard: "Tricky",
      pt_why_new: "New",
      pt_why_topic: "Topic",
      pt_why_up: "Up",
      pt_why_again: "Again",
      pt_why_back: "Back",
      pt_note_up: "**Got it** → back in a few cards, in **{mode}**",
      pt_note_done: "**Got it** → done for this game",
      pt_note_down: "**Again** → back soon, in **{mode}**",
      pt_note_again: "**Again** → back soon",
      pt_sum_title: "Game over",
      pt_sum_title_good: "Good game!",
      pt_sum_today: "Today: {n} of {goal} cards",
      pt_sum_today_met: "Today: {n} of {goal} ✓ · {days}-day streak",
      pt_sum_today_met_one: "Today: {n} of {goal} ✓ · 1-day streak",
      pt_sum_cards: "cards",
      pt_sum_min: "playing",
      pt_sum_bien: "got it",
      pt_sum_best: "Bien in a row speaking",
      pt_sum_ladder: "Where they ended up",
      pt_sum_ladder_note: "{n} reached {mode} this game.",
      pt_sum_ladder_note_one: "1 reached {mode} this game.",
      pt_sum_ladder_note_zero: "None reached {mode} yet: give it a bit longer.",
      pt_sum_ladder_quiet: "Quiet mode: they all stayed in Read.",
      pt_sum_missed: "These cost you",
      pt_sum_review: "Review these {n}",
      pt_sum_review_one: "Review this one",
      pt_sum_won: "You won",
      play_combo_hud: "in a row",
      play_combo_aria: "{n} Bien in a row",
      play_how_racha: "{n}-day streak",
      play_how_hablar: "{n} spoken",
      play_how_combo: "{n} in a row",
      play_how_otro: "reward",
      play_kick_racha: "{n} days in a row!",
      play_kick_hablar: "{n} Bien speaking!",
      play_kick_combo: "{n} Bien in a row!",
      play_kick_otro: "Reward!",
      play_album_done_title: "Album complete!",
      play_album_done_text: "You have the whole album. More soon.",
      play_added_word: "Now in your **Vocabulary** · list «{list}»",
      play_added_phrase: "Now in your **Phrases** · list «{list}»",
      play_keep_playing: "Keep playing",
      play_to_album: "See the album",
      play_listen: "Listen",
      play_days_one: "day in a row",
      play_days: "days in a row",
      play_today: "today: {n} of {goal} cards",
      play_today_met: "today: {n} of {goal} ✓",
      play_free_day: "Free day",
      play_next_keep: "**{n} more cards** today to keep your streak.",
      play_next_keep_one: "**1 more card** today to keep your streak.",
      play_next_start: "Do **{n} cards** today to start a streak.",
      play_next_start_one: "Do **1 card** today to start a streak.",
      play_next_reward: "Next reward: **{n} more days** of streak.",
      play_next_reward_one: "Next reward: **tomorrow**, if you keep the streak.",
      play_goal_label: "Daily goal",
      play_racha_rule: "Every card you turned over or graded counts, in any mode. You get one free day a week.",
      play_today_title: "Today, speaking",
      play_today_sub: "Hablar rewards: the automatic grade counts. Each one once a day.",
      play_goal_session: "{n} Bien in one session",
      play_goal_combo: "{n} Bien in a row",
      play_won_today: "won!",
      play_speak_btn: "Practice speaking",
      play_quiet_note: "Hablar isn't available in quiet mode.",
      play_album_title: "Your album",
      play_album_entry: "Things from here: {n} of {total} · added to your Vocabulary and Phrases",
      play_album_desc: "Things from here you won by playing. Each one is already in your Vocabulary or Phrases, in the list «{list}». {n} of {total}.",
      play_album_left: "{n} left to discover.",
      play_album_how: "How to win them",
      play_album_back: "‹ Play",
      play_rule_racha: "A streak of {a}, {b}, {c}… days",
      play_rule_session: "{a} Bien speaking in one session (and {b})",
      play_rule_combo: "{n} Bien in a row, speaking",
      play_rule_fine: "In Hablar the automatic grade counts, not the one you change. Each Hablar reward can be won once a day. Coming: Contrarreloj records and challenges.",
      play_stat_days: "{n} days",
      play_stat_days_one: "1 day",
      play_stat_racha: "streak (best: {n})",
      play_stat_longest: "cards, your longest session",
      play_stat_combo: "Bien in a row speaking (best)",
      play_stat_album_n: "{n} of {total}",
      play_stat_album: "in your album",
      play_go_btn: "Go to Play",
      topics_intro: "Topics for drilling one thing. They don't add anything to your verbs, vocabulary or phrases.",
      topic_what: "What to practise?",
      topic_start: "Practise",
      topic_count: "{n} cards",
      topic_pick_one: "Pick at least one range.",
      topic_sentences: "See the sentences",
      topic_also: "also: {x}",
      topic_note_read: "See the front, say it to yourself, then flip for the answer.",
      topic_note_listen: "The front is audio only: listen, then flip to see it written.",
      topic_note_speak: "Say it out loud: tap the mic, speak, tap again.",
      topic_h_none: "You haven't practised this topic yet.",
      topic_h_cards: "{n} cards",
      topic_h_cards_1: "1 card",
      topic_h_firm_sub: "ranges solid",
      topic_h_learned_sub: "sentences learned",
      topic_h_ranges: "By range",
      topic_h_hard: "Giving you trouble",
      topic_h_hard_btn: "Practise these",
      topic_s_none: "not yet",
      topic_s_few: "a little",
      topic_s_weak: "shaky",
      topic_s_ok: "good",
      topic_s_firm: "solid",
      topic_firm_of: "{b} of {n} ranges solid",
      topic_learned_of: "{b} of {n}",
      prog_topics_title: "Topics",
      flash_done_text_practice: "Done! You got every card.",
      msg_nada_para_practicar: "Nothing to practice there.",
      prog_loading: "Loading your history…",
      prog_error: "Couldn't load your history from the server; for now this only shows what's on this device.",
      prog_intro_title: "Your progress",
      prog_intro_text: "No graded cards yet. When you practice, flip each card and mark it \"Got it\" or \"Again\" — then this is where you'll see what's due for review, what's giving you trouble, and how you're doing.",
      prog_due_title: "Due for review today",
      prog_card_1: "card",
      prog_card_n: "cards",
      prog_due_missed: "{n} you missed last time",
      prog_due_time: "about {n} min at your pace",
      prog_due_btn: "Review now",
      prog_due_none: "Nothing due today. Whatever you grade comes back here when it's due.",
      prog_week_title: "This week",
      prog_week_goal: "Goal: {goal} days · {n} so far",
      prog_days: "M,T,W,T,F,S,S",
      prog_stat_cards: "cards",
      prog_stat_min: "practicing",
      prog_stat_bien: "got it",
      prog_stat_resp: "to flip",
      prog_struggle_title: "Giving you trouble",
      prog_struggle_sub: "The ones you missed most in the last two weeks · most recent on the right",
      prog_struggle_btn: "Practice these {n}",
      prog_struggle_save: "Save as a list",
      prog_struggle_list_name: "Trouble words · {date}",
      prog_struggle_saved: "Created the list \"{name}\" with {n} items.",
      prog_x_of_y: "{b} of {n}",
      prog_grid_title: "Verbs by tense and person",
      prog_grid_sub: "% got it across all your verbs (last 60 days) · tap a cell to practice it",
      prog_grid_none: "not practiced",
      prog_grid_cell_aria: "{tense}, {person}: {pct}% got it over {n} answers",
      prog_grid_cell_none: "{tense}, {person}: not practiced",
      prog_person_yo: "yo",
      prog_person_vos: "vos",
      prog_person_el: "él",
      prog_person_nosotros: "nos.",
      prog_person_ellos: "ellos",
      prog_tense_presente: "Present",
      prog_tense_preterito: "Preterite",
      prog_tense_imperfecto: "Imperfect",
      prog_tense_futuro: "Future",
      prog_tense_condicional: "Conditional",
      prog_tense_subjPresente: "Subj. present",
      prog_tense_subjPasado: "Subj. past",
      prog_tense_imperativo: "Imperative",
      prog_learned_title: "What you've learned",
      prog_learned_sub: "Learned = got it across spaced reviews (not just today)",
      prog_learned_words: "words",
      prog_learned_forms: "verb forms",
      prog_learned_phrases: "phrases",
      prog_learned_new: "In green: new this week",
      prog_spark_from: "8 weeks ago",
      prog_spark_to: "today · {n}",
      prog_spark_aria: "Learned over the last 8 weeks: from {a} to {b}",
      prog_lists_title: "Lists",
      prog_lists_sub: "Tap a list to practice what's left",
      prog_lists_count: "{l} of {n} learned",
      prog_lists_done: "You've learned this whole list!",
      prog_key_learned: "learned",
      prog_key_progress: "on the way",
      prog_known_title: "Still known?",
      prog_known_sub: "You marked these Known, but last time you graded them \"Again\"",
      prog_known_btn: "Review them",
      last_session_title: "Last session · {when}",
      last_session_today: "today {time}",
      last_session_yesterday: "yesterday {time}",
      last_session_cards: "{n} cards",
      last_session_cards_1: "1 card",
      last_session_min: "{n} min",
      last_session_bien: "{n} got it",
      last_session_otra: "{n} again",
      last_session_btn: "Review the {n} you missed",
      last_session_btn_1: "Review the one you missed",
      history_toggle: "Your history",
      history_none: "Not in your flashcards yet.",
      history_seen: "{n} times",
      history_seen_1: "once",
      history_seen_sub: "on flashcards, over {d} days",
      history_seen_sub_1: "on flashcards, on 1 day",
      history_grade_sub: "got it",
      history_no_grades: "not graded yet",
      history_flip_sub: "to flip, on average",
      history_next_sub: "next review",
      history_next_today: "today",
      history_next_tomorrow: "tomorrow",
      history_next_days: "in {n} days",
      history_forms_sub: "forms learned (of those practiced)",
      history_last: "last {n} · most recent on the right",
      list_meta_learned: " · {n} learned",
      list_meta_learned_1: " · 1 learned",
      known_toggle_aria_on: "Known — tap to unmark",
      known_toggle_aria_off: "Mark as known",
      known_mark_aria: "Known",
      known_form_title: "You marked this form as known",
      conj_legend_known: "forms you marked as known on flashcards",
      flash_done_title: "All done!",
      flash_done_text: "You've marked every card as known.",
      flash_done_text_review: "No known cards left to review.",
      tts_play_aria: "Hear pronunciation",
      tts_error: "Couldn't play the audio. Try again.",
      tts_voice_elena_aria: "Voice: Elena",
      tts_voice_tomas_aria: "Voice: Tomás",
      btn_rae_lookup: "Look up in RAE",
      rae_lookup_looking_up: "Looking up…",
      rae_lookup_not_found: "Not found in the DLE. Fill in the fields by hand.",
      rae_lookup_filled: "Fields filled in from the DLE — check them over before saving.",
      rae_lookup_maybe_irregular: "Some of the forms the DLE filled in don't match the expected regular conjugation — this verb is probably irregular; check the pattern and Irregularidad.",
      rae_lookup_translation_unavailable: " Automatic translation isn't available right now, so the definition stayed in Spanish.",
      rae_lookup_error: "Couldn't reach the DLE right now. Try again.",
      rae_lookup_daily_limit: "You've reached today's lookup limit. You can look up more tomorrow.",
      lists_intro: "Build a list out of any verbs, words and phrases from your index — you can mix them, for example everything useful for \"the kitchen\" — and share it with a link. Whoever opens it can see the list and import it into their own account, without touching the rest of your data.",
      lists_empty: "You haven't created any lists yet.",
      btn_create_list_toggle: "+ Create list",
      list_form_title: "New list",
      label_nombre: "Name",
      placeholder_list_name: "e.g. The kitchen",
      btn_create: "Create",
      btn_copy_link: "Copy link",
      btn_native_share: "Share…",
      btn_share: "Share",
      btn_delete_list: "Delete list",
      list_picker_new_label: "Or create a new list",
      placeholder_new_list_name: "e.g. Food adjectives",
      btn_create_and_add: "Create and add",
      share_login_note: "Log in or create an account to import this list into your index.",
      btn_import: "Import to my collection",
      settings_title: "Settings",
      settings_lang_label: "App language",
      settings_lang_note: "This only changes the app's own text — your verbs and vocabulary always stay in Spanish.",
      settings_voice_label: "Pronunciation voice",
      settings_voice_note: "The voice you hear when you tap the speaker on flashcards.",
      flash_group_mode: "How to practise",
      flash_mode_read: "Read",
      flash_mode_listen: "Listen",
      flash_mode_note_read: "Read the front, then flip for the answer.",
      flash_mode_note_listen: "The front is audio only: listen to the word (or the verb form), then flip to see it written, with its meaning.",
      flash_mode_note_quiet: "Quiet mode is on, so Listen and Speak aren't available. You can turn it off in Settings.",
      flash_autoplay: "Play the audio automatically",
      flash_autoplay_note: "The Spanish plays as soon as it appears (on the front, or when you flip).",
      flash_autoplay_note_listen: "In Listen it always plays.",
      flash_autoplay_note_quiet: "Muted by quiet mode.",
      flash_listen_aria: "Play again",
      settings_quiet_label: "Quiet mode",
      settings_quiet_off: "Off",
      settings_quiet_on: "On",
      settings_quiet_note: "Mutes all pronunciation audio in the app (on a plane, say). This device only.",
      settings_backup_label: "Backup",
      settings_backup_note: "Keeps a copy of your verbs, words, phrases and lists on the server, including what you've marked as known. There's one backup: a new one replaces the old.",
      backup_create: "Back up now",
      backup_restore: "Restore…",
      backup_delete: "Delete my content…",
      backup_cancel: "Cancel",
      backup_none: "You haven't made a backup yet.",
      backup_last: "Last backup: {date} — {summary}.",
      backup_loading: "Looking for your backup…",
      backup_unavailable: "Backup isn't available yet (the database still needs updating).",
      backup_unit_verb: "verb|verbs", backup_unit_word: "word|words", backup_unit_phrase: "phrase|phrases", backup_unit_list: "list|lists",
      backup_and: "and", backup_nothing: "nothing",
      backup_prefer_backup: "Use the backup",
      backup_prefer_backup_sub: "replaces what's in the app (including what's marked as known)",
      backup_prefer_active: "Keep what's in the app",
      backup_prefer_active_sub: "only adds what's missing",
      backup_replace_text: "This replaces your backup from {date} ({summary}) with what's in the app now ({current}).",
      backup_replace_confirm: "Replace backup",
      backup_working: "One moment…",
      backup_done: "Done: backup saved ({summary}).",
      backup_err_empty: "Nothing to back up: your account has no content.",
      backup_delete_text: "This deletes {current} from the app. Your backup isn't touched.",
      backup_delete_has_backup: "Your backup is from {date} ({summary}).",
      backup_delete_no_backup: "Careful: you have no backup, so this can't be undone.",
      backup_delete_word: "DELETE",
      backup_delete_type: "Type DELETE to confirm:",
      backup_delete_confirm: "Delete everything",
      backup_deleted: "Your content was deleted ({summary}). You can bring it back with \"Restore…\".",
      backup_restore_text: "Backup from {date}: {summary}.",
      backup_restore_conflicts: "{n} of these are already in the app. Which version do you want?",
      backup_restore_no_conflicts: "None of this is in the app right now: everything gets added.",
      backup_restore_confirm: "Restore",
      backup_restored: "Restored: {ins} added, {ovw} replaced by the backup, {kept} left as they were.",
      backup_err_none: "There's no backup to restore.",
      quiet_toast_text: "Quiet mode is on. You can turn it off in Settings.",
      quiet_toast_settings: "Settings",
      tts_muted_aria: "Audio muted (quiet mode)",
      remove_btn: "Remove",
      empty_no_verbs: "You don't have any verbs yet.",
      empty_no_verb_match: "No infinitive matches “{q}”.",
      empty_no_words: "You don't have any words yet.",
      empty_no_word_match: "No word matches “{q}”.",
      empty_no_phrases: "You don't have any phrases yet.",
      empty_no_phrase_match: "No phrase matches “{q}”.",
      empty_no_lists: "You don't have any lists yet — create one below.",
      msg_falta_infinitivo: "The infinitive is required.",
      msg_guardando: "Saving…",
      msg_error_guardar: "Error saving: {msg}",
      confirm_delete_verb: "Delete this verb from your index?",
      msg_no_pudo_eliminar: "Couldn't delete: {msg}",
      msg_ya_tenes_verbos_ejemplo: "You already have all the example verbs in your account.",
      msg_no_pudieron_cargar_verbos: "Couldn't load the example verbs: {msg}",
      msg_error_cargar_verbos: "Error loading your verbs: {msg}",
      msg_falta_palabra: "The word is required.",
      msg_error_cargar_vocab: "Error loading your vocabulary: {msg}",
      confirm_delete_word: "Delete this word from your vocabulary?",
      msg_ya_tenes_palabras_ejemplo: "You already have all the example words in your vocabulary.",
      msg_no_pudieron_cargar_palabras: "Couldn't load the example words: {msg}",
      msg_falta_frase: "The phrase is required.",
      msg_error_cargar_frases: "Error loading your phrases: {msg}",
      confirm_delete_phrase: "Delete this phrase from your collection?",
      msg_ya_tenes_frases_ejemplo: "You already have all the example phrases in your collection.",
      msg_no_pudieron_cargar_frases: "Couldn't load the example phrases: {msg}",
      msg_error_cargar_listas: "Error loading your lists: {msg}",
      msg_error_generic: "Error: {msg}",
      msg_error_cargar_items: "Error loading the items: {msg}",
      msg_falta_nombre: "The name is required.",
      msg_creando: "Creating…",
      confirm_delete_list: "Delete this list? This doesn't delete your verbs or words, only the shared list.",
      msg_error_cargar_lista: "Error loading the list: {msg}",
      msg_enlace_copiado: "Link copied.",
      msg_no_pudo_copiar: "Couldn't copy automatically — the link is already selected, copy it with Ctrl/Cmd+C.",
      msg_enlace_seleccionado: "The link is already selected, copy it with Ctrl/Cmd+C.",
      msg_no_pudo_compartir: "Couldn't share: {msg}",
      msg_no_items_filtro: "There are no items to add with the current filter.",
      msg_agregando: "Adding…",
      msg_ya_estaban_todos: "They were all already in that list ({n}).",
      msg_nada_para_agregar: "There's nothing to add.",
      msg_agrego_1: "1 item was added to the list.",
      msg_agregaron_n: "{n} items were added to the list.",
      msg_ya_estaban_paren: " ({n} already there.)",
      msg_poner_nombre: "Enter a name for the new list.",
      msg_error_crear: "Error creating: {msg}",
      msg_cargando: "Loading…",
      msg_enlace_invalido: "Invalid link",
      msg_enlace_no_existe: "This link doesn't exist or is no longer available.",
      msg_importando: "Importing…",
      msg_error_importar: "Error importing: {msg}",
      msg_imported_prefix: "Imported {n}",
      unit_item_singular: " item.",
      unit_item_plural: " items.",
      msg_ya_estaba_singular: " was already",
      msg_ya_estaban_plural: " were already",
      msg_en_tu_coleccion: " in your collection: {list}.",
      msg_no_pudo_crear_lista_cuenta: " Couldn't create the list in your account: {msg}",
      msg_lista_creada_sin_items: " The list was created but its items couldn't be added: {msg}",
      msg_se_creo_lista: " Created the list “{name}” in your account.",
      msg_email_confirmacion: "We sent a confirmation email to {email}. Confirm your account and then log in.",
      preposicion_note: "Used with the preposition “{prep}”.",
      th_imp_abbrev: "Aff.",
      unit_verbo_s: " verb",
      unit_verbo_pl: " verbs",
      unit_palabra_s: " word",
      unit_palabra_pl: " words",
      unit_frase_s: " phrase",
      unit_frase_pl: " phrases",
      unit_item_bare_s: " item",
      unit_item_bare_pl: " items",
      share_fallback_name: "shared list",
      share_native_text: "Sharing the list “{name}” from voseá.",
      share_shared_by: " · shared by {label}",
      btn_import_json_toggle: "Import content (JSON)",
      import_json_title: "Import content from JSON",
      import_json_intro: "Paste or upload a JSON file with verbs and/or words that follows voseá's format. Nothing is saved until you confirm the import.",
      import_spec_summary: "View / copy the format specification",
      btn_copy_spec: "Copy specification",
      import_json_file_label: "Choose a .json file",
      import_json_textarea_label: "Or paste the JSON here",
      import_json_placeholder: "Paste the JSON with your verbs and words here…",
      btn_validate_import: "Validate",
      import_json_errors_heading: "Blocking errors",
      import_json_warnings_heading: "Warnings",
      import_json_preview_heading: "Will be imported",
      btn_confirm_import: "Confirm import",
      import_json_no_content: "Paste JSON or choose a file to validate.",
      import_json_parse_error: "The JSON isn't valid: {msg}",
      import_err_not_object: "The JSON must be an object.",
      import_err_bad_version: "Unsupported format version (expected version: 1). The whole file was rejected.",
      import_err_verbs_not_array: "\"verbs\" must be an array.",
      import_err_words_not_array: "\"words\" must be an array.",
      import_err_phrases_not_array: "\"phrases\" must be an array.",
      import_json_summary_line: "Parsed {v} verb(s), {w} word(s) and {p} phrase(s); {e} blocking error(s); {warn} warning(s).",
      import_json_nothing: "There are no valid verbs, words or phrases to import.",
      import_err_verb_missing_infinitive: "verb #{n}: missing infinitive.",
      import_err_verb_bad_type: "verb #{n} ({inf}): \"type\" must be -ar, -er or -ir.",
      import_err_verb_type_mismatch: "verb #{n} ({inf}): type \"{type}\" doesn't match the infinitive's ending.",
      import_err_verb_bad_irregularity: "verb #{n} ({inf}): invalid \"irregularity\" value.",
      import_err_verb_bad_transitivity: "verb #{n} ({inf}): invalid \"transitivity\" value.",
      import_err_verb_missing_forms: "verb #{n} ({inf}): missing \"forms\" object.",
      import_err_verb_missing_field: "verb #{n} ({inf}): missing {field}.",
      import_warn_verb_cells: "verb #{n} ({inf}): declared \"regular\" but has cells marked that may not match the regular pattern — double check these.",
      import_err_word_missing: "word #{n}: missing \"word\" or \"definition\".",
      import_err_word_bad_pos: "word #{n} ({word}): invalid \"part_of_speech\" value.",
      import_err_word_bad_gender: "word #{n} ({word}): invalid \"gender\" value.",
      import_err_phrase_missing: "phrase #{n}: missing \"phrase\" or \"definition\".",
      import_err_phrase_bad_function: "phrase #{n} ({phrase}): invalid \"function\" value.",
      import_err_phrase_bad_register: "phrase #{n} ({phrase}): invalid \"register\" value.",
      import_json_result_summary: "Imported {vIns} new verb(s), {wIns} new word(s) and {pIns} new phrase(s); skipped {vSkip} verb(s), {wSkip} word(s) and {pSkip} phrase(s) you already had.",
      import_json_result_list_created: " Created the list “{name}”.",
      import_json_result_list_added: " Added to the list “{name}”: {added} item(s) ({already} already there).",
      import_json_result_list_error: " Couldn't process the list: {msg}"
    }
  };

  // Grammatical category "tags" — the values actually stored on a verb/word
  // (irregularity, transitivity, part of speech, gender, and the
  // reflexive/auxiliar/gustar-like flags) are canonical Spanish strings in
  // the database no matter what — only their on-screen label changes here.
  var TAG_LABELS = {
    "regular": { es: "regular", en: "regular" },
    "cambio de raíz": { es: "cambio de raíz", en: "stem-changing" },
    "irregular (yo)": { es: "irregular (yo)", en: "irregular (yo only)" },
    "irregular (total)": { es: "irregular (total)", en: "fully irregular" },
    "transitivo": { es: "transitivo", en: "transitive" },
    "intransitivo": { es: "intransitivo", en: "intransitive" },
    "ambos": { es: "ambos", en: "both" },
    "reflexivo": { es: "reflexivo", en: "reflexive" },
    "auxiliar": { es: "auxiliar", en: "auxiliary" },
    "dativo": { es: "dativo", en: "dative" },
    "sustantivo": { es: "sustantivo", en: "noun" },
    "adjetivo": { es: "adjetivo", en: "adjective" },
    "adverbio": { es: "adverbio", en: "adverb" },
    "pronombre": { es: "pronombre", en: "pronoun" },
    "preposición": { es: "preposición", en: "preposition" },
    "conjunción": { es: "conjunción", en: "conjunction" },
    "interjección": { es: "interjección", en: "interjection" },
    "masculino": { es: "masculino", en: "masculine" },
    "femenino": { es: "femenino", en: "feminine" },
    "neutro": { es: "neutro", en: "neuter" },
    // Phrase facets. "function" values below never collide with anything
    // above, so they go through the same tagLabel() lookup as verb/word
    // tags. Register's "neutro" would collide with the word-gender "neutro"
    // entry right above (same stored string, different English translation
    // needed — "neutral register" vs "neuter gender") — so register labels
    // are handled separately via the register_* I18N keys instead of this
    // dictionary; see registerLabel() below.
    "saludo": { es: "saludo", en: "greeting" },
    "despedida": { es: "despedida", en: "farewell" },
    "cortesía": { es: "cortesía", en: "courtesy" },
    "acuerdo": { es: "acuerdo", en: "agreement" },
    "desacuerdo": { es: "desacuerdo", en: "disagreement" },
    "sorpresa": { es: "sorpresa", en: "surprise" },
    "pregunta": { es: "pregunta", en: "question" },
    "muletilla": { es: "muletilla", en: "filler word" },
    "otro": { es: "otro", en: "other" },
    "idiomática": { es: "idiomática", en: "idiomatic" },
    "sabido": { es: "sabido", en: "known" }
  };

  // Register labels can't live in TAG_LABELS above (its "neutro" key is
  // already taken by word gender, with a different English translation) —
  // this is the phrase-register equivalent, keyed off the I18N dictionaries
  // instead via a "register_" prefix.
  function registerLabel(value) {
    return t("register_" + (value || "neutro"));
  }

  // Tense/mood names (NOT person/pronoun labels — see the big comment
  // above). Keyed by the same .key values TENSES/SUBJ_TENSES/
  // FLASH_MATRIX_COLUMNS already use, so applyGrammarLabels() can mutate
  // those shared objects' .label in place and every table/flashcard that
  // reads .label picks up the change with no further code changes.
  var TENSE_LABELS = {
    es: { presente: "Presente", preterito: "Pretérito", imperfecto: "Imperfecto", futuro: "Futuro", condicional: "Condicional", subjPresente: "Presente", subjPasado: "Pasado", imperativo: "Imperativo" },
    en: { presente: "Present", preterito: "Preterite", imperfecto: "Imperfect", futuro: "Future", condicional: "Conditional", subjPresente: "Present", subjPasado: "Past", imperativo: "Imperative" }
  };

  function t(key, vars) {
    var s = (I18N[currentLang] && I18N[currentLang][key]);
    if (s === undefined) s = (I18N.es[key] !== undefined ? I18N.es[key] : key);
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.split("{" + k + "}").join(vars[k]);
      });
    }
    return s;
  }

  function tagLabel(value) {
    var entry = TAG_LABELS[value];
    return entry ? entry[currentLang] : value;
  }

  // Walks the DOM applying data-i18n / data-i18n-placeholder / data-i18n-tag
  // attributes. Called once at startup and again whenever the language
  // changes, so static markup never needs its own per-language branches.
  function applyI18n(root) {
    var scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach(function (elx) {
      elx.textContent = t(elx.getAttribute("data-i18n"));
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach(function (elx) {
      elx.placeholder = t(elx.getAttribute("data-i18n-placeholder"));
    });
    scope.querySelectorAll("[data-i18n-aria-label]").forEach(function (elx) {
      elx.setAttribute("aria-label", t(elx.getAttribute("data-i18n-aria-label")));
    });
    scope.querySelectorAll("[data-i18n-tag]").forEach(function (elx) {
      elx.textContent = tagLabel(elx.getAttribute("data-i18n-tag"));
    });
    document.documentElement.lang = currentLang;
    // The three toolbar "load example X" buttons are set directly here
    // rather than through the data-i18n attribute walk above, since they
    // aren't static markup — see the matching empty-state seed buttons in
    // renderVerbList()/renderWordList()/renderPhraseList() below, which set
    // the same text the same way when they're (re)created. No count in the
    // label (mason, 2026-09-25: "there is no need to indicate the number of
    // defaults that will be added") — just "Cargar verbos de ejemplo" etc.
    if (el.seedToolbarBtn) el.seedToolbarBtn.textContent = t("seed_verbs_btn");
    if (el.seedWordsToolbarBtn) el.seedWordsToolbarBtn.textContent = t("seed_words_btn");
    if (el.seedPhrasesToolbarBtn) el.seedPhrasesToolbarBtn.textContent = t("seed_phrases_btn");
    applyQuietMode();
    // The backup panel's texts are set in code, not via data-i18n.
    if (el.backupStatus) { renderBackupStatus(); if (backupAction) openBackupPanel(backupAction); }
  }

  // ================= settings (app language, tts voice) =================
  function renderLangButtons() {
    el.langEs.classList.toggle("active", currentLang === "es");
    el.langEn.classList.toggle("active", currentLang === "en");
  }

  function renderVoiceButtons() {
    el.settingsVoiceElena.classList.toggle("active", ttsVoiceKey === "elena");
    el.settingsVoiceTomas.classList.toggle("active", ttsVoiceKey === "tomas");
  }

  // Mirrors setLang() below: device-local guess applied immediately, then
  // synced to the account (once one is signed in) the same way lang is.
  function setTtsVoice(voiceKey) {
    if ((voiceKey !== "elena" && voiceKey !== "tomas") || voiceKey === ttsVoiceKey) return;
    ttsVoiceKey = voiceKey;
    try { localStorage.setItem(TTS_VOICE_LOCAL_KEY, voiceKey); } catch (e) {}
    renderVoiceButtons();
    if (currentUser) {
      supabaseClient.from("user_settings")
        .upsert({ user_id: currentUser.id, tts_voice: voiceKey, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
        .then(function (res) {
          if (res.error) el.settingsMsg.textContent = t("msg_error_guardar", { msg: res.error.message });
        });
    }
  }

  // ---- Quiet mode ----
  // html.quiet-mode drives the muted icon (styles.css); the speaker
  // buttons' aria-labels say so too. Called at startup and from
  // applyI18n() (which would otherwise reset those labels).
  function applyQuietMode() {
    document.documentElement.classList.toggle("quiet-mode", quietMode);
    document.querySelectorAll(".flash-speak-btn, .detail-speak-btn").forEach(function (b) {
      b.setAttribute("aria-label", t(quietMode ? "tts_muted_aria" : "tts_play_aria"));
    });
    if (el.settingsQuietOn) {
      el.settingsQuietOn.classList.toggle("active", quietMode);
      el.settingsQuietOff.classList.toggle("active", !quietMode);
    }
    if (el.flashModeRead) renderFlashModeControls();
  }

  // ---- Backup / delete / restore (2026-10-01) ----
  // mason: back up creates a restorable copy of your content on the server
  // (Sabido included); delete removes your content from the app but not
  // the backup; restore brings it back, and when something is already in
  // the app you choose: the backup's version or the app's. All three run
  // as SQL functions (schema.sql, "Backup / delete / restore"), each one a
  // single transaction scoped to the signed-in user by RLS. This only
  // drives them and redraws.
  var backupInfo = null;    // last vosea_restore_preview() result
  var backupAction = null;  // "backup" | "delete" | "restore" while a panel is open
  var backupBusy = false;

  // "2 verbos, 15 palabras y 1 frase" — zeros left out, singular/plural.
  function backupCountsText(c) {
    c = c || {};
    var parts = [["verbs", "backup_unit_verb"], ["words", "backup_unit_word"], ["phrases", "backup_unit_phrase"], ["lists", "backup_unit_list"]]
      .filter(function (x) { return (c[x[0]] || 0) > 0; })
      .map(function (x) { var n = c[x[0]]; var u = t(x[1]).split("|"); return n + " " + (n === 1 ? u[0] : u[1]); });
    if (!parts.length) return t("backup_nothing");
    if (parts.length === 1) return parts[0];
    return parts.slice(0, -1).join(", ") + " " + t("backup_and") + " " + parts[parts.length - 1];
  }
  function currentContentCounts() {
    return { verbs: allVerbs.length, words: allWords.length, phrases: allPhrases.length, lists: allLists.length };
  }
  function backupDateText(iso) {
    try {
      return new Date(iso).toLocaleString(currentLang === "es" ? "es-AR" : "en-US", { dateStyle: "medium", timeStyle: "short" });
    } catch (e) { return String(iso || ""); }
  }
  function setBackupMsg(text, isError) {
    el.backupMsg.textContent = text || "";
    el.backupMsg.classList.toggle("is-error", !!isError);
  }
  function backupErrorText(err) {
    var m = (err && err.message) || String(err || "");
    if (/nothing_to_backup/.test(m)) return t("backup_err_empty");
    if (/no_backup/.test(m)) return t("backup_err_none");
    return t("msg_error_generic", { msg: m });
  }
  function renderBackupStatus() {
    var unavailable = backupInfo && backupInfo.unavailable;
    if (!backupInfo) el.backupStatus.textContent = t("backup_loading");
    else if (unavailable) el.backupStatus.textContent = t("backup_unavailable");
    else if (!backupInfo.exists) el.backupStatus.textContent = t("backup_none");
    else el.backupStatus.textContent = t("backup_last", { date: backupDateText(backupInfo.created_at), summary: backupCountsText(backupInfo.counts) });
    el.backupCreate.disabled = backupBusy || !backupInfo || !!unavailable;
    el.backupDelete.disabled = backupBusy || !backupInfo || !!unavailable;
    el.backupRestore.disabled = backupBusy || !backupInfo || !!unavailable || !backupInfo.exists;
  }
  function refreshBackupStatus() {
    if (!currentUser) return Promise.resolve(null);
    return supabaseClient.rpc("vosea_restore_preview").then(function (res) {
      backupInfo = res.error ? { unavailable: true, error: res.error } : (res.data || { exists: false });
      renderBackupStatus();
      return backupInfo;
    });
  }
  function closeBackupPanel() {
    backupAction = null;
    el.backupPanel.hidden = true;
    el.backupPanel.classList.remove("is-danger");
    el.backupConfirm.classList.remove("is-danger");
    el.backupChoice.hidden = true;
    el.backupTyped.hidden = true;
    el.backupTypedInput.value = "";
    el.backupChoice.querySelectorAll("input").forEach(function (r) { r.checked = false; });
  }
  function backupConflictTotal() {
    var c = (backupInfo && backupInfo.conflicts) || {};
    return (c.verbs || 0) + (c.words || 0) + (c.phrases || 0) + (c.lists || 0);
  }
  function updateBackupConfirmState() {
    var ok = !backupBusy;
    if (backupAction === "delete") ok = ok && el.backupTypedInput.value.trim().toUpperCase() === t("backup_delete_word");
    if (backupAction === "restore" && backupConflictTotal() > 0) ok = ok && !!el.backupChoice.querySelector("input:checked");
    el.backupConfirm.disabled = !ok;
  }
  function openBackupPanel(action) {
    closeBackupPanel();
    setBackupMsg("");
    backupAction = action;
    var cur = backupCountsText(currentContentCounts());
    var text = "";
    if (action === "backup") {
      text = t("backup_replace_text", { date: backupDateText(backupInfo.created_at), summary: backupCountsText(backupInfo.counts), current: cur });
      el.backupConfirm.textContent = t("backup_replace_confirm");
    } else if (action === "delete") {
      text = t("backup_delete_text", { current: cur }) + "\n" + (backupInfo.exists
        ? t("backup_delete_has_backup", { date: backupDateText(backupInfo.created_at), summary: backupCountsText(backupInfo.counts) })
        : t("backup_delete_no_backup"));
      el.backupTypedLabel.textContent = t("backup_delete_type");
      el.backupTyped.hidden = false;
      el.backupPanel.classList.add("is-danger");
      el.backupConfirm.classList.add("is-danger");
      el.backupConfirm.textContent = t("backup_delete_confirm");
    } else {
      var n = backupConflictTotal();
      text = t("backup_restore_text", { date: backupDateText(backupInfo.created_at), summary: backupCountsText(backupInfo.counts) }) + "\n" +
        (n > 0 ? t("backup_restore_conflicts", { n: n }) : t("backup_restore_no_conflicts"));
      el.backupChoice.hidden = n === 0;
      el.backupConfirm.textContent = t("backup_restore_confirm");
    }
    el.backupPanelText.textContent = text;
    el.backupPanel.hidden = false;
    updateBackupConfirmState();
    if (action === "delete") el.backupTypedInput.focus();
  }
  // After delete/restore the server's content changed wholesale: drop any
  // open detail page or flashcard deck that may point at a deleted item,
  // then reload everything the same way signing in does.
  function reloadAllContentAfterBackupOp() {
    deselectVerb();
    deselectWord();
    deselectPhrase();
    if (!el.flashOverlay.hidden) closeFlashcards();
    loadVerbs();
    loadWords();
    loadPhrases();
    loadLists();
  }
  function runBackupOp(promise, onOk) {
    backupBusy = true;
    setBackupMsg(t("backup_working"));
    renderBackupStatus();
    updateBackupConfirmState();
    return promise.then(function (res) {
      backupBusy = false;
      if (res.error) { setBackupMsg(backupErrorText(res.error), true); renderBackupStatus(); updateBackupConfirmState(); return; }
      closeBackupPanel();
      onOk(res.data || {});
      refreshBackupStatus();
    }, function (err) {
      backupBusy = false;
      setBackupMsg(backupErrorText(err), true);
      renderBackupStatus();
      updateBackupConfirmState();
    });
  }
  function doBackupCreate() {
    runBackupOp(supabaseClient.rpc("vosea_backup_content"), function (d) {
      setBackupMsg(t("backup_done", { summary: backupCountsText(d) }));
    });
  }
  function onBackupCreateClick() {
    if (!backupInfo || backupBusy) return;
    var c = currentContentCounts();
    if (!(c.verbs + c.words + c.phrases + c.lists)) { closeBackupPanel(); setBackupMsg(t("backup_err_empty"), true); return; }
    if (backupInfo.exists) openBackupPanel("backup"); else doBackupCreate();
  }
  function onBackupRestoreClick() {
    if (!backupInfo || backupBusy) return;
    // Fresh numbers: what's "already in the app" may have changed since
    // Settings opened.
    refreshBackupStatus().then(function (info) { if (info && info.exists) openBackupPanel("restore"); });
  }
  function onBackupConfirm() {
    if (el.backupConfirm.disabled) return;
    if (backupAction === "backup") { doBackupCreate(); return; }
    if (backupAction === "delete") {
      runBackupOp(supabaseClient.rpc("vosea_delete_content"), function (d) {
        reloadAllContentAfterBackupOp();
        setBackupMsg(t("backup_deleted", { summary: backupCountsText(d) }));
      });
      return;
    }
    if (backupAction === "restore") {
      var picked = el.backupChoice.querySelector("input:checked");
      var prefer = backupConflictTotal() > 0 && picked ? picked.value : "active";
      runBackupOp(supabaseClient.rpc("vosea_restore_content", { p_prefer: prefer }), function (d) {
        reloadAllContentAfterBackupOp();
        setBackupMsg(t("backup_restored", { ins: d.inserted || 0, ovw: d.overwritten || 0, kept: d.kept || 0 }));
      });
    }
  }

  function setQuietMode(on) {
    on = !!on;
    if (on === quietMode) return;
    quietMode = on;
    try { localStorage.setItem(QUIET_MODE_LOCAL_KEY, on ? "1" : "0"); } catch (e) {}
    if (on) {
      // Silence anything already playing, and clear its ring.
      if (ttsAudioEl) { try { ttsAudioEl.pause(); } catch (e) {} }
      if (ttsActiveEl) { ttsActiveEl.classList.remove("tts-active"); ttsActiveEl = null; }
    } else {
      hideQuietToast();
    }
    quietTapCount = 0;
    applyQuietMode();
  }

  // A tap on anything that would speak, while quiet mode is on. First tap:
  // a small shake of the icon. Second tap within a few seconds: a toast
  // saying quiet mode is on, with a shortcut to Settings (mason: "If a user
  // clicks/taps an audio icon a couple of times maybe a banner or pop up
  // displays that the quiet mode is active and can be disabled in the
  // configuration"). A toast rather than the page's status banner, since
  // that one sits under the flashcard overlay.
  function noteQuietTap(btn) {
    if (btn) {
      btn.classList.remove("quiet-nudge");
      void btn.offsetWidth;
      btn.classList.add("quiet-nudge");
    }
    quietTapCount++;
    clearTimeout(quietTapTimer);
    quietTapTimer = setTimeout(function () { quietTapCount = 0; }, 6000);
    if (quietTapCount >= 2) { quietTapCount = 0; showQuietToast(); }
  }

  function showQuietToast() {
    el.quietToast.hidden = false;
    clearTimeout(quietToastTimer);
    quietToastTimer = setTimeout(hideQuietToast, 5000);
  }
  function hideQuietToast() {
    clearTimeout(quietToastTimer);
    if (el.quietToast) el.quietToast.hidden = true;
  }

  function openSettings() {
    el.settingsMsg.textContent = "";
    renderLangButtons();
    renderVoiceButtons();
    applyQuietMode();
    closeBackupPanel();
    setBackupMsg("");
    backupInfo = null;
    renderBackupStatus();
    refreshBackupStatus();
    el.settingsOverlay.hidden = false;
  }

  function closeSettings() {
    el.settingsOverlay.hidden = true;
  }

  // Account menu (2026-09-25) — the kebab trigger opposite the "voseá"
  // wordmark that replaced the old always-visible email/settings/logout
  // row. Unlike the app's modals (settings, list filter, etc.), which sit
  // behind a full-screen dim .modal-overlay and only close via an explicit
  // button, this is a small popover with nothing behind it — so it also
  // needs to close on an outside click, which is new for this codebase.
  function closeAcctMenu() {
    el.acctMenu.hidden = true;
    el.acctTrigger.setAttribute("aria-expanded", "false");
  }

  function toggleAcctMenu(evt) {
    evt.stopPropagation();
    var willOpen = el.acctMenu.hidden;
    closeAcctMenu();
    if (willOpen) {
      el.acctMenu.hidden = false;
      el.acctTrigger.setAttribute("aria-expanded", "true");
    }
  }

  // Re-paints everything that was already rendered before the language
  // changed. applyI18n() covers static markup on its own, but anything
  // built dynamically in JS (badges, empty states, the flashcard setup
  // screen, whichever detail view is open) has its old-language text
  // baked into already-created DOM nodes and has to be rebuilt.
  function refreshAllTranslatedViews() {
    applyGrammarLabels();
    applyI18n();
    refreshListFilterUI();
    renderList();
    renderWordList();
    renderPhraseList();
    renderListsPanel();
    renderOfflineBanner();
    if (selectedId) selectVerb(selectedId);
    if (selectedWordId) selectWord(selectedWordId);
    renderTopicList();
    if (selectedTopicId) selectTopic(selectedTopicId, true);
    if (selectedListId && !el.listDetail.hidden) selectListRow(selectedListId);
    if (currentShareList) renderSharePreview();
    if (!el.flashcardsPanel.hidden) renderFlashSetup();
    if (!el.flashOverlay.hidden) renderFlashCard();
    renderLangButtons();
    refreshPracticeViews();
  }

  function setLang(lang) {
    if ((lang !== "en" && lang !== "es") || lang === currentLang) return;
    currentLang = lang;
    try { localStorage.setItem(LANG_LOCAL_KEY, lang); } catch (e) {}
    refreshAllTranslatedViews();
    if (currentUser) {
      supabaseClient.from("user_settings")
        .upsert({ user_id: currentUser.id, lang: lang, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
        .then(function (res) {
          if (res.error) el.settingsMsg.textContent = t("msg_error_guardar", { msg: res.error.message });
        });
    }
  }

  // Called right after login. The device-level localStorage guess (already
  // applied at startup, before we know who's logged in) avoids a flash of
  // the wrong language; this corrects it to the account's real, synced
  // preference once it's back from Supabase. A first-ever login has no row
  // yet (maybeSingle() returns null rather than erroring), which just
  // means the default ('en', see LANG_LOCAL_KEY above and schema.sql's
  // user_settings.lang column — 2026-09-26, mason's ask) stands until the
  // person picks something in settings.
  function loadUserSettings() {
    if (!currentUser) return;
    supabaseClient.from("user_settings").select("lang, tts_voice").eq("user_id", currentUser.id).maybeSingle().then(function (res) {
      if (res.error) return;
      var lang = (res.data && res.data.lang) || "en";
      if (lang !== currentLang) {
        currentLang = lang;
        try { localStorage.setItem(LANG_LOCAL_KEY, lang); } catch (e) {}
        refreshAllTranslatedViews();
      } else {
        renderLangButtons();
      }
      var voice = (res.data && res.data.tts_voice) || "elena";
      if (voice !== ttsVoiceKey) {
        ttsVoiceKey = voice;
        try { localStorage.setItem(TTS_VOICE_LOCAL_KEY, voice); } catch (e) {}
      }
      renderVoiceButtons();
    });
    loadPlayGoal();
  }

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

  // Mutates the shared TENSES/SUBJ_TENSES/FLASH_MATRIX_COLUMNS objects'
  // .label in place (their .key never changes, so every lookup/data
  // access that depends on .key is unaffected). Because FLASH_MATRIX_
  // COLUMNS was built with .concat() — which copies array slots, not the
  // objects themselves — the TENSES/SUBJ_TENSES entries inside it are the
  // very same objects, so one pass over each array is enough for every
  // table, flashcard prompt, etc. that reads .label to pick up the change.
  function applyGrammarLabels() {
    var dict = TENSE_LABELS[currentLang] || TENSE_LABELS.es;
    TENSES.forEach(function (x) { if (dict[x.key]) x.label = dict[x.key]; });
    SUBJ_TENSES.forEach(function (x) { if (dict[x.key]) x.label = dict[x.key]; });
    FLASH_MATRIX_COLUMNS.forEach(function (x) { if (dict[x.key]) x.label = dict[x.key]; });
  }

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
    { infinitive: "haber", definition: "to have (auxiliary)", type: "-er", irregularity: "irregular (total)", pattern: "fully irregular (auxiliary verb)", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: true, forms: { presente: { yo: "he", vos: "has", el: "ha", nosotros: "hemos", ellos: "han" }, preterito: { yo: "hube", vos: "hubiste", el: "hubo", nosotros: "hubimos", ellos: "hubieron" }, imperfecto: { yo: "había", vos: "habías", el: "había", nosotros: "habíamos", ellos: "habían" }, futuro: { yo: "habré", vos: "habrás", el: "habrá", nosotros: "habremos", ellos: "habrán" }, condicional: { yo: "habría", vos: "habrías", el: "habría", nosotros: "habríamos", ellos: "habrían" }, subjPresente: { yo: "haya", vos: "hayas", el: "haya", nosotros: "hayamos", ellos: "hayan" }, subjPasado: { yo: "hubiera", vos: "hubieras", el: "hubiera", nosotros: "hubiéramos", ellos: "hubieran" }, gerundio: "habiendo", participio: "habido", impersonal: { presente: "hay", preterito: "hubo", imperfecto: "había", futuro: "habrá", condicional: "habría", subjPresente: "haya" } } },
    { infinitive: "tener", definition: "to have", type: "-er", irregularity: "cambio de raíz", pattern: "stem-change e→ie + irregular yo", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: true, forms: { presente: { yo: "tengo", vos: "tenés", el: "tiene", nosotros: "tenemos", ellos: "tienen" }, preterito: { yo: "tuve", vos: "tuviste", el: "tuvo", nosotros: "tuvimos", ellos: "tuvieron" }, imperfecto: { yo: "tenía", vos: "tenías", el: "tenía", nosotros: "teníamos", ellos: "tenían" }, futuro: { yo: "tendré", vos: "tendrás", el: "tendrá", nosotros: "tendremos", ellos: "tendrán" }, condicional: { yo: "tendría", vos: "tendrías", el: "tendría", nosotros: "tendríamos", ellos: "tendrían" }, subjPresente: { yo: "tenga", vos: "tengas", el: "tenga", nosotros: "tengamos", ellos: "tengan" }, subjPasado: { yo: "tuviera", vos: "tuvieras", el: "tuviera", nosotros: "tuviéramos", ellos: "tuvieran" }, imperativo: { vos: "tené", usted: "tenga", nosotros: "tengamos", ustedes: "tengan" }, gerundio: "teniendo", participio: "tenido" } },
    { infinitive: "hacer", definition: "to do/make", type: "-er", irregularity: "irregular (yo)", pattern: "irregular yo + irregular preterite", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "hago", vos: "hacés", el: "hace", nosotros: "hacemos", ellos: "hacen" }, preterito: { yo: "hice", vos: "hiciste", el: "hizo", nosotros: "hicimos", ellos: "hicieron" }, imperfecto: { yo: "hacía", vos: "hacías", el: "hacía", nosotros: "hacíamos", ellos: "hacían" }, futuro: { yo: "haré", vos: "harás", el: "hará", nosotros: "haremos", ellos: "harán" }, condicional: { yo: "haría", vos: "harías", el: "haría", nosotros: "haríamos", ellos: "harían" }, subjPresente: { yo: "haga", vos: "hagas", el: "haga", nosotros: "hagamos", ellos: "hagan" }, subjPasado: { yo: "hiciera", vos: "hicieras", el: "hiciera", nosotros: "hiciéramos", ellos: "hicieran" }, imperativo: { vos: "hacé", usted: "haga", nosotros: "hagamos", ustedes: "hagan" }, gerundio: "haciendo", participio: "hecho" } },
    { infinitive: "poder", definition: "to be able to", type: "-er", irregularity: "cambio de raíz", pattern: "stem-change o→ue + irregular preterite", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: true, forms: { presente: { yo: "puedo", vos: "podés", el: "puede", nosotros: "podemos", ellos: "pueden" }, preterito: { yo: "pude", vos: "pudiste", el: "pudo", nosotros: "pudimos", ellos: "pudieron" }, imperfecto: { yo: "podía", vos: "podías", el: "podía", nosotros: "podíamos", ellos: "podían" }, futuro: { yo: "podré", vos: "podrás", el: "podrá", nosotros: "podremos", ellos: "podrán" }, condicional: { yo: "podría", vos: "podrías", el: "podría", nosotros: "podríamos", ellos: "podrían" }, subjPresente: { yo: "pueda", vos: "puedas", el: "pueda", nosotros: "podamos", ellos: "puedan" }, subjPasado: { yo: "pudiera", vos: "pudieras", el: "pudiera", nosotros: "pudiéramos", ellos: "pudieran" }, imperativo: { vos: "podé", usted: "pueda", nosotros: "podamos", ustedes: "puedan" }, gerundio: "pudiendo", participio: "podido" } },
    { infinitive: "decir", definition: "to say/tell", type: "-ir", irregularity: "cambio de raíz", pattern: "stem-change e→i + irregular yo + irregular preterite", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "digo", vos: "decís", el: "dice", nosotros: "decimos", ellos: "dicen" }, preterito: { yo: "dije", vos: "dijiste", el: "dijo", nosotros: "dijimos", ellos: "dijeron" }, imperfecto: { yo: "decía", vos: "decías", el: "decía", nosotros: "decíamos", ellos: "decían" }, futuro: { yo: "diré", vos: "dirás", el: "dirá", nosotros: "diremos", ellos: "dirán" }, condicional: { yo: "diría", vos: "dirías", el: "diría", nosotros: "diríamos", ellos: "dirían" }, subjPresente: { yo: "diga", vos: "digas", el: "diga", nosotros: "digamos", ellos: "digan" }, subjPasado: { yo: "dijera", vos: "dijeras", el: "dijera", nosotros: "dijéramos", ellos: "dijeran" }, imperativo: { vos: "decí", usted: "diga", nosotros: "digamos", ustedes: "digan" }, gerundio: "diciendo", participio: "dicho" } },
    { infinitive: "ir", definition: "to go", type: "-ir", irregularity: "irregular (total)", pattern: "fully irregular", reflexive: false, transitivity: "intransitivo", preposicion: "a", auxiliar: true, forms: { presente: { yo: "voy", vos: "vas", el: "va", nosotros: "vamos", ellos: "van" }, preterito: { yo: "fui", vos: "fuiste", el: "fue", nosotros: "fuimos", ellos: "fueron" }, imperfecto: { yo: "iba", vos: "ibas", el: "iba", nosotros: "íbamos", ellos: "iban" }, futuro: { yo: "iré", vos: "irás", el: "irá", nosotros: "iremos", ellos: "irán" }, condicional: { yo: "iría", vos: "irías", el: "iría", nosotros: "iríamos", ellos: "irían" }, subjPresente: { yo: "vaya", vos: "vayas", el: "vaya", nosotros: "vayamos", ellos: "vayan" }, subjPasado: { yo: "fuera", vos: "fueras", el: "fuera", nosotros: "fuéramos", ellos: "fueran" }, imperativo: { vos: "andá", usted: "vaya", nosotros: "vamos", ustedes: "vayan" }, gerundio: "yendo", participio: "ido" } },
    { infinitive: "ver", definition: "to see", type: "-er", irregularity: "irregular (total)", pattern: "irregular imperfect (veía) + irregular participle (visto)", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "veo", vos: "ves", el: "ve", nosotros: "vemos", ellos: "ven" }, preterito: { yo: "vi", vos: "viste", el: "vio", nosotros: "vimos", ellos: "vieron" }, imperfecto: { yo: "veía", vos: "veías", el: "veía", nosotros: "veíamos", ellos: "veían" }, futuro: { yo: "veré", vos: "verás", el: "verá", nosotros: "veremos", ellos: "verán" }, condicional: { yo: "vería", vos: "verías", el: "vería", nosotros: "veríamos", ellos: "verían" }, subjPresente: { yo: "vea", vos: "veas", el: "vea", nosotros: "veamos", ellos: "vean" }, subjPasado: { yo: "viera", vos: "vieras", el: "viera", nosotros: "viéramos", ellos: "vieran" }, imperativo: { vos: "ve", usted: "vea", nosotros: "veamos", ustedes: "vean" }, gerundio: "viendo", participio: "visto" } },
    { infinitive: "dar", definition: "to give", type: "-ar", irregularity: "irregular (yo)", pattern: "irregular preterite (di, dio) + irregular subjunctive (dé)", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "doy", vos: "das", el: "da", nosotros: "damos", ellos: "dan" }, preterito: { yo: "di", vos: "diste", el: "dio", nosotros: "dimos", ellos: "dieron" }, imperfecto: { yo: "daba", vos: "dabas", el: "daba", nosotros: "dábamos", ellos: "daban" }, futuro: { yo: "daré", vos: "darás", el: "dará", nosotros: "daremos", ellos: "darán" }, condicional: { yo: "daría", vos: "darías", el: "daría", nosotros: "daríamos", ellos: "darían" }, subjPresente: { yo: "dé", vos: "des", el: "dé", nosotros: "demos", ellos: "den" }, subjPasado: { yo: "diera", vos: "dieras", el: "diera", nosotros: "diéramos", ellos: "dieran" }, imperativo: { vos: "da", usted: "dé", nosotros: "demos", ustedes: "den" }, gerundio: "dando", participio: "dado" } },
    { infinitive: "saber", definition: "to know (facts/skills)", type: "-er", irregularity: "irregular (yo)", pattern: "irregular yo (sé) + irregular preterite + irregular future stem + irregular subjunctive", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "sé", vos: "sabés", el: "sabe", nosotros: "sabemos", ellos: "saben" }, preterito: { yo: "supe", vos: "supiste", el: "supo", nosotros: "supimos", ellos: "supieron" }, imperfecto: { yo: "sabía", vos: "sabías", el: "sabía", nosotros: "sabíamos", ellos: "sabían" }, futuro: { yo: "sabré", vos: "sabrás", el: "sabrá", nosotros: "sabremos", ellos: "sabrán" }, condicional: { yo: "sabría", vos: "sabrías", el: "sabría", nosotros: "sabríamos", ellos: "sabrían" }, subjPresente: { yo: "sepa", vos: "sepas", el: "sepa", nosotros: "sepamos", ellos: "sepan" }, subjPasado: { yo: "supiera", vos: "supieras", el: "supiera", nosotros: "supiéramos", ellos: "supieran" }, imperativo: { vos: "sabé", usted: "sepa", nosotros: "sepamos", ustedes: "sepan" }, gerundio: "sabiendo", participio: "sabido" } },
    { infinitive: "querer", definition: "to want/love", type: "-er", irregularity: "cambio de raíz", pattern: "stem-change e→ie + irregular preterite", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: true, forms: { presente: { yo: "quiero", vos: "querés", el: "quiere", nosotros: "queremos", ellos: "quieren" }, preterito: { yo: "quise", vos: "quisiste", el: "quiso", nosotros: "quisimos", ellos: "quisieron" }, imperfecto: { yo: "quería", vos: "querías", el: "quería", nosotros: "queríamos", ellos: "querían" }, futuro: { yo: "querré", vos: "querrás", el: "querrá", nosotros: "querremos", ellos: "querrán" }, condicional: { yo: "querría", vos: "querrías", el: "querría", nosotros: "querríamos", ellos: "querrían" }, subjPresente: { yo: "quiera", vos: "quieras", el: "quiera", nosotros: "queramos", ellos: "quieran" }, subjPasado: { yo: "quisiera", vos: "quisieras", el: "quisiera", nosotros: "quisiéramos", ellos: "quisieran" }, imperativo: { vos: "queré", usted: "quiera", nosotros: "queramos", ustedes: "quieran" }, gerundio: "queriendo", participio: "querido" } },
    { infinitive: "comer", definition: "to eat", type: "-er", irregularity: "regular", pattern: "regular -er", reflexive: false, transitivity: "ambos", preposicion: "", auxiliar: false, forms: { presente: { yo: "como", vos: "comés", el: "come", nosotros: "comemos", ellos: "comen" }, preterito: { yo: "comí", vos: "comiste", el: "comió", nosotros: "comimos", ellos: "comieron" }, imperfecto: { yo: "comía", vos: "comías", el: "comía", nosotros: "comíamos", ellos: "comían" }, futuro: { yo: "comeré", vos: "comerás", el: "comerá", nosotros: "comeremos", ellos: "comerán" }, condicional: { yo: "comería", vos: "comerías", el: "comería", nosotros: "comeríamos", ellos: "comerían" }, subjPresente: { yo: "coma", vos: "comas", el: "coma", nosotros: "comamos", ellos: "coman" }, subjPasado: { yo: "comiera", vos: "comieras", el: "comiera", nosotros: "comiéramos", ellos: "comieran" }, imperativo: { vos: "comé", usted: "coma", nosotros: "comamos", ustedes: "coman" }, gerundio: "comiendo", participio: "comido" } },
    { infinitive: "llamarse", definition: "to be called / to be named", type: "-ar", irregularity: "regular", pattern: "regular reflexive", reflexive: true, transitivity: "intransitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "me llamo", vos: "te llamás", el: "se llama", nosotros: "nos llamamos", ellos: "se llaman" }, preterito: { yo: "me llamé", vos: "te llamaste", el: "se llamó", nosotros: "nos llamamos", ellos: "se llamaron" }, imperfecto: { yo: "me llamaba", vos: "te llamabas", el: "se llamaba", nosotros: "nos llamábamos", ellos: "se llamaban" }, futuro: { yo: "me llamaré", vos: "te llamarás", el: "se llamará", nosotros: "nos llamaremos", ellos: "se llamarán" }, condicional: { yo: "me llamaría", vos: "te llamarías", el: "se llamaría", nosotros: "nos llamaríamos", ellos: "se llamarían" }, subjPresente: { yo: "me llame", vos: "te llames", el: "se llame", nosotros: "nos llamemos", ellos: "se llamen" }, subjPasado: { yo: "me llamara", vos: "te llamaras", el: "se llamara", nosotros: "nos llamáramos", ellos: "se llamaran" }, imperativo: { vos: "llamate", usted: "se llame", nosotros: "nos llamemos", ustedes: "se llamen" }, gerundio: "llamándose", participio: "llamado" } },
    { infinitive: "gustar", definition: "to be pleasing to / to like", type: "-ar", irregularity: "regular", pattern: "verbo \"tipo gustar\": el sujeto es lo que gusta; la persona lleva pronombre de objeto indirecto (me/te/le/nos/les). Ej.: \"Me gusta el café\" / \"Me gustan los perros\".", reflexive: false, transitivity: "intransitivo", preposicion: "", auxiliar: false, gustar_like: true, forms: { presente: { yo: "gusto", vos: "gustás", el: "gusta", nosotros: "gustamos", ellos: "gustan" }, preterito: { yo: "gusté", vos: "gustaste", el: "gustó", nosotros: "gustamos", ellos: "gustaron" }, imperfecto: { yo: "gustaba", vos: "gustabas", el: "gustaba", nosotros: "gustábamos", ellos: "gustaban" }, futuro: { yo: "gustaré", vos: "gustarás", el: "gustará", nosotros: "gustaremos", ellos: "gustarán" }, condicional: { yo: "gustaría", vos: "gustarías", el: "gustaría", nosotros: "gustaríamos", ellos: "gustarían" }, subjPresente: { yo: "guste", vos: "gustes", el: "guste", nosotros: "gustemos", ellos: "gusten" }, subjPasado: { yo: "gustara", vos: "gustaras", el: "gustara", nosotros: "gustáramos", ellos: "gustaran" }, imperativo: { vos: "gustá", usted: "guste", nosotros: "gustemos", ustedes: "gusten" }, gerundio: "gustando", participio: "gustado" } },
    // Added 2026-09-25 per mason: "it's a real miss to not include the verb
    // vosear in the default list" — genuinely on-theme for an app that's
    // specifically about rioplatense voseo. Fully regular -ar verb (no
    // spelling-change cells like the -car/-gar/-zar verbs elsewhere in this
    // project), so every form below follows the same regular -ar pattern as
    // "comer"/"llamarse" above, just with the -ar endings.
    { infinitive: "vosear", definition: "to address (someone) as \"vos\" (rather than \"tú\")", type: "-ar", irregularity: "regular", pattern: "regular -ar", reflexive: false, transitivity: "transitivo", preposicion: "", auxiliar: false, forms: { presente: { yo: "voseo", vos: "voseás", el: "vosea", nosotros: "voseamos", ellos: "vosean" }, preterito: { yo: "voseé", vos: "voseaste", el: "voseó", nosotros: "voseamos", ellos: "vosearon" }, imperfecto: { yo: "voseaba", vos: "voseabas", el: "voseaba", nosotros: "voseábamos", ellos: "voseaban" }, futuro: { yo: "vosearé", vos: "vosearás", el: "voseará", nosotros: "vosearemos", ellos: "vosearán" }, condicional: { yo: "vosearía", vos: "vosearías", el: "vosearía", nosotros: "vosearíamos", ellos: "vosearían" }, subjPresente: { yo: "vosee", vos: "vosees", el: "vosee", nosotros: "voseemos", ellos: "voseen" }, subjPasado: { yo: "voseara", vos: "vosearas", el: "voseara", nosotros: "voseáramos", ellos: "vosearan" }, imperativo: { vos: "voseá", usted: "vosee", nosotros: "voseemos", ustedes: "voseen" }, gerundio: "voseando", participio: "voseado" } },
  ];

  // ================= starter vocabulary (100 common words, offered to a brand-new account) =================
  var STARTER_WORDS = [
    { word: "amigo", definition: "friend (male)", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "amiga", definition: "friend (female)", part_of_speech: "sustantivo", gender: "femenino" },
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
    { word: "trabajo", definition: "work / job", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "tiempo", definition: "time / weather", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "día", definition: "day", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "año", definition: "year", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "dinero", definition: "money", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "libro", definition: "book", part_of_speech: "sustantivo", gender: "masculino" },
    { word: "casa", definition: "house", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "familia", definition: "family", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "vida", definition: "life", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "agua", definition: "water", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "comida", definition: "food", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "ciudad", definition: "city", part_of_speech: "sustantivo", gender: "femenino" },
    { word: "bueno", definition: "good", part_of_speech: "adjetivo", gender: "" },
    { word: "malo", definition: "bad", part_of_speech: "adjetivo", gender: "" },
    { word: "grande", definition: "big", part_of_speech: "adjetivo", gender: "" },
    { word: "pequeño", definition: "small", part_of_speech: "adjetivo", gender: "" },
    { word: "nuevo", definition: "new", part_of_speech: "adjetivo", gender: "" },
    { word: "viejo", definition: "old", part_of_speech: "adjetivo", gender: "" },
    { word: "bonito", definition: "pretty", part_of_speech: "adjetivo", gender: "" },
    { word: "feliz", definition: "happy", part_of_speech: "adjetivo", gender: "" },
    { word: "triste", definition: "sad", part_of_speech: "adjetivo", gender: "" },
    { word: "fácil", definition: "easy", part_of_speech: "adjetivo", gender: "" },
    { word: "difícil", definition: "difficult", part_of_speech: "adjetivo", gender: "" },
    { word: "importante", definition: "important", part_of_speech: "adjetivo", gender: "" },
    { word: "bien", definition: "well", part_of_speech: "adverbio", gender: "" },
    { word: "mal", definition: "badly", part_of_speech: "adverbio", gender: "" },
    { word: "muy", definition: "very", part_of_speech: "adverbio", gender: "" },
    { word: "mucho", definition: "a lot / much", part_of_speech: "adverbio", gender: "" },
    { word: "siempre", definition: "always", part_of_speech: "adverbio", gender: "" },
    { word: "yo", definition: "I", part_of_speech: "pronombre", gender: "" },
    { word: "vos", definition: "you (rioplatense informal)", part_of_speech: "pronombre", gender: "" },
    { word: "nosotros", definition: "we", part_of_speech: "pronombre", gender: "" },
    { word: "con", definition: "with", part_of_speech: "preposición", gender: "" },
    { word: "para", definition: "for / in order to", part_of_speech: "preposición", gender: "" },
    { word: "y", definition: "and", part_of_speech: "conjunción", gender: "" },
    { word: "pero", definition: "but", part_of_speech: "conjunción", gender: "" },
    { word: "hola", definition: "hi / hello", part_of_speech: "interjección", gender: "" },
    { word: "chau", definition: "bye", part_of_speech: "interjección", gender: "" }
  ];

  // ================= starter phrases (15 phrases, offered to a brand-new account) =================
  // Selection mirrors STARTER_VERBS/STARTER_WORDS above: at least one
  // example of every "function" value (the phrase equivalent of
  // part_of_speech) and every "register" value, plus a healthy mix of
  // idiomatic vs. literal so the idiomatic/literal fields aren't only ever
  // seen empty.
  var STARTER_PHRASES = [
    { phrase: "¿Qué onda?", definition: "what's up? / how's it going?", function: "saludo", register: "coloquial", idiomatic: true, literal: "what wave/vibe?" },
    { phrase: "¿Cómo andás?", definition: "how are you doing?", function: "saludo", register: "neutro", idiomatic: false, literal: "" },
    { phrase: "Nos vemos", definition: "see you later", function: "despedida", register: "neutro", idiomatic: false, literal: "" },
    { phrase: "Que la pases bien", definition: "take care / have a good one", function: "despedida", register: "coloquial", idiomatic: true, literal: "that you pass it well" },
    { phrase: "Por favor", definition: "please", function: "cortesía", register: "neutro", idiomatic: false, literal: "" },
    { phrase: "De nada", definition: "you're welcome", function: "cortesía", register: "neutro", idiomatic: false, literal: "" },
    { phrase: "Con permiso", definition: "excuse me (to pass by or enter)", function: "cortesía", register: "neutro", idiomatic: false, literal: "" },
    { phrase: "Dale", definition: "okay / sure / sounds good", function: "acuerdo", register: "coloquial", idiomatic: true, literal: "give it / go" },
    { phrase: "Ni loco", definition: "no way / not a chance", function: "desacuerdo", register: "coloquial", idiomatic: true, literal: "not even crazy" },
    { phrase: "¡No puede ser!", definition: "no way! / I can't believe it!", function: "sorpresa", register: "neutro", idiomatic: false, literal: "" },
    { phrase: "¡Qué quilombo!", definition: "what a mess!", function: "sorpresa", register: "lunfardo", idiomatic: true, literal: "\"quilombo\" = mess/chaos (originally \"brothel\")" },
    { phrase: "¿Viste?", definition: "you know? / see what I mean?", function: "muletilla", register: "coloquial", idiomatic: true, literal: "did you see?" },
    { phrase: "¿Me podés ayudar?", definition: "can you help me?", function: "pregunta", register: "neutro", idiomatic: false, literal: "" },
    { phrase: "¿Cuánto sale?", definition: "how much does it cost?", function: "pregunta", register: "coloquial", idiomatic: true, literal: "how much does it come out?" },
    { phrase: "Todo bien", definition: "all good / no worries / it's fine", function: "otro", register: "coloquial", idiomatic: true, literal: "all good" },
    // Added 2026-09-25 per mason's ask for "a really colloquial expression
    // that uses vos" — "cargar" here means to tease/mess with someone, a
    // very common porteño usage (not the literal "to load/charge"), so this
    // is genuinely idiomatic rather than just a sentence that happens to
    // contain the pronoun.
    { phrase: "¿Vos me estás cargando?", definition: "are you messing with me? / are you serious?", function: "sorpresa", register: "coloquial", idiomatic: true, literal: "are you loading/charging me?" }
  ];

  // ================= state =================
  var allVerbs = [];      // [{id, data}]

  // Alphabetical order for every content tab (mason, 2026-10-02). The
  // database's own ORDER BY uses the server's collation, which can put
  // accented letters and capitals in odd places and sorts "¿Cuánto sale?"
  // by its "¿". So each loaded array is sorted here instead, the Spanish
  // way: accents and case ignored (a = á = A), ñ after n, numbers in
  // numeric order, and leading punctuation (¿ ¡ « " … ( -) skipped.
  var SORT_COLLATOR = (typeof Intl !== "undefined" && Intl.Collator)
    ? new Intl.Collator("es", { sensitivity: "base", numeric: true })
    : null;
  function sortableText(s) {
    return String(s || "").replace(/^[\s¿¡«»"'“”‘’(\[\-–—….]+/, "");
  }
  function compareText(s, t2) {
    var x = sortableText(s), y = sortableText(t2);
    var c = SORT_COLLATOR ? SORT_COLLATOR.compare(x, y) : norm(x).localeCompare(norm(y));
    if (c) return c;
    // same letters ignoring accents/case (e.g. "papa" / "papá"): fixed order
    s = String(s || ""); t2 = String(t2 || "");
    return s < t2 ? -1 : (s > t2 ? 1 : 0);
  }
  function sortByText(entries, field) {
    return entries.sort(function (a, b) { return compareText(a.data[field], b.data[field]); });
  }
  // A list item / shared-list item: {data: {infinitive|word|phrase}}.
  function itemText(row) { var d = (row && row.data) || {}; return d.infinitive || d.word || d.phrase || ""; }
  function sortItemRows(rows) { return rows.sort(function (a, b) { return compareText(itemText(a), itemText(b)); }); }
  var filtered = [];
  var selectedId = null;
  var editingId = null;
  // Which reading (personal-subject vs. dative) the detail card shows for a
  // verb that is both gustar_like AND also_personal_use (e.g. "parecer") —
  // see the gustar-mode tabs in selectVerb(). Reset to "personal" whenever a
  // different verb is opened; irrelevant (and ignored) for every other verb.
  var detailGustarTab = "personal";
  // facet filters: each tag facet is tri-state per value — a value can be
  // "included" (must match, OR'd against other included values of the same
  // facet), "excluded" (must not match — excludes always win over includes,
  // even across different facets), or left neutral. Boolean flag facets
  // (reflexive/auxiliar/gustarLike, and idiomatic for phrases) are each
  // independently AND'd rather than OR'd — see flagOk(). The "list" facet
  // is multi-membership (an item can be in several lists) and follows the
  // same OR-within-include / excludes-win rule as tag facets, but — unlike
  // every other facet here — it is NOT per-tab. See sharedListFilter below.
  var activeVerbFilters = {
    type: { include: new Set(), exclude: new Set() },
    irregularity: { include: new Set(), exclude: new Set() },
    transitivity: { include: new Set(), exclude: new Set() },
    flag: { include: new Set(), exclude: new Set() }
  };

  var allWords = [];      // [{id, data}] — vocabulario (nouns, adjectives, etc.)
  var filteredWords = [];
  var selectedWordId = null;
  var editingWordId = null;
  var activeWordFilters = {
    pos: { include: new Set(), exclude: new Set() },
    gender: { include: new Set(), exclude: new Set() },
    flag: { include: new Set(), exclude: new Set() }
  };

  var allPhrases = [];    // [{id, data}] — short common phrases/expressions
  var filteredPhrases = [];
  var selectedPhraseId = null;
  var editingPhraseId = null;
  var activePhraseFilters = {
    function: { include: new Set(), exclude: new Set() },
    register: { include: new Set(), exclude: new Set() },
    flag: { include: new Set(), exclude: new Set() }
  };

  // The "Listas" facet — unlike every filter above, this ONE is shared
  // across verbs/words/phrases (and flashcard deck assembly, which just
  // draws from each tab's already-filtered pool): a list cuts across all
  // three content types, so reviewing one shouldn't mean toggling it on
  // separately per tab (2026-09-27, mason's ask, see handoff doc). Wrapped
  // in a { list: {include, exclude} } shape — rather than a bare
  // {include, exclude} — purely so the existing facetOk()/cycleFacetValue()/
  // chipVisualState()/listFacetOk()/anyFilterActive()/saveFilters()/
  // loadFilters() helpers, all written against a facets-keyed object, work
  // on it completely unchanged; "list" is just this object's only key.
  var sharedListFilter = { list: { include: new Set(), exclude: new Set() } };
  var SHARED_LIST_STORAGE_KEY = "iv-filters-lists-shared";
  // One-time upgrade path from the old per-tab list state (each tab's own
  // now-removed activeFilters.list, still sitting in iv-filters-verbs/
  // words/phrases from before this feature) into the new shared state —
  // union of every tab's includes, excludes winning on conflict, same
  // precedence listFacetOk() already gives excludes generally. Runs once,
  // guarded by SHARED_LIST_STORAGE_KEY already existing, so it never
  // clobbers a shared selection made after this shipped. Mason's call,
  // asked directly rather than decided silently (see handoff doc) — he
  // chose to migrate rather than drop the old per-tab state.
  function migrateLegacyPerTabListFilters() {
    try {
      if (localStorage.getItem(SHARED_LIST_STORAGE_KEY) != null) return; // already migrated (or already used)
      var include = new Set();
      var exclude = new Set();
      var sawAny = false;
      ["verbs", "words", "phrases"].forEach(function (tab) {
        var raw = localStorage.getItem(filtersStorageKey(tab));
        if (!raw) return;
        var saved = JSON.parse(raw);
        if (!saved || !saved.list) return;
        sawAny = true;
        (saved.list.include || []).forEach(function (id) { include.add(id); });
        (saved.list.exclude || []).forEach(function (id) { exclude.add(id); });
      });
      if (!sawAny) return;
      exclude.forEach(function (id) { include.delete(id); }); // excludes win on conflict
      include.forEach(function (id) { sharedListFilter.list.include.add(id); });
      exclude.forEach(function (id) { sharedListFilter.list.exclude.add(id); });
      saveFilters(SHARED_LIST_STORAGE_KEY, sharedListFilter);
    } catch (e) { /* corrupt/unavailable — start the shared filter neutral */ }
  }

  // shared lists — see schema.sql for the lists/list_items tables. Each list
  // is a named, curated subset of the user's own verbs or words; items are
  // stored as denormalized snapshots (see rowToList/addItemToList below).
  var allLists = [];      // [{id, data}]
  var selectedListId = null;
  var listPickerTarget = null; // { itemType: "verb"|"word", data } while #list-picker-overlay is open
  var listFilterTarget = null; // "verbs" | "words" | "phrases" — which tab's trigger opened #list-filter-overlay (the shared list facet itself is edited the same way regardless of tab; this only matters for reopening the modal in place)
  var currentShareList = null; // { listId, listName, ownerLabel, items } while previewing a ?share= link

  // Reverse membership maps rebuilt every time loadLists() runs (from the
  // full list_items rows, not just a count). list_items stores denormalized
  // snapshots rather than foreign keys to verbs/words/phrases (see
  // addItemToList/addImportSnapshotsToList), so membership can only be
  // matched by normalized name — norm(infinitive/word/phrase) -> Set<listId>
  // — same matching convention already used for duplicate-detection and by
  // the old per-list study-set builder this replaces. EMPTY_ID_SET is a
  // shared read-only fallback so lookups on a name with no lists don't need
  // a null check everywhere.
  var EMPTY_ID_SET = new Set();
  var verbListMembership = {};   // norm(infinitive) -> Set<listId>
  var wordListMembership = {};   // norm(word) -> Set<listId>
  var phraseListMembership = {}; // norm(phrase) -> Set<listId>

  // flashcards draw from whatever is currently filtered on the Verbos/
  // Vocabulario tabs (the "filtered"/"filteredWords" arrays above), plus
  // their own source toggle and tense/person filters below.
  var activeFlashSources = { verbs: true, words: true, phrases: true };
  // activeFlashCells holds every selected "tenseKey|personKey" grid cell
  // (see FLASH_MATRIX_COLUMNS/flashCellKey above) — starts with everything on.
  var activeFlashCells = new Set(flashAllCellKeys());
  // gerundio/participio have no person axis, so they're plain on/off toggles.
  var activeFlashStandalone = new Set(["gerundio", "participio"]);
  var flashDirection = "def2word"; // or "word2def"
  // Leer / Escuchar and auto-play (2026-10-03). Both remembered per device,
  // like quiet mode. "Escuchar" can't be used while quiet mode is on — see
  // effectiveFlashMode().
  var FLASH_MODE_LOCAL_KEY = "iv-flash-mode";
  var FLASH_AUTOPLAY_LOCAL_KEY = "iv-flash-autoplay";
  var flashMode = (function () { try { var m = localStorage.getItem(FLASH_MODE_LOCAL_KEY); return m === "escuchar" || m === "hablar" ? m : "leer"; } catch (e) { return "leer"; } })();
  var flashAutoPlay = (function () { try { return localStorage.getItem(FLASH_AUTOPLAY_LOCAL_KEY) === "1"; } catch (e) { return false; } })();
  var flashAutoToken = 0; // bumps on every card render, so a late auto-play for an old card is dropped
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
    acctTrigger: document.getElementById("acct-trigger"),
    acctMenu: document.getElementById("acct-menu"),
    acctMenuEmail: document.getElementById("acct-menu-email"),
    acctMenuSettings: document.getElementById("acct-menu-settings"),
    acctMenuLogout: document.getElementById("acct-menu-logout"),
    settingsOverlay: document.getElementById("settings-overlay"),
    settingsMsg: document.getElementById("settings-msg"),
    settingsClose: document.getElementById("settings-close"),
    settingsQuietOn: document.getElementById("settings-quiet-on"),
    settingsQuietOff: document.getElementById("settings-quiet-off"),
    quietToast: document.getElementById("quiet-toast"),
    quietToastSettings: document.getElementById("quiet-toast-settings"),
    backupStatus: document.getElementById("backup-status"),
    backupCreate: document.getElementById("backup-create"),
    backupRestore: document.getElementById("backup-restore"),
    backupDelete: document.getElementById("backup-delete"),
    backupPanel: document.getElementById("backup-panel"),
    backupPanelText: document.getElementById("backup-panel-text"),
    backupChoice: document.getElementById("backup-choice"),
    backupTyped: document.getElementById("backup-typed"),
    backupTypedLabel: document.getElementById("backup-typed-label"),
    backupTypedInput: document.getElementById("backup-typed-input"),
    backupConfirm: document.getElementById("backup-confirm"),
    backupCancel: document.getElementById("backup-cancel"),
    backupMsg: document.getElementById("backup-msg"),
    langEs: document.getElementById("lang-es"),
    langEn: document.getElementById("lang-en"),
    settingsVoiceElena: document.getElementById("settings-voice-elena"),
    settingsVoiceTomas: document.getElementById("settings-voice-tomas"),

    banner: document.getElementById("status-banner"),
    offlineBanner: document.getElementById("offline-banner"),
    offlineBannerText: document.getElementById("offline-banner-text"),
    search: document.getElementById("search"),
    count: document.getElementById("count"),
    list: document.getElementById("card-list"),
    detail: document.getElementById("detail"),
    dInfinitive: document.getElementById("d-infinitive"),
    dDefinition: document.getElementById("d-definition"),
    dSpeak: document.getElementById("d-speak"),
    dTtsMsg: document.getElementById("d-tts-msg"),
    dBadges: document.getElementById("d-badges"),
    dPattern: document.getElementById("d-pattern"),
    dPreposicion: document.getElementById("d-preposicion"),
    dNotes: document.getElementById("d-notes"),
    dExample: document.getElementById("d-example"),
    dTenseRow: document.getElementById("d-tense-row"),
    dConjBody: document.getElementById("d-conj-body"),
    dConjPronounBody: document.getElementById("d-conj-pronoun-body"),
    dConjLegend: document.getElementById("d-conj-legend"),
    dGustarLegend: document.getElementById("d-gustar-legend"),
    dKnownLegend: document.getElementById("d-known-legend"),
    dGustarTabs: document.getElementById("d-gustar-tabs"),
    dGustarTabPersonal: document.getElementById("d-gustar-tab-personal"),
    dGustarTabDativo: document.getElementById("d-gustar-tab-dativo"),
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
    fNotes: document.getElementById("f-notes"),
    fExample: document.getElementById("f-example"),
    fIrregularity: document.getElementById("f-irregularity"),
    fTransitivity: document.getElementById("f-transitivity"),
    fPreposicion: document.getElementById("f-preposicion"),
    fReflexive: document.getElementById("f-reflexive"),
    fAuxiliar: document.getElementById("f-auxiliar"),
    fGustarLike: document.getElementById("f-gustar-like"),
    fAlsoPersonalUseWrap: document.getElementById("f-also-personal-use-wrap"),
    fAlsoPersonalUse: document.getElementById("f-also-personal-use"),
    fGerundio: document.getElementById("f-gerundio"),
    fParticipio: document.getElementById("f-participio"),
    fRaeLookup: document.getElementById("f-rae-lookup"),
    imperativoFormRow: document.getElementById("imperativo-form-row"),
    verbFilters: document.getElementById("verb-filters"),
    verbFiltersClear: document.getElementById("verb-filters-clear"),
    verbListsGroup: document.getElementById("verb-lists-group"),
    verbListsTrigger: document.getElementById("verb-lists-trigger"),
    verbListsTriggerLabel: document.getElementById("verb-lists-trigger-label"),
    verbHiddenRow: document.getElementById("verb-hidden-row"),
    verbHiddenText: document.getElementById("verb-hidden-text"),
    verbShowAllBtn: document.getElementById("verb-show-all-btn"),

    tabVerbs: document.getElementById("tab-verbs"),
    tabWords: document.getElementById("tab-words"),
    tabPhrases: document.getElementById("tab-phrases"),
    tabFlashcards: document.getElementById("tab-flashcards"),
    verbsPanel: document.getElementById("verbs-panel"),
    wordsPanel: document.getElementById("words-panel"),
    phrasesPanel: document.getElementById("phrases-panel"),
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
    wdSpeak: document.getElementById("wd-speak"),
    wdTtsMsg: document.getElementById("wd-tts-msg"),
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
    wfRaeLookup: document.getElementById("wf-rae-lookup"),
    wordFilters: document.getElementById("word-filters"),
    wordFiltersClear: document.getElementById("word-filters-clear"),
    wordListsGroup: document.getElementById("word-lists-group"),
    wordListsTrigger: document.getElementById("word-lists-trigger"),
    wordListsTriggerLabel: document.getElementById("word-lists-trigger-label"),
    wordHiddenRow: document.getElementById("word-hidden-row"),
    wordHiddenText: document.getElementById("word-hidden-text"),
    wordShowAllBtn: document.getElementById("word-show-all-btn"),

    phraseSearch: document.getElementById("phrase-search"),
    phraseCount: document.getElementById("phrase-count"),
    phraseList: document.getElementById("phrase-list"),
    phraseDetail: document.getElementById("phrase-detail"),
    pdPhrase: document.getElementById("pd-phrase"),
    pdDefinition: document.getElementById("pd-definition"),
    pdBadges: document.getElementById("pd-badges"),
    pdLiteral: document.getElementById("pd-literal"),
    pdNotes: document.getElementById("pd-notes"),
    pdExample: document.getElementById("pd-example"),
    pdSpeak: document.getElementById("pd-speak"),
    pdTtsMsg: document.getElementById("pd-tts-msg"),
    pdEdit: document.getElementById("pd-edit"),
    pdDelete: document.getElementById("pd-delete"),
    toggleAddPhrase: document.getElementById("toggle-add-phrase"),
    seedPhrasesToolbarBtn: document.getElementById("seed-phrases-toolbar-btn"),
    phraseForm: document.getElementById("phrase-form"),
    phraseFormTitle: document.getElementById("phrase-form-title"),
    phraseFormMsg: document.getElementById("phrase-form-msg"),
    phraseFormCancel: document.getElementById("phrase-form-cancel"),
    pfPhrase: document.getElementById("pf-phrase"),
    pfDefinition: document.getElementById("pf-definition"),
    pfFunction: document.getElementById("pf-function"),
    pfRegister: document.getElementById("pf-register"),
    pfIdiomatic: document.getElementById("pf-idiomatic"),
    pfLiteralWrap: document.getElementById("pf-literal-wrap"),
    pfLiteral: document.getElementById("pf-literal"),
    pfNotes: document.getElementById("pf-notes"),
    pfExample: document.getElementById("pf-example"),
    phraseFilters: document.getElementById("phrase-filters"),
    phraseFiltersClear: document.getElementById("phrase-filters-clear"),
    phraseListsGroup: document.getElementById("phrase-lists-group"),
    phraseListsTrigger: document.getElementById("phrase-lists-trigger"),
    phraseListsTriggerLabel: document.getElementById("phrase-lists-trigger-label"),
    phraseHiddenRow: document.getElementById("phrase-hidden-row"),
    phraseHiddenText: document.getElementById("phrase-hidden-text"),
    phraseShowAllBtn: document.getElementById("phrase-show-all-btn"),

    flashSrcVerbs: document.getElementById("flash-src-verbs"),
    flashSrcWords: document.getElementById("flash-src-words"),
    flashSrcPhrases: document.getElementById("flash-src-phrases"),
    flashVerbCount: document.getElementById("flash-verb-count"),
    flashWordCount: document.getElementById("flash-word-count"),
    flashPhraseCount: document.getElementById("flash-phrase-count"),
    flashVerbOptions: document.getElementById("flash-verb-options"),
    flashWordOptions: document.getElementById("flash-word-options"),
    flashPresets: document.getElementById("flash-presets"),
    flashCustomToggle: document.getElementById("flash-custom-toggle"),
    flashCustom: document.getElementById("flash-custom"),
    flashPickAll: document.getElementById("flash-pick-all"),
    flashPickNone: document.getElementById("flash-pick-none"),
    flashDeckCount: document.getElementById("flash-deck-count"),
    flashDirDef: document.getElementById("flash-dir-def"),
    flashDirWord: document.getElementById("flash-dir-word"),
    flashSetupMsg: document.getElementById("flash-setup-msg"),
    flashStartBtn: document.getElementById("flash-start-btn"),

    flashOverlay: document.getElementById("flash-overlay"),
    flashCloseBtn: document.getElementById("flash-close-btn"),
    flashProgress: document.getElementById("flash-progress"),
    flashDoneClose: document.getElementById("flash-done-close"),
    flashDoneText: document.getElementById("flash-done-text"),
    flashCard: document.getElementById("flash-card"),
    flashFrontMain: document.getElementById("flash-front-main"),
    flashFrontSub: document.getElementById("flash-front-sub"),
    flashFrontSpeak: document.getElementById("flash-front-speak"),
    flashListenBtn: document.getElementById("flash-listen-btn"),
    flashListenFace: document.getElementById("flash-listen-face"),
    flashListenTag: document.getElementById("flash-listen-tag"),
    flashWave: document.getElementById("flash-wave"),
    flashBackMeta: document.getElementById("flash-back-meta"),
    flashModeRead: document.getElementById("flash-mode-read"),
    flashModeListen: document.getElementById("flash-mode-listen"),
    flashModeSpeak: document.getElementById("flash-mode-speak"),
    flashModeNote: document.getElementById("flash-mode-note"),
    flashAutoplay: document.getElementById("flash-autoplay"),
    flashAutoplayLabel: document.getElementById("flash-autoplay-label"),
    flashAutoplayNote: document.getElementById("flash-autoplay-note"),
    flashBackMain: document.getElementById("flash-back-main"),
    flashBackSub: document.getElementById("flash-back-sub"),
    flashBackSpeak: document.getElementById("flash-back-speak"),
    flashBackBadges: document.getElementById("flash-back-badges"),
    flashBackExample: document.getElementById("flash-back-example"),
    flashBackHeard: document.getElementById("flash-back-heard"),
    flashBackAnswer: document.getElementById("flash-back-answer"),
    flashBackSaidLabel: document.getElementById("flash-back-said-label"),
    flashBackSaidPre: document.getElementById("flash-back-said-pre"),
    flashBackPlay: document.getElementById("flash-back-play"),
    flashSpeakMic: document.getElementById("flash-speak-mic"),
    flashSpeakHint: document.getElementById("flash-speak-hint"),
    flashFrontCloze: document.getElementById("flash-front-cloze"),
    flashKnownToggle: document.getElementById("flash-known-toggle"),
    flashGrade: document.getElementById("flash-grade"),
    flashGradeOtra: document.getElementById("flash-grade-otra"),
    flashGradeBien: document.getElementById("flash-grade-bien"),
    flashTally: document.getElementById("flash-tally"),
    dKnown: document.getElementById("d-known"),
    wdKnown: document.getElementById("wd-known"),
    pdKnown: document.getElementById("pd-known"),
    flashTtsMsg: document.getElementById("flash-tts-msg"),
    flashPrevBtn: document.getElementById("flash-prev-btn"),
    flashNextBtn: document.getElementById("flash-next-btn"),
    flashArrowPrev: document.getElementById("flash-arrow-prev"),
    flashArrowNext: document.getElementById("flash-arrow-next"),

    tabLists: document.getElementById("tab-lists"),
    tabProgress: document.getElementById("tab-progress"),
    tabTopics: document.getElementById("tab-topics"),
    tabPlay: document.getElementById("tab-play"),
    playPanel: document.getElementById("play-panel"),
    playHome: document.getElementById("play-home"),
    playRacha: document.getElementById("play-racha"),
    playToday: document.getElementById("play-today"),
    playAlbumEntry: document.getElementById("play-album-entry"),
    playAlbumEntryText: document.getElementById("play-album-entry-text"),
    playAlbum: document.getElementById("play-album"),
    playAlbumBack: document.getElementById("play-album-back"),
    playAlbumDesc: document.getElementById("play-album-desc"),
    playAlbumGrid: document.getElementById("play-album-grid"),
    playAlbumLeft: document.getElementById("play-album-left"),
    playAlbumHow: document.getElementById("play-album-how"),
    playAlbumFine: document.getElementById("play-album-fine"),
    rewardOverlay: document.getElementById("reward-overlay"),
    rewardClose: document.getElementById("reward-close"),
    rewardKicker: document.getElementById("reward-kicker"),
    rewardWord: document.getElementById("reward-word"),
    rewardGloss: document.getElementById("reward-gloss"),
    rewardExample: document.getElementById("reward-example"),
    rewardNote: document.getElementById("reward-note"),
    rewardWhere: document.getElementById("reward-where"),
    rewardListen: document.getElementById("reward-listen"),
    rewardGo: document.getElementById("reward-go"),
    rewardMsg: document.getElementById("reward-msg"),
    flashCombo: document.getElementById("flash-combo"),
    playModes: document.getElementById("play-modes"),
    playMsg: document.getElementById("play-msg"),
    ptWhy: document.getElementById("pt-why"),
    ptNote: document.getElementById("pt-note"),
    ptSummary: document.getElementById("pt-summary"),
    flashHintLine: document.getElementById("flash-hint-line"),
    topicsPanel: document.getElementById("topics-panel"),
    topicList: document.getElementById("topic-list"),
    topicDetail: document.getElementById("topic-detail"),
    tdName: document.getElementById("td-name"),
    tdDesc: document.getElementById("td-desc"),
    tdLesson: document.getElementById("td-lesson"),
    tdRangesWrap: document.getElementById("td-ranges-wrap"),
    tdRanges: document.getElementById("td-ranges"),
    tdModeRead: document.getElementById("td-mode-read"),
    tdModeListen: document.getElementById("td-mode-listen"),
    tdModeSpeak: document.getElementById("td-mode-speak"),
    tdModeNote: document.getElementById("td-mode-note"),
    tdMsg: document.getElementById("td-msg"),
    tdStart: document.getElementById("td-start"),
    tdCount: document.getElementById("td-count"),
    tdSentencesWrap: document.getElementById("td-sentences-wrap"),
    tdSentencesToggle: document.getElementById("td-sentences-toggle"),
    tdSentences: document.getElementById("td-sentences"),
    flashTopicTag: document.getElementById("flash-topic-tag"),
    progressPanel: document.getElementById("progress-panel"),
    progressBody: document.getElementById("progress-body"),
    lastSession: document.getElementById("last-session"),
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
    ldPhrasesGroup: document.getElementById("ld-phrases-group"),
    ldPhrasesItems: document.getElementById("ld-phrases-items"),
    ldShareBtn: document.getElementById("ld-share-btn"),
    ldDelete: document.getElementById("ld-delete"),

    dAddToList: document.getElementById("d-add-to-list"),
    wdAddToList: document.getElementById("wd-add-to-list"),
    pdAddToList: document.getElementById("pd-add-to-list"),
    addFilteredToList: document.getElementById("add-filtered-to-list"),
    addFilteredWordsToList: document.getElementById("add-filtered-words-to-list"),
    addFilteredPhrasesToList: document.getElementById("add-filtered-phrases-to-list"),

    listPickerOverlay: document.getElementById("list-picker-overlay"),
    listPickerCount: document.getElementById("list-picker-count"),
    listPickerMsg: document.getElementById("list-picker-msg"),
    listPickerList: document.getElementById("list-picker-list"),
    listPickerNewName: document.getElementById("list-picker-new-name"),
    listPickerCreateBtn: document.getElementById("list-picker-create-btn"),
    listPickerClose: document.getElementById("list-picker-close"),

    listFilterOverlay: document.getElementById("list-filter-overlay"),
    listFilterSearch: document.getElementById("list-filter-search"),
    listFilterList: document.getElementById("list-filter-list"),
    listFilterClearBtn: document.getElementById("list-filter-clear-btn"),
    listFilterClose: document.getElementById("list-filter-close"),

    shareOverlay: document.getElementById("share-overlay"),
    shareCloseBtn: document.getElementById("share-close-btn"),
    shareName: document.getElementById("share-name"),
    shareMeta: document.getElementById("share-meta"),
    shareMsg: document.getElementById("share-msg"),
    shareItems: document.getElementById("share-items"),
    shareLoginNote: document.getElementById("share-login-note"),
    shareImportBtn: document.getElementById("share-import-btn"),
    shareImportResult: document.getElementById("share-import-result"),

    toggleImportJson: document.getElementById("toggle-import-json"),
    importJsonOverlay: document.getElementById("import-json-overlay"),
    importSpecPre: document.getElementById("import-spec-pre"),
    importSpecCopyBtn: document.getElementById("import-spec-copy-btn"),
    importSpecCopyMsg: document.getElementById("import-spec-copy-msg"),
    importJsonFile: document.getElementById("import-json-file"),
    importJsonTextarea: document.getElementById("import-json-textarea"),
    importJsonParseMsg: document.getElementById("import-json-parse-msg"),
    importJsonValidateBtn: document.getElementById("import-json-validate-btn"),
    importJsonPreview: document.getElementById("import-json-preview"),
    importJsonSummary: document.getElementById("import-json-summary"),
    importJsonErrorsWrap: document.getElementById("import-json-errors-wrap"),
    importJsonErrors: document.getElementById("import-json-errors"),
    importJsonWarningsWrap: document.getElementById("import-json-warnings-wrap"),
    importJsonWarnings: document.getElementById("import-json-warnings"),
    importJsonPreviewListWrap: document.getElementById("import-json-preview-list-wrap"),
    importJsonPreviewList: document.getElementById("import-json-preview-list"),
    importJsonResultMsg: document.getElementById("import-json-result-msg"),
    importJsonConfirmBtn: document.getElementById("import-json-confirm-btn"),
    importJsonCancelBtn: document.getElementById("import-json-cancel-btn")
  };

  function showBanner(msg) { el.banner.textContent = msg; el.banner.hidden = false; }
  function clearBanner() { el.banner.hidden = true; }

  // ================= offline cache (Tier A: read-only) =================
  // After every successful load of verbs/words/lists, the raw rows are
  // stashed in localStorage. If a later load fails — no network, or a
  // session that can't refresh while offline — the app falls back to that
  // last-saved copy instead of showing an empty/error screen. This is
  // deliberately read-only: adding, editing, sharing and importing still
  // require a live connection, and just show their normal error message
  // if they don't have one.
  var CACHE_PREFIX = "iv-cache-";
  var offlineKinds = {}; // kind ("verbs"/"words"/"lists") -> savedAt, present only while that kind is showing cached data

  function cacheKey(kind) {
    return CACHE_PREFIX + kind + "-" + (currentUser ? currentUser.id : "anon");
  }

  function saveCache(kind, rows) {
    try {
      localStorage.setItem(cacheKey(kind), JSON.stringify({ savedAt: Date.now(), rows: rows }));
    } catch (e) {
      // Storage full, disabled, or private browsing — offline fallback
      // just won't have anything to fall back to later; not fatal now.
    }
  }

  function readCache(kind) {
    try {
      var raw = localStorage.getItem(cacheKey(kind));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function formatCacheAge(savedAt) {
    var mins = Math.max(0, Math.round((Date.now() - savedAt) / 60000));
    if (mins < 1) return t("cache_age_moment");
    if (mins < 60) return t(mins === 1 ? "cache_age_minutes" : "cache_age_minutes_pl", { n: mins });
    var hours = Math.round(mins / 60);
    if (hours < 24) return t(hours === 1 ? "cache_age_hours" : "cache_age_hours_pl", { n: hours });
    var days = Math.round(hours / 24);
    return t(days === 1 ? "cache_age_days" : "cache_age_days_pl", { n: days });
  }

  function markOffline(kind, savedAt) {
    offlineKinds[kind] = savedAt;
    renderOfflineBanner();
  }

  function markOnline(kind) {
    delete offlineKinds[kind];
    renderOfflineBanner();
  }

  function renderOfflineBanner() {
    var kinds = Object.keys(offlineKinds);
    if (kinds.length === 0) { el.offlineBanner.hidden = true; return; }
    var oldest = Math.min.apply(null, kinds.map(function (k) { return offlineKinds[k]; }));
    el.offlineBannerText.textContent = t("offline_banner", { age: formatCacheAge(oldest) });
    el.offlineBanner.hidden = false;
  }

  function stripAccents(s) { return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function norm(s) { return stripAccents(s).toLowerCase().trim(); }

  // ================= filter chips (shared by verbs/vocabulario/frases) =================
  // Tri-state: every chip is neutral, "included" or "excluded". Tapping a
  // chip cycles neutral -> include -> exclude -> neutral. Excludes always
  // win over includes, even across different facets — a record excluded by
  // any facet is hidden regardless of what else matches. Within one facet,
  // includes are OR'd (matching any included value is enough); facets are
  // AND'd together, same as before. Pass ignoreExcludes:true to check only
  // the include side — used to compute the "hidden by your excludes" count.

  // Single-value tag facets (type/irregularity/transitivity/pos/gender/
  // function/register): value is a single string per record.
  function facetOk(activeFilters, facet, value, ignoreExcludes) {
    var state = activeFilters[facet];
    if (!state) return true;
    if (!ignoreExcludes && state.exclude.size && state.exclude.has(value)) return false;
    if (state.include.size && !state.include.has(value)) return false;
    return true;
  }

  // Boolean flag facets (reflexive/auxiliar/gustarLike on verbs, idiomatic
  // on phrases): each flag chip is independently AND'd, not OR'd — turning
  // on "reflexivo" AND "auxiliar" together means both must be true, same
  // as the app's original (pre-tri-state) flag behavior. getFlag(value)
  // returns whether the record has that boolean flag set.
  function flagOk(activeFilters, facet, getFlag, ignoreExcludes) {
    var state = activeFilters[facet];
    if (!state) return true;
    var ok = true;
    state.include.forEach(function (value) { if (!getFlag(value)) ok = false; });
    if (!ignoreExcludes) {
      state.exclude.forEach(function (value) { if (getFlag(value)) ok = false; });
    }
    return ok;
  }

  // The "list" facet: multi-membership (a record can be in several lists),
  // so it's OR-within-include / excludes-win, same shape as a tag facet,
  // just checked against a membership Set instead of a single value.
  function listFacetOk(activeFilters, membershipSet, ignoreExcludes) {
    var state = activeFilters.list;
    if (!state) return true;
    membershipSet = membershipSet || EMPTY_ID_SET;
    if (!ignoreExcludes && state.exclude.size) {
      var excluded = false;
      state.exclude.forEach(function (id) { if (membershipSet.has(id)) excluded = true; });
      if (excluded) return false;
    }
    if (state.include.size) {
      var included = false;
      state.include.forEach(function (id) { if (membershipSet.has(id)) included = true; });
      if (!included) return false;
    }
    return true;
  }

  function anyFilterActive(activeFilters) {
    return Object.keys(activeFilters).some(function (f) {
      var state = activeFilters[f];
      return state.include.size > 0 || state.exclude.size > 0;
    });
  }

  // neutral -> include -> exclude -> neutral
  function cycleFacetValue(activeFilters, facet, value) {
    var state = activeFilters[facet];
    if (!state) return;
    if (state.include.has(value)) {
      state.include.delete(value);
      state.exclude.add(value);
    } else if (state.exclude.has(value)) {
      state.exclude.delete(value);
    } else {
      state.include.add(value);
    }
  }

  function chipVisualState(activeFilters, facet, value) {
    var state = activeFilters[facet];
    if (!state) return "neutral";
    if (state.include.has(value)) return "include";
    if (state.exclude.has(value)) return "exclude";
    return "neutral";
  }

  function refreshChipVisuals(containerEl, activeFilters) {
    var chips = containerEl.querySelectorAll(".chip[data-facet]");
    for (var i = 0; i < chips.length; i++) {
      var chip = chips[i];
      var vstate = chipVisualState(activeFilters, chip.getAttribute("data-facet"), chip.getAttribute("data-value"));
      chip.classList.toggle("active", vstate === "include");
      chip.classList.toggle("exclude", vstate === "exclude");
    }
  }

  // Clears only the exclude side of every facet, leaving includes as they
  // are — this is what the per-tab "Mostrar todo" button does, since the
  // hidden-count it responds to only ever counts items hidden by excludes.
  function clearExcludesOnly(activeFilters) {
    Object.keys(activeFilters).forEach(function (f) { activeFilters[f].exclude.clear(); });
  }

  function filtersStorageKey(tabName) { return "iv-filters-" + tabName; }

  function saveFilters(storageKey, activeFilters) {
    try {
      var out = {};
      Object.keys(activeFilters).forEach(function (f) {
        out[f] = { include: Array.from(activeFilters[f].include), exclude: Array.from(activeFilters[f].exclude) };
      });
      localStorage.setItem(storageKey, JSON.stringify(out));
    } catch (e) { /* localStorage unavailable — filters just won't persist */ }
  }

  function loadFilters(storageKey, activeFilters) {
    try {
      var raw = localStorage.getItem(storageKey);
      if (!raw) return;
      var saved = JSON.parse(raw);
      Object.keys(activeFilters).forEach(function (f) {
        if (!saved[f]) return;
        (saved[f].include || []).forEach(function (v) { activeFilters[f].include.add(v); });
        (saved[f].exclude || []).forEach(function (v) { activeFilters[f].exclude.add(v); });
      });
    } catch (e) { /* corrupt or unavailable — start from neutral */ }
  }

  // Clears one tab's own tag facets (and its search box) — NOT the shared
  // Listas facet. Used by the list-aware empty-state's "clear the other
  // filters" action (see renderListAwareEmptyNote below): the whole point
  // there is to reveal items that ARE in the active list(s) but hidden by
  // this tab's own filters, so the list selection itself must survive. This
  // is deliberately narrower than wireFilterChips()'s "Limpiar filtros"
  // button, which (now that list is shared rather than per-tab) also only
  // touches this tab's own tag facets — clearing the shared list facet from
  // a single tab's button would otherwise silently drop it out from under
  // the other two tabs mid-review, so that's left to the list-filter modal's
  // own "Limpiar selección" or the picker's tri-state toggle instead.
  function clearTabFiltersOnly(tab) {
    var filters = activeFiltersForTab(tab);
    Object.keys(filters).forEach(function (f) { filters[f].include.clear(); filters[f].exclude.clear(); });
    saveFilters(filtersStorageKey(tab), filters);
    if (tab === "verbs") {
      el.search.value = "";
      refreshChipVisuals(el.verbFilters, activeVerbFilters);
      el.verbFiltersClear.hidden = !anyFilterActive(activeVerbFilters);
      renderList();
    } else if (tab === "words") {
      el.wordSearch.value = "";
      refreshChipVisuals(el.wordFilters, activeWordFilters);
      el.wordFiltersClear.hidden = !anyFilterActive(activeWordFilters);
      renderWordList();
    } else {
      el.phraseSearch.value = "";
      refreshChipVisuals(el.phraseFilters, activePhraseFilters);
      el.phraseFiltersClear.hidden = !anyFilterActive(activePhraseFilters);
      renderPhraseList();
    }
    updateListsTrigger(tab);
  }

  // Shared by renderList()/renderWordList()/renderPhraseList()'s empty
  // state. Only kicks in when the shared Listas facet is actually doing
  // something (an include or exclude is set) — otherwise the tab's own
  // plain "nothing matches your search" message applies as before. When the
  // facet is active, tells apart two cases the handoff asked to distinguish:
  // the active list(s) genuinely have no items of this content type, vs.
  // they do, but this tab's own tag filters (or search) are hiding them —
  // in which case a one-tap action clears just this tab's own filters,
  // leaving the list selection (and the other two tabs) alone. Reuses the
  // existing .empty-note/seed-btn styling rather than inventing new markup.
  // Returns true when it rendered something, so the caller skips its own
  // generic empty message.
  function renderListAwareEmptyNote(noteEl, opts) {
    var state = sharedListFilter.list;
    if (!state.include.size && !state.exclude.size) return false;
    var inLists = opts.allItems.filter(function (item) {
      return listFacetOk(sharedListFilter, opts.membership(item), false);
    });
    var p = document.createElement("p");
    if (inLists.length === 0) {
      p.textContent = t(opts.noneKey);
      noteEl.appendChild(p);
    } else {
      p.textContent = t(inLists.length === 1 ? opts.hiddenSKey : opts.hiddenPlKey, { n: inLists.length });
      noteEl.appendChild(p);
      var clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "seed-btn";
      clearBtn.textContent = t("empty_list_clear_filters_btn");
      clearBtn.addEventListener("click", opts.onClear);
      noteEl.appendChild(clearBtn);
    }
    return true;
  }

  // Event delegation (rather than one addEventListener per chip at wiring
  // time) so chips added later — the "Listas" group, rebuilt every time
  // loadLists() runs — react to clicks without being re-wired individually.
  function wireFilterChips(containerEl, clearBtnEl, activeFilters, storageKey, onChange) {
    containerEl.addEventListener("click", function (evt) {
      var chip = evt.target.closest(".chip[data-facet]");
      if (!chip || !containerEl.contains(chip)) return;
      var facet = chip.getAttribute("data-facet");
      var value = chip.getAttribute("data-value");
      cycleFacetValue(activeFilters, facet, value);
      refreshChipVisuals(containerEl, activeFilters);
      clearBtnEl.hidden = !anyFilterActive(activeFilters);
      saveFilters(storageKey, activeFilters);
      onChange();
    });
    clearBtnEl.addEventListener("click", function () {
      Object.keys(activeFilters).forEach(function (f) { activeFilters[f].include.clear(); activeFilters[f].exclude.clear(); });
      refreshChipVisuals(containerEl, activeFilters);
      clearBtnEl.hidden = true;
      saveFilters(storageKey, activeFilters);
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
    thImp.textContent = t("th_imp_abbrev");
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
    btn.dataset.itemId = id; // lets refreshKnownUi() patch this row in place

    var inf = document.createElement("span");
    inf.className = "inf";
    inf.textContent = data.infinitive || id;
    if (data.known) inf.appendChild(knownMark());
    btn.appendChild(inf);

    if (data.type) {
      var tb = document.createElement("span");
      tb.className = "badge type";
      tb.textContent = tagLabel(data.type);
      btn.appendChild(tb);
    }
    if (data.irregularity && data.irregularity !== "regular") {
      var ib = document.createElement("span");
      ib.className = "badge irregular";
      ib.textContent = tagLabel(data.irregularity);
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

  // Shared hidden-count row: how many items would show if the tab's active
  // excludes were lifted (includes and the search box still apply). Used by
  // every tab's "Mostrar todo" affordance.
  function renderHiddenCount(rowEl, textEl, hiddenCount) {
    if (hiddenCount > 0) {
      textEl.textContent = hiddenCount === 1 ? t("hidden_count_s", { n: hiddenCount }) : t("hidden_count_pl", { n: hiddenCount });
      rowEl.hidden = false;
    } else {
      rowEl.hidden = true;
    }
  }

  function verbPassesFacets(v, ignoreExcludes) {
    if (!facetOk(activeVerbFilters, "type", v.data.type || "", ignoreExcludes)) return false;
    if (!facetOk(activeVerbFilters, "irregularity", v.data.irregularity || "regular", ignoreExcludes)) return false;
    if (!facetOk(activeVerbFilters, "transitivity", v.data.transitivity || "transitivo", ignoreExcludes)) return false;
    // "flag" chips are independent boolean switches, not OR'd alternatives.
    if (!flagOk(activeVerbFilters, "flag", function (value) {
      if (value === "reflexive") return !!v.data.reflexive;
      if (value === "auxiliar") return !!v.data.auxiliar;
      if (value === "gustarLike") return !!v.data.gustar_like;
      if (value === "known") return !!v.data.known;
      return false;
    }, ignoreExcludes)) return false;
    if (!listFacetOk(sharedListFilter, verbListMembership[norm(v.data.infinitive || "")], ignoreExcludes)) return false;
    return true;
  }

  function renderList() {
    var q = norm(el.search.value);
    var searchOk = function (v) { return !q || norm(v.data.infinitive || v.id).indexOf(q) !== -1; };
    filtered = allVerbs.filter(function (v) { return searchOk(v) && verbPassesFacets(v, false); });
    var wouldShow = allVerbs.filter(function (v) { return searchOk(v) && verbPassesFacets(v, true); });
    filtered.sort(function (a, b) { return compareText(a.data.infinitive || a.id, b.data.infinitive || b.id); });
    renderHiddenCount(el.verbHiddenRow, el.verbHiddenText, wouldShow.length - filtered.length);

    el.list.innerHTML = "";
    if (filtered.length === 0) {
      var li = document.createElement("li");
      var note = document.createElement("div");
      note.className = "empty-note";
      if (allVerbs.length === 0) {
        var p = document.createElement("p");
        p.textContent = t("empty_no_verbs");
        note.appendChild(p);
        var seedBtn = document.createElement("button");
        seedBtn.type = "button";
        seedBtn.className = "seed-btn";
        seedBtn.textContent = t("seed_verbs_btn");
        seedBtn.addEventListener("click", seedStarterVerbs);
        note.appendChild(seedBtn);
      } else if (!renderListAwareEmptyNote(note, {
        allItems: allVerbs,
        membership: function (v) { return verbListMembership[norm(v.data.infinitive || "")]; },
        noneKey: "empty_list_no_verbs",
        hiddenSKey: "empty_list_hidden_verbs_s",
        hiddenPlKey: "empty_list_hidden_verbs_pl",
        onClear: function () { clearTabFiltersOnly("verbs"); }
      })) {
        var p2 = document.createElement("p");
        p2.textContent = t("empty_no_verb_match", { q: el.search.value });
        note.appendChild(p2);
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
    fitShortSelectionList(el.list);
    el.count.textContent = allVerbs.length ? (filtered.length + " / " + allVerbs.length) : "";
    updateFlashCounts();
  }

  // Short selection lists shrink to their rows plus one empty row-sized
  // slot (mason, 2026-09-28: "no more than 1 entry larger than the number
  // of entries"). The sizing itself is CSS (see #card-list in styles.css);
  // this only sets --slot to the AVERAGE height of the rows actually shown,
  // so the empty slot matches them — rows vary a lot on a phone (1–3 lines),
  // and the CSS fallback (a fifth of the full box) was built for the
  // starter content's longer rows. Only when there are 1–4 real rows; a
  // hidden tab's rows measure 0, so a ResizeObserver re-measures when the
  // list becomes visible or the width changes (rows re-wrap).
  var shortListObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver(function (entries) { entries.forEach(function (e) { measureShortListSlot(e.target); }); })
    : null;
  function measureShortListSlot(ul) {
    var rows = Array.prototype.filter.call(ul.children, function (c) { return c.tagName === "LI" && !c.querySelector(".empty-note"); });
    var total = 0;
    rows.forEach(function (li) { total += li.getBoundingClientRect().height; });
    if (rows.length && rows.length < 5 && total > 0) {
      var slot = Math.round(total / rows.length) + "px";
      if (ul.style.getPropertyValue("--slot") !== slot) ul.style.setProperty("--slot", slot);
    } else if (!rows.length || rows.length >= 5) {
      ul.style.removeProperty("--slot");
    }
  }
  function fitShortSelectionList(ul) {
    if (shortListObserver && !ul.__fitObserved) { shortListObserver.observe(ul); ul.__fitObserved = true; }
    measureShortListSlot(ul);
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
    if (id !== selectedId) detailGustarTab = "personal";
    selectedId = id;
    var entry = allVerbs.find(function (v) { return v.id === id; });
    if (!entry) { el.detail.hidden = true; return; }
    var data = entry.data;
    var forms = data.forms || {};
    // Quietly starts downloading the infinitive's audio the moment the verb
    // detail page opens, so it's likely already in the browser's cache by
    // the time someone taps the speak button — see prefetchTts() above.
    // Also the gerundio/participio — mason's own request (2026-09-25):
    // those two sit as their own standalone speakable tiles right on this
    // same page (not buried in the conjugation table), so a tap on either
    // is a likely-enough first move that it's worth the same head start as
    // the infinitive. Everything else in the table stays fetch-on-tap
    // only (plus the row/column prefetch once a cell IS tapped — see
    // prefetchAdjacentConjugationCells()), so glancing through many verbs
    // still doesn't download audio for forms nobody asked to hear.
    prefetchTts(data.infinitive);
    if (forms.gerundio) prefetchTts(forms.gerundio);
    if (forms.participio) prefetchTts(forms.participio);
    // A verb can be gustar_like AND also_personal_use (e.g. "parecer") — the
    // stored forms are identical either way, only the reinterpretation
    // differs, so a small tab control picks which one this render uses.
    // Every render decision below that used to read data.gustar_like
    // directly now reads effectiveGustar instead, so when the tabs aren't
    // shown at all (also_personal_use false, the common case) effectiveGustar
    // === data.gustar_like and behavior is unchanged. The dGustarLike BADGE
    // further down deliberately keeps reading data.gustar_like directly —
    // it reflects the verb's true canonical tag, not the active tab.
    var gustarDualMode = !!(data.gustar_like && data.also_personal_use);
    if (el.dGustarTabs) el.dGustarTabs.hidden = !gustarDualMode;
    if (gustarDualMode) {
      el.dGustarTabPersonal.classList.toggle("active", detailGustarTab === "personal");
      el.dGustarTabDativo.classList.toggle("active", detailGustarTab === "dativo");
    }
    var effectiveGustar = gustarDualMode ? (detailGustarTab === "dativo") : !!data.gustar_like;

    el.dInfinitive.textContent = data.infinitive || id;
    el.dDefinition.textContent = data.definition || "";
    el.dBadges.innerHTML = "";
    if (data.type) el.dBadges.appendChild(badge("type", tagLabel(data.type)));
    el.dBadges.appendChild(badge("irregular", tagLabel(data.irregularity || "regular")));
    el.dBadges.appendChild(badge("transitivity", tagLabel(data.transitivity || "transitivo")));
    if (data.reflexive) el.dBadges.appendChild(badge("reflexive", tagLabel("reflexivo")));
    if (data.auxiliar) el.dBadges.appendChild(badge("auxiliar", tagLabel("auxiliar")));
    if (data.gustar_like) el.dBadges.appendChild(badge("gustarLike", tagLabel("dativo")));
    appendKnownToggle(el.dBadges, el.dKnown, data.known);
    el.dPattern.textContent = data.pattern || "";
    el.dPattern.style.display = data.pattern ? "" : "none";
    el.dPreposicion.textContent = data.preposicion ? t("preposicion_note", { prep: data.preposicion }) : "";
    el.dPreposicion.style.display = data.preposicion ? "" : "none";
    // Usage notes + example (2026-10-01, same treatment as words): the
    // list-specific sense of a verb lives here, not in its definition.
    el.dNotes.textContent = data.notes || "";
    el.dNotes.style.display = data.notes ? "" : "none";
    el.dExample.textContent = data.example || "";
    el.dExample.style.display = data.example ? "" : "none";
    el.dTtsMsg.textContent = "";

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
        if (imper.vos) td.classList.add("speakable");
        td.dataset.formKey = flashCellKey("imperativo", "vos");
        return td;
      }
      if (personKey === "nosotros") {
        td.textContent = imper.nosotros || "—";
        if (imper.nosotros) td.classList.add("speakable");
        td.dataset.formKey = flashCellKey("imperativo", "nosotros");
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
      // Speakable text here is just the .real span (usted/ustedes) — not
      // the full "— / — / <real>" td.textContent — see the tap-to-hear
      // click handler below, which special-cases td.imp-col for this.
      if (realVal) td.classList.add("speakable");
      td.dataset.formKey = flashCellKey("imperativo", personKey);
      return td;
    }

    buildTenseHeader();
    el.dConjBody.innerHTML = "";
    el.dConjPronounBody.innerHTML = "";
    if (el.dConjLegend) el.dConjLegend.style.display = effectiveGustar ? "none" : "";
    if (el.dGustarLegend) el.dGustarLegend.style.display = effectiveGustar ? "" : "none";
    PERSONS.forEach(function (p) {
      var prTr = document.createElement("tr");
      var prTh = document.createElement("th");
      prTh.textContent = effectiveGustar ? GUSTAR_LIKE_PERSON[p.key].label : p.label;
      prTr.appendChild(prTh);
      el.dConjPronounBody.appendChild(prTr);

      var tr = document.createElement("tr");
      TENSES.forEach(function (t) {
        var td = document.createElement("td");
        if (effectiveGustar) {
          var gText = gustarCellText(forms, t.key, p.key);
          td.textContent = gText;
          if (gText !== "—") td.classList.add("speakable");
        } else {
          var val = (forms[t.key] && forms[t.key][p.key]) || "";
          td.textContent = val || "—";
          if (isCellIrregular(data, t.key, p.key, val)) td.classList.add("irreg");
          if (val) td.classList.add("speakable");
        }
        td.dataset.formKey = flashCellKey(t.key, p.key); // see paintVerbFormMarks()
        tr.appendChild(td);
      });
      SUBJ_TENSES.forEach(function (t) {
        var tdSubj = document.createElement("td");
        if (effectiveGustar) {
          var gSubjText = gustarCellText(forms, t.key, p.key);
          tdSubj.textContent = gSubjText;
          if (gSubjText !== "—") tdSubj.classList.add("speakable");
        } else {
          var subjVal = (forms[t.key] && forms[t.key][p.key]) || "";
          tdSubj.textContent = subjVal || "—";
          if (isCellIrregular(data, t.key, p.key, subjVal)) tdSubj.classList.add("irreg");
          if (subjVal) tdSubj.classList.add("speakable");
        }
        tdSubj.dataset.formKey = flashCellKey(t.key, p.key);
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
        if (imp[t.key]) td.classList.add("speakable");
        td.dataset.formKey = flashCellKey(t.key, "impersonal");
        impTr.appendChild(td);
      });
      SUBJ_TENSES.forEach(function (t) {
        var impTdSubj = document.createElement("td");
        impTdSubj.textContent = imp[t.key] || "—";
        if (imp[t.key]) impTdSubj.classList.add("speakable");
        impTdSubj.dataset.formKey = flashCellKey(t.key, "impersonal");
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
    el.dGerundio.classList.toggle("speakable", !!forms.gerundio);
    el.dParticipio.textContent = forms.participio || "—";
    el.dParticipio.classList.toggle("speakable", !!forms.participio);
    paintVerbFormMarks(data); // per-form Sabido checks (tiles carry data-form-key in index.html)

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
    renderItemHistory("verb");
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
    impTh.textContent = t("impersonal_optional");
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
    el.fNotes.value = "";
    el.fExample.value = "";
    el.fIrregularity.value = "regular";
    el.fTransitivity.value = "transitivo";
    el.fPreposicion.value = "";
    el.fReflexive.checked = false;
    el.fAuxiliar.checked = false;
    el.fGustarLike.checked = false;
    el.fAlsoPersonalUse.checked = false;
    el.fAlsoPersonalUseWrap.hidden = true;
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
    el.fNotes.value = data.notes || "";
    el.fExample.value = data.example || "";
    el.fIrregularity.value = data.irregularity || "regular";
    el.fTransitivity.value = data.transitivity || "transitivo";
    el.fPreposicion.value = data.preposicion || "";
    el.fReflexive.checked = !!data.reflexive;
    el.fAuxiliar.checked = !!data.auxiliar;
    el.fGustarLike.checked = !!data.gustar_like;
    el.fAlsoPersonalUse.checked = !!data.also_personal_use;
    el.fAlsoPersonalUseWrap.hidden = !data.gustar_like;
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
      notes: el.fNotes.value.trim(),
      example: el.fExample.value.trim(),
      transitivity: el.fTransitivity.value,
      preposicion: el.fPreposicion.value.trim(),
      reflexive: el.fReflexive.checked,
      auxiliar: el.fAuxiliar.checked,
      gustar_like: el.fGustarLike.checked,
      also_personal_use: el.fGustarLike.checked && el.fAlsoPersonalUse.checked,
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
        notes: row.notes || "",
        example: row.example || "",
        transitivity: row.transitivity || "transitivo",
        preposicion: row.preposicion || "",
        reflexive: !!row.reflexive,
        auxiliar: !!row.auxiliar,
        gustar_like: !!row.gustar_like,
        also_personal_use: !!row.also_personal_use,
        known: !!row.known,
        known_forms: row.known_forms || {},
        forms_en: row.forms_en || {},
        forms_en_sig: row.forms_en_sig || "",
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
        if (res.error) throw res.error;
        saveCache("verbs", res.data || []);
        markOnline("verbs");
        clearBanner();
        var prevById = {};
        allVerbs.forEach(function (v) { prevById[v.id] = v.data; });
        allVerbs = sortByText((res.data || []).map(rowToVerb), "infinitive");
        carryOverVerbGlosses(prevById, allVerbs);
        renderList();
        queueVerbGlosses(); // fills in English for any verb that's missing/outdated — see verb-gloss section
        if (selectedId) {
          var still = allVerbs.find(function (v) { return v.id === selectedId; });
          if (still) selectVerb(selectedId); else { el.detail.hidden = true; selectedId = null; }
        }
      })
      .catch(function (err) {
        var cached = readCache("verbs");
        if (!cached) { showBanner(t("msg_error_cargar_verbos", { msg: (err && err.message) || err })); return; }
        allVerbs = sortByText(cached.rows.map(rowToVerb), "infinitive");
        markOffline("verbs", cached.savedAt);
        renderList();
      });
  }

  function handleSubmit(evt) {
    evt.preventDefault();
    var data = collectFormData();
    if (!data.infinitive) { el.formMsg.textContent = t("msg_falta_infinitivo"); return; }
    el.formMsg.textContent = t("msg_guardando");

    var query = editingId
      ? supabaseClient.from("verbs").update(data).eq("id", editingId).select().single()
      : supabaseClient.from("verbs").insert(data).select().single();

    query.then(function (res) {
      if (res.error) { el.formMsg.textContent = t("msg_error_guardar", { msg: res.error.message }); return; }
      var savedId = res.data.id;
      verbGlossPriorityId = savedId;
      closeForm();
      loadVerbs().then(function () { selectVerb(savedId); });
    });
  }

  function handleDelete() {
    if (!selectedId) return;
    if (!window.confirm(t("confirm_delete_verb"))) return;
    supabaseClient.from("verbs").delete().eq("id", selectedId).then(function (res) {
      if (res.error) { showBanner(t("msg_no_pudo_eliminar", { msg: res.error.message })); return; }
      el.detail.hidden = true;
      selectedId = null;
      loadVerbs();
    });
  }

  // Supabase's bulk insert sends one INSERT statement for the whole array,
  // with its column list derived from whichever keys appear across ALL the
  // rows put together. A key that's only set on SOME rows (e.g. gustar_like
  // is only ever written on the handful of gustar-type verbs in
  // STARTER_VERBS) still becomes a real column in that statement, and every
  // OTHER row silently gets an explicit NULL for it — not the column's own
  // default — which then trips its "not null" constraint. Explicitly
  // filling in every optional field here, on every row, keeps the batch
  // uniform so this can't happen again no matter which verbs
  // STARTER_VERBS ends up with in the future.
  function normalizeStarterVerb(sv) {
    return {
      infinitive: sv.infinitive,
      definition: sv.definition || "",
      type: sv.type || "-ar",
      irregularity: sv.irregularity || "regular",
      pattern: sv.pattern || "",
      notes: sv.notes || "",
      example: sv.example || "",
      reflexive: !!sv.reflexive,
      transitivity: sv.transitivity || "transitivo",
      preposicion: sv.preposicion || "",
      auxiliar: !!sv.auxiliar,
      gustar_like: !!sv.gustar_like,
      also_personal_use: !!sv.also_personal_use,
      known: !!sv.known,
      forms: sv.forms || {}
    };
  }

  function seedStarterVerbs() {
    var existing = {};
    allVerbs.forEach(function (v) { existing[norm(v.data.infinitive || "")] = true; });
    var toInsert = STARTER_VERBS.filter(function (sv) { return !existing[norm(sv.infinitive)]; }).map(normalizeStarterVerb);
    if (toInsert.length === 0) {
      showBanner(t("msg_ya_tenes_verbos_ejemplo"));
      return;
    }
    supabaseClient.from("verbs").insert(toInsert).then(function (res) {
      if (res.error) { showBanner(t("msg_no_pudieron_cargar_verbos", { msg: res.error.message })); return; }
      loadVerbs();
    });
  }

  // ================= vocabulario (general words) =================
  function setMainTab(tab) {
    el.tabVerbs.classList.toggle("active", tab === "verbs");
    el.tabWords.classList.toggle("active", tab === "words");
    el.tabPhrases.classList.toggle("active", tab === "phrases");
    el.tabFlashcards.classList.toggle("active", tab === "flashcards");
    el.tabLists.classList.toggle("active", tab === "lists");
    el.tabProgress.classList.toggle("active", tab === "progress");
    el.tabTopics.classList.toggle("active", tab === "topics");
    el.tabPlay.classList.toggle("active", tab === "play");
    el.topicsPanel.hidden = tab !== "topics";
    el.playPanel.hidden = tab !== "play";
    el.progressPanel.hidden = tab !== "progress";
    el.verbsPanel.hidden = tab !== "verbs";
    el.wordsPanel.hidden = tab !== "words";
    el.phrasesPanel.hidden = tab !== "phrases";
    el.flashcardsPanel.hidden = tab !== "flashcards";
    el.listsPanel.hidden = tab !== "lists";
    if (tab === "flashcards") { renderFlashSetup(); renderLastSession(); }
    if (tab === "lists") {
      loadLists();
      loadPracticeHistory(false).then(function () { if (!el.listsPanel.hidden) decorateListRows(); });
    }
    if (tab === "progress") renderProgress();
    if (tab === "play") {
      albumOpen = false; // the tab always opens on its home; the album is one tap in
      renderPlay();
      if (currentUser) {
        loadPracticeHistory(false).then(function () { if (!el.playPanel.hidden) { renderPlay(); playCheckRacha(); } });
        loadRewards();
        loadGameRecords();
      }
    }
    if (tab === "topics") {
      renderTopicList();
      if (currentUser) loadPracticeHistory(false).then(function () { if (!el.topicsPanel.hidden) { renderTopicList(); if (selectedTopicId) renderItemHistory("topic"); } });
    }
    try { localStorage.setItem("iv-main-tab", tab); } catch (e) {}
  }

  function wordCardRow(id, data) {
    var li = document.createElement("li");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card-row";
    btn.dataset.itemId = id;

    var w = document.createElement("span");
    w.className = "inf";
    w.textContent = data.word || id;
    if (data.known) w.appendChild(knownMark());
    btn.appendChild(w);

    if (data.partOfSpeech) btn.appendChild(badge("type", tagLabel(data.partOfSpeech)));
    if (data.gender) btn.appendChild(badge("gender", tagLabel(data.gender)));

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

  function wordPassesFacets(v, ignoreExcludes) {
    if (!facetOk(activeWordFilters, "pos", v.data.partOfSpeech || "", ignoreExcludes)) return false;
    if (!facetOk(activeWordFilters, "gender", v.data.gender || "", ignoreExcludes)) return false;
    if (!flagOk(activeWordFilters, "flag", function (value) {
      if (value === "known") return !!v.data.known;
      return false;
    }, ignoreExcludes)) return false;
    if (!listFacetOk(sharedListFilter, wordListMembership[norm(v.data.word || "")], ignoreExcludes)) return false;
    return true;
  }

  function renderWordList() {
    var q = norm(el.wordSearch.value);
    var searchOk = function (v) { return !q || norm(v.data.word || v.id).indexOf(q) !== -1; };
    filteredWords = allWords.filter(function (v) { return searchOk(v) && wordPassesFacets(v, false); });
    var wouldShow = allWords.filter(function (v) { return searchOk(v) && wordPassesFacets(v, true); });
    filteredWords.sort(function (a, b) { return compareText(a.data.word || a.id, b.data.word || b.id); });
    renderHiddenCount(el.wordHiddenRow, el.wordHiddenText, wouldShow.length - filteredWords.length);

    el.wordList.innerHTML = "";
    if (filteredWords.length === 0) {
      var li = document.createElement("li");
      var note = document.createElement("div");
      note.className = "empty-note";
      if (allWords.length === 0) {
        var p = document.createElement("p");
        p.textContent = t("empty_no_words");
        note.appendChild(p);
        var seedWordsBtn = document.createElement("button");
        seedWordsBtn.type = "button";
        seedWordsBtn.className = "seed-btn";
        seedWordsBtn.textContent = t("seed_words_btn");
        seedWordsBtn.addEventListener("click", seedStarterWords);
        note.appendChild(seedWordsBtn);
      } else if (!renderListAwareEmptyNote(note, {
        allItems: allWords,
        membership: function (v) { return wordListMembership[norm(v.data.word || "")]; },
        noneKey: "empty_list_no_words",
        hiddenSKey: "empty_list_hidden_words_s",
        hiddenPlKey: "empty_list_hidden_words_pl",
        onClear: function () { clearTabFiltersOnly("words"); }
      })) {
        var p2 = document.createElement("p");
        p2.textContent = t("empty_no_word_match", { q: el.wordSearch.value });
        note.appendChild(p2);
      }
      li.appendChild(note);
      el.wordList.appendChild(li);
    } else {
      filteredWords.forEach(function (v) { el.wordList.appendChild(wordCardRow(v.id, v.data)); });
    }
    // See the matching comment in renderList(): reset scroll position so a
    // filter that shrinks the list can't leave it scrolled past its own end.
    el.wordList.scrollTop = 0;
    fitShortSelectionList(el.wordList);
    el.wordCount.textContent = allWords.length ? (filteredWords.length + " / " + allWords.length) : "";
    updateFlashCounts();
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
    prefetchTts(data.word); // see prefetchTts() above

    el.wdWord.textContent = data.word || id;
    el.wdDefinition.textContent = data.definition || "";
    el.wdBadges.innerHTML = "";
    if (data.partOfSpeech) el.wdBadges.appendChild(badge("type", tagLabel(data.partOfSpeech)));
    if (data.gender) el.wdBadges.appendChild(badge("gender", tagLabel(data.gender)));
    appendKnownToggle(el.wdBadges, el.wdKnown, data.known);
    el.wdNotes.textContent = data.notes || "";
    el.wdNotes.style.display = data.notes ? "" : "none";
    el.wdExample.textContent = data.example || "";
    el.wdExample.style.display = data.example ? "" : "none";
    el.wdTtsMsg.textContent = "";

    el.wordDetail.hidden = false;
    el.wordDetail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    renderItemHistory("word");
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
        example: row.example || "",
        known: !!row.known
      }
    };
  }

  function loadWords() {
    return supabaseClient
      .from("words")
      .select("*")
      .order("word", { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        saveCache("words", res.data || []);
        markOnline("words");
        clearBanner();
        allWords = sortByText((res.data || []).map(rowToWord), "word");
        renderWordList();
        if (selectedWordId) {
          var still = allWords.find(function (v) { return v.id === selectedWordId; });
          if (still) selectWord(selectedWordId); else { el.wordDetail.hidden = true; selectedWordId = null; }
        }
      })
      .catch(function (err) {
        var cached = readCache("words");
        if (!cached) { showBanner(t("msg_error_cargar_vocab", { msg: (err && err.message) || err })); return; }
        allWords = sortByText(cached.rows.map(rowToWord), "word");
        markOffline("words", cached.savedAt);
        renderWordList();
      });
  }

  function handleWordSubmit(evt) {
    evt.preventDefault();
    var data = collectWordFormData();
    if (!data.word) { el.wordFormMsg.textContent = t("msg_falta_palabra"); return; }
    el.wordFormMsg.textContent = t("msg_guardando");

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
      if (res.error) { el.wordFormMsg.textContent = t("msg_error_guardar", { msg: res.error.message }); return; }
      var savedId = res.data.id;
      closeWordForm();
      loadWords().then(function () { selectWord(savedId); });
    });
  }

  function handleWordDelete() {
    if (!selectedWordId) return;
    if (!window.confirm(t("confirm_delete_word"))) return;
    supabaseClient.from("words").delete().eq("id", selectedWordId).then(function (res) {
      if (res.error) { showBanner(t("msg_no_pudo_eliminar", { msg: res.error.message })); return; }
      el.wordDetail.hidden = true;
      selectedWordId = null;
      loadWords();
    });
  }

  // Same reasoning as normalizeStarterVerb above — keeps every row in the
  // batch insert carrying the same explicit set of keys, regardless of
  // which optional fields any individual STARTER_WORDS entry happens to set.
  function normalizeStarterWord(sw) {
    return {
      word: sw.word,
      definition: sw.definition || "",
      part_of_speech: sw.part_of_speech || "sustantivo",
      gender: sw.gender || "",
      notes: sw.notes || "",
      example: sw.example || ""
    };
  }

  function seedStarterWords() {
    var existing = {};
    allWords.forEach(function (v) { existing[norm(v.data.word || "")] = true; });
    var toInsert = STARTER_WORDS.filter(function (sw) { return !existing[norm(sw.word)]; }).map(normalizeStarterWord);
    if (toInsert.length === 0) {
      showBanner(t("msg_ya_tenes_palabras_ejemplo"));
      return;
    }
    supabaseClient.from("words").insert(toInsert).then(function (res) {
      if (res.error) { showBanner(t("msg_no_pudieron_cargar_palabras", { msg: res.error.message })); return; }
      loadWords();
    });
  }

  // ================= phrases =================
  // Short common phrases/expressions — structurally a near-mirror of the
  // words CRUD block above, but with its own facets (function/register/
  // idiomatic+literal) instead of part_of_speech/gender. See schema.sql's
  // "Frases" section for why phrases got their own table rather than a
  // part_of_speech: "frase" tag inside words.

  function phraseCardRow(id, data) {
    var li = document.createElement("li");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card-row";
    btn.dataset.itemId = id;

    var p = document.createElement("span");
    p.className = "inf";
    p.textContent = data.phrase || id;
    if (data.known) p.appendChild(knownMark());
    btn.appendChild(p);

    if (data.function) btn.appendChild(badge("type", tagLabel(data.function)));
    if (data.register && data.register !== "neutro") btn.appendChild(badge("register", registerLabel(data.register)));
    if (data.idiomatic) btn.appendChild(badge("idiomatic", tagLabel("idiomática")));

    var def = document.createElement("span");
    def.className = "def";
    def.textContent = data.definition || "";
    btn.appendChild(def);

    btn.addEventListener("click", function () {
      if (selectedPhraseId === id) deselectPhrase(); else selectPhrase(id);
    });
    li.appendChild(btn);
    return li;
  }

  function phrasePassesFacets(v, ignoreExcludes) {
    if (!facetOk(activePhraseFilters, "function", v.data.function || "", ignoreExcludes)) return false;
    if (!facetOk(activePhraseFilters, "register", v.data.register || "", ignoreExcludes)) return false;
    if (!flagOk(activePhraseFilters, "flag", function (value) {
      if (value === "idiomatic") return !!v.data.idiomatic;
      if (value === "known") return !!v.data.known;
      return false;
    }, ignoreExcludes)) return false;
    if (!listFacetOk(sharedListFilter, phraseListMembership[norm(v.data.phrase || "")], ignoreExcludes)) return false;
    return true;
  }

  function renderPhraseList() {
    var q = norm(el.phraseSearch.value);
    var searchOk = function (v) { return !q || norm(v.data.phrase || v.id).indexOf(q) !== -1; };
    filteredPhrases = allPhrases.filter(function (v) { return searchOk(v) && phrasePassesFacets(v, false); });
    var wouldShow = allPhrases.filter(function (v) { return searchOk(v) && phrasePassesFacets(v, true); });
    filteredPhrases.sort(function (a, b) { return compareText(a.data.phrase || a.id, b.data.phrase || b.id); });
    renderHiddenCount(el.phraseHiddenRow, el.phraseHiddenText, wouldShow.length - filteredPhrases.length);

    el.phraseList.innerHTML = "";
    if (filteredPhrases.length === 0) {
      var li = document.createElement("li");
      var note = document.createElement("div");
      note.className = "empty-note";
      if (allPhrases.length === 0) {
        var p = document.createElement("p");
        p.textContent = t("empty_no_phrases");
        note.appendChild(p);
        var seedPhrasesBtn = document.createElement("button");
        seedPhrasesBtn.type = "button";
        seedPhrasesBtn.className = "seed-btn";
        seedPhrasesBtn.textContent = t("seed_phrases_btn");
        seedPhrasesBtn.addEventListener("click", seedStarterPhrases);
        note.appendChild(seedPhrasesBtn);
      } else if (!renderListAwareEmptyNote(note, {
        allItems: allPhrases,
        membership: function (v) { return phraseListMembership[norm(v.data.phrase || "")]; },
        noneKey: "empty_list_no_phrases",
        hiddenSKey: "empty_list_hidden_phrases_s",
        hiddenPlKey: "empty_list_hidden_phrases_pl",
        onClear: function () { clearTabFiltersOnly("phrases"); }
      })) {
        var p2 = document.createElement("p");
        p2.textContent = t("empty_no_phrase_match", { q: el.phraseSearch.value });
        note.appendChild(p2);
      }
      li.appendChild(note);
      el.phraseList.appendChild(li);
    } else {
      filteredPhrases.forEach(function (v) { el.phraseList.appendChild(phraseCardRow(v.id, v.data)); });
    }
    el.phraseList.scrollTop = 0;
    fitShortSelectionList(el.phraseList);
    el.phraseCount.textContent = allPhrases.length ? (filteredPhrases.length + " / " + allPhrases.length) : "";
    updateFlashCounts();
  }

  function deselectPhrase() {
    selectedPhraseId = null;
    el.phraseDetail.hidden = true;
  }

  function selectPhrase(id) {
    selectedPhraseId = id;
    var entry = allPhrases.find(function (v) { return v.id === id; });
    if (!entry) { el.phraseDetail.hidden = true; return; }
    var data = entry.data;
    prefetchTts(data.phrase); // see prefetchTts() above

    el.pdPhrase.textContent = data.phrase || id;
    el.pdDefinition.textContent = data.definition || "";
    el.pdBadges.innerHTML = "";
    if (data.function) el.pdBadges.appendChild(badge("type", tagLabel(data.function)));
    if (data.register && data.register !== "neutro") el.pdBadges.appendChild(badge("register", registerLabel(data.register)));
    if (data.idiomatic) el.pdBadges.appendChild(badge("idiomatic", tagLabel("idiomática")));
    appendKnownToggle(el.pdBadges, el.pdKnown, data.known);
    el.pdLiteral.textContent = data.literal || "";
    el.pdLiteral.style.display = (data.idiomatic && data.literal) ? "" : "none";
    el.pdNotes.textContent = data.notes || "";
    el.pdNotes.style.display = data.notes ? "" : "none";
    el.pdExample.textContent = data.example || "";
    el.pdExample.style.display = data.example ? "" : "none";
    el.pdTtsMsg.textContent = "";

    el.phraseDetail.hidden = false;
    el.phraseDetail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    renderItemHistory("phrase");
  }

  function clearPhraseForm() {
    el.pfPhrase.value = "";
    el.pfDefinition.value = "";
    el.pfFunction.value = "otro";
    el.pfRegister.value = "neutro";
    el.pfIdiomatic.checked = false;
    el.pfLiteralWrap.hidden = true;
    el.pfLiteral.value = "";
    el.pfNotes.value = "";
    el.pfExample.value = "";
  }

  function fillPhraseForm(data) {
    el.pfPhrase.value = data.phrase || "";
    el.pfDefinition.value = data.definition || "";
    el.pfFunction.value = data.function || "otro";
    el.pfRegister.value = data.register || "neutro";
    el.pfIdiomatic.checked = !!data.idiomatic;
    el.pfLiteralWrap.hidden = !data.idiomatic;
    el.pfLiteral.value = data.literal || "";
    el.pfNotes.value = data.notes || "";
    el.pfExample.value = data.example || "";
  }

  function openPhraseForm(mode, data) {
    editingPhraseId = mode === "edit" ? selectedPhraseId : null;
    el.phraseFormTitle.textContent = mode === "edit" ? t("form_title_edit_phrase") : t("form_title_add_phrase");
    el.phraseFormMsg.textContent = "";
    if (mode === "edit" && data) fillPhraseForm(data); else clearPhraseForm();
    el.phraseForm.hidden = false;
    el.toggleAddPhrase.hidden = true;
    el.seedPhrasesToolbarBtn.hidden = true;
    el.pfPhrase.focus();
    el.phraseForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function closePhraseForm() {
    el.phraseForm.hidden = true;
    el.toggleAddPhrase.hidden = false;
    el.seedPhrasesToolbarBtn.hidden = false;
    editingPhraseId = null;
    el.phraseFormMsg.textContent = "";
  }

  function collectPhraseFormData() {
    return {
      phrase: el.pfPhrase.value.trim(),
      definition: el.pfDefinition.value.trim(),
      function: el.pfFunction.value,
      register: el.pfRegister.value,
      idiomatic: el.pfIdiomatic.checked,
      literal: el.pfLiteral.value.trim(),
      notes: el.pfNotes.value.trim(),
      example: el.pfExample.value.trim()
    };
  }

  function rowToPhrase(row) {
    return {
      id: row.id,
      data: {
        phrase: row.phrase,
        definition: row.definition || "",
        function: row.function || "otro",
        register: row.register || "neutro",
        idiomatic: !!row.idiomatic,
        literal: row.literal || "",
        notes: row.notes || "",
        example: row.example || "",
        known: !!row.known
      }
    };
  }

  function loadPhrases() {
    return supabaseClient
      .from("phrases")
      .select("*")
      .order("phrase", { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        saveCache("phrases", res.data || []);
        markOnline("phrases");
        clearBanner();
        allPhrases = sortByText((res.data || []).map(rowToPhrase), "phrase");
        renderPhraseList();
        if (selectedPhraseId) {
          var still = allPhrases.find(function (v) { return v.id === selectedPhraseId; });
          if (still) selectPhrase(selectedPhraseId); else { el.phraseDetail.hidden = true; selectedPhraseId = null; }
        }
      })
      .catch(function (err) {
        var cached = readCache("phrases");
        if (!cached) { showBanner(t("msg_error_cargar_frases", { msg: (err && err.message) || err })); return; }
        allPhrases = sortByText(cached.rows.map(rowToPhrase), "phrase");
        markOffline("phrases", cached.savedAt);
        renderPhraseList();
      });
  }

  function handlePhraseSubmit(evt) {
    evt.preventDefault();
    var data = collectPhraseFormData();
    if (!data.phrase) { el.phraseFormMsg.textContent = t("msg_falta_frase"); return; }
    el.phraseFormMsg.textContent = t("msg_guardando");

    var row = {
      phrase: data.phrase,
      definition: data.definition,
      function: data.function,
      register: data.register,
      idiomatic: data.idiomatic,
      literal: data.literal,
      notes: data.notes,
      example: data.example
    };

    var query = editingPhraseId
      ? supabaseClient.from("phrases").update(row).eq("id", editingPhraseId).select().single()
      : supabaseClient.from("phrases").insert(row).select().single();

    query.then(function (res) {
      if (res.error) { el.phraseFormMsg.textContent = t("msg_error_guardar", { msg: res.error.message }); return; }
      var savedId = res.data.id;
      closePhraseForm();
      loadPhrases().then(function () { selectPhrase(savedId); });
    });
  }

  function handlePhraseDelete() {
    if (!selectedPhraseId) return;
    if (!window.confirm(t("confirm_delete_phrase"))) return;
    supabaseClient.from("phrases").delete().eq("id", selectedPhraseId).then(function (res) {
      if (res.error) { showBanner(t("msg_no_pudo_eliminar", { msg: res.error.message })); return; }
      el.phraseDetail.hidden = true;
      selectedPhraseId = null;
      loadPhrases();
    });
  }

  // Same reasoning as normalizeStarterVerb/normalizeStarterWord above.
  function normalizeStarterPhrase(sp) {
    return {
      phrase: sp.phrase,
      definition: sp.definition || "",
      function: sp.function || "otro",
      register: sp.register || "neutro",
      idiomatic: !!sp.idiomatic,
      literal: sp.literal || "",
      notes: sp.notes || "",
      example: sp.example || ""
    };
  }

  function seedStarterPhrases() {
    var existing = {};
    allPhrases.forEach(function (v) { existing[norm(v.data.phrase || "")] = true; });
    var toInsert = STARTER_PHRASES.filter(function (sp) { return !existing[norm(sp.phrase)]; }).map(normalizeStarterPhrase);
    if (toInsert.length === 0) {
      showBanner(t("msg_ya_tenes_frases_ejemplo"));
      return;
    }
    supabaseClient.from("phrases").insert(toInsert).then(function (res) {
      if (res.error) { showBanner(t("msg_no_pudieron_cargar_frases", { msg: res.error.message })); return; }
      loadPhrases();
    });
  }

  // ================= flashcards =================
  // Tense/person picker (2026-09-28 redesign, option "D" from a mockup
  // comparison mason picked): quick picks first — the choices you'd usually
  // make ("Presente", "Pasados", "Condicional"…) — with the full per-cell
  // control one tap away under "Personalizar", laid out as one row per
  // tense with the five persons inline. Replaces the old persons × tenses
  // grid, which on a phone only fit 3 of its 8 columns (the rest hid behind
  // a sideways scroll) and read as a wall of 39 filled checkboxes.
  // mason's one change to the mockup: Futuro and Condicional as separate
  // picks, "those are taught at different times and in rioplatense it
  // feels like future tense is used less than the simple ir a +
  // infinitivo, whereas conditionals are common."
  //
  // The underlying selection model is unchanged — activeFlashCells holds
  // "tenseKey|personKey" keys, activeFlashStandalone holds gerundio/
  // participio — so buildFlashDeck() and everything downstream of it is
  // untouched.

  var FLASH_STANDALONE_KEYS = ["gerundio", "participio"];
  var FLASH_PRESETS = [
    { i18n: "flash_preset_presente", tenses: ["presente"] },
    { i18n: "flash_preset_pasados", tenses: ["preterito", "imperfecto"] },
    { i18n: "flash_preset_futuro", tenses: ["futuro"] },
    { i18n: "flash_preset_condicional", tenses: ["condicional"] },
    { i18n: "flash_preset_subjuntivo", tenses: [SUBJ_KEY, SUBJ_PAST_KEY] },
    { i18n: "flash_preset_imperativo", tenses: ["imperativo"] },
    { i18n: "flash_preset_nonpersonal", standalone: FLASH_STANDALONE_KEYS }
  ];
  // Pronoun labels are Spanish in both UI languages; short forms so five
  // fit beside a tense name on a phone. In the imperativo row the él/ellos
  // slots are really usted/ustedes commands (see IMPERATIVO_FORM_KEY).
  var FLASH_PERSON_SHORT = { yo: "yo", vos: "vos", el: "él", nosotros: "nos.", ellos: "ellos" };
  var FLASH_IMPERATIVO_SHORT = { vos: "vos", el: "ud.", nosotros: "nos.", ellos: "uds." };
  var flashCustomOpen = false;

  function flashKeysState(keys, set) {
    var n = keys.filter(function (k) { return set.has(k); }).length;
    return n === 0 ? "none" : (n === keys.length ? "all" : "some");
  }
  function flashToggleKeys(keys, set) {
    var turnOn = flashKeysState(keys, set) !== "all";
    keys.forEach(function (k) { if (turnOn) set.add(k); else set.delete(k); });
  }
  function flashPresetCellKeys(preset) {
    var keys = [];
    (preset.tenses || []).forEach(function (tk) { keys = keys.concat(flashColumnCellKeys(tk)); });
    return keys;
  }
  function flashPresetState(preset) {
    return preset.standalone
      ? flashKeysState(preset.standalone, activeFlashStandalone)
      : flashKeysState(flashPresetCellKeys(preset), activeFlashCells);
  }
  // A person chip in "Personalizar" acts on the tenses you've already
  // chosen (any tense with at least one person on), not on every tense —
  // otherwise picking "Pasados" and then tapping "vos" would silently add
  // vos in presente, subjuntivo, etc. With nothing chosen yet it covers
  // every tense.
  function flashPersonScopeKeys(personKey) {
    var inPlay = FLASH_MATRIX_COLUMNS.filter(function (c) { return flashTenseHasAnySelected(c.key); });
    var cols = inPlay.length ? inPlay : FLASH_MATRIX_COLUMNS;
    return cols.filter(function (c) { return flashCellSelectable(c.key, personKey); })
      .map(function (c) { return flashCellKey(c.key, personKey); });
  }
  function flashAriaPressed(state) { return state === "all" ? "true" : (state === "some" ? "mixed" : "false"); }

  function flashPickChip(label, state, onClick, title) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (state === "all" ? " active" : (state === "some" ? " partial" : ""));
    b.textContent = label;
    b.setAttribute("aria-pressed", flashAriaPressed(state));
    if (title) b.title = title;
    b.addEventListener("click", onClick);
    return b;
  }

  function renderFlashPicker() {
    // Quick picks. A pick that's only partly on (after customizing) shows a
    // dashed outline; tapping it then turns the whole pick on.
    el.flashPresets.innerHTML = "";
    FLASH_PRESETS.forEach(function (preset) {
      el.flashPresets.appendChild(flashPickChip(t(preset.i18n), flashPresetState(preset), function () {
        if (preset.standalone) flashToggleKeys(preset.standalone, activeFlashStandalone);
        else flashToggleKeys(flashPresetCellKeys(preset), activeFlashCells);
        renderFlashPicker();
      }));
    });

    el.flashCustomToggle.setAttribute("aria-expanded", flashCustomOpen ? "true" : "false");
    el.flashCustomToggle.classList.toggle("open", flashCustomOpen);
    el.flashCustom.hidden = !flashCustomOpen;
    if (flashCustomOpen) renderFlashCustom();
    updateFlashDeckCount();
  }

  // "Personalizar": one row per tense, grouped by mood, persons inline —
  // every combination the old grid allowed, with no sideways scrolling.
  function renderFlashCustom() {
    var box = el.flashCustom;
    box.innerHTML = "";

    var cols = document.createElement("div");
    cols.className = "flash-custom-cols";
    var colsLabel = document.createElement("span");
    colsLabel.className = "flash-custom-cols-label";
    colsLabel.textContent = t("flash_custom_persons");
    cols.appendChild(colsLabel);
    PERSONS.forEach(function (p) {
      var keys = flashPersonScopeKeys(p.key);
      cols.appendChild(flashPickChip(FLASH_PERSON_SHORT[p.key], flashKeysState(keys, activeFlashCells), function () {
        flashToggleKeys(keys, activeFlashCells);
        renderFlashPicker();
      }, p.label));
    });
    box.appendChild(cols);

    [
      { label: t("mood_indicativo"), cols: TENSES },
      { label: t("mood_subjuntivo"), cols: SUBJ_TENSES },
      { label: null, cols: FLASH_MATRIX_COLUMNS.filter(function (c) { return c.key === "imperativo"; }) }
    ].forEach(function (group) {
      var block = document.createElement("div");
      block.className = "flash-custom-block";
      if (group.label) {
        var mood = document.createElement("p");
        mood.className = "flash-custom-mood";
        mood.textContent = group.label;
        block.appendChild(mood);
      }
      group.cols.forEach(function (col) {
        var row = document.createElement("div");
        row.className = "flash-custom-row";
        var keys = flashColumnCellKeys(col.key);
        var state = flashKeysState(keys, activeFlashCells);

        var name = document.createElement("button");
        name.type = "button";
        name.className = "flash-custom-name " + state;
        name.setAttribute("aria-pressed", flashAriaPressed(state));
        var box2 = document.createElement("span");
        box2.className = "flash-custom-box";
        box2.setAttribute("aria-hidden", "true");
        name.appendChild(box2);
        name.appendChild(document.createTextNode(col.label));
        name.addEventListener("click", function () { flashToggleKeys(keys, activeFlashCells); renderFlashPicker(); });
        row.appendChild(name);

        var persons = document.createElement("div");
        persons.className = "flash-custom-persons";
        PERSONS.forEach(function (p) {
          if (!flashCellSelectable(col.key, p.key)) {
            var na = document.createElement("span");
            na.className = "flash-custom-p na";
            na.textContent = "—";
            na.setAttribute("aria-hidden", "true");
            persons.appendChild(na);
            return;
          }
          var cellKey = flashCellKey(col.key, p.key);
          var on = activeFlashCells.has(cellKey);
          var b = document.createElement("button");
          b.type = "button";
          b.className = "flash-custom-p" + (on ? " on" : "");
          b.textContent = col.key === "imperativo" ? FLASH_IMPERATIVO_SHORT[p.key] : FLASH_PERSON_SHORT[p.key];
          b.setAttribute("aria-pressed", on ? "true" : "false");
          b.setAttribute("aria-label", col.label + " · " + (col.key === "imperativo" ? IMPERATIVO_DISPLAY[p.key] : p.label));
          b.addEventListener("click", function () {
            if (activeFlashCells.has(cellKey)) activeFlashCells.delete(cellKey); else activeFlashCells.add(cellKey);
            renderFlashPicker();
          });
          persons.appendChild(b);
        });
        row.appendChild(persons);
        block.appendChild(row);
      });
      box.appendChild(block);
    });
  }

  function setFlashPickAll(on) {
    if (on) {
      flashAllCellKeys().forEach(function (k) { activeFlashCells.add(k); });
      FLASH_STANDALONE_KEYS.forEach(function (k) { activeFlashStandalone.add(k); });
    } else {
      activeFlashCells.clear();
      activeFlashStandalone.clear();
    }
    renderFlashPicker();
  }

  // How many cards Empezar would deal right now — the real deck (verbs ×
  // selected forms, plus words and phrases, after every tab's filters and
  // Sabido chips), so the number always matches what you get.
  function updateFlashDeckCount() {
    if (!el.flashDeckCount) return;
    var n = buildFlashDeck().length;
    el.flashDeckCount.textContent = t(n === 1 ? "flash_deck_count_1" : "flash_deck_count", { n: n });
  }

  // A tense column counts as "in play" for an impersonal verb (llover,
  // nevar, haber's "hay") if at least one person is selected for it —
  // impersonal forms have no person of their own to check directly.
  function flashTenseHasAnySelected(tenseKey) {
    return flashColumnCellKeys(tenseKey).some(function (k) { return activeFlashCells.has(k); });
  }

  // Split out from renderFlashSetup() so verb/word/phrase list renders can
  // keep the flashcards tab's source counts current on their own, even
  // when that tab isn't the one currently open. Without this, the counts
  // only ever refreshed when renderFlashSetup() itself ran (i.e. on
  // setMainTab("flashcards")) — fine while browsing normally, but if the
  // Tarjetas tab is the one restored on load (restoreMainTab() runs
  // synchronously, before the async loadVerbs/loadWords/loadPhrases have
  // resolved) it renders once against still-empty filtered/filteredWords/
  // filteredPhrases arrays and shows "(0)" for everything, then never
  // updates again since nothing re-opens that tab to re-run
  // renderFlashSetup(). Switching tabs and back "fixed" it only because
  // that re-triggers renderFlashSetup() against the by-then-populated
  // arrays. Calling this at the end of every list render closes that gap
  // at the source instead of relying on a tab revisit to paper over it.
  function updateFlashCounts() {
    el.flashVerbCount.textContent = "(" + filtered.length + ")";
    el.flashWordCount.textContent = "(" + filteredWords.length + ")";
    el.flashPhraseCount.textContent = "(" + filteredPhrases.length + ")";
    updateFlashDeckCount();
  }

  function renderFlashSetup() {
    updateFlashCounts();
    el.flashVerbOptions.hidden = !activeFlashSources.verbs;
    // The "card direction" panel is shared by words AND phrases — both are
    // plain front/back cards (no tense/person matrix), so one direction
    // toggle covers both rather than duplicating the same two radio buttons
    // a second time for phrases.
    el.flashWordOptions.hidden = (!activeFlashSources.words && !activeFlashSources.phrases) || effectiveFlashMode() === "escuchar";
    renderFlashModeControls();

    var noSource = !activeFlashSources.verbs && !activeFlashSources.words && !activeFlashSources.phrases;
    el.flashStartBtn.disabled = noSource;
    el.flashSetupMsg.textContent = noSource ? t("flash_no_source") : "";
    renderFlashPicker(); // relabels on a language switch; also refreshes the deck count
  }

  // ================= English per conjugated form (verb-gloss) =================
  // A verb card's answer side shows the English of THAT form ("tengo" →
  // "(I have)") rather than the infinitive's definition — mason, 2026-09-28.
  // Nothing about English conjugation is derived here: the verb-gloss Edge
  // Function asks Claude for every form of one verb in a single call, and
  // the result is stored on the verb (verbs.forms_en, keyed by the same
  // form keys as known_forms — see flashCellKey), so studying never calls
  // the API.
  //
  // The English itself is SHARED app-wide (mason: "the first instance of a
  // verb on the server is truth"): the Edge Function keeps one canonical
  // set per verb in public.verb_gloss_canon, made with the definition of
  // whoever added that verb first, and only asks Claude for forms nobody
  // has glossed yet. So two people adding "tener" get identical English and
  // only the first one costs anything. See the header of
  // supabase/functions/verb-gloss/index.ts.
  //
  // verbs.forms_en_sig fingerprints what this account's copy was fetched
  // for — the verb, its gustar mode, and WHICH forms it has. Deliberately
  // not the user's own definition (the canonical one is used regardless)
  // nor the Spanish spelling of each form (fixing a typo doesn't change the
  // English of that slot). A verb is fetched again only when that changes:
  // new verb, forms added/removed, import, or a verb that predates this
  // feature (the one-time backfill happens on its own, in the background,
  // the first time each account loads its verbs).

  // Bump to make every account re-fetch its copy — e.g. after correcting a
  // row of verb_gloss_canon by hand. Cheap: the canonical rows answer it.
  var VERB_GLOSS_VERSION = 2;

  // Every form of a verb that a flashcard can show, with the exact Spanish
  // text the card shows and a human label of its slot for the model.
  // Mirrors buildFlashDeck()'s own value logic; allVerbFormKeys() is built
  // on this so the two can't drift apart.
  function verbFormEntries(data) {
    var forms = data.forms || {};
    var out = [];
    FLASH_PERSONAL_TENSES.forEach(function (tn) {
      var mood = SUBJ_TENSES.some(function (s) { return s.key === tn.key; }) ? "subjuntivo" : "indicativo";
      PERSONS.forEach(function (p) {
        var val = data.gustar_like ? gustarCellText(forms, tn.key, p.key) : ((forms[tn.key] && forms[tn.key][p.key]) || "");
        if (val && val !== "—") out.push({ key: flashCellKey(tn.key, p.key), es: val, slot: p.label + " · " + tn.label.toLowerCase() + " (" + mood + ")" });
      });
      var imp = (forms.impersonal || {})[tn.key];
      if (imp) out.push({ key: flashCellKey(tn.key, "impersonal"), es: imp, slot: "impersonal · " + tn.label.toLowerCase() + " (" + mood + ")" });
    });
    Object.keys(IMPERATIVO_FORM_KEY).forEach(function (pk) {
      var val = (forms.imperativo || {})[IMPERATIVO_FORM_KEY[pk]];
      if (val) out.push({ key: flashCellKey("imperativo", pk), es: val, slot: IMPERATIVO_FORM_KEY[pk] + " · imperativo afirmativo" });
    });
    if (forms.gerundio) out.push({ key: "gerundio", es: forms.gerundio, slot: "gerundio" });
    if (forms.participio) out.push({ key: "participio", es: forms.participio, slot: "participio" });
    return out;
  }

  // Cached per data object: a verb's data object is replaced wholesale when
  // its forms change (loadVerbs), and the in-place mutations (known,
  // known_forms, forms_en) don't feed the fingerprint.
  var verbGlossSigCache = new WeakMap();
  function verbGlossSig(data) {
    var cached = verbGlossSigCache.get(data);
    if (cached) return cached;
    var src = JSON.stringify({
      v: VERB_GLOSS_VERSION,
      i: (data.infinitive || "").normalize("NFC").trim().toLowerCase(),
      g: !!data.gustar_like,
      k: verbFormEntries(data).map(function (e) { return e.key; }).sort()
    });
    var h = 5381;
    for (var i = 0; i < src.length; i++) h = ((h * 33) ^ src.charCodeAt(i)) >>> 0;
    var sig = VERB_GLOSS_VERSION + "-" + h.toString(36) + "-" + src.length.toString(36);
    verbGlossSigCache.set(data, sig);
    return sig;
  }

  function verbNeedsGloss(data) {
    return verbFormEntries(data).length > 0 && data.forms_en_sig !== verbGlossSig(data);
  }

  // The English for one form, or "" if there isn't a current one (not
  // generated yet, or generated from forms that have since been edited).
  function verbFormGloss(data, formKey) {
    if (!formKey || !data.forms_en || data.forms_en_sig !== verbGlossSig(data)) return "";
    return data.forms_en[formKey] || "";
  }

  // What goes under the Spanish on a card's answer side. Computed at render
  // time (not deck-build time) so glosses that finish generating while a
  // deck is open show up on the very next card.
  function cardBackSub(card) {
    if (card.kind === "verb") {
      var gloss = verbFormGloss(card.data, card.formKey);
      if (gloss) return "(" + gloss + ")";
    }
    return card.backSub || "";
  }

  // If a flashcard is open when its English arrives, update its answer line
  // in place (mason, 2026-09-28: a just-added verb's card kept showing the
  // definition until a refresh, even though the console showed the English
  // had been generated).
  function refreshOpenFlashCardSub() {
    if (el.flashOverlay.hidden) return;
    var card = flashDeck[flashIndex];
    if (!card || card.kind !== "verb") return;
    var sub = cardBackSub(card);
    el.flashBackSub.textContent = sub;
    el.flashBackSub.style.display = sub ? "" : "none";
  }

  // A verbs reload that was already in flight when English was saved can
  // land afterwards with the row as it was before — and the queue won't
  // retry a (verb, fingerprint) it has already done this session, so the
  // English stayed missing until a refresh. loadVerbs() calls this to keep
  // the in-memory English whenever the reloaded row lacks it but still has
  // the same forms. The database already has it; this only fixes what's on
  // screen.
  function carryOverVerbGlosses(prevById, entries) {
    entries.forEach(function (v) {
      var old = prevById[v.id];
      if (!old || !old.forms_en_sig) return;
      var sig = verbGlossSig(v.data);
      if (v.data.forms_en_sig !== sig && old.forms_en_sig === sig) {
        v.data.forms_en = old.forms_en;
        v.data.forms_en_sig = old.forms_en_sig;
      }
    });
  }

  // Background queue: one verb at a time, never more than one attempt per
  // (verb, fingerprint) per page load, and it switches itself off for the
  // session after two consecutive failures (function not deployed yet,
  // schema.sql not run yet, offline) — so a problem can't turn into a loop
  // of paid calls. Progress is logged to the console with a [verb-gloss]
  // prefix.
  var verbGlossAttempted = new Set();
  var verbGlossRunning = false;
  var verbGlossDisabled = false;
  var verbGlossFailures = 0;
  var verbGlossPriorityId = null; // a verb just saved in the form jumps the queue

  function queueVerbGlosses() {
    if (verbGlossRunning || verbGlossDisabled || !currentUser) return;
    verbGlossRunning = true;
    (function step() {
      if (verbGlossDisabled) { verbGlossRunning = false; return; }
      var pending = function (v) { return verbNeedsGloss(v.data) && !verbGlossAttempted.has(v.id + ":" + verbGlossSig(v.data)); };
      var next = allVerbs.find(function (v) { return v.id === verbGlossPriorityId && pending(v); }) || allVerbs.find(pending);
      if (!next) { verbGlossRunning = false; return; }
      verbGlossAttempted.add(next.id + ":" + verbGlossSig(next.data));
      generateVerbGloss(next).then(function () { setTimeout(step, 250); });
    })();
  }

  function noteVerbGlossFailure(infinitive, why) {
    verbGlossFailures++;
    console.warn("[verb-gloss] " + infinitive + ": " + why);
    if (verbGlossFailures >= 2) {
      verbGlossDisabled = true;
      console.warn("[verb-gloss] paused for this session after repeated failures — is the verb-gloss function deployed and schema.sql run?");
    }
  }

  function generateVerbGloss(entry) {
    var id = entry.id, data = entry.data;
    var entries = verbFormEntries(data);
    var sig = verbGlossSig(data);
    var started = Date.now();
    return supabaseClient.functions.invoke("verb-gloss", {
      body: {
        infinitive: data.infinitive || "", definition: data.definition || "",
        reflexive: !!data.reflexive, gustarLike: !!data.gustar_like, forms: entries
      }
    }).then(function (res) {
      var glosses = res && res.data && res.data.glosses;
      if (res.error || !glosses || !Object.keys(glosses).length) {
        noteVerbGlossFailure(data.infinitive, (res.error && res.error.message) || "empty reply");
        return;
      }
      return supabaseClient.from("verbs").update({ forms_en: glosses, forms_en_sig: sig }).eq("id", id).then(function (up) {
        if (up.error) { noteVerbGlossFailure(data.infinitive, "couldn't save (" + up.error.message + ")"); return; }
        verbGlossFailures = 0;
        // The list may have been reloaded meanwhile (new data objects) —
        // update whichever copies still describe the same forms.
        var current = allVerbs.find(function (v) { return v.id === id; });
        [data, current && current.data].forEach(function (d) {
          if (d && verbGlossSig(d) === sig) { d.forms_en = glosses; d.forms_en_sig = sig; }
        });
        refreshOpenFlashCardSub(); // the card on screen shows it right away
        var d = res.data;
        console.info("[verb-gloss] " + data.infinitive + ": " + Object.keys(glosses).length + "/" + entries.length + " forms in " + (Date.now() - started) + " ms" +
          (typeof d.cached === "number" ? " (" + d.cached + " from the shared cache, " + (d.generated || 0) + " newly generated)" : ""));
      });
    }).catch(function (err) {
      noteVerbGlossFailure(data.infinitive, (err && err.message) || String(err));
    });
  }

  // A flashcard is { kind: "verb"|"word"|"phrase", data, frontMain, frontSub, backMain, backSub,
  // frontSpeak, backSpeak }. frontMain/backMain are the big headline text; the *Sub lines and
  // badges are secondary. frontSpeak/backSpeak are the TTS-friendly text for a face, and are
  // only set on the side(s) that are actually Spanish — a verb's front and back are both
  // Spanish (infinitive, conjugated form), while a word/phrase card only has one Spanish side,
  // depending on flashDirection; the other side is left undefined so renderFlashCard hides that
  // face's speaker button rather than reading an English definition in an Argentine accent.
  // A verb's cards, one per form, for the forms want(formKey, tenseKey, tag)
  // accepts (tag: "personal" | "impersonal" | "imperativo" | "standalone").
  // Split out of buildFlashDeck() (2026-10-03) so the Progreso tab can build
  // decks of specific forms ("repasar hoy", a tense×person cell, ...).
  function verbCards(data, want) {
    var deck = [];
    var forms = data.forms || {};
    var def = data.definition || "";
    var inf = data.infinitive || "";

    FLASH_PERSONAL_TENSES.forEach(function (t) {
      PERSONS.forEach(function (p) {
        if (!want(flashCellKey(t.key, p.key), t.key, "personal")) return;
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
          kind: "verb", data: data, formKey: flashCellKey(t.key, p.key),
          frontMain: inf, frontSub: frontLabel + " · " + t.label.toLowerCase(),
          backMain: val, backSub: def ? "(" + def + ")" : "",
          frontSpeak: inf, backSpeak: val
        });
      });
    });

    // impersonal verbs (llover, nevar, haber's "hay"...) have no person —
    // same idea as the extra row the conjugation table shows for them.
    var imp = forms.impersonal || {};
    FLASH_PERSONAL_TENSES.forEach(function (t) {
      if (!want(flashCellKey(t.key, "impersonal"), t.key, "impersonal")) return;
      var val = imp[t.key] || "";
      if (!val) return;
      deck.push({
        kind: "verb", data: data, formKey: flashCellKey(t.key, "impersonal"),
        frontMain: inf, frontSub: "impersonal · " + t.label.toLowerCase(),
        backMain: val, backSub: def ? "(" + def + ")" : "",
        frontSpeak: inf, backSpeak: val
      });
    });

    if (forms.imperativo) {
      Object.keys(IMPERATIVO_FORM_KEY).forEach(function (personKey) {
        if (!want(flashCellKey("imperativo", personKey), "imperativo", "imperativo")) return;
        var val = forms.imperativo[IMPERATIVO_FORM_KEY[personKey]] || "";
        if (!val) return;
        deck.push({
          kind: "verb", data: data, formKey: flashCellKey("imperativo", personKey),
          frontMain: inf, frontSub: IMPERATIVO_DISPLAY[personKey] + " · " + t("mood_imperativo").toLowerCase(),
          backMain: val, backSub: def ? "(" + def + ")" : "",
          frontSpeak: inf, backSpeak: val
        });
      });
    }

    [{ key: "gerundio", i18nKey: "tile_gerundio" }, { key: "participio", i18nKey: "tile_participio" }].forEach(function (item) {
      if (!want(item.key, item.key, "standalone")) return;
      var val = forms[item.key] || "";
      if (!val) return;
      deck.push({
        kind: "verb", data: data, formKey: item.key,
        frontMain: inf, frontSub: t(item.i18nKey),
        backMain: val, backSub: def ? "(" + def + ")" : "",
        frontSpeak: inf, backSpeak: val
      });
    });
    return deck;
  }

  // The forms picked in the flashcard setup (quick picks / Personalizar).
  function setupVerbWant(formKey, tenseKey, tag) {
    if (tag === "impersonal") return flashTenseHasAnySelected(tenseKey);
    if (tag === "standalone") return activeFlashStandalone.has(formKey);
    return activeFlashCells.has(formKey);
  }

  function wordCard(data, direction) {
    var word = data.word || "";
    var def = data.definition || "";
    // Front is the Spanish word (speakable); back is the English
    // definition, which a Rioplatense voice would just mangle — no
    // backSpeak there.
    if (direction === "word2def") return { kind: "word", data: data, frontMain: word, frontSub: "", backMain: def || "—", backSub: "", frontSpeak: word };
    return { kind: "word", data: data, frontMain: def || word, frontSub: "", backMain: word, backSub: "", backSpeak: word };
  }

  // Same shared flashDirection as words — "word2def" here reads as
  // "phrase → definition".
  function phraseCard(data, direction) {
    var phrase = data.phrase || "";
    var def = data.definition || "";
    if (direction === "word2def") return { kind: "phrase", data: data, frontMain: phrase, frontSub: "", backMain: def || "—", backSub: "", frontSpeak: phrase };
    return { kind: "phrase", data: data, frontMain: def || phrase, frontSub: "", backMain: phrase, backSub: "", backSpeak: phrase };
  }

  function buildFlashDeck() {
    var deck = [];
    if (activeFlashSources.verbs) {
      verbFlashSource().forEach(function (v) {
        Array.prototype.push.apply(deck, verbCards(v.data, setupVerbWant));
      });
    }
    if (activeFlashSources.words) {
      filteredWords.forEach(function (w) { deck.push(wordCard(w.data, flashDirection)); });
    }
    if (activeFlashSources.phrases) {
      filteredPhrases.forEach(function (ph) { deck.push(phraseCard(ph.data, flashDirection)); });
    }
    // Sabido chips apply per CARD here (per form, for verbs) — see
    // cardPassesKnownFilter()/verbFlashSource().
    return deck.filter(cardPassesKnownFilter);
  }

  function flashBackBadges(card) {
    var frag = document.createDocumentFragment();
    var data = card.data;
    if (card.kind === "verb") {
      if (data.type) frag.appendChild(badge("type", tagLabel(data.type)));
      frag.appendChild(badge("irregular", tagLabel(data.irregularity || "regular")));
      frag.appendChild(badge("transitivity", tagLabel(data.transitivity || "transitivo")));
      if (data.reflexive) frag.appendChild(badge("reflexive", tagLabel("reflexivo")));
      if (data.auxiliar) frag.appendChild(badge("auxiliar", tagLabel("auxiliar")));
      if (data.gustar_like) frag.appendChild(badge("gustarLike", tagLabel("dativo")));
    } else if (card.kind === "word") {
      if (data.partOfSpeech) frag.appendChild(badge("type", tagLabel(data.partOfSpeech)));
      if (data.gender) frag.appendChild(badge("gender", tagLabel(data.gender)));
    } else {
      if (data.function) frag.appendChild(badge("type", tagLabel(data.function)));
      if (data.register && data.register !== "neutro") frag.appendChild(badge("register", registerLabel(data.register)));
      if (data.idiomatic) frag.appendChild(badge("idiomatic", tagLabel("idiomática")));
    }
    return frag;
  }

  // Once a clip actually starts playing, nudges its .tts-active ring's
  // already-running animation to a new speed that lands it on a clean lap
  // boundary right around when the clip finishes — so it still looks
  // "done" in step with the audio, without ever restarting or jumping.
  // Mason flagged this twice (2026-09-25): first that the ring's fixed
  // 0.9s loop outlasted this app's typically-short clips (single words,
  // one conjugated form), so it visibly kept chasing after the audio had
  // already gone quiet; then, after a first fix that restarted the ring
  // with the real duration baked in, that the restart itself produced a
  // visible jump the instant playback began. Restarting a CSS animation —
  // however it's done, even via a forced reflow — always snaps it back to
  // its 0% frame, which is a pop no matter what duration you give it.
  // `playbackRate` is the one platform primitive that changes an
  // animation's speed with no discontinuity at all: the browser just
  // keeps advancing the exact same animation from wherever it already is,
  // only faster or slower from this point on. Nothing resets, so there's
  // nothing to jump.
  function syncChaseToAudio(btn) {
    if (!btn || !ttsAudioEl) return;
    var dur = ttsAudioEl.duration;
    if (!isFinite(dur) || dur <= 0) return; // unknown length — leave it at its default pace
    var anims = btn.getAnimations({ subtree: true });
    var anim = null;
    for (var i = 0; i < anims.length; i++) {
      if (anims[i].animationName === "tts-chase") { anim = anims[i]; break; }
    }
    if (!anim) return;
    // styles.css authors the ring's own base speed as one lap every 0.9s
    // (`.tts-active::after`'s `animation: tts-chase 0.9s ...`). Picking
    // the nearest whole number of laps that fit in the clip's remaining
    // length, then setting playbackRate to make exactly that many laps
    // take exactly that long, keeps the speed change close to 1x (subtle)
    // for clips near 0.9s, rather than a big, obvious lurch either way.
    var baseLapMs = 900;
    var remainingMs = dur * 1000;
    var laps = Math.max(1, Math.round(remainingMs / baseLapMs));
    anim.playbackRate = (laps * baseLapMs) / remainingMs;
  }

  // Plays `text` in the currently-selected Azure voice, via the "tts" Edge
  // Function (see supabase/functions/tts/index.ts) — app.js never talks to
  // Azure directly, and never sees the Azure key. `btn` is the speaker
  // button (or, for the verb conjugation table, the table cell — or the
  // gerundio/participio tile) that was tapped, purely so we can put a
  // "something's happening" indicator on it while the request is in
  // flight and restore it after; it plays fine without one. `msgEl` is
  // where a "couldn't play that" error gets shown — each screen with a
  // speaker button has its own small message element (flashcards:
  // flash-tts-msg, word/phrase detail: wd-tts-msg/pd-tts-msg) since only
  // one of them is ever visible at a time; defaults to flash-tts-msg so
  // existing flashcard call sites don't need to change.
  //
  // Used to swap `btn`'s own markup out for a plain "…" while busy. Mason
  // asked (2026-09-25) to replace that with a "chasing border" animation
  // instead (.tts-active, see styles.css): a conjugation-table cell's text
  // IS the word being studied, and hiding it right as it's spoken worked
  // against the app's whole point — hearing and seeing a word at the same
  // time. So now `btn`'s own content is never touched; only a class toggles.
  // That class also now spans a wider window than the old "…" swap did: on
  // from the moment of the tap, off only once the clip actually finishes
  // playing (ttsAudioEl's "ended", below) — not just once the network
  // request resolves — since "while the audio is playing" was the other
  // half of what mason asked for.
  function playTts(text, btn, msgEl, opts) {
    if (!msgEl) msgEl = el.flashTtsMsg;
    var silentErrors = !!(opts && opts.silent);
    // Quiet mode: no request at all; clear a stale "couldn't play" line.
    if (quietMode) { msgEl.textContent = ""; noteQuietTap(btn); return; }
    if (!text || ttsInFlight) return;
    ttsInFlight = true;
    msgEl.textContent = "";
    if (btn) {
      btn.disabled = true;
      // Only one clip plays at a time (ttsAudioEl is a single shared
      // element) — if something else's ring is still showing from a still-
      // playing previous clip, this new tap is about to cut that playback
      // off, so clear its ring now rather than leaving it stuck on with
      // nothing actually playing behind it.
      if (ttsActiveEl && ttsActiveEl !== btn) ttsActiveEl.classList.remove("tts-active");
      ttsActiveEl = btn;
      // Starts at styles.css's default pace (one lap every 0.9s) — the
      // real clip length isn't known yet. syncChaseToAudio() below
      // adjusts this same running animation's speed, without restarting
      // it, once playback actually begins.
      btn.classList.add("tts-active");
    }

    // Temporary diagnostic (2026-09-25): the Edge Function already knows
    // whether it served a cached clip or paid for a fresh Azure synthesis
    // (res.data.cached), but until now the client just threw that away.
    // Logging it here — with the round-trip time — lets us see directly in
    // the browser console whether "it feels slow sometimes" is really Azure
    // being re-hit on already-heard content, or just normal Edge
    // Function/network latency on a genuine cache hit. Safe to leave in
    // permanently (console.log, no UI change, negligible cost); pull it out
    // later if it stops being useful.
    //
    // Deliberately console.log, not console.debug (as originally shipped):
    // Chrome DevTools buckets console.debug() under its "Verbose" level,
    // which is hidden from the console by default — so these lines were
    // silently invisible unless that filter was manually enabled, defeating
    // the entire point of a diagnostic someone's supposed to just glance at.
    // Found 2026-09-25 when mason filtered the console for "[tts]" while
    // testing warmTtsCache()'s effect and saw nothing at all, even on a
    // word already confirmed warmed.
    //
    // Second gap found the same day: the original version only timed the
    // Edge Function round trip (getting back {url, cached}), not the actual
    // audio. Even on a genuine cache hit, the browser still has to fetch the
    // real audio bytes from that URL before anything is audible — a step
    // that's fast on a REPEAT play of the same URL (the browser's own HTTP
    // cache already has it — the upload sets a 1-year cache header) but not
    // on the first play of a given clip in this browser session, which is
    // very likely the actual source of "first tap feels slower than the
    // second." Now timing both phases separately so that's visible directly
    // instead of inferred.
    var ttsStartedAt = (window.performance && performance.now) ? performance.now() : Date.now();
    function msSince(t0) {
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      return Math.round(now - t0);
    }

    // 2026-10-03: no longer calls the Edge Function on every play. Audio
    // comes from ttsLoadAudio() — already-downloaded bytes when the clip was
    // prefetched (instant), else the remembered URL, else the Edge Function
    // — see "TTS audio loading" just below playTts().
    ttsLoadAudio(text)
      .then(function (r) {
        var edgeMs = msSince(ttsStartedAt);
        console.log("%c[tts] " + r.how + "%c — ready in " + edgeMs + "ms — \"" + text + "\"",
          r.how === "edge: AZURE SYNTHESIS (cache miss)" ? "color:#c0392b;font-weight:bold" : "color:#2a8f4f;font-weight:bold", "color:inherit");
        if (!ttsAudioEl) ttsAudioEl = new Audio();
        ttsAudioEl.src = r.src;
        // Keeps the chasing-border ring on through the actual playback,
        // not just the fetch — "ended" is the real end of a tap-to-hear
        // interaction from mason's point of view. Reassigning onended
        // fresh on every call is safe: only one clip ever plays on this
        // shared <audio> element at a time, so there's never a stale
        // handler left over from an earlier tap by the time this fires —
        // and if THIS clip gets interrupted by a later tap before it ever
        // ends, that later tap's own setup above already cleared this ring
        // for us, so onended firing late (or never, its src having since
        // moved on) has nothing left to clean up.
        ttsAudioEl.onended = function () {
          if (btn) btn.classList.remove("tts-active");
          if (ttsActiveEl === btn) ttsActiveEl = null;
        };
        return ttsAudioEl.play().then(function () {
          // Now that the clip is actually playing, its real duration is
          // known — nudge the ring's already-running animation to match it
          // (see syncChaseToAudio() above), with no restart and no jump.
          syncChaseToAudio(btn);
          if (btn && btn === el.flashListenBtn) waveFollowPlayback(text);
          var totalMs = msSince(ttsStartedAt);
          console.log("[tts] audio started — " + totalMs + "ms after the tap — \"" + text + "\"");
        });
      })
      .catch(function (err) {
        var elapsedMs = msSince(ttsStartedAt);
        console.log("[tts] request failed — " + elapsedMs + "ms — \"" + text + "\"", err);
        if (!silentErrors) msgEl.textContent = t("tts_error");
        if (btn) btn.classList.remove("tts-active");
        if (ttsActiveEl === btn) ttsActiveEl = null;
      })
      .then(function () {
        ttsInFlight = false;
        if (btn) { btn.disabled = false; }
      });
  }

  // ================= TTS audio loading (2026-10-03) =================
  // mason: "the audio takes about a second or two to play. Are these
  // prefetching correctly?" Only half: prefetchTts() used to call the Edge
  // Function and then fetch() the clip to warm the browser's HTTP cache —
  // but every PLAY called the Edge Function again (a network round trip
  // plus the function's own existence check: most of that second), and
  // Safari's <audio> doesn't reliably reuse fetch()'s cache anyway. On top
  // of that, auto-play fired 200 ms after a card appeared, before the
  // card's own prefetch had finished, so it did its own full round trip.
  //
  // Now there's one loader, shared by prefetch and play, that keeps:
  //  - the clip's URL per (voice, text), remembered on the device
  //    (localStorage) — clips are content-addressed and never change, so
  //    once known, the Edge Function is never asked again;
  //  - the clip's bytes as an in-memory blob: URL, so a prefetched clip
  //    plays with no network at all;
  //  - any load already in flight, so a play that arrives mid-prefetch
  //    waits for that same load instead of starting another.
  // Flashcards also prefetch the next two cards, not just the current one.
  var TTS_URL_LOCAL_KEY = "iv-tts-urls";
  var TTS_URL_MAX = 3000;
  var TTS_BLOB_MAX = 80;
  var ttsUrlMemo = (function () {
    try { var m = JSON.parse(localStorage.getItem(TTS_URL_LOCAL_KEY) || "{}"); return (m && typeof m === "object") ? m : {}; } catch (e) { return {}; }
  })();
  var ttsUrlSaveTimer = null;
  var ttsBlobUrls = {};   // key -> blob: URL
  var ttsBlobOrder = [];  // keys, oldest first (for trimming)
  var ttsLoading = {};    // key -> Promise of {src, how}

  function ttsKey(text) { return TTS_VOICES[ttsVoiceKey] + "\u0000" + String(text || "").trim(); }

  function saveTtsUrlMemo() {
    clearTimeout(ttsUrlSaveTimer);
    ttsUrlSaveTimer = setTimeout(function () {
      var keys = Object.keys(ttsUrlMemo);
      if (keys.length > TTS_URL_MAX) keys.slice(0, keys.length - TTS_URL_MAX).forEach(function (k) { delete ttsUrlMemo[k]; });
      try { localStorage.setItem(TTS_URL_LOCAL_KEY, JSON.stringify(ttsUrlMemo)); } catch (e) {}
    }, 500);
  }

  // The clip's public URL: remembered, or asked of the Edge Function (which
  // synthesizes it first if nobody has heard this text in this voice yet).
  function ttsResolveUrl(text, force) {
    var key = ttsKey(text);
    if (!force && ttsUrlMemo[key]) return Promise.resolve({ url: ttsUrlMemo[key], how: "url remembered" });
    return supabaseClient.functions.invoke("tts", { body: { text: String(text).trim(), voice: TTS_VOICES[ttsVoiceKey] } })
      .then(function (res) {
        if (res.error || !res.data || !res.data.url) throw (res.error || new Error("no_url"));
        ttsUrlMemo[key] = res.data.url;
        saveTtsUrlMemo();
        return { url: res.data.url, how: res.data.cached ? "edge: cache hit" : "edge: AZURE SYNTHESIS (cache miss)" };
      });
  }

  function rememberTtsBlob(key, src) {
    ttsBlobUrls[key] = src;
    ttsBlobOrder.push(key);
    while (ttsBlobOrder.length > TTS_BLOB_MAX) {
      var old = ttsBlobOrder.shift();
      var oldSrc = ttsBlobUrls[old];
      if (!oldSrc) continue;
      if (ttsAudioEl && ttsAudioEl.src === oldSrc) { ttsBlobOrder.push(old); break; } // never pull the clip that's playing
      delete ttsBlobUrls[old];
      try { URL.revokeObjectURL(oldSrc); } catch (e) {}
    }
  }

  function ttsFetchBlob(url) {
    return fetch(url).then(function (resp) {
      if (!resp.ok) { var e = new Error("http_" + resp.status); e.status = resp.status; throw e; }
      return resp.blob();
    }).then(function (blob) { return URL.createObjectURL(blob); });
  }

  // Resolves to {src, how}: src is a blob: URL when the bytes could be
  // downloaded, or the plain public URL as a fallback (the <audio> element
  // then streams it itself).
  function ttsLoadAudio(text) {
    var key = ttsKey(text);
    if (ttsBlobUrls[key]) return Promise.resolve({ src: ttsBlobUrls[key], how: "already downloaded" });
    if (ttsLoading[key]) return ttsLoading[key];
    var p = ttsResolveUrl(text).then(function (r) {
      return ttsFetchBlob(r.url).then(function (src) {
        rememberTtsBlob(key, src);
        return { src: src, how: r.how };
      }, function (err) {
        // A remembered URL that's gone (e.g. the cache bucket was cleared):
        // forget it and ask the Edge Function once more.
        if (r.how === "url remembered" && err && err.status) {
          delete ttsUrlMemo[key]; saveTtsUrlMemo();
          return ttsResolveUrl(text, true).then(function (r2) {
            return ttsFetchBlob(r2.url).then(function (src) { rememberTtsBlob(key, src); return { src: src, how: r2.how }; },
              function () { return { src: r2.url, how: r2.how }; });
          });
        }
        return { src: r.url, how: r.how + " (streamed)" };
      });
    });
    ttsLoading[key] = p;
    var clear = function () { if (ttsLoading[key] === p) delete ttsLoading[key]; };
    p.then(clear, clear);
    return p;
  }

  // Powers the "Buscar en RAE" shortcut on the add-verb and add-word forms
  // (2026-09-26). Calls the dle-lookup Edge Function (see
  // supabase/functions/dle-lookup/index.ts for the full rationale — RAE
  // itself has no public API, so this goes through the free, unofficial
  // rae-api.com) and pre-fills the editable fields from whatever it finds.
  // Same convention as handleSubmit/handleWordSubmit's own .form-msg text:
  // el.formMsg/el.wordFormMsg just get a plain status string, no extra
  // class. Every field it touches stays a normal editable input afterward —
  // this is a shortcut for typing, not an import: mason/his wife still see
  // and can change (or clear) anything before saving, exactly like the
  // existing JSON-import path.
  //
  // f-type (-ar/-er/-ir) and the whole conjugation table, including
  // imperativo, are now auto-filled too (2026-09-27, per mason: "i think
  // that i would rather pull the conjugations and the tags based on what is
  // on rae since there is a tu/vos in the api that we are using" — reversing
  // this function's original "never touch the table" design). See
  // dle-lookup/index.ts's file header for the full rationale, especially
  // what's still deliberately left alone: f-irregularity (RAE has no such
  // classification, and guessing it is a real judgment call — confirmed with
  // mason rather than assumed) and the vos cell of a reflexive verb's
  // imperativo row (needs an enclitic pronoun suffix, not a plain prefix).
  //
  // `data.definition` arrives already translated to English by the Edge
  // Function (Azure Translator, added 2026-09-26 — see dle-lookup/index.ts)
  // — a RAE definition is Spanish-only, which isn't useful for this field's
  // job as an English gloss. The example sentence is NOT translated, on
  // purpose: it's meant to stay real Spanish usage to read.

  // Fills the conjugation-table + imperativo inputs from the `forms` object
  // dle-lookup/index.ts builds out of RAE's own data (see that file's header
  // for exactly which rae-api.com field feeds which cell). Same
  // non-presumptuous convention as every other RAE-lookup field: only ever
  // writes into a cell that's still empty.
  //
  // RAE's conjugated forms never include the reflexive pronoun (a
  // pronominal verb's "yo" cell comes back as "llamo," not "me llamo"),
  // while this app's own stored forms always do (see STARTER_VERBS' llamarse
  // above) — so a reflexive verb's cells get the right pronoun prefixed on
  // here. The one deliberate exception is the vos imperativo cell: Spanish
  // attaches that pronoun as an enclitic suffix instead ("llamate," not "te
  // llamá"), which isn't a plain prefix and isn't attempted — left blank for
  // a human to type, same philosophy as never auto-setting f-irregularity.
  var IMPERATIVO_REFLEXIVE_PRONOUNS = { vos: "te", usted: "se", nosotros: "nos", ustedes: "se" };
  function fillConjugationCellsFromRae(forms, reflexive) {
    PERSONS.forEach(function (p) {
      TENSES.concat(SUBJ_TENSES).forEach(function (t) {
        var raw = forms[t.key] && forms[t.key][p.key];
        if (!raw) return;
        var inp = document.getElementById("f-" + t.key + "-" + p.key);
        if (!inp || inp.value) return;
        inp.value = reflexive ? REFLEXIVE_PRONOUNS[p.key] + " " + raw : raw;
      });
    });

    var imper = forms.imperativo || {};
    IMPERATIVE_PERSONS.forEach(function (p) {
      if (reflexive && p.key === "vos") return; // enclitic case, see above
      var raw = imper[p.key];
      if (!raw) return;
      var inp = document.getElementById("f-imperativo-" + p.key);
      if (!inp || inp.value) return;
      inp.value = reflexive ? IMPERATIVO_REFLEXIVE_PRONOUNS[p.key] + " " + raw : raw;
    });
  }

  // Whole-table version of the old yo-only irregularity hint: reuses the
  // app's own isCellIrregular() (the same function the conjugation table
  // itself uses to flag deviations) across every cell RAE just supplied,
  // rather than re-deriving what a regular form looks like a second time.
  // Purely informational — never sets f-irregularity itself (see above).
  function raeFormsLookIrregular(forms, term, reflexive) {
    var hintData = { infinitive: term, reflexive: reflexive };
    return PERSONS.some(function (p) {
      return TENSES.concat(SUBJ_TENSES).some(function (t) {
        var raw = forms[t.key] && forms[t.key][p.key];
        if (!raw) return false;
        var val = reflexive ? REFLEXIVE_PRONOUNS[p.key] + " " + raw : raw;
        return isCellIrregular(hintData, t.key, p.key, val);
      });
    });
  }

  function lookupInRae(kind) {
    var isVerb = kind === "verb";
    var termEl = isVerb ? el.fInfinitive : el.wfWord;
    var btn = isVerb ? el.fRaeLookup : el.wfRaeLookup;
    var msgEl = isVerb ? el.formMsg : el.wordFormMsg;
    var term = (termEl.value || "").trim();

    if (!term) {
      msgEl.textContent = isVerb ? t("msg_falta_infinitivo") : t("msg_falta_palabra");
      return;
    }
    if (raeLookupInFlight) return;
    raeLookupInFlight = true;
    btn.disabled = true;
    msgEl.textContent = t("rae_lookup_looking_up");

    supabaseClient.functions.invoke("dle-lookup", { body: { term: term, kind: kind } })
      .then(function (res) {
        if (res.error) throw res.error;
        var data = res.data || {};
        if (!data.found) {
          msgEl.textContent = t("rae_lookup_not_found");
          return;
        }

        if (isVerb) {
          if (data.definition && !el.fDefinition.value) el.fDefinition.value = data.definition;
          if (data.example && !el.fExample.value) el.fExample.value = data.example;
          if (data.transitivity) el.fTransitivity.value = data.transitivity;
          if (data.reflexive) el.fReflexive.checked = true;
          if (data.gerundio) el.fGerundio.value = data.gerundio;
          if (data.participio) el.fParticipio.value = data.participio;

          // -ar/-er/-ir is fully implied by the two letters already sitting
          // in f-infinitive — not RAE data at all, just the same verbClass()
          // the conjugation table itself uses, run a second time here.
          var klass = verbClass(term);
          if (klass) el.fType.value = "-" + klass;

          var reflexiveNow = el.fReflexive.checked;
          if (data.forms) fillConjugationCellsFromRae(data.forms, reflexiveNow);

          var msg = t("rae_lookup_filled");
          if (data.forms && raeFormsLookIrregular(data.forms, term, reflexiveNow)) {
            msg += " " + t("rae_lookup_maybe_irregular");
          }
          // The Edge Function translates the definition es->en via Azure
          // Translator (see dle-lookup/index.ts) and reports whether that
          // actually happened — say so plainly rather than silently leaving
          // a Spanish sentence in a field meant to be an English gloss
          // (e.g. before mason has deployed the AZURE_TRANSLATOR_KEY
          // secret, or on a transient Azure hiccup).
          if (data.definition && data.definitionTranslated === false) {
            msg += t("rae_lookup_translation_unavailable");
          }
          msgEl.textContent = msg;
        } else {
          if (data.definition && !el.wfDefinition.value) el.wfDefinition.value = data.definition;
          if (data.pos) el.wfPos.value = data.pos;
          if (data.gender) el.wfGender.value = data.gender;
          if (data.example && !el.wfExample.value) el.wfExample.value = data.example;
          var wordMsg = t("rae_lookup_filled");
          if (data.definition && data.definitionTranslated === false) {
            wordMsg += t("rae_lookup_translation_unavailable");
          }
          msgEl.textContent = wordMsg;
        }
      })
      .catch(function (err) {
        console.log("[dle-lookup] request failed", err);
        // 429 = this account's daily lookup limit (see dle-lookup/index.ts).
        var limited = err && err.context && err.context.status === 429;
        msgEl.textContent = t(limited ? "rae_lookup_daily_limit" : "rae_lookup_error");
      })
      .then(function () {
        raeLookupInFlight = false;
        btn.disabled = false;
      });
  }

  // Quietly downloads a clip's audio bytes into the browser's own HTTP cache
  // *before* anyone taps a speaker button, so that by the time they do, the
  // real playTts() call below is hitting the browser's own cache instead of
  // paying the ~0.5-1.5s first-time network fetch (see playTts()'s two-phase
  // timing above, and the project brief's "TTS cache warming" section for
  // the "barato" evidence that pinned this down).
  //
  // Added 2026-09-25, same day as the warming-vs-per-device-caching
  // discussion above: mason's own proposal, once he'd seen that discussion,
  // was to fetch a card's audio the moment it's actually displayed rather
  // than the whole library up front — since a flashcard or detail page sits
  // on screen for a beat before anyone taps anything, that gap is enough
  // time for the fetch to finish quietly in the background. This is
  // deliberately much lighter than the bulk-audio-prefetch idea mason
  // turned down: it only ever downloads bytes for content someone is
  // actually looking at right now, so total data used stays proportional to
  // how much of the app someone actually browses, not the size of the
  // library.
  //
  // Calls the same "tts" Edge Function warmTtsCache() does (so it's still
  // free/instant if the clip's already server-cached) and then just
  // fetch()es the returned URL — never audio.play(), since triggering sound
  // with no user gesture would be bad UX even where the browser allows it.
  // That plain fetch() is what actually lands the bytes in the browser's
  // HTTP cache, via the Storage upload's existing 1-year cacheControl
  // header — no other code needed for a later playTts() call on the same
  // text to benefit.
  //
  // Silent and best-effort throughout: nothing here ever touches
  // msgEl/btn or shows an error. If this fails (offline, cold Edge
  // Function, whatever), the user just doesn't get the head start — the
  // real playTts() call still works exactly as it does today when they
  // actually tap speak.
  //
  // ttsPrefetched dedupes by voice+text so flipping back and forth over the
  // same handful of cards doesn't refire a network call every time — once a
  // clip's been requested this session, it's left to the browser's own
  // cache from then on.
  //
  // Guarded against warmTtsCacheRunning: selectVerb() gets called
  // separately from collectSpeakableTextsForVerb() during warmTtsCache()'s
  // own scan (see below), and that's a synthetic, non-visual drive-through
  // of every verb — not a real "the user is looking at this" event. Without
  // this guard, running warmTtsCache() would itself download every verb
  // infinitive's actual audio bytes as a side effect, which is exactly the
  // bulk-download behavior mason deliberately chose not to build.
  function prefetchTts(text) {
    // Quiet mode: nothing will be played, so don't spend data fetching it.
    if (!text || !currentUser || warmTtsCacheRunning || quietMode) return;
    // Respect the OS/browser's own Data Saver setting where it's exposed
    // (Chrome/Android; not in Safari, where navigator.connection is simply
    // undefined and this just no-ops) — someone who's explicitly asked
    // their device to use less data shouldn't have this quietly working
    // against that.
    if (window.navigator && navigator.connection && navigator.connection.saveData) return;
    // 2026-10-03: downloads the clip's bytes through the same loader that
    // playTts() uses, so a later play is instant and never re-asks the Edge
    // Function — see "TTS audio loading" below playTts().
    ttsLoadAudio(text).catch(function () {});
  }

  // The merged usted/ustedes imperativo cell ("— / — / <real>", td.imp-col)
  // is speakable text-wise only via its .real span — see selectVerb()'s
  // imperativoCell() above for why. Both the tap-to-hear click handler and
  // the row/column prefetch below need this exact same rule, so it lives
  // here once rather than being duplicated at each call site.
  function speakableCellText(cell) {
    var real = cell.querySelector(".real");
    return real ? real.textContent : cell.textContent;
  }

  // Row-and-column conjugation-table prefetch (2026-09-25) — mason's own
  // follow-up to the view-triggered prefetching above, once he'd confirmed
  // firing a background fetch doesn't touch the main thread and so can't
  // make the table itself feel slower to use: "let's implement a prefetch
  // of the row and column (pronoun and tense) that are common to the
  // user's tapped cell. since we don't know if a user is going to be
  // drilling a pronoun or a tense and either is a reasonable thing to do."
  //
  // Deliberately scoped to just the tapped cell's row + column (at most
  // ~11 cells: 7 other tenses/imperativo in the row, up to 4 other
  // persons in the column), not the whole table (30+ cells) — prefetching
  // everything the instant someone taps one cell would reintroduce a
  // smaller-scale version of the exact "download things nobody asked for"
  // concern that ruled out bulk-library prefetching in the first place
  // (see the project brief's TTS cache warming section). This stays
  // proportional to what a single tap actually suggests: the user is
  // about to keep drilling either this pronoun across tenses or this
  // tense across pronouns — not necessarily the whole table.
  //
  // Staggered (setTimeout, CONJ_PREFETCH_STAGGER_MS apart) rather than all
  // fired at once: although none of this blocks the main thread (fetch()
  // and invoke() are async, so the table stays perfectly scrollable/
  // tappable regardless of how many requests are in flight), a burst of
  // ~10 simultaneous requests would still compete for real bandwidth with
  // the playTts() call this same tap just kicked off, and with whatever
  // cell gets tapped next — which could ironically make the thing the
  // user is actually waiting to hear right now feel slower. Spreading
  // dispatch out over a second or two keeps each prefetch cheap and lets
  // a real, explicit tap always win any contention for the connection.
  //
  // Pure DOM traversal — reads sibling <td> elements directly off the
  // already-rendered table (the same .speakable cells selectVerb() marked,
  // via speakableCellText() above for the merged-cell special case) rather
  // than reaching back into forms/PERSONS/TENSES a second time to
  // re-derive which cells exist. Works unmodified for the impersonal row
  // (llover, nevar) too, since that's just another <tr> in the same tbody
  // with the same column layout — no separate case needed.
  function prefetchAdjacentConjugationCells(td) {
    if (!td || !el.dConjBody.contains(td)) return;
    var CONJ_PREFETCH_STAGGER_MS = 150;
    var texts = [];
    var tr = td.parentNode;
    // Row: every other speakable cell sharing this <tr> (same pronoun,
    // every other tense/imperativo).
    Array.prototype.forEach.call(tr.children, function (cell) {
      if (cell !== td && cell.classList.contains("speakable")) texts.push(speakableCellText(cell));
    });
    // Column: the cell at the same position in every other <tr> (same
    // tense, every other pronoun).
    var colIndex = Array.prototype.indexOf.call(tr.children, td);
    Array.prototype.forEach.call(el.dConjBody.children, function (otherTr) {
      if (otherTr === tr) return;
      var cell = otherTr.children[colIndex];
      if (cell && cell.classList.contains("speakable")) texts.push(speakableCellText(cell));
    });
    texts.forEach(function (text, i) {
      setTimeout(function () { prefetchTts(text); }, i * CONJ_PREFETCH_STAGGER_MS);
    });
  }

  // ================= TTS cache warming (console utility, 2026-09-25) =================
  // Not a UI feature — there's no button for this anywhere. It's a maintenance
  // operation mason runs himself from the browser console (already signed in
  // as himself) to pre-synthesize every piece of Spanish text the app can
  // currently speak, for both voices, so real usage later always hits an
  // instant cache hit instead of paying Azure's synthesis latency the first
  // time a given form/word/phrase gets tapped. The Edge Function's cache is
  // content-addressed (sha256 of voice+text) and shared across all accounts,
  // so this benefits everyone, not just whoever runs it.
  //
  // Deliberately NOT something this codebase's author (Claude) can trigger
  // directly against the live backend — there's no service-role key or any
  // other credential available here, by design (see the project brief's
  // working agreement). This just exposes the capability; mason runs
  // `warmTtsCache()` from the console himself, using his own real session.
  //
  // Reuses selectVerb()'s actual rendering to decide which conjugated forms
  // are "speakable" (imperativo's yo-less/merged-usted-ustedes quirks, the
  // personal-vs-dativo gustar_like split, etc.) rather than re-deriving that
  // logic a second time here — whatever selectVerb() marks .speakable IS the
  // set of verb forms a real user can tap to hear, by definition.
  function collectSpeakableTextsForVerb(id) {
    var texts = [];
    var entry = allVerbs.find(function (v) { return v.id === id; });
    if (!entry) return texts;
    if (entry.data.infinitive) texts.push(entry.data.infinitive);

    function renderAndCollect(tab) {
      detailGustarTab = tab;
      selectVerb(id);
      var cells = el.dConjBody.querySelectorAll("td.speakable");
      cells.forEach(function (td) {
        var real = td.querySelector(".real");
        var text = real ? real.textContent : td.textContent;
        if (text && text !== "—") texts.push(text);
      });
      if (el.dGerundio.classList.contains("speakable")) texts.push(el.dGerundio.textContent);
      if (el.dParticipio.classList.contains("speakable")) texts.push(el.dParticipio.textContent);
    }

    renderAndCollect("personal");
    // A verb that's both gustar_like and also_personal_use (e.g. "parecer")
    // renders genuinely different spoken text depending on which tab is
    // active (regular conjugation vs. "me parece" style) — both need warming.
    if (entry.data.gustar_like && entry.data.also_personal_use) {
      renderAndCollect("dativo");
    }
    return texts;
  }

  function collectAllSpeakableTexts() {
    var texts = [];

    allWords.forEach(function (w) { if (w.data.word) texts.push(w.data.word); });
    STARTER_WORDS.forEach(function (w) { if (w.word) texts.push(w.word); });

    allPhrases.forEach(function (p) { if (p.data.phrase) texts.push(p.data.phrase); });
    STARTER_PHRASES.forEach(function (p) { if (p.phrase) texts.push(p.phrase); });

    var existingInfinitives = {};
    allVerbs.forEach(function (v) { existingInfinitives[norm(v.data.infinitive || "")] = true; });
    allVerbs.forEach(function (v) {
      texts = texts.concat(collectSpeakableTextsForVerb(v.id));
    });

    // Starter verbs aren't in allVerbs (they're only offered via the "seed"
    // buttons on an empty account) — temporarily splice synthetic {id, data}
    // entries in so selectVerb() can render them exactly like a real saved
    // verb, then splice them back out. Skip any starter verb whose
    // infinitive the account already has saved, so it isn't warmed twice.
    var synthetic = [];
    STARTER_VERBS.forEach(function (sv, i) {
      if (existingInfinitives[norm(sv.infinitive || "")]) return;
      synthetic.push({ id: "__warm_starter_verb_" + i, data: sv });
    });
    synthetic.forEach(function (se) { allVerbs.push(se); });
    synthetic.forEach(function (se) {
      texts = texts.concat(collectSpeakableTextsForVerb(se.id));
    });
    if (synthetic.length) allVerbs.splice(allVerbs.length - synthetic.length, synthetic.length);

    return texts;
  }

  function warmTtsCache() {
    if (!currentUser) {
      console.error("[warm] Sign in first — this needs your real session to call the tts function.");
      return;
    }

    // Remember what the detail pane was showing before we start, so we can
    // put it back — collectSpeakableTextsForVerb() drives selectVerb() over
    // and over, which means the verb detail card will visibly flicker
    // through every verb in the collection while this runs. Expected; just
    // don't run this mid-lesson.
    var originalSelectedId = selectedId;
    var originalGustarTab = detailGustarTab;

    // See prefetchTts()'s comment for why this matters: collectAllSpeakableTexts()
    // drives selectVerb() directly (via collectSpeakableTextsForVerb()) to read
    // back which cells it marks .speakable, and without this flag that would
    // also trigger a real audio-byte prefetch for every verb's infinitive as an
    // unwanted side effect — exactly the bulk-download behavior mason chose not
    // to build. Cleared once every call in `pairs` has actually finished, in
    // runNext()'s completion branch below.
    warmTtsCacheRunning = true;

    var texts = collectAllSpeakableTexts();

    if (originalSelectedId && allVerbs.some(function (v) { return v.id === originalSelectedId; })) {
      detailGustarTab = originalGustarTab;
      selectVerb(originalSelectedId);
    } else {
      selectedId = null;
      detailGustarTab = "personal";
      el.detail.hidden = true;
    }

    var uniqueTexts = Array.from(new Set(texts.filter(function (s) { return !!s; })));
    var voiceKeys = Object.keys(TTS_VOICES);
    var pairs = [];
    voiceKeys.forEach(function (vk) {
      uniqueTexts.forEach(function (text) {
        pairs.push({ voiceKey: vk, voice: TTS_VOICES[vk], text: text });
      });
    });

    console.log("[warm] " + uniqueTexts.length + " unique texts × " + voiceKeys.length + " voices = " + pairs.length + " calls to make. Starting…");

    var stats = { hit: 0, miss: 0, error: 0 };
    var DELAY_MS = 150;

    function wait(ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function runNext(i) {
      if (i >= pairs.length) {
        warmTtsCacheRunning = false;
        console.log("[warm] done — " + stats.hit + " already cached, " + stats.miss + " newly synthesized, " + stats.error + " errors.");
        return;
      }
      var pair = pairs[i];
      supabaseClient.functions.invoke("tts", { body: { text: pair.text, voice: pair.voice } })
        .then(function (res) {
          if (res.error || !res.data || !res.data.url) throw (res.error || new Error("no_url"));
          if (res.data.cached) {
            stats.hit++;
          } else {
            stats.miss++;
            console.log("[warm] synthesized (" + pair.voiceKey + "): \"" + pair.text + "\"");
          }
        })
        .catch(function (err) {
          stats.error++;
          console.warn("[warm] FAILED (" + pair.voiceKey + "): \"" + pair.text + "\"", err);
        })
        .then(function () {
          if ((i + 1) % 25 === 0 || i + 1 === pairs.length) {
            console.log("[warm] progress: " + (i + 1) + " / " + pairs.length + " — " + stats.hit + " cached, " + stats.miss + " new, " + stats.error + " errors");
          }
          return wait(DELAY_MS);
        })
        .then(function () { runNext(i + 1); });
    }

    runNext(0);
    return "[warm] started — watch the console for progress.";
  }
  window.warmTtsCache = warmTtsCache;

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
    var listen = !!card.listen;
    el.flashCard.classList.toggle("is-listen", listen);
    el.flashFrontMain.textContent = card.frontMain;
    el.flashFrontMain.style.display = listen ? "none" : "";
    // Long prompts (definitions) step down in size so the card's other
    // contents — the mic in Hablar — keep their room.
    var mainLen = String(card.frontMain || "").length;
    el.flashFrontMain.classList.toggle("is-long", mainLen > 26 && mainLen <= 48);
    el.flashFrontMain.classList.toggle("is-longer", mainLen > 48);
    var cloze = flashCloze(card);
    el.flashFrontCloze.textContent = cloze;
    el.flashFrontCloze.hidden = !cloze;
    el.flashFrontSub.textContent = card.frontSub || "";
    el.flashFrontSub.style.display = card.frontSub && !listen ? "" : "none";
    el.flashListenBtn.hidden = !listen;
    renderListenFace(card);
    el.flashBackMain.textContent = card.backMain;
    el.flashBackMeta.textContent = card.backMeta || "";
    el.flashBackMeta.hidden = !card.backMeta;
    var backSub = cardBackSub(card); // a verb form's own English when available — see verbFormGloss()
    el.flashBackSub.textContent = backSub;
    el.flashBackSub.style.display = backSub ? "" : "none";
    el.flashBackSub.classList.toggle("listen-def", listen && card.kind !== "verb");
    el.flashBackBadges.innerHTML = "";
    el.flashBackBadges.appendChild(flashBackBadges(card));
    var ex = flashExampleText(card.data);
    el.flashBackExample.textContent = ex;
    el.flashBackExample.hidden = !ex;
    if (ex && flashBackOverflows()) el.flashBackExample.hidden = true;
    // A speak button only shows on a face whose text is actually Spanish —
    // for verbs that's both faces (infinitive front, conjugated form back),
    // for words/phrases only whichever side isn't the English definition
    // (see buildFlashDeck's frontSpeak/backSpeak). Reading the definition
    // aloud in an Argentine Spanish voice would just be noise.
    el.flashFrontSpeak.hidden = !card.frontSpeak;
    el.flashBackSpeak.hidden = !card.backSpeak;
    setKnownToggleState(el.flashKnownToggle, cardShowsKnown(card));
    renderTopicFaces(card);
    renderFlashGrade(card);
    renderFlashTally();
    renderSpeakState();
    renderHeard(card);
    fitFlashFront();
    el.flashTtsMsg.textContent = "";
    // Quietly start downloading both faces' audio as soon as this card
    // becomes the current one — most cards sit on screen for a moment
    // before anyone taps speak or flips, which is enough time for this to
    // land before it's needed. See prefetchTts() above.
    prefetchTts(card.frontSpeak);
    prefetchTts(card.backSpeak);
    prefetchTts(card.audio);
    // ...and the next two cards, so their audio is ready before you get there.
    [1, 2].forEach(function (k) {
      var c = flashDeck[flashIndex + k];
      if (!c) return;
      prefetchTts(c.frontSpeak); prefetchTts(c.backSpeak); prefetchTts(c.audio);
    });
    // Auto-play: a listening card's audio, or (Leer + switch on) the front's
    // Spanish. A short delay lets the card swap in first.
    var token = ++flashAutoToken;
    if (listen) {
      setTimeout(function () { autoPlayFlash(card.audio, el.flashListenBtn, token); }, 200);
    } else if (deckAutoPlayOn() && card.frontSpeak && !card.speak) {
      setTimeout(function () { autoPlayFlash(card.frontSpeak, el.flashFrontSpeak, token); }, 200);
    }
    el.flashProgress.textContent = (flashIndex + 1) + " / " + flashDeck.length;
    el.flashPrevBtn.disabled = flashIndex === 0;
    el.flashArrowPrev.disabled = flashIndex === 0;
    renderPartidaFaces(card);
    // force layout so the un-flip above is actually painted before we
    // re-enable the transition on the next frame
    void el.flashCard.offsetWidth;
    requestAnimationFrame(function () {
      el.flashCard.classList.remove("no-anim");
    });
  }

  // The sentence shown under a card's answer: an example written as
  // "everyday sentence / list sentence" shows its last part (the one in the
  // list's context); a single sentence shows as is.
  function flashExampleText(data) {
    var ex = String((data && data.example) || "").trim();
    if (!ex) return "";
    var parts = ex.split(" / ").map(function (s) { return s.trim(); }).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  }
  // Context for a definition → Spanish card (2026-10-05, mason: "the
  // definitions belong to the general use case, not the context"): the
  // list example under the definition, with the answer blanked out —
  // «Agarré un ___ para las valijas.» Only for words/phrases whose front is
  // the meaning (Leer definición → palabra, and Hablar); not for verbs
  // (their example usually contains the very form being asked for) or
  // listening cards. Inflected forms count as the word (valija → valijas,
  // demorado → demorada); if the answer isn't found in the sentence, the
  // sentence is shown as is — it can't give anything away.
  function clozeStrip(s) {
    // lower case, accents off, SAME length as the input (so indexes line up)
    return Array.prototype.map.call(String(s || ""), function (ch) { return ch.normalize("NFD").charAt(0).toLowerCase(); }).join("");
  }
  function flashCloze(card) {
    if (!card || card.listen || card.kind === "verb" || !card.backSpeak || card.frontSpeak) return "";
    var ex = flashExampleText(card.data);
    if (!ex) return "";
    var answer = String(card.backSpeak || "").trim();
    var sStrip = clozeStrip(ex);
    var aStrip = clozeStrip(answer).replace(/^[¿¡]+|[?!.]+$/g, "").trim();
    var out = ex;
    if (aStrip.indexOf(" ") !== -1) {
      var at = sStrip.indexOf(aStrip);
      if (at !== -1) out = ex.slice(0, at) + "___" + ex.slice(at + aStrip.length);
    } else if (aStrip) {
      var stem = aStrip;
      for (var k = 0; k < 2 && stem.length > 4 && /[aeos]$/.test(stem); k++) stem = stem.slice(0, -1);
      var re = /[a-zñ]+/g, m, pieces = [], last = 0;
      while ((m = re.exec(sStrip))) {
        var tok = m[0];
        if (tok === aStrip || (tok.indexOf(stem) === 0 && Math.abs(tok.length - aStrip.length) <= 3)) {
          pieces.push(ex.slice(last, m.index), "___");
          last = m.index + tok.length;
        }
      }
      if (pieces.length) out = pieces.join("") + ex.slice(last);
    }
    return "«" + out + "»";
  }

  // Front-face fit (2026-10-05): if a long prompt + context don't fit above
  // the mic, drop the context sentence (then a problem message, last).
  function flashFaceOverflows(face) {
    if (!face || !face.clientHeight) return false;
    var cs = getComputedStyle(face);
    var gap = parseFloat(cs.rowGap || cs.gap) || 0;
    var total = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    var n = 0;
    Array.prototype.forEach.call(face.children, function (ch) {
      if (ch.classList.contains("flash-speak-btn") || ch.hidden) return;
      var chs = getComputedStyle(ch);
      if (chs.display === "none" || chs.position === "absolute") return; // the pinned mic/speaker has its own reserved space
      total += ch.offsetHeight; n++;
    });
    total += gap * Math.max(0, n - 1);
    return total > face.clientHeight + 1;
  }
  function fitFlashFront() {
    var face = el.flashFrontMain && el.flashFrontMain.parentNode;
    if (!face) return;
    el.flashSpeakHint.style.display = "";
    el.flashFrontCloze.style.display = "";
    if (!flashFaceOverflows(face)) return;
    // The hint line is only ever a problem message now, so it outranks the
    // context sentence: that goes first.
    if (!el.flashFrontCloze.hidden) { el.flashFrontCloze.style.display = "none"; if (!flashFaceOverflows(face)) return; }
    if (!el.flashSpeakHint.hidden) el.flashSpeakHint.style.display = "none";
  }

  // Whether the back face's content is taller than the card (a long
  // definition on a short phone screen). Layout sizes, so the card's 3D
  // rotation doesn't matter.
  function flashBackOverflows() {
    var back = el.flashBackMain.closest(".flash-back");
    if (!back || !back.clientHeight) return false;
    var cs = getComputedStyle(back);
    var gap = parseFloat(cs.rowGap || cs.gap) || 0;
    var total = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    var n = 0;
    Array.prototype.forEach.call(back.children, function (ch) {
      if (ch.classList.contains("flash-speak-btn") || ch.hidden || getComputedStyle(ch).display === "none") return;
      total += ch.offsetHeight; n++;
    });
    total += gap * Math.max(0, n - 1);
    return total > back.clientHeight + 1;
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

  // ---- Leer / Escuchar + audio automático (2026-10-03) ----
  // mason picked both from a mockup: "Escuchar" cards whose front is audio
  // only (hear the word or the conjugated form, flip to see it written with
  // its meaning), and a switch that plays the Spanish by itself in normal
  // (Leer) cards. Quiet mode wins over both.
  function effectiveFlashMode() { return quietMode ? "leer" : flashMode; }
  function flashAutoPlayOn() { return !quietMode && (effectiveFlashMode() === "escuchar" || flashAutoPlay); }
  // In a Partida each card has its own mode, so Leer cards follow just the
  // "Reproducir el audio solo" switch.
  function deckAutoPlayOn() { return ptActive() ? (!quietMode && flashAutoPlay) : flashAutoPlayOn(); }

  function renderFlashModeControls() {
    if (!el.flashModeRead) return;
    var mode = effectiveFlashMode();
    el.flashModeRead.classList.toggle("active", mode === "leer");
    el.flashModeListen.classList.toggle("active", mode === "escuchar");
    el.flashModeListen.disabled = quietMode;
    if (el.flashModeSpeak) {
      el.flashModeSpeak.classList.toggle("active", mode === "hablar");
      el.flashModeSpeak.disabled = quietMode;
    }
    el.flashModeNote.textContent = t(quietMode ? "flash_mode_note_quiet" : (mode === "escuchar" ? "flash_mode_note_listen" : (mode === "hablar" ? (hablarSupported() ? "flash_mode_note_speak" : "speak_unsupported") : "flash_mode_note_read")));
    el.flashModeNote.classList.toggle("is-warn", quietMode);
    var locked = quietMode || mode === "escuchar";
    el.flashAutoplay.checked = flashAutoPlayOn();
    el.flashAutoplay.disabled = locked;
    el.flashAutoplayLabel.classList.toggle("is-disabled", locked);
    el.flashAutoplayNote.textContent = t(quietMode ? "flash_autoplay_note_quiet" : (mode === "escuchar" ? "flash_autoplay_note_listen" : (mode === "hablar" ? "flash_autoplay_note_speak" : "flash_autoplay_note")));
    if (el.flashWordOptions) el.flashWordOptions.hidden = (!activeFlashSources.words && !activeFlashSources.phrases) || mode === "escuchar" || mode === "hablar";
  }

  function setFlashMode(mode) {
    if ((mode === "escuchar" || mode === "hablar") && quietMode) return;
    flashMode = mode === "escuchar" || mode === "hablar" ? mode : "leer";
    try { localStorage.setItem(FLASH_MODE_LOCAL_KEY, flashMode); } catch (e) {}
    renderFlashModeControls();
    renderTopicModeControls();
  }

  // Listening cards are the ordinary cards (built "palabra → definición"
  // so every word/phrase card knows its Spanish and its meaning), turned
  // around: the front is audio only, the back shows the Spanish written
  // with its meaning — for verbs, the form plus which verb, person and
  // tense it is, and the form's English.
  function buildListenDeck() {
    var saved = flashDirection;
    flashDirection = "word2def";
    var deck;
    try { deck = buildFlashDeck(); } finally { flashDirection = saved; }
    return deck.map(listenCard);
  }

  // The quiet tag over an Escuchar card's waveform (mason, 2026-10-05:
  // "probably the right amount of help for a low A2"): what kind of thing
  // you're about to hear — "sustantivo · femenino", "pregunta", and for a
  // verb its person and tense ("vos · presente"). If that ever becomes too
  // much help, the verb case is the one to cut back to just "verbo".
  function listenTagText(c) {
    var d = c.data || {};
    if (c.kind === "verb") return c.frontSub || "";
    if (c.kind === "word") return [d.partOfSpeech, d.gender].filter(Boolean).map(tagLabel).join(" · ");
    return d.function ? tagLabel(d.function) : "";
  }

  // One ordinary card turned into a listening card. Words/phrases must be
  // built "word2def" (Spanish on the front) before this.
  function listenCard(c) {
    var out = Object.assign({}, c, { listen: true, frontMain: "", frontSub: "", frontSpeak: "" });
    out.listenTag = listenTagText(c);
    if (c.kind === "topic") {
      out.audio = c.backSpeak;
      out.backMain = c.listenBackMain || c.backMain;
      out.backSub = c.listenBackSub || "";
      out.backSpeak = c.backSpeak;
      out.listenTag = c.listenTag || "";
      return out;
    }
    if (c.kind === "verb") {
      out.audio = c.backSpeak || c.backMain;
      out.backMeta = (c.frontMain || "") + (c.frontSub ? " · " + c.frontSub : "");
    } else {
      out.audio = c.frontSpeak || c.frontMain;
      out.backMain = c.frontMain;
      out.backSub = c.backMain && c.backMain !== "—" ? c.backMain : "";
      out.backSpeak = out.audio;
    }
    return out;
  }

  // ---- Escuchar waveform (2026-10-05) ----
  // Drawn from the card's own TTS clip (the bytes ttsLoadAudio() already
  // downloads for playback, so no extra request): loudness every 25 ms,
  // silence trimmed off both ends, scaled to the loudest moment. One bar
  // per 25 ms, so length follows the clip; clips too long for the card
  // are squeezed (each bar keeps the loudest of what it covers). Kept in
  // memory per clip. If the audio can't be decoded the card just shows
  // the tag and the speaker, as before.
  var WAVE_STEP_S = 0.025;
  var wavePeaks = {};    // ttsKey -> number[] (0..1)
  var waveLoading = {};  // ttsKey -> Promise
  var waveRaf = 0;
  function waveDecode(ab) {
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return Promise.reject(new Error("no_audio_context"));
    var ctx = new OAC(1, 1, 44100);
    return new Promise(function (resolve, reject) { ctx.decodeAudioData(ab, resolve, reject); });
  }
  function wavePeaksFrom(buf) {
    var data = buf.getChannelData(0), win = Math.max(1, Math.round(buf.sampleRate * WAVE_STEP_S)), out = [];
    for (var i = 0; i < data.length; i += win) {
      var sum = 0, n = Math.min(win, data.length - i);
      for (var j = 0; j < n; j++) sum += data[i + j] * data[i + j];
      out.push(Math.sqrt(sum / n));
    }
    var max = Math.max.apply(null, out.concat([1e-6]));
    var a = 0, b = out.length - 1;
    while (a < b && out[a] < max * 0.03) a++;
    while (b > a && out[b] < max * 0.03) b--;
    // The bars only cover the speech, so keep where it starts and ends in
    // the clip: playback is mapped onto that span, not the whole file.
    // (Bug, mason 2026-10-05: the fill ran late and finished well after
    // the voice did, because the clip's silent lead-in and tail were
    // trimmed from the bars but not from the timing.)
    return {
      bars: out.slice(a, b + 1).map(function (v) { return Math.pow(v / max, 0.8); }),
      t0: a * WAVE_STEP_S,
      t1: (b + 1) * WAVE_STEP_S
    };
  }
  function waveLoad(text) {
    var key = ttsKey(text);
    if (wavePeaks[key]) return Promise.resolve(wavePeaks[key]);
    if (waveLoading[key]) return waveLoading[key];
    // Never asks for audio itself (that would double the Edge Function
    // calls when audio fails): it uses the clip once playback or prefetch
    // has it — already downloaded, or still on its way.
    var pending = ttsBlobUrls[key] ? Promise.resolve({ src: ttsBlobUrls[key] }) : ttsLoading[key];
    if (!pending) return Promise.reject(new Error("not_loaded"));
    var p = pending.then(function (r) {
      return fetch(r.src).then(function (resp) { if (!resp.ok) throw new Error("http_" + resp.status); return resp.arrayBuffer(); });
    }).then(waveDecode).then(function (buf) {
      var peaks = wavePeaksFrom(buf);
      if (!peaks.bars.length) throw new Error("silent");
      wavePeaks[key] = peaks;
      return peaks;
    });
    waveLoading[key] = p;
    var clear = function () { if (waveLoading[key] === p) delete waveLoading[key]; };
    p.then(clear, clear);
    return p;
  }
  function waveDraw(wave, fresh) {
    var peaks = wave.bars;
    var w = el.flashWave;
    w.textContent = "";
    var room = (w.parentNode && w.parentNode.clientWidth) || 300;
    var maxBars = Math.max(8, Math.floor(room / 5));
    var bars = peaks;
    if (bars.length > maxBars) {
      var k = bars.length / maxBars;
      bars = [];
      for (var i = 0; i < maxBars; i++) bars.push(Math.max.apply(null, peaks.slice(Math.floor(i * k), Math.max(Math.floor(i * k) + 1, Math.floor((i + 1) * k)))));
    }
    var frag = document.createDocumentFragment();
    bars.forEach(function (v) { var b = document.createElement("i"); b.style.height = Math.max(4, Math.round(v * 60)) + "px"; frag.appendChild(b); });
    w.appendChild(frag);
    w.classList.toggle("is-new", !!fresh);
  }
  function renderListenFace(card) {
    var listen = !!(card && card.listen);
    el.flashListenFace.hidden = !listen;
    cancelAnimationFrame(waveRaf);
    el.flashWave.textContent = "";
    if (!listen) return;
    el.flashListenTag.textContent = card.listenTag || "";
    var key = ttsKey(card.audio);
    if (wavePeaks[key]) { waveDraw(wavePeaks[key], false); return; }
    waveShow(card);
  }
  function waveShow(card) {
    waveLoad(card.audio).then(function (peaks) {
      if (flashDeck[flashIndex] === card && !el.flashOverlay.hidden && !el.flashWave.children.length) waveDraw(peaks, true);
    }, function (err) { if (err && err.message !== "not_loaded") console.log("[wave] no waveform for \"" + card.audio + "\":", err.message); });
  }
  // Fills the bars in from the left while the clip plays.
  function waveFollowPlayback(text) {
    var card = flashDeck[flashIndex];
    if (!card || !card.listen || card.audio !== text) return;
    cancelAnimationFrame(waveRaf);
    if (!el.flashWave.children.length) waveShow(card); // the clip has just arrived
    var bars = el.flashWave.children;
    var key = ttsKey(text);
    var step = function () {
      var a = ttsAudioEl;
      var playing = a && !a.paused && !a.ended && flashDeck[flashIndex] === card && ttsActiveEl === el.flashListenBtn;
      var wave = wavePeaks[key];
      var frac = 0;
      if (playing && wave) frac = Math.max(0, Math.min(1, (a.currentTime - wave.t0) / Math.max(0.05, wave.t1 - wave.t0)));
      else if (playing && a.duration) frac = a.currentTime / a.duration;
      var on = Math.ceil(frac * bars.length);
      for (var i = 0; i < bars.length; i++) bars[i].classList.toggle("on", playing && i < on);
      if (playing) waveRaf = requestAnimationFrame(step);
    };
    waveRaf = requestAnimationFrame(step);
  }

  window.voseWaveState = function () {
    var card = flashDeck[flashIndex], w = card && card.listen ? wavePeaks[ttsKey(card.audio)] : null;
    return { t: ttsAudioEl ? ttsAudioEl.currentTime : null, playing: !!(ttsAudioEl && !ttsAudioEl.paused), t0: w ? w.t0 : null, t1: w ? w.t1 : null, bars: el.flashWave.children.length, on: el.flashWave.querySelectorAll("i.on").length };
  };

  // iOS only lets a page start audio from a tap; playing one silent clip on
  // the shared <audio> element during the Empezar tap "unlocks" it, so the
  // automatic plays that follow (after a fetch, not inside a tap) work.
  var SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
  function unlockTtsAudio() {
    try {
      if (!ttsAudioEl) ttsAudioEl = new Audio();
      ttsAudioEl.src = SILENT_WAV;
      var pr = ttsAudioEl.play();
      if (pr && pr.catch) pr.catch(function () {});
    } catch (e) {}
  }

  // Plays a card's Spanish by itself. Waits briefly if an earlier clip is
  // still being fetched; gives up quietly if the card has moved on, quiet
  // mode is on, or the audio fails (the speaker button is still there).
  function autoPlayFlash(text, btn, token, tries) {
    if (!text || quietMode || token !== flashAutoToken || el.flashOverlay.hidden) return;
    if (ttsInFlight) {
      if ((tries || 0) < 8) setTimeout(function () { autoPlayFlash(text, btn, token, (tries || 0) + 1); }, 250);
      return;
    }
    playTts(text, btn, el.flashTtsMsg, { silent: true });
  }

  function startFlashcards() {
    var mode = effectiveFlashMode();
    var cards = mode === "escuchar" ? buildListenDeck() : (mode === "hablar" ? buildSpeakDeck() : buildFlashDeck());
    if (cards.length === 0) {
      el.flashSetupMsg.textContent = t("flash_no_cards");
      return;
    }
    el.flashSetupMsg.textContent = "";
    openFlashDeck(cards, "setup");
  }

  // "setup": the deck built from the Tarjetas setup (passes follow the tabs'
  // Sabido chips). "practice": a deck started from Progreso or the last-
  // session card — it repeats until every card has been marked Bien.
  var flashDeckSource = "setup";
  function openFlashDeck(cards, source) {
    if (!cards.length) return false;
    flashDeckSource = source || "setup";
    if (flashAutoPlayOn()) unlockTtsAudio();
    if (cards.some(function (c) { return c.speak; })) hablarPrepareMic(); // inside the tap, so iOS asks for the mic here
    flashDeck = flashDeckSource === "partida" ? cards : shuffleArray(cards); // Partida keeps its own order
    flashIndex = 0;
    el.flashOverlay.classList.remove("is-done");
    // only the card itself flips to the opposite theme — the overlay's
    // background, topbar, and controls stay in the app's actual theme.
    el.flashCard.setAttribute("data-theme", ambientIsDark() ? "light" : "dark");
    el.flashOverlay.hidden = false;
    practiceStartSession();
    playDeckStart();
    renderFlashCard();
    practiceOpenView(flashDeck[flashIndex]);
    return true;
  }

  function nextFlashCard() {
    if (!flashDeck.length) return;
    hablarAbort();
    var leaving = flashDeck[flashIndex];
    practiceCloseView();
    if (ptActive()) { ptOnLeave(leaving); ptEnsureAhead(PT_AHEAD); } // Partida never reaches the end
    flashIndex++;
    if (flashIndex >= flashDeck.length) {
      // End of a pass. Cards marked (or un-marked) Sabido during it stay put
      // until here — so going back within a pass still works — and only now
      // does the tab's Sabido chip get re-applied: see cardStaysForNextPass().
      var practiceDeck = flashDeckSource === "practice";
      var nextPass = flashDeck.filter(practiceDeck ? function (c) { return c._grade !== "bien"; } : cardStaysForNextPass);
      var reviewMode = !practiceDeck && flashDeck.some(cardInReviewMode);
      practiceEndPass();
      if (!nextPass.length) { showFlashDone(reviewMode, practiceDeck ? "flash_done_text_practice" : null); practiceFlush(); return; }
      flashDeck = shuffleArray(nextPass);
      flashIndex = 0;
      practiceFlush();
    }
    renderFlashCard();
    practiceOpenView(flashDeck[flashIndex]);
  }

  function prevFlashCard() {
    if (flashIndex <= 0) return;
    hablarAbort();
    practiceCloseView();
    flashIndex--;
    renderFlashCard();
    practiceOpenView(flashDeck[flashIndex]);
  }

  function closeFlashcards() {
    hablarRelease();
    hablarDropRecordings();
    practiceCloseView();
    practiceSession = null;
    practiceFlush();
    el.flashOverlay.hidden = true;
    el.flashOverlay.classList.remove("is-done");
    ptEnd();
    renderFlashCombo();
    refreshPracticeViews();
  }

  function toggleFlashFlip() {
    if (hablarRec && hablarRec.card === flashDeck[flashIndex]) { hablarStop(); return; }
    el.flashCard.classList.toggle("flipped");
    practiceNoteFlip(el.flashCard.classList.contains("flipped"));
    // Leer + audio automático: the back's Spanish plays as it turns over
    // (Escuchar already played it on the front; its back has a speaker).
    var card = flashDeck[flashIndex];
    if (card && !card.listen && el.flashCard.classList.contains("flipped") && deckAutoPlayOn() && card.backSpeak) {
      autoPlayFlash(card.backSpeak, el.flashBackSpeak, flashAutoToken);
    }
  }


  // ================= Practice log (2026-10-03) =================
  // One row per card shown in a deck, saved to public.practice_log (see the
  // end of schema.sql). It is the history the Progreso tab and the "Tu
  // historial" panels will be built from, so it records more than any
  // screen shows today: how you graded the card (the Otra vez | Bien switch
  // under it — mason's "option B": it only marks, swiping still moves on),
  // how long until you flipped it and how long you spent on each face,
  // speaker taps, whether you came back to it in the same pass, and
  // whether its Sabido mark changed.
  //
  // Rows queue up on the device (localStorage, so nothing is lost offline
  // or if the app is closed mid-deck) and go to the server in small
  // batches: every PRACTICE_FLUSH_AT cards, at the end of each pass, when
  // the deck closes, when the app goes to the background, and after
  // signing in. Each row carries a client-made id, so re-sending a batch
  // after a dropped connection can't create duplicates.

  var PRACTICE_QUEUE_KEY = "iv-practice-queue";
  var PRACTICE_OPEN_KEY = "iv-practice-open";
  var PRACTICE_QUEUE_MAX = 1500;
  var PRACTICE_FLUSH_AT = 20;
  var PRACTICE_BATCH = 100;
  var PRACTICE_FACE_MAX_MS = 10 * 60 * 1000; // a card left open for ages counts as 10 minutes
  var practiceQueue = [];
  var practiceSession = null; // { id, pass, position, seen: {cardKey: true} } while a deck is open
  var practiceView = null;    // the card on screen: { card, row, face: "front"|"back", since, paused }
  var practiceFlushing = false;
  var practiceTallyBase = { bien: 0, otra: 0 }; // grades from earlier passes of this deck
  var practiceDeviceType = null;

  try { practiceQueue = JSON.parse(localStorage.getItem(PRACTICE_QUEUE_KEY) || "[]") || []; } catch (e) { practiceQueue = []; }
  if (!Array.isArray(practiceQueue)) practiceQueue = [];
  // A card that was on screen when the app was last closed from the background.
  try {
    var practiceOrphan = JSON.parse(localStorage.getItem(PRACTICE_OPEN_KEY) || "null");
    if (practiceOrphan && practiceOrphan.id) practiceQueue.push(practiceOrphan);
    localStorage.removeItem(PRACTICE_OPEN_KEY);
  } catch (e) {}

  function savePracticeQueue() {
    if (practiceQueue.length > PRACTICE_QUEUE_MAX) practiceQueue = practiceQueue.slice(practiceQueue.length - PRACTICE_QUEUE_MAX);
    try { localStorage.setItem(PRACTICE_QUEUE_KEY, JSON.stringify(practiceQueue)); } catch (e) {}
  }

  function practiceUuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
    else for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 0x100).toString(16).slice(1); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }

  function practiceDevice() {
    if (practiceDeviceType) return practiceDeviceType;
    var coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    var short = Math.min(window.screen ? screen.width : 0, window.screen ? screen.height : 0) || window.innerWidth;
    practiceDeviceType = !coarse ? "desktop" : (short >= 600 ? "tablet" : "phone");
    return practiceDeviceType;
  }

  // Same normalisation as schema.sql's vosea_norm(): no accents, lower case.
  function practiceNorm(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  }
  function practiceCardKey(card) {
    var d = card.data || {};
    return card.kind + "|" + practiceNorm(d.infinitive || d.word || d.phrase || d.topic) + "|" + (card.formKey || "");
  }

  function practiceStartSession() {
    practiceSession = { id: practiceUuid(), pass: 1, position: 0, seen: {} };
    practiceTallyBase = { bien: 0, otra: 0 };
    flashDeck.forEach(function (c) { c._grade = null; c._gradeTouched = false; c._speech = null; });
    practiceView = null;
  }

  // Grades belong to a card for one pass; the next pass starts ungraded.
  function practiceEndPass() {
    if (!practiceSession) return;
    flashDeck.forEach(function (c) {
      if (c._grade) practiceTallyBase[c._grade]++;
      c._grade = null;
      c._gradeTouched = false;
      c._speech = null;
    });
    practiceSession.pass++;
    practiceSession.seen = {};
  }

  function practiceOpenView(card) {
    practiceCloseView();
    if (!practiceSession || !card) return;
    var key = practiceCardKey(card);
    var d = card.data || {};
    practiceSession.position++;
    var known = cardShowsKnown(card);
    practiceView = {
      card: card, face: "front", since: Date.now(), paused: document.hidden,
      row: {
        id: practiceUuid(),
        user_id: currentUser ? currentUser.id : null,
        session_id: practiceSession.id,
        shown_at: new Date().toISOString(),
        item_kind: card.kind,
        item_id: findItemId(card.kind, card.data),
        item_key: practiceNorm(d.infinitive || d.word || d.phrase || d.topic),
        form_key: card.formKey || null,
        mode: card.listen ? "escuchar" : (card.speak ? "hablar" : "leer"),
        direction: card.listen ? "audio" : (card.kind === "verb" ? "inf2form" : (card.kind === "topic" ? "topic" : (card.speak ? "def2word" : (card.dir || flashDirection)))),
        pass: practiceSession.pass,
        position: practiceSession.position,
        revisit: !!practiceSession.seen[key],
        grade: null, grade_auto: false, grade_changes: 0,
        flipped: false, flips: 0, ms_to_flip: null, ms_front: 0, ms_back: 0,
        audio_plays: 0,
        known_before: known, known_after: known,
        device: practiceDevice()
      }
    };
    practiceSession.seen[key] = true;
  }

  // Adds the time since the last face change (or resume) to the face on screen.
  function practiceTick() {
    var v = practiceView;
    if (!v || v.paused) return;
    var now = Date.now();
    var ms = Math.min(Math.max(0, now - v.since), PRACTICE_FACE_MAX_MS);
    if (v.face === "back") v.row.ms_back += ms; else v.row.ms_front += ms;
    v.since = now;
  }

  function practiceNoteFlip(flipped) {
    var v = practiceView;
    if (!v) return;
    practiceTick();
    v.row.flips++;
    if (flipped && !v.row.flipped) {
      v.row.flipped = true;
      v.row.ms_to_flip = v.row.ms_front;
    }
    v.face = flipped ? "back" : "front";
    renderFlashGrade(v.card);
  }

  function practiceNoteAudio() { if (practiceView) practiceView.row.audio_plays++; }

  function practiceFinishRow() {
    var v = practiceView;
    practiceTick();
    v.row.grade = v.card._grade || null;
    // Hablar: did the final grade come from the automatic suggestion, untouched?
    if (v.row.speech) v.row.grade_auto = !!(v.row.speech.auto_grade && v.row.grade === v.row.speech.auto_grade && !v.card._gradeTouched);
    v.row.known_after = cardShowsKnown(v.card);
    if (!v.row.user_id && currentUser) v.row.user_id = currentUser.id;
    return v.row;
  }

  function practiceCloseView() {
    if (!practiceView) return;
    var row = practiceFinishRow();
    practiceView = null;
    if (!row.user_id) return; // not signed in — nothing to save it under
    practiceQueue.push(row);
    savePracticeQueue();
    if (practiceQueue.length >= PRACTICE_FLUSH_AT) practiceFlush();
    playAfterRow(row);
  }

  function practiceFlush() {
    if (practiceFlushing || !currentUser || !practiceQueue.length) return;
    var mine = practiceQueue.filter(function (r) { return r.user_id === currentUser.id; });
    if (!mine.length) return;
    // Rows without Hablar details go first, in their own batch: if the
    // practice_log.speech column isn't there yet (pending SQL not run),
    // only the Hablar rows wait.
    // Topic rows (2026-10-06) go last, on their own, for the same reason:
    // practice_log only accepts item_kind 'topic' once
    // pending_2026-10-06_temas.sql has run.
    var classic = mine.filter(function (r) { return r.item_kind !== "topic"; });
    var plain = classic.filter(function (r) { return !r.speech; });
    var batch = (plain.length ? plain : (classic.length ? classic : mine)).slice(0, PRACTICE_BATCH);
    practiceFlushing = true;
    supabaseClient.from("practice_log").upsert(batch, { onConflict: "id", ignoreDuplicates: true }).then(function (res) {
      practiceFlushing = false;
      if (res && res.error) { console.warn("[practice] not saved yet (will retry):", res.error.message); return; }
      var sent = {};
      batch.forEach(function (r) { sent[r.id] = true; });
      practiceNoteSent(batch);
      practiceQueue = practiceQueue.filter(function (r) { return !sent[r.id]; });
      savePracticeQueue();
      if (practiceQueue.some(function (r) { return r.user_id === currentUser.id; })) practiceFlush();
    }, function (err) {
      practiceFlushing = false;
      console.warn("[practice] not saved yet (will retry):", err && err.message);
    });
  }

  // Going to the background (switching apps, locking the phone) pauses the
  // clock and sends what's queued; the card on screen is parked so it isn't
  // lost if the app is closed from there. Coming back resumes the same card.
  function practiceOnHide() {
    if (practiceView && !practiceView.paused) {
      practiceTick();
      practiceView.paused = true;
      try {
        var draft = Object.assign({}, practiceView.row, { grade: practiceView.card._grade || null, known_after: cardShowsKnown(practiceView.card) });
        if (draft.user_id) localStorage.setItem(PRACTICE_OPEN_KEY, JSON.stringify(draft));
      } catch (e) {}
    }
    practiceFlush();
  }
  function practiceOnShow() {
    try { localStorage.removeItem(PRACTICE_OPEN_KEY); } catch (e) {}
    if (practiceView && practiceView.paused) { practiceView.paused = false; practiceView.since = Date.now(); }
    practiceFlush();
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) practiceOnHide(); else practiceOnShow(); });
  window.addEventListener("pagehide", practiceOnHide);
  window.addEventListener("online", practiceFlush);

  // ---- the Otra vez | Bien switch ----
  function setFlashGrade(grade) {
    var card = flashDeck[flashIndex];
    if (!card) return;
    card._grade = card._grade === grade ? null : grade; // tapping the lit one clears it
    card._gradeTouched = true;
    if (practiceView && practiceView.card === card) practiceView.row.grade_changes++;
    renderFlashGrade(card);
    renderFlashTally();
  }

  function renderFlashGrade(card) {
    if (!el.flashGrade) return;
    var g = card ? card._grade : null;
    var shown = !!g || !!(practiceView && practiceView.card === card && practiceView.row.flipped) || el.flashCard.classList.contains("flipped");
    el.flashGrade.classList.toggle("is-hidden", !shown);
    el.flashGradeOtra.setAttribute("aria-pressed", g === "otra" ? "true" : "false");
    el.flashGradeBien.setAttribute("aria-pressed", g === "bien" ? "true" : "false");
    el.flashGradeOtra.tabIndex = shown ? 0 : -1;
    el.flashGradeBien.tabIndex = shown ? 0 : -1;
    renderPartidaNote(card);
  }

  // "5 bien · 1 otra vez" in the top bar, for this deck so far; hidden until
  // the first grade.
  function renderFlashTally() {
    if (!el.flashTally) return;
    if (ptActive()) { el.flashTally.hidden = true; return; } // Partida: the counts are in its summary
    var b = practiceTallyBase.bien, o = practiceTallyBase.otra;
    flashDeck.forEach(function (c) { if (c._grade === "bien") b++; else if (c._grade === "otra") o++; });
    el.flashTally.hidden = !(b || o);
    el.flashTally.innerHTML = "";
    if (!(b || o)) return;
    var parts = t("flash_tally").split(/(\{b\}|\{o\})/);
    parts.forEach(function (part) {
      if (part === "{b}" || part === "{o}") {
        var n = document.createElement("b");
        n.className = part === "{b}" ? "tally-bien" : "tally-otra";
        n.textContent = String(part === "{b}" ? b : o);
        el.flashTally.appendChild(n);
      } else if (part) {
        el.flashTally.appendChild(document.createTextNode(part));
      }
    });
  }

  // Test/debug hook: what's waiting to be sent.
  window.vosePracticeQueue = function () { return practiceQueue.slice(); };



  // ================= Hablar (2026-10-04) =================
  // The third "Cómo practicar" mode: the front shows the meaning (or the
  // verb + person + tense), you tap the mic and SAY the Spanish, and the
  // card turns over by itself showing what Azure heard and a suggested
  // Bien / Otra vez in the grade switch — which you can always change.
  //
  // The grading rule comes from the two test rounds on hablar-prueba.html
  // (64 recordings, mason + Alexa; see the roadmap doc):
  //   A. what it heard matches the answer (no accents, spaces ignored, extra
  //      words like "vos" or "la" allowed) → Bien. In testing a wrong answer
  //      never matched (0/24), so this is safe.
  //   B. otherwise, Azure's es-AR pronunciation check against the answer:
  //      accuracy ≥ HABLAR_MIN_ACCURACY, no single sound below
  //      HABLAR_MIN_PHONEME and no word flagged → Bien. This rescues correct
  //      single words the recogniser misheard ("vale hija" for valija).
  //   C. not sure (2026-10-04, mason): no match, and the score is in the
  //      in-between band — accuracy ≥ HABLAR_UNSURE_FLOOR but not a clean
  //      B (a weak sound or a flagged word) — → NO suggestion; you grade it.
  //      In testing that band held most near-miss wrong answers (comemos
  //      for comimos 76, despachaste 82–85, polo 93 with one sound at 32)
  //      but also a correct "lluvia" at 82. Logged as rule "unsure" so the
  //      band itself can be tuned.
  //   D. otherwise (clearly low) → Otra vez. Nothing heard → no suggestion.
  // Those two numbers are first guesses; every Hablar card logs what was
  // heard, the scores, the suggestion and whether you changed it
  // (practice_log.speech), so they can be re-tuned from real practice.
  // Audio is never stored: it goes to the "stt" Edge Function and back.
  var HABLAR_MAX_MS = 6000;
  var HABLAR_MIN_ACCURACY = 90;
  var HABLAR_MIN_PHONEME = 60;
  var HABLAR_UNSURE_FLOOR = 75;
  var hablarStream = null;
  var hablarStreamPromise = null;
  var hablarRec = null;      // the recording in progress: { card, mr, chunks, started, tick, auto, cancelled }
  var hablarBusyCard = null; // the card whose recording is being analysed
  var hablarHintOverride = null; // { card, text } — a one-off message (mic refused, ...)

  function hablarSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  // One microphone stream for the whole deck (asked for during the Empezar
  // tap, so the permission prompt comes up there, not mid-deck); released
  // when the deck closes or the app goes to the background.
  function hablarGetStream() {
    if (hablarStream && hablarStream.getAudioTracks().some(function (tr) { return tr.readyState === "live"; })) return Promise.resolve(hablarStream);
    if (hablarStreamPromise) return hablarStreamPromise;
    hablarStreamPromise = navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }).then(function (s) {
      hablarStream = s; hablarStreamPromise = null; return s;
    }, function (err) { hablarStreamPromise = null; throw err; });
    return hablarStreamPromise;
  }
  function hablarPrepareMic() {
    if (!hablarSupported()) return;
    hablarGetStream().catch(function () {});
  }
  function hablarRelease() {
    hablarAbort();
    if (hablarStream) { hablarStream.getTracks().forEach(function (tr) { tr.stop(); }); hablarStream = null; }
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) hablarRelease(); });

  // What the card expects, for matching: gustar-mode cells hold two
  // answers ("me gusta / me gustan").
  function speakAnswers(card) {
    if (card.answers && card.answers.length) return card.answers.slice(); // topics: every accepted way to say it
    return String(card.backMain || "").split(/\s*\/\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function speakCard(c) { return Object.assign({}, c, { speak: true }); }
  function buildSpeakDeck() {
    // Always prompt → Spanish: the meaning on the front for words/phrases.
    var saved = flashDirection;
    flashDirection = "def2word";
    var deck;
    try { deck = buildFlashDeck(); } finally { flashDirection = saved; }
    return deck.map(speakCard);
  }

  function speechNorm(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[¿?¡!.,;:«»"()]/g, " ").replace(/\s+/g, " ").trim();
  }
  function speechMatches(expected, heard) {
    var e = speechNorm(expected), h = speechNorm(heard);
    if (!e || !h) return false;
    if (e === h) return true;
    if (e.replace(/ /g, "") === h.replace(/ /g, "")) return true; // "de morado" = demorado
    return (" " + h + " ").indexOf(" " + e + " ") !== -1;          // "vos tenés", "la valija"
  }

  function hablarJudge(card, data) {
    var h = (data && data.heard) || {};
    var heard = h.ok ? (h.lexical || h.display || "") : "";
    var a = ((data && data.assessments) || [])[0] || {};
    var scored = !!(a.ok && a.scores && a.scores.accuracy != null);
    var minPh = null, wordErr = false;
    (a.words || []).forEach(function (w) {
      if (w.error && w.error !== "None") wordErr = true;
      (w.phonemes || []).forEach(function (ph) { if (ph.accuracy != null && (minPh === null || ph.accuracy < minPh)) minPh = ph.accuracy; });
    });
    var res = {
      heard: heard,
      heard_display: h.display || "",
      recognition: h.recognitionStatus || (h.error ? "error" : null),
      accuracy: scored ? a.scores.accuracy : null,
      pron: scored ? a.scores.pron : null,
      min_phoneme: minPh,
      word_error: wordErr,
      // false when the function skipped the scoring call (transcript matched)
      assessed: !!((data && data.assessments) || []).length
    };
    // A number can come back written in digits ("4372"): compare digits.
    var heardDigits = card.digits ? String(h.display || "").replace(/\D/g, "") : "";
    if ((heard && speakAnswers(card).some(function (ans) { return speechMatches(ans, heard); })) || (heardDigits && heardDigits === card.digits)) {
      res.auto_grade = "bien"; res.rule = "transcript";
    } else if (scored && res.accuracy >= HABLAR_MIN_ACCURACY && (minPh === null || minPh >= HABLAR_MIN_PHONEME) && !wordErr) {
      res.auto_grade = "bien"; res.rule = "score";
    } else if (!heard && (!scored || res.accuracy < 30)) {
      res.auto_grade = null; res.rule = "nothing";
    } else if (scored && res.accuracy >= HABLAR_UNSURE_FLOOR) {
      res.auto_grade = null; res.rule = "unsure";
    } else {
      res.auto_grade = "otra"; res.rule = "none";
    }
    return res;
  }

  // ---- recording ----
  function hablarToggle() {
    var card = flashDeck[flashIndex];
    if (!card || !card.speak) return;
    if (hablarRec) { if (hablarRec.card === card) hablarStop(); return; }
    if (hablarBusyCard === card) return;
    if (!hablarSupported()) { hablarHint(card, t("speak_unsupported")); return; }
    if (ttsAudioEl) { try { ttsAudioEl.pause(); } catch (e) {} } // don't record our own voice
    hablarStopPlayback();
    hablarGetStream().then(function (stream) {
      if (flashDeck[flashIndex] !== card || el.flashOverlay.hidden || hablarRec) return;
      var mr;
      try { mr = new MediaRecorder(stream); } catch (e) { hablarHint(card, t("speak_unsupported")); return; }
      var rec = { card: card, mr: mr, chunks: [], started: Date.now(), cancelled: false };
      mr.ondataavailable = function (e) { if (e.data && e.data.size) rec.chunks.push(e.data); };
      mr.onstop = function () {
        clearTimeout(rec.auto);
        if (hablarRec === rec) hablarRec = null;
        if (!rec.cancelled) {
          var blob = new Blob(rec.chunks, { type: mr.mimeType || "audio/mp4" });
          hablarKeepRecording(card, blob);
          hablarAnalyse(card, blob, Date.now() - rec.started);
        }
        renderSpeakState();
      };
      rec.auto = setTimeout(hablarStop, HABLAR_MAX_MS);
      hablarRec = rec;
      hablarHintOverride = null;
      mr.start();
      renderSpeakState();
    }, function (err) {
      hablarHint(card, t(err && (err.name === "NotAllowedError" || err.name === "SecurityError") ? "speak_mic_denied" : "speak_mic_error"));
    });
  }
  function hablarStop() { if (hablarRec && hablarRec.mr.state !== "inactive") hablarRec.mr.stop(); }
  function hablarAbort() { if (hablarRec) { hablarRec.cancelled = true; hablarStop(); } }

  function hablarAnalyse(card, blob, recMs) {
    hablarBusyCard = card;
    var t0 = Date.now();
    var answers = speakAnswers(card);
    speechToWav16k(blob).then(function (wav) {
      // answers/digits let the function skip the scoring call when the plain
      // transcript already matches (one Azure call instead of two).
      return supabaseClient.functions.invoke("stt", { body: { text: answers[0] || card.backMain, answers: answers, digits: card.digits || undefined, audio: speechBytesToBase64(wav), assess: ["es-AR"] } });
    }).then(function (res) {
      if (res.error) {
        var ctx = res.error.context;
        var status = ctx && ctx.status;
        throw new Error(status ? "HTTP " + status : (res.error.message || "error"));
      }
      return hablarJudge(card, res.data);
    }).then(finish, function (err) {
      console.warn("[hablar] couldn't analyse the recording:", err && err.message);
      finish({ heard: "", recognition: "error", error: String((err && err.message) || err).slice(0, 120), auto_grade: null, rule: "error" });
    });
    function finish(result) {
      if (hablarBusyCard === card) hablarBusyCard = null;
      result.rec_ms = recMs;
      result.latency_ms = Date.now() - t0;
      result.attempt = ((card._speech && card._speech.attempt) || 0) + 1;
      card._speech = result;
      if (result.auto_grade && !card._gradeTouched) card._grade = result.auto_grade;
      playOnSpeech(card, result);
      if (practiceView && practiceView.card === card) practiceView.row.speech = Object.assign({}, result);
      if (flashDeck[flashIndex] !== card || el.flashOverlay.hidden) return;
      renderSpeakState();
      renderHeard(card);
      renderFlashGrade(card);
      renderFlashTally();
      if (!el.flashCard.classList.contains("flipped")) toggleFlashFlip();
    }
  }

  // ---- recording → 16 kHz mono 16-bit WAV (what Azure's REST API takes) ----
  function speechEncodeWav(samples, rate) {
    var buf = new ArrayBuffer(44 + samples.length * 2);
    var v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
    str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, samples.length * 2, true);
    for (var i = 0; i < samples.length; i++) {
      var x = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
    }
    return new Uint8Array(buf);
  }
  function speechToWav16k(blob) {
    return blob.arrayBuffer().then(function (ab) {
      var AC = window.AudioContext || window.webkitAudioContext;
      var ctx = new AC();
      return new Promise(function (resolve, reject) { ctx.decodeAudioData(ab, resolve, reject); }).then(function (decoded) {
        try { ctx.close(); } catch (e) {}
        var rate = 16000;
        var off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
        var src = off.createBufferSource();
        src.buffer = decoded;
        src.connect(off.destination);
        src.start();
        return off.startRendering().then(function (rendered) { return speechEncodeWav(rendered.getChannelData(0), rate); });
      });
    });
  }
  function speechBytesToBase64(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  // ---- on screen ----
  function hablarHint(card, text) { hablarHintOverride = { card: card, text: text }; renderSpeakState(); }
  function renderSpeakState() {
    if (!el.flashSpeakMic) return;
    var card = flashDeck[flashIndex];
    var speak = !!(card && card.speak) && !el.flashOverlay.classList.contains("is-done");
    el.flashSpeakMic.hidden = !speak;
    el.flashCard.classList.toggle("is-speak", speak);
    // No standing instructions under the mic (2026-10-05, mason: the icon
    // explains itself; the text was clutter). The mic's own look carries
    // the state — red with a stop square while recording, pulsing while
    // checking — and the hint line only appears for a problem (mic
    // refused, browser can't record).
    var warn = speak && hablarHintOverride && hablarHintOverride.card === card;
    el.flashSpeakHint.hidden = !warn;
    if (!speak) return;
    var recording = !!(hablarRec && hablarRec.card === card);
    var busy = hablarBusyCard === card;
    el.flashSpeakMic.classList.toggle("is-recording", recording);
    el.flashSpeakMic.classList.toggle("is-busy", busy);
    el.flashSpeakMic.setAttribute("aria-label", t(recording ? "speak_stop_aria" : "speak_mic_aria"));
    el.flashSpeakHint.classList.toggle("is-warn", !!warn);
    el.flashSpeakHint.textContent = warn ? hablarHintOverride.text : "";
    fitFlashFront();
  }
  // ---- your recording, to play back next to the answer ----
  // The last recording of each card stays in memory (an object URL on the
  // card) while the deck is open, so ▶ on the back can play it; it is
  // never uploaded or stored, and every URL is let go when the deck closes.
  var hablarRecUrls = [];
  var hablarPlayer = null;
  function hablarKeepRecording(card, blob) {
    if (!window.URL || !URL.createObjectURL) return;
    if (card._recUrl) { try { URL.revokeObjectURL(card._recUrl); } catch (e) {} }
    card._recUrl = URL.createObjectURL(blob);
    hablarRecUrls.push(card._recUrl);
  }
  function hablarDropRecordings() {
    hablarStopPlayback();
    hablarRecUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    hablarRecUrls = [];
    flashDeck.forEach(function (c) { if (c) delete c._recUrl; });
  }
  function hablarStopPlayback() {
    if (hablarPlayer) { try { hablarPlayer.pause(); } catch (e) {} }
    if (el.flashBackPlay) el.flashBackPlay.classList.remove("is-playing");
  }
  function hablarPlayOwn() {
    var card = flashDeck[flashIndex];
    if (!card || !card._recUrl) return;
    if (el.flashBackPlay.classList.contains("is-playing")) { hablarStopPlayback(); return; }
    if (ttsAudioEl) { try { ttsAudioEl.pause(); } catch (e) {} }
    if (!hablarPlayer) {
      hablarPlayer = new Audio();
      var done = function () { el.flashBackPlay.classList.remove("is-playing"); };
      hablarPlayer.addEventListener("ended", done);
      hablarPlayer.addEventListener("pause", done);
      hablarPlayer.addEventListener("error", done);
    }
    hablarPlayer.src = card._recUrl;
    el.flashBackPlay.classList.add("is-playing");
    var pr = hablarPlayer.play();
    if (pr && pr.catch) pr.catch(function () { el.flashBackPlay.classList.remove("is-playing"); });
    // How often you listen back to yourself goes in the log with the rest
    // of the Hablar result (practice_log.speech.plays).
    if (practiceView && practiceView.card === card && practiceView.row.speech) {
      practiceView.row.speech.plays = (practiceView.row.speech.plays || 0) + 1;
    }
  }

  // What you said, lined up under the answer: { pre, core, post }. Words
  // before the answer ("y la valija") go in pre, so they can hang to the
  // left beside "Dijiste:"; anything after a full match goes in post.
  // Punctuation isn't spoken, so it's dropped, and the first letter
  // follows the answer's case (Azure writes "Revoque." like a sentence).
  function speechCleanShown(text) {
    return String(text || "").replace(/[¿?¡!]/g, "").replace(/[.。]+(\s|$)/g, "$1").replace(/\s+/g, " ").trim();
  }
  function speechMatchCase(text, model) {
    var m = String(model || "").match(/\p{L}/u);
    var i = text.search(/\p{L}/u);
    if (!m || i < 0) return text;
    var up = m[0] !== m[0].toLowerCase();
    return text.slice(0, i) + (up ? text.charAt(i).toUpperCase() : text.charAt(i).toLowerCase()) + text.slice(i + 1);
  }
  function speechAlign(card, sp) {
    var answers = speakAnswers(card);
    if (sp.rule === "score") {
      // Judged right on pronunciation though the transcript differs:
      // show the answer itself (the transcript next to a Bien confused
      // mason, 2026-10-05); ▶ lets you hear what you actually said.
      return { pre: "", core: speechCleanShown(answers[0] || card.backMain), post: "" };
    }
    // Topics show the spoken form (lexical): "cuatro mil…", not "4372".
    var said = card.kind === "topic" ? (sp.heard || sp.heard_display) : (sp.heard_display || sp.heard);
    var shown = speechMatchCase(speechCleanShown(said || ""), answers[0] || card.backMain);
    var toks = shown.split(" ").filter(Boolean);
    if (!toks.length) return { pre: "", core: "", post: "" };
    var norms = toks.map(speechNorm);
    var best = { k: 0, score: -1, ans: [] };
    answers.forEach(function (ans) {
      var aw = speechNorm(ans).split(" ").filter(Boolean);
      for (var k = 0; k <= Math.min(3, toks.length - 1); k++) {
        var sc = 0;
        for (var i = 0; i < aw.length && k + i < norms.length; i++) if (norms[k + i] === aw[i]) sc++;
        if (sc > best.score || (sc === best.score && k < best.k)) best = { k: k, score: sc, ans: aw };
      }
    });
    var k = best.score > 0 ? best.k : 0;
    var pre = toks.slice(0, k), rest = toks.slice(k);
    var post = [];
    if (sp.rule === "transcript" && best.ans.length && rest.length > best.ans.length) {
      post = rest.slice(best.ans.length); rest = rest.slice(0, best.ans.length);
    }
    if (!rest.length) { rest = pre; pre = []; }
    // The first word shown takes the answer's case, wherever it lands.
    var core = rest.join(" ");
    var preText = pre.join(" ");
    if (preText) {
      core = speechMatchCase(core, answers[0] || card.backMain);
      preText = speechMatchCase(preText, "a"); // extra words lead in lower case: "y la"
    }
    return { pre: preText, core: core, post: post.join(" ") };
  }

  function renderHeard(card) {
    if (!el.flashBackHeard) return;
    var sp = card && card.speak ? card._speech : null;
    var grid = el.flashBackAnswer;
    hablarStopPlayback();
    grid.className = "flash-answer-grid";
    el.flashBackHeard.className = "flash-heard";
    el.flashBackHeard.textContent = "";
    el.flashBackSaidPre.textContent = "";
    el.flashBackHeard.hidden = !sp;
    el.flashBackSaidLabel.hidden = !sp;
    el.flashBackPlay.hidden = !(sp && card._recUrl);
    if (!sp) { fitFlashBack(); return; }
    grid.classList.add("is-said");
    var len = String(card.backMain || "").length;
    if (sp.rule === "error" || sp.rule === "nothing") {
      grid.classList.add("is-none");
      el.flashBackHeard.classList.add("is-msg");
      el.flashBackHeard.textContent = sp.rule === "error" ? t("speak_error") : "—";
    } else {
      var parts = speechAlign(card, sp);
      el.flashBackSaidPre.textContent = parts.pre;
      el.flashBackHeard.textContent = parts.core;
      if (parts.post) {
        var post = document.createElement("span");
        post.className = "said-post";
        post.textContent = " " + parts.post;
        el.flashBackHeard.appendChild(post);
      }
      len = Math.max(len, (parts.pre ? parts.pre.length + 1 : 0) + parts.core.length + (parts.post ? parts.post.length + 1 : 0));
      grid.classList.add(sp.rule === "unsure" ? "is-unsure" : (sp.auto_grade === "bien" ? "is-bien" : "is-otra"));
    }
    grid.classList.toggle("is-long", len > 22 && len <= 40);
    grid.classList.toggle("is-longer", len > 40);
    fitFlashBack();
  }
  // The back with a result can run out of room on a phone: the example
  // sentence goes first; the answer and what you said always stay.
  function fitFlashBack() {
    var ex = el.flashBackExample;
    if (!ex || !ex.textContent) return;
    ex.hidden = false;
    if (flashBackOverflows()) ex.hidden = true;
  }
  el.flashBackPlay.addEventListener("click", function (evt) { evt.stopPropagation(); hablarPlayOwn(); });
  el.flashSpeakMic.addEventListener("click", function (evt) { evt.stopPropagation(); hablarToggle(); });

  // Test/debug hooks.
  window.voseHablarJudge = function (backMain, data) { return hablarJudge({ backMain: backMain }, data); };

  // ================= Temas (2026-10-06) =================
  // mason: drilling things that come in large, focused volumes (numbers,
  // prices, the time, grammar structures like más/menos que or ya/todavía)
  // would swamp Verbos/Vocabulario/Frases, which are his own collection.
  // So topics live in their own tab, as one list (mason: "a single list for
  // the topics instead of two"). Tapping one opens its detail page: a short
  // lesson, what/how to practise and Practicar (which opens the usual
  // flashcards: Leer / Escuchar / Hablar, Bien / Otra vez), and "Tu
  // historial" behind the same remembered expander as verbs and words.
  // Mockups mason approved: practica_maqueta.png → temas_maqueta.png.
  //
  // Two kinds of topic, both built into the app (nothing stored):
  //  - generated ("gen"): every card is made on the spot from a range the
  //    person picks — Números, Precios, La hora, Fechas;
  //  - sentence packs ("pack"): a fixed set of example sentences for one
  //    structure, each with the key words as gaps — Comparativos, Hay que ·
  //    tener que, Ya · todavía.
  // Practice rows are logged like any card: item_kind "topic", item_key the
  // topic id, form_key "<range>:<value>" (generated) or the sentence id.
  // The rows need practice_log to accept item_kind 'topic' — see
  // pending_2026-10-06_temas.sql; until that has run, topic rows simply
  // wait on the device (practiceFlush() sends them last, on their own).
  // ---- Spanish number words (Rioplatense usage; RAE spelling) ----
  // numWords(n, beforeNoun): 21 → "veintiuno", but before a noun or "mil"
  // the -uno shortens: "veintiún pesos", "veintiún mil", "un millón".
  var NUM_UNITS = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez",
    "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte",
    "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
  var NUM_TENS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  var NUM_HUNDREDS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];
  function numUnder100(n, apo) {
    if (n < 30) {
      if (n === 1) return apo ? "un" : "uno";
      if (n === 21) return apo ? "veintiún" : "veintiuno";
      return NUM_UNITS[n];
    }
    var u = n % 10;
    return NUM_TENS[Math.floor(n / 10)] + (u ? " y " + (u === 1 ? (apo ? "un" : "uno") : NUM_UNITS[u]) : "");
  }
  function numUnder1000(n, apo) {
    if (n === 100) return "cien";
    var h = Math.floor(n / 100), r = n % 100;
    return [h ? NUM_HUNDREDS[h] : "", r ? numUnder100(r, apo) : ""].filter(Boolean).join(" ");
  }
  function numWords(n, beforeNoun) {
    n = Math.floor(Math.abs(n));
    if (n === 0) return "cero";
    var mil = Math.floor(n / 1000000), th = Math.floor((n % 1000000) / 1000), rest = n % 1000;
    var parts = [];
    if (mil) parts.push(mil === 1 ? "un millón" : numUnder1000(mil, true) + " millones");
    if (th) parts.push(th === 1 ? "mil" : numUnder1000(th, true) + " mil");
    if (rest) parts.push(numUnder1000(rest, !!beforeNoun));
    return parts.join(" ");
  }
  // "4.372", "1.000.000" — Argentina writes thousands with a dot.
  function numDigits(n) { return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function pesosWords(n) {
    if (n === 1) return "un peso";
    var exactMillions = n >= 1000000 && n % 1000000 === 0;
    return numWords(n, true) + (exactMillions ? " de pesos" : " pesos");
  }
  // 15:45 → "las cuatro menos cuarto" (and the other way of saying it).
  function horaWords(h, m) {
    function hourName(x) { var h12 = x % 12 || 12; return h12 === 1 ? "la una" : "las " + numWords(h12); }
    var minName = function (x) { return x === 15 ? "cuarto" : (x === 30 ? "media" : numWords(x)); };
    if (m === 0) return [hourName(h)];
    if (m <= 30) return [hourName(h) + " y " + minName(m)];
    var forms = [hourName(h + 1) + " menos " + minName(60 - m), hourName(h) + " y " + numWords(m)];
    return forms;
  }
  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  // 9/7 → "el nueve de julio"; the 1st is "el primero" (also "el uno").
  function fechaWords(d, mo, y) {
    var tail = " de " + MESES[mo - 1] + (y ? " de " + numWords(y) : "");
    if (d === 1) return ["el primero" + tail, "el uno" + tail];
    return ["el " + numWords(d) + tail];
  }

  function topicRand(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function topicPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function L(es, en) { return { es: es, en: en }; }
  function topicText(x) { return x && typeof x === "object" ? (x[currentLang] || x.es) : (x || ""); }
  var FECHAS_PATRIAS = [
    [1, 1, "Año Nuevo"], [24, 3, "Día de la Memoria"], [2, 4, "Día de los Veteranos y Caídos en Malvinas"],
    [1, 5, "Día del Trabajador"], [25, 5, "Revolución de Mayo"], [20, 6, "Día de la Bandera"],
    [9, 7, "Día de la Independencia"], [17, 8, "Paso a la Inmortalidad de San Martín"],
    [12, 10, "Día del Respeto a la Diversidad Cultural"], [20, 11, "Día de la Soberanía Nacional"],
    [8, 12, "Inmaculada Concepción"], [25, 12, "Navidad"]
  ];
  var DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function horaFront(h, m) { return h + ":" + (m < 10 ? "0" : "") + m; }

  var TOPICS = [
    {
      id: "numeros", type: "gen", name: L("Números", "Numbers"),
      desc: L("Del cero al millón. Cada tarjeta es un número nuevo.", "Zero to a million. Every card is a new number."),
      tag: L("número", "number"),
      ranges: [
        { key: "0-20", label: L("0–20", "0–20"), gen: function () { return topicRand(0, 20); } },
        { key: "21-99", label: L("21–99", "21–99"), gen: function () { return topicRand(21, 99); } },
        { key: "cientos", label: L("cientos", "hundreds"), gen: function () { return topicRand(100, 999); } },
        { key: "miles", label: L("miles", "thousands"), gen: function () { return topicRand(1000, 9999); } },
        { key: "grandes", label: L("10.000+", "10,000+"), gen: function () { return topicRand(10, 999) * 1000 + (Math.random() < 0.5 ? topicRand(1, 999) : 0); } },
        { key: "millones", label: L("millones", "millions"), gen: function () { return topicRand(1, 20) * 1000000 + (Math.random() < 0.5 ? topicRand(1, 9) * 100000 : 0); } },
        { key: "anios", label: L("años", "years"), gen: function () { return topicRand(1900, 2035); } },
        { key: "dificiles", label: L("los difíciles", "the tricky ones"), gen: function () { return topicPick([15, 16, 21, 50, 60, 70, 100, 101, 500, 505, 515, 700, 707, 900, 999, 1000, 1001, 1100, 21000, 31000, 100000, 101000, 500000, 700000, 1000000, 2000000]); } }
      ],
      defaults: ["21-99", "cientos", "miles"],
      card: function (range, v) {
        var n = Number(v), words = numWords(n);
        var front = range === "anios" ? String(n) : numDigits(n);
        return { frontMain: front, backMain: words, backSpeak: words, digits: String(n), listenBackMain: front, listenBackSub: words };
      },
      // Each pattern line is a range; the line under it is that same
      // range in words (mason, 2026-10-06: examples under a range read as
      // its translation, so make them exactly that).
      lesson: [
        { f: "0–15 · cada uno tiene su nombre", ex: "[cero] a [quince]" },
        { f: "16–29 · una sola palabra", ex: "[dieci]séis a [veinti]nueve" },
        { f: "31–99 · decena y unidad", ex: "treinta [y] uno a noventa [y] nueve" },
        { f: "100 · 101–199", ex: "[cien] · [ciento] uno a [ciento] noventa y nueve" },
        { f: "200–999 · ojo con 500, 700 y 900", ex: "doscientos a novecientos noventa y nueve · [quinientos] · [setecientos] · [novecientos]" },
        { f: "1.000 · 2.000 · 1.000.000", ex: "[mil] · dos [mil] · un [millón]" }
      ],
      tip: L("En Argentina el punto separa los miles: 4.372 · 1.000.000. Antes de un sustantivo, «uno» se acorta: veintiún años, un millón.",
             "In Argentina a dot separates thousands: 4.372 · 1.000.000. Before a noun «uno» shortens: veintiún años, un millón.")
    },
    {
      id: "precios", type: "gen", name: L("Precios", "Prices"),
      desc: L("Lo que vas a escuchar en la caja: $1.250 → mil doscientos cincuenta pesos.", "What you'll hear at the till: $1.250 → mil doscientos cincuenta pesos."),
      tag: L("precio", "price"),
      ranges: [
        { key: "hasta-1000", label: L("hasta $1.000", "up to $1,000"), gen: function () { return topicRand(2, 99) * 10; } },
        { key: "miles", label: L("$1.000–$9.999", "$1,000–$9,999"), gen: function () { return topicRand(20, 199) * 50; } },
        { key: "decenas", label: L("$10.000–$99.999", "$10,000–$99,999"), gen: function () { return topicRand(20, 199) * 500; } },
        { key: "cientos-mil", label: L("$100.000+", "$100,000+"), gen: function () { return topicRand(20, 199) * 5000; } }
      ],
      defaults: ["miles", "decenas"],
      card: function (range, v) {
        var n = Number(v), words = pesosWords(n), front = "$" + numDigits(n);
        return { frontMain: front, backMain: words, backSpeak: words, digits: String(n), listenBackMain: front, listenBackSub: words };
      },
      lesson: [
        { f: "número + pesos", ex: "mil doscientos cincuenta [pesos]" },
        { f: "uno → un, veintiuno → veintiún", ex: "[un] peso · [veintiún] pesos · treinta y [un] mil" },
        { f: "millón exacto → de pesos", ex: "un millón [de] pesos · un millón quinientos mil pesos" }
      ],
      tip: L("En la calle se dice mucho «lucas» por miles: cinco lucas = $5.000.", "On the street people often say «lucas» for thousands: cinco lucas = $5,000.")
    },
    {
      id: "hora", type: "gen", name: L("La hora", "Telling the time"),
      desc: L("15:45 → las cuatro menos cuarto.", "15:45 → las cuatro menos cuarto."),
      tag: L("la hora", "the time"),
      ranges: [
        { key: "faciles", label: L("en punto · cuarto · media", "o'clock · quarter · half"), gen: function () { return horaFront(topicRand(0, 23), topicPick([0, 15, 30, 45])); } },
        { key: "cada5", label: L("cada cinco minutos", "every five minutes"), gen: function () { return horaFront(topicRand(0, 23), topicRand(0, 11) * 5); } }
      ],
      defaults: ["faciles"],
      card: function (range, v) {
        var p = String(v).split(":"), forms = horaWords(Number(p[0]), Number(p[1]));
        return { frontMain: String(v), backMain: forms[0], backSpeak: forms[0], answers: forms, backSub: forms[1] ? t("topic_also", { x: forms[1] }) : "", listenBackMain: String(v), listenBackSub: forms[0] };
      },
      lesson: [
        { f: "la una · las dos, las tres…", ex: "[es la] una · [son las] tres" },
        { f: "y cuarto · y media · menos cuarto", ex: "las cuatro [y cuarto] · las cuatro [y media] · las cinco [menos cuarto]" },
        { f: "hasta y media: y …; después: menos …", ex: "las nueve [y diez] · las diez [menos veinte]" }
      ],
      tip: L("Se escribe en 24 horas (15:45) pero se dice en 12: «las cuatro menos cuarto», y si hace falta, «de la tarde».",
             "It's written in 24-hour time (15:45) but said in 12: «las cuatro menos cuarto», adding «de la tarde» if needed.")
    },
    {
      id: "fechas", type: "gen", name: L("Fechas", "Dates"),
      desc: L("9/7 → el nueve de julio. Día primero, mes después.", "9/7 → el nueve de julio. Day first, then month."),
      tag: L("fecha", "date"),
      ranges: [
        { key: "dia-mes", label: L("día y mes", "day and month"), gen: function () { var m = topicRand(1, 12); return topicRand(1, DIAS_MES[m - 1]) + "/" + m; } },
        { key: "con-anio", label: L("con año", "with the year"), gen: function () { var m = topicRand(1, 12); return topicRand(1, DIAS_MES[m - 1]) + "/" + m + "/" + topicRand(1950, 2030); } },
        { key: "patrias", label: L("feriados", "holidays"), gen: function () { var f = topicPick(FECHAS_PATRIAS); return f[0] + "/" + f[1]; } }
      ],
      defaults: ["dia-mes", "patrias"],
      card: function (range, v) {
        var p = String(v).split("/").map(Number), forms = fechaWords(p[0], p[1], p[2] || 0);
        var fiesta = FECHAS_PATRIAS.find(function (f) { return f[0] === p[0] && f[1] === p[1]; });
        var sub = [fiesta ? fiesta[2] : "", forms[1] ? t("topic_also", { x: forms[1] }) : ""].filter(Boolean).join(" · ");
        return { frontMain: String(v), backMain: forms[0], backSpeak: forms[0], answers: forms, backSub: sub, listenBackMain: String(v), listenBackSub: forms[0] + (fiesta ? " · " + fiesta[2] : "") };
      },
      lesson: [
        { f: "el + número + de + mes", ex: "[el] nueve [de] julio" },
        { f: "el 1 → el primero", ex: "el [primero] de mayo" },
        { f: "año → de + número", ex: "el 9 de julio [de] mil ochocientos dieciséis" }
      ],
      tip: L("Los meses van con minúscula: enero, julio. En Argentina se escribe día/mes: 9/7 es el 9 de julio.",
             "Months are lower case: enero, julio. Argentina writes day/month: 9/7 is the 9th of July.")
    },
    {
      id: "comparativos", type: "pack", name: L("Comparativos", "Comparisons"),
      desc: L("Comparar cosas, personas y cantidades.", "Comparing things, people and amounts."),
      tag: L("comparativos", "comparisons"),
      lesson: [
        { f: "más / menos + adjetivo + que", ex: "Este café es [más] caro [que] el otro." },
        { f: "tan + adjetivo + como", ex: "Mendoza es [tan] linda [como] Salta." },
        { f: "tanto/a/os/as + sustantivo + como", ex: "No tengo [tanta] plata [como] vos." },
        { f: "mejor · peor · mayor · menor + que", ex: "Este vino es [mejor que] ese." },
        { f: "más de / menos de + cantidad", ex: "Gasté [más de] diez mil pesos." }
      ],
      items: [
        { id: "c01", es: "Este café es [más] caro [que] el de la esquina.", en: "This coffee is more expensive than the one on the corner.", p: "más + adjetivo + que" },
        { id: "c02", es: "El subte es [más] rápido [que] el colectivo.", en: "The subway is faster than the bus.", p: "más + adjetivo + que" },
        { id: "c03", es: "Hoy hace [menos] frío [que] ayer.", en: "It's less cold today than yesterday.", p: "menos + sustantivo + que" },
        { id: "c04", es: "Mi departamento es [más] chico [que] el tuyo.", en: "My apartment is smaller than yours.", p: "más + adjetivo + que" },
        { id: "c05", es: "Vos hablás [más] rápido [que] yo.", en: "You speak faster than I do.", p: "más + adverbio + que" },
        { id: "c06", es: "Este barrio es [más] tranquilo [que] el centro.", en: "This neighborhood is quieter than downtown.", p: "más + adjetivo + que" },
        { id: "c07", es: "Esta pizza está [tan] rica [como] la de ayer.", en: "This pizza is as good as yesterday's.", p: "tan + adjetivo + como" },
        { id: "c08", es: "Mendoza es [tan] linda [como] Salta.", en: "Mendoza is as pretty as Salta.", p: "tan + adjetivo + como" },
        { id: "c09", es: "No soy [tan] alto [como] mi hermano.", en: "I'm not as tall as my brother.", p: "tan + adjetivo + como" },
        { id: "c10", es: "No tengo [tanta] plata [como] vos.", en: "I don't have as much money as you.", p: "tanto/a + sustantivo + como" },
        { id: "c11", es: "Hay [tantos] turistas [como] el año pasado.", en: "There are as many tourists as last year.", p: "tantos/as + sustantivo + como" },
        { id: "c12", es: "Trabajo [tanto como] vos.", en: "I work as much as you do.", p: "verbo + tanto como" },
        { id: "c13", es: "Este vino es [mejor que] ese.", en: "This wine is better than that one.", p: "mejor que" },
        { id: "c14", es: "El tráfico hoy está [peor que] nunca.", en: "The traffic today is worse than ever.", p: "peor que" },
        { id: "c15", es: "Mi hermana es [mayor que] yo.", en: "My sister is older than me.", p: "mayor que" },
        { id: "c16", es: "Él es dos años [menor que] su novia.", en: "He's two years younger than his girlfriend.", p: "menor que" },
        { id: "c17", es: "Es el café [más] caro [de] la carta.", en: "It's the most expensive coffee on the menu.", p: "el/la + sustantivo + más + adjetivo + de" },
        { id: "c18", es: "Buenos Aires es la ciudad [más] grande [del] país.", en: "Buenos Aires is the biggest city in the country.", p: "el/la + sustantivo + más + adjetivo + de" },
        { id: "c19", es: "Gasté [más de] diez mil pesos.", en: "I spent more than ten thousand pesos.", p: "más de + cantidad" },
        { id: "c20", es: "Tengo [menos de] una hora.", en: "I have less than an hour.", p: "menos de + cantidad" }
      ]
    },
    {
      id: "hay-que", type: "pack", name: L("Hay que · tener que", "Hay que · tener que"),
      desc: L("Obligación general o de una persona.", "Obligation in general, or for someone."),
      tag: L("hay que · tener que", "hay que · tener que"), choice: "hay que · tener que",
      lesson: [
        { f: "hay que + infinitivo → en general, nadie en particular", ex: "[Hay que] sacar turno." },
        { f: "tener que + infinitivo → una persona", ex: "[Tengo que] llamar a mi mamá." },
        { f: "pasado: hubo que / había que · tuve que / tenía que", ex: "[Tuve que] esperar una hora." },
        { f: "«Tenés que…» también recomienda", ex: "[Tenés que] probar el choripán." }
      ],
      items: [
        { id: "h01", es: "[Hay que] sacar turno antes de ir.", en: "You have to get an appointment before going.", p: "hay que · en general" },
        { id: "h02", es: "[Tengo que] llamar a mi mamá.", en: "I have to call my mom.", p: "tener que · yo" },
        { id: "h03", es: "Para entrar, [hay que] mostrar el documento.", en: "To get in, you have to show ID.", p: "hay que · en general" },
        { id: "h04", es: "Mañana [tenemos que] madrugar.", en: "Tomorrow we have to get up early.", p: "tener que · nosotros" },
        { id: "h05", es: "[Hay que] pagar en efectivo.", en: "You have to pay in cash.", p: "hay que · en general" },
        { id: "h06", es: "¿[Tenés que] trabajar el sábado?", en: "Do you have to work on Saturday?", p: "tener que · vos" },
        { id: "h07", es: "En el colectivo [hay que] tener la SUBE cargada.", en: "On the bus you need a topped-up SUBE card.", p: "hay que · en general" },
        { id: "h08", es: "[Tienen que] bajar en la próxima parada.", en: "You (all) have to get off at the next stop.", p: "tener que · ustedes" },
        { id: "h09", es: "[Hay que] reservar con tiempo.", en: "You have to book ahead.", p: "hay que · en general" },
        { id: "h10", es: "Mi hermano [tiene que] estudiar para el examen.", en: "My brother has to study for the exam.", p: "tener que · él" },
        { id: "h11", es: "No [hay que] pagar para entrar.", en: "You don't have to pay to get in.", p: "no hay que" },
        { id: "h12", es: "[Tuve que] esperar una hora.", en: "I had to wait an hour.", p: "tener que · pasado" },
        { id: "h13", es: "[Hubo que] cancelar la reunión.", en: "The meeting had to be cancelled.", p: "hay que · pasado" },
        { id: "h14", es: "¿Qué [hay que] hacer para sacar la residencia?", en: "What do you have to do to get residency?", p: "hay que · en general" },
        { id: "h15", es: "[Tenés que] probar el choripán.", en: "You have to try the choripán.", p: "tener que · recomendación" },
        { id: "h16", es: "[Vamos a tener que] tomar un taxi.", en: "We're going to have to take a taxi.", p: "ir a + tener que" }
      ]
    },
    {
      id: "ya-todavia", type: "pack", name: L("Ya · todavía", "Ya · todavía"),
      desc: L("Ya, todavía, ya no, todavía no.", "Already, still, not anymore, not yet."),
      tag: L("ya · todavía", "ya · todavía"), choice: "ya · todavía",
      lesson: [
        { f: "ya → already (en preguntas: yet)", ex: "[Ya] comí. · ¿[Ya] llegó?" },
        { f: "todavía → still", ex: "[Todavía] vivo en Palermo." },
        { f: "todavía no → not yet", ex: "[Todavía no] llegó." },
        { f: "ya no → not anymore", ex: "[Ya no] trabajo ahí." },
        { f: "muy de acá: ya voy · ya está", ex: "¡[Ya] voy! · [Ya] está, listo." }
      ],
      items: [
        { id: "y01", es: "¿[Ya] llegó el colectivo?", en: "Has the bus arrived yet?", p: "ya · pregunta" },
        { id: "y02", es: "[Todavía] no llegó.", en: "It hasn't arrived yet.", p: "todavía no" },
        { id: "y03", es: "[Ya] comí, gracias.", en: "I already ate, thanks.", p: "ya · already" },
        { id: "y04", es: "¿[Todavía] vivís en Palermo?", en: "Do you still live in Palermo?", p: "todavía · still" },
        { id: "y05", es: "[Ya] no trabajo ahí.", en: "I don't work there anymore.", p: "ya no" },
        { id: "y06", es: "[Todavía] no sé.", en: "I don't know yet.", p: "todavía no" },
        { id: "y07", es: "¡[Ya] voy!", en: "Coming!", p: "ya voy" },
        { id: "y08", es: "Son las once y [todavía] está abierto.", en: "It's eleven and it's still open.", p: "todavía · still" },
        { id: "y09", es: "¿[Ya] terminaste?", en: "Are you done already?", p: "ya · pregunta" },
        { id: "y10", es: "[Ya] no llueve.", en: "It's not raining anymore.", p: "ya no" },
        { id: "y11", es: "[Todavía] tenemos tiempo.", en: "We still have time.", p: "todavía · still" },
        { id: "y12", es: "¿[Todavía] no pediste?", en: "You still haven't ordered?", p: "todavía no" },
        { id: "y13", es: "[Ya] está, listo.", en: "That's it, done.", p: "ya está" },
        { id: "y14", es: "Mi hermano [todavía] duerme.", en: "My brother is still asleep.", p: "todavía · still" },
        { id: "y15", es: "[Ya] es tarde.", en: "It's already late.", p: "ya · already" },
        { id: "y16", es: "¿[Ya] pagaste la luz?", en: "Have you paid the electricity bill yet?", p: "ya · pregunta" }
      ]
    }
  ];
  // ---- more topics (2026-10-06, mason: ABCs, vowels, consonants, the
  // c/g sounds, and the pronouns), and the order they're listed in ----
  // Word topics (pronunciation): each range is a short list of words with
  // the letters in focus in [brackets]; sy = the syllables, the stressed
  // one in capitals; the range's note says how it sounds.
  function wordRange(key, label, note, items) {
    return { key: key, label: label, note: note, items: items, size: items.length,
      gen: function () { return topicPlain(topicPick(items).w); } };
  }
  function W(w, sy) { return { w: w, sy: sy }; }
  function wordCardFor(r, v) {
    var it = r.items.find(function (x) { return topicPlain(x.w) === v; });
    if (!it) return null;
    var word = topicPlain(it.w), note = topicText(r.note);
    return { frontMain: word, frontRich: it.w, backMain: it.sy, backSpeak: word, answers: [word], backSub: note,
      listenBackMain: word, listenBackRich: it.w, listenBackSub: note, wordFront: true };
  }
  var LETRAS = [["a", ["a"]], ["b", ["be", "be larga"]], ["c", ["ce"]], ["d", ["de"]], ["e", ["e"]], ["f", ["efe"]], ["g", ["ge"]],
    ["h", ["hache"]], ["i", ["i", "i latina"]], ["j", ["jota"]], ["k", ["ka"]], ["l", ["ele"]], ["m", ["eme"]], ["n", ["ene"]],
    ["ñ", ["eñe"]], ["o", ["o"]], ["p", ["pe"]], ["q", ["cu"]], ["r", ["erre", "ere"]], ["s", ["ese"]], ["t", ["te"]], ["u", ["u"]],
    ["v", ["ve", "ve corta", "uve"]], ["w", ["doble ve", "doble u", "uve doble"]], ["x", ["equis"]], ["y", ["ye", "i griega"]], ["z", ["zeta"]]];
  var DELETREAR = ["hola", "calle", "queso", "vaso", "llave", "jugo", "zapato", "año", "hielo", "kiosco", "taxi", "boca",
    "Palermo", "Belgrano", "Recoleta", "subte", "yerba", "cerveza", "guitarra", "Juan"];
  function letraNames(ch) { var e = LETRAS.find(function (x) { return x[0] === ch; }); return e ? e[1] : [ch]; }
  function spellWord(word) { return word.toLowerCase().split("").map(function (ch) { return letraNames(ch)[0]; }); }

  TOPICS.push(
    {
      id: "abecedario", type: "gen", name: L("El abecedario", "The alphabet"),
      desc: L("Las letras y cómo deletrear: G → ge, «hola» → hache, o, ele, a.", "The letters, and spelling: G → ge, «hola» → hache, o, ele, a."),
      tag: L("letra", "letter"),
      ranges: [
        { key: "letras", label: L("las letras", "the letters"), size: LETRAS.length, gen: function () { return topicPick(LETRAS)[0]; } },
        { key: "deletrear", label: L("deletrear", "spelling"), size: DELETREAR.length, gen: function () { return topicPick(DELETREAR); } }
      ],
      defaults: ["letras"],
      card: function (range, v) {
        if (range === "letras") {
          var names = letraNames(v);
          return { frontMain: v.toUpperCase(), backMain: names[0], backSpeak: names[0], answers: names,
            backSub: names.length > 1 ? t("topic_also", { x: names.slice(1).join(", ") }) : "",
            listenBackMain: v.toUpperCase(), listenBackSub: names[0] };
        }
        var letters = spellWord(v);
        return { frontMain: v, backMain: letters.join(" · "), backSpeak: letters.join(", "), answers: [letters.join(" ")],
          listenBackMain: v, listenBackSub: letters.join(" · "), wordFront: true };
      },
      lesson: [
        { f: "A – M", ex: "a · be · ce · de · e · efe · ge · [hache] · i · [jota] · ka · ele · eme" },
        { f: "N – Z", ex: "ene · [eñe] · o · pe · [cu] · erre · ese · te · u · ve · [doble ve] · equis · [ye] · zeta" },
        { f: "b · v", ex: "en Argentina: [be larga] · [ve corta]" }
      ],
      tip: L("Ch y ll ya no son letras: se deletrean «ce, hache» y «ele, ele». Muchos dicen «i griega» por la y.",
             "Ch and ll are no longer letters: spell them «ce, hache» and «ele, ele». Many people say «i griega» for y.")
    },
    {
      id: "vocales", type: "gen", name: L("Las vocales", "The vowels"),
      desc: L("Las cinco vocales: siempre cortas y siempre iguales.", "The five vowels: always short, always the same."),
      tag: L("vocales", "vowels"),
      ranges: [
        wordRange("a", L("a", "a"), L("a: abierta y corta, nunca «ei»", "a: open and short, like 'ah', never 'ay'"),
          [W("c[a]s[a]", "CA·sa"), W("m[a]m[á]", "ma·MÁ"), W("p[a]p[a]", "PA·pa"), W("n[a]d[a]", "NA·da"), W("pl[a]t[a]", "PLA·ta"), W("m[a]ñ[a]n[a]", "ma·ÑA·na")]),
        wordRange("e", L("e", "e"), L("e: corta, sin deslizarse a «ei»", "e: short, like 'eh', no glide into 'ay'"),
          [W("m[e]sa", "ME·sa"), W("l[e]ch[e]", "LE·che"), W("v[e]rd[e]", "VER·de"), W("t[e]la", "TE·la"), W("n[e]n[e]", "NE·ne"), W("tr[e]c[e]", "TRE·ce")]),
        wordRange("i", L("i", "i"), L("i: como «ee», pero corta", "i: like 'ee', but short"),
          [W("s[í]", "SÍ"), W("p[i]so", "PI·so"), W("v[i]no", "VI·no"), W("f[i]n", "FIN"), W("Ch[i]le", "CHI·le"), W("l[i]ndo", "LIN·do")]),
        wordRange("o", L("o", "o"), L("o: redonda y corta, nunca «ou»", "o: round and short, never 'oh-oo'"),
          [W("t[o]d[o]", "TO·do"), W("f[o]t[o]", "FO·to"), W("p[o]c[o]", "PO·co"), W("l[o]c[o]", "LO·co"), W("[o]j[o]", "O·jo"), W("s[o]l[o]", "SO·lo")]),
        wordRange("u", L("u", "u"), L("u: como «oo», labios redondos", "u: like 'oo', lips rounded"),
          [W("[u]no", "U·no"), W("l[u]na", "LU·na"), W("m[u]cho", "MU·cho"), W("n[u]nca", "NUN·ca"), W("fr[u]ta", "FRU·ta"), W("s[u]r", "SUR")]),
        wordRange("juntas", L("dos juntas", "two together"), L("dos vocales juntas: se dicen las dos, rápido", "two vowels together: say both, quickly"),
          [W("b[ue]no", "BUE·no"), W("[ai]re", "AI·re"), W("c[iu]dad", "ciu·DAD"), W("c[au]sa", "CAU·sa"), W("n[ie]ve", "NIE·ve"), W("h[oy]", "HOY")])
      ],
      defaults: ["a", "e", "i", "o", "u"],
      lesson: [
        { f: "a · e · i · o · u", ex: "siempre el mismo sonido, siempre cortas" },
        { f: "nunca se «comen»", ex: "cho·co·LA·te: cada vocal entera" },
        { f: "la sílaba fuerte (en las tarjetas, en mayúsculas)", ex: "CA·sa · ca·[FÉ] · ma·[ÑA]·na" }
      ],
      tip: L("En inglés las vocales sin acento se apagan; en español no: cada una suena clara.",
             "In English unstressed vowels fade; in Spanish they don't: each one stays clear.")
    },
    {
      id: "consonantes", type: "gen", name: L("Las consonantes", "The consonants"),
      desc: L("Los sonidos de acá: ll e y como «sh», r y rr, j, h muda…", "The local sounds: ll and y as 'sh', r and rr, j, silent h…"),
      tag: L("consonantes", "consonants"),
      ranges: [
        wordRange("ll-y", L("ll · y", "ll · y"), L("en Buenos Aires ll e y suenan «sh»: «cashe», «sho»", "in Buenos Aires ll and y sound like 'sh': «cashe», «sho»"),
          [W("ca[ll]e", "CA·lle"), W("po[ll]o", "PO·llo"), W("[y]o", "YO"), W("pla[y]a", "PLA·ya"), W("[ll]ave", "LLA·ve"), W("a[y]er", "a·YER")]),
        wordRange("r", L("r suave", "soft r"), L("r entre vocales: un solo toque de la lengua", "r between vowels: one quick tap of the tongue"),
          [W("pe[r]o", "PE·ro"), W("ca[r]o", "CA·ro"), W("pa[r]a", "PA·ra"), W("ca[r]a", "CA·ra"), W("ho[r]a", "HO·ra"), W("to[r]o", "TO·ro")]),
        wordRange("rr", L("rr · r inicial", "rr · initial r"), L("rr, y r al principio: vibrante, varios toques", "rr, and r at the start: rolled, several taps"),
          [W("pe[rr]o", "PE·rro"), W("ca[rr]o", "CA·rro"), W("[r]osa", "RO·sa"), W("[r]ico", "RI·co"), W("a[rr]iba", "a·RRI·ba"), W("[R]oma", "RO·ma")]),
        wordRange("j", L("j", "j"), L("j: una h fuerte, de la garganta", "j: a strong, throaty h"),
          [W("[j]amón", "ja·MÓN"), W("o[j]o", "O·jo"), W("[j]ugo", "JU·go"), W("[j]oven", "JO·ven"), W("me[j]or", "me·JOR"), W("via[j]e", "VIA·je")]),
        wordRange("h", L("h muda", "silent h"), L("h: no suena nunca", "h: always silent"),
          [W("[h]ola", "HO·la"), W("[h]ora", "HO·ra"), W("a[h]ora", "a·HO·ra"), W("[h]acer", "ha·CER"), W("[h]ijo", "HI·jo"), W("[h]oy", "HOY")]),
        wordRange("b-v", L("b = v", "b = v"), L("b y v suenan igual; entre vocales, suave, sin cerrar del todo los labios", "b and v sound the same; between vowels, soft, lips not quite closed"),
          [W("[v]aso", "VA·so"), W("[b]eso", "BE·so"), W("[v]ino", "VI·no"), W("[b]ueno", "BUE·no"), W("[v]os", "VOS"), W("a[b]uela", "a·BUE·la")]),
        wordRange("d", L("d suave", "soft d"), L("d entre vocales y al final: suave, casi la «th» de «this»", "d between vowels and at the end: soft, close to the 'th' in 'this'"),
          [W("cansa[d]o", "can·SA·do"), W("to[d]o", "TO·do"), W("na[d]a", "NA·da"), W("verda[d]", "ver·DAD"), W("Madri[d]", "ma·DRID"), W("ciuda[d]", "ciu·DAD")]),
        wordRange("n", L("ñ", "ñ"), L("ñ: como «ny» en «canyon»", "ñ: like 'ny' in 'canyon'"),
          [W("a[ñ]o", "A·ño"), W("ni[ñ]o", "NI·ño"), W("ma[ñ]ana", "ma·ÑA·na"), W("Espa[ñ]a", "es·PA·ña"), W("ba[ñ]o", "BA·ño"), W("se[ñ]or", "se·ÑOR")]),
        wordRange("z", L("z = s", "z = s"), L("en Argentina z, ce y ci suenan como s", "in Argentina z, ce and ci sound like s"),
          [W("[z]apato", "za·PA·to"), W("cerve[z]a", "cer·VE·za"), W("pla[z]a", "PLA·za"), W("a[z]ul", "a·ZUL"), W("[c]ine", "CI·ne"), W("[c]ielo", "CIE·lo")]),
        wordRange("s", L("s antes de consonante", "s before a consonant"), L("en Buenos Aires la s antes de consonante a veces se aspira: «ehte», «mihmo»", "in Buenos Aires an s before a consonant is often breathed: «ehte», «mihmo»"),
          [W("mo[s]ca", "MOS·ca"), W("e[s]te", "ES·te"), W("mi[s]mo", "MIS·mo"), W("de[s]pués", "des·PUÉS"), W("gu[s]to", "GUS·to"), W("fie[s]ta", "FIES·ta")])
      ],
      defaults: ["ll-y", "r", "rr", "j"],
      lesson: [
        { f: "ll · y → «sh» (en Buenos Aires)", ex: "ca[ll]e → «cashe» · [y]o → «sho»" },
        { f: "r · rr", ex: "pe[r]o (un toque) · pe[rr]o (vibrante)" },
        { f: "j · h", ex: "[j]amón (h fuerte) · [h]ola (muda)" },
        { f: "b = v · z = s", ex: "[v]aso / [b]eso · [z]apato / [s]apo" },
        { f: "d suave", ex: "cansa[d]o · verda[d]" }
      ],
      tip: L("La pronunciación de acá: el «sheísmo» (ll, y) es lo más porteño de todo.",
             "The local accent: «sheísmo» (ll and y as 'sh') is the most porteño sound of all.")
    },
    {
      id: "c-g", type: "gen", name: L("La c y la g", "C and G"),
      desc: L("Cuándo suenan k, s, g o j: casa, cena, gato, gente.", "When they sound k, s, g or j: casa, cena, gato, gente."),
      tag: L("c · g", "c · g"),
      ranges: [
        wordRange("ca", L("ca · co · cu", "ca · co · cu"), L("c + a, o, u → k", "c + a, o, u → k"),
          [W("[c]asa", "CA·sa"), W("[c]osa", "CO·sa"), W("[c]una", "CU·na"), W("[c]uchara", "cu·CHA·ra"), W("[c]ampo", "CAM·po"), W("[C]órdoba", "CÓR·do·ba")]),
        wordRange("ce", L("ce · ci", "ce · ci"), L("c + e, i → s", "c + e, i → s"),
          [W("[c]ena", "CE·na"), W("[c]ine", "CI·ne"), W("[c]ielo", "CIE·lo"), W("[c]ebolla", "ce·BO·lla"), W("[c]inco", "CIN·co"), W("[c]entro", "CEN·tro")]),
        wordRange("ga", L("ga · go · gu", "ga · go · gu"), L("g + a, o, u → g", "g + a, o, u → g"),
          [W("[g]ato", "GA·to"), W("[g]ordo", "GOR·do"), W("[g]usto", "GUS·to"), W("a[g]ua", "A·gua"), W("ami[g]o", "a·MI·go"), W("la[g]o", "LA·go")]),
        wordRange("ge", L("ge · gi", "ge · gi"), L("g + e, i → j", "g + e, i → j"),
          [W("[g]ente", "GEN·te"), W("[g]imnasio", "gim·NA·sio"), W("[g]eneral", "ge·ne·RAL"), W("má[g]ico", "MÁ·gi·co"), W("pá[g]ina", "PÁ·gi·na"), W("[g]irar", "gi·RAR")]),
        wordRange("gue", L("gue · gui", "gue · gui"), L("gue, gui → g: la u no suena", "gue, gui → g: the u is silent"),
          [W("[gu]erra", "GUE·rra"), W("[gu]itarra", "gui·TA·rra"), W("hambur[gu]esa", "ham·bur·GUE·sa"), W("Mi[gu]el", "mi·GUEL"), W("[gu]iso", "GUI·so"), W("se[gu]ir", "se·GUIR")]),
        wordRange("gue2", L("güe · güi", "güe · güi"), L("güe, güi → gu: la u sí suena", "güe, güi → gu: the u is said"),
          [W("pin[gü]ino", "pin·GÜI·no"), W("ver[gü]enza", "ver·GÜEN·za"), W("biling[ü]e", "bi·LIN·güe"), W("ci[gü]eña", "ci·GÜE·ña"), W("a[gü]ita", "a·GÜI·ta"), W("lin[gü]ística", "lin·GÜÍS·ti·ca")]),
        wordRange("qu", L("que · qui", "que · qui"), L("que, qui → k: la u no suena", "que, qui → k: the u is silent"),
          [W("[qu]eso", "QUE·so"), W("[qu]ince", "QUIN·ce"), W("por[qu]e", "POR·que"), W("a[qu]í", "a·QUÍ"), W("[qu]iero", "QUIE·ro"), W("ra[qu]eta", "ra·QUE·ta")])
      ],
      defaults: ["ca", "ce", "ga", "ge"],
      lesson: [
        { f: "c + a, o, u → k · c + e, i → s", ex: "[c]asa · [c]osa · [c]ena · [c]ine" },
        { f: "g + a, o, u → g · g + e, i → j", ex: "[g]ato · [g]usto · [g]ente · [g]imnasio" },
        { f: "gue, gui → g (la u no suena)", ex: "[gu]erra · [gu]itarra" },
        { f: "güe, güi → gu (la u suena)", ex: "pin[gü]ino · ver[gü]enza" },
        { f: "que, qui → k", ex: "[qu]eso · [qu]ince" }
      ],
      tip: L("Por eso se escribe qu y gu: para que antes de e o i se mantenga el sonido k o g.",
             "That's why qu and gu exist: to keep the k or g sound before e or i.")
    },
    {
      id: "pronombres", type: "pack", name: L("Pronombres personales", "Subject pronouns"),
      desc: L("yo, vos, él, ella, usted, nosotros, ustedes, ellos.", "yo, vos, él, ella, usted, nosotros, ustedes, ellos."),
      tag: L("pronombres", "pronouns"),
      lesson: [
        { f: "yo · vos · él, ella, usted", ex: "[Vos] sos · [usted] es" },
        { f: "nosotros/as · ustedes · ellos/as", ex: "[Ustedes] son (acá no se usa «vosotros»)" },
        { f: "muchas veces no hace falta", ex: "Vivimos en Palermo. (= nosotros)" }
      ],
      tip: L("En Argentina: vos en vez de tú, y ustedes para el plural, también con amigos.",
             "In Argentina: vos instead of tú, and ustedes for the plural, even with friends."),
      items: [
        { id: "p01", es: "[Yo] soy de Estados Unidos.", en: "I'm from the United States.", p: "yo" },
        { id: "p02", es: "¿[Vos] sos de acá?", en: "Are you from here?", p: "vos" },
        { id: "p03", es: "[Ella] trabaja en un banco.", en: "She works at a bank.", p: "ella" },
        { id: "p04", es: "[Nosotros] vivimos en Palermo.", en: "We live in Palermo.", p: "nosotros" },
        { id: "p05", es: "[Ustedes] hablan muy rápido.", en: "You (all) speak very fast.", p: "ustedes" },
        { id: "p06", es: "[Ellos] llegan mañana.", en: "They arrive tomorrow.", p: "ellos" },
        { id: "p07", es: "¿[Usted] es el dueño?", en: "Are you (formal) the owner?", p: "usted" },
        { id: "p08", es: "[Él] es mi marido.", en: "He's my husband.", p: "él" },
        { id: "p09", es: "[Nosotras] somos hermanas.", en: "We're sisters.", p: "nosotras" },
        { id: "p10", es: "[Vos] tenés razón.", en: "You're right.", p: "vos" },
        { id: "p11", es: "[Ellas] son de Córdoba.", en: "They (women) are from Córdoba.", p: "ellas" },
        { id: "p12", es: "¿Y [vos]? ¿Qué hacés?", en: "And you? What do you do?", p: "vos" }
      ]
    },
    {
      id: "objeto-directo", type: "pack", name: L("Objeto directo", "Direct object pronouns"),
      desc: L("lo, la, los, las, me, te, nos: «Sí, lo vi».", "lo, la, los, las, me, te, nos: «Sí, lo vi»."),
      tag: L("objeto directo", "direct object"),
      lesson: [
        { f: "me · te · lo / la · nos · los / las", ex: "¿Viste a Juan? Sí, [lo] vi." },
        { f: "antes del verbo conjugado", ex: "[La] conozco." },
        { f: "o pegado al infinitivo", ex: "Voy a llamar[lo]." },
        { f: "lo / la = una persona o una cosa", ex: "El auto [lo] estacioné acá." }
      ],
      tip: L("En Argentina se usa «lo» para él: «lo vi», no «le vi».", "In Argentina «lo» is used for him: «lo vi», not «le vi»."),
      items: [
        { id: "d01", es: "¿Viste a Juan? Sí, [lo] vi ayer.", en: "Did you see Juan? Yes, I saw him yesterday.", p: "lo = a Juan" },
        { id: "d02", es: "¿Tenés las llaves? Sí, [las] tengo.", en: "Do you have the keys? Yes, I have them.", p: "las = las llaves" },
        { id: "d03", es: "Compré pan y [lo] dejé en la mesa.", en: "I bought bread and left it on the table.", p: "lo = el pan" },
        { id: "d04", es: "¿Me escuchás? Sí, [te] escucho.", en: "Can you hear me? Yes, I can hear you.", p: "te = a vos" },
        { id: "d05", es: "¿Dónde está el auto? [Lo] estacioné en la esquina.", en: "Where's the car? I parked it on the corner.", p: "lo = el auto" },
        { id: "d06", es: "Las empanadas [las] compré en la esquina.", en: "I bought the empanadas on the corner.", p: "las = las empanadas" },
        { id: "d07", es: "¿Conocés a María? Sí, [la] conozco.", en: "Do you know María? Yes, I know her.", p: "la = a María" },
        { id: "d08", es: "Voy a llamar[lo] mañana.", en: "I'm going to call him tomorrow.", p: "pegado al infinitivo" },
        { id: "d09", es: "¿[Nos] esperás? Ya salimos.", en: "Will you wait for us? We're just leaving.", p: "nos = a nosotros" },
        { id: "d10", es: "Estos zapatos [los] compré en Once.", en: "I bought these shoes in Once.", p: "los = los zapatos" },
        { id: "d11", es: "¿La cuenta? Ya [la] pagué.", en: "The bill? I already paid it.", p: "la = la cuenta" },
        { id: "d12", es: "¿[Me] llamás después?", en: "Will you call me later?", p: "me = a mí" },
        { id: "d13", es: "La película está buena: quiero ver[la] otra vez.", en: "The movie is good: I want to see it again.", p: "pegado al infinitivo" },
        { id: "d14", es: "No [lo] sé.", en: "I don't know.", p: "lo = eso" }
      ]
    },
    {
      id: "objeto-indirecto", type: "pack", name: L("Objeto indirecto", "Indirect object pronouns"),
      desc: L("me, te, le, nos, les: «Le di el libro».", "me, te, le, nos, les: «Le di el libro»."),
      tag: L("objeto indirecto", "indirect object"),
      lesson: [
        { f: "me · te · le · nos · les", ex: "[Le] di el libro a Juan." },
        { f: "a quién, para quién", ex: "[Te] mando un mensaje." },
        { f: "gustar, encantar, doler", ex: "[Me] gusta · [nos] encanta · [me] duele" },
        { f: "muchas veces se repite con «a …»", ex: "[Le] di el libro [a Juan]." }
      ],
      tip: L("Con gustar, lo que gusta es la cosa: a mí me gusta el mate, a ellos les gustan las empanadas.",
             "With gustar, the thing liked is the subject: a mí me gusta el mate, a ellos les gustan las empanadas."),
      items: [
        { id: "i01", es: "[Le] di el libro a Juan.", en: "I gave Juan the book.", p: "le = a Juan" },
        { id: "i02", es: "¿[Me] pasás la sal?", en: "Can you pass me the salt?", p: "me = a mí" },
        { id: "i03", es: "[Les] escribo a mis viejos todos los domingos.", en: "I write to my parents every Sunday.", p: "les = a mis viejos" },
        { id: "i04", es: "[Te] mando un mensaje más tarde.", en: "I'll send you a message later.", p: "te = a vos" },
        { id: "i05", es: "El mozo [nos] trajo la cuenta.", en: "The waiter brought us the bill.", p: "nos = a nosotros" },
        { id: "i06", es: "A mi hermana [le] gusta el mate.", en: "My sister likes mate.", p: "gustar: le" },
        { id: "i07", es: "¿[Le] preguntaste al mozo?", en: "Did you ask the waiter?", p: "le = al mozo" },
        { id: "i08", es: "[Les] dije que sí.", en: "I told them yes.", p: "les = a ellos" },
        { id: "i09", es: "¿Qué [te] dijo el médico?", en: "What did the doctor tell you?", p: "te = a vos" },
        { id: "i10", es: "[Me] duele la cabeza.", en: "My head hurts.", p: "doler: me" },
        { id: "i11", es: "¿[Le] podés dar esto a Ana?", en: "Can you give this to Ana?", p: "le = a Ana" },
        { id: "i12", es: "[Nos] encanta Buenos Aires.", en: "We love Buenos Aires.", p: "encantar: nos" },
        { id: "i13", es: "Voy a decir[le] la verdad.", en: "I'm going to tell him the truth.", p: "pegado al infinitivo" },
        { id: "i14", es: "A ustedes, ¿[les] gusta el asado?", en: "Do you (all) like asado?", p: "gustar: les" }
      ]
    },
    {
      id: "dobles", type: "pack", name: L("Me lo · se lo", "Me lo · se lo"),
      desc: L("Los dos pronombres juntos: «Sí, se lo di».", "Both pronouns together: «Sí, se lo di»."),
      tag: L("me lo · se lo", "me lo · se lo"),
      lesson: [
        { f: "indirecto + directo", ex: "[me lo] · [te la] · [nos los]" },
        { f: "le / les + lo, la → se lo, se la", ex: "[Se lo] di. (nunca «le lo»)" },
        { f: "pegados al infinitivo, con tilde", ex: "Voy a dár[selo]." }
      ],
      tip: L("El orden es siempre el mismo: primero a quién (me, te, se, nos), después qué (lo, la, los, las).",
             "The order never changes: first to whom (me, te, se, nos), then what (lo, la, los, las)."),
      items: [
        { id: "x01", es: "¿Le diste el regalo? Sí, [se lo] di.", en: "Did you give him the present? Yes, I gave it to him.", p: "le + lo → se lo" },
        { id: "x02", es: "¿Me prestás la birome? Sí, [te la] presto.", en: "Will you lend me the pen? Yes, I'll lend it to you.", p: "te + la" },
        { id: "x03", es: "La cuenta, ¿[nos la] traés?", en: "Can you bring us the bill?", p: "nos + la" },
        { id: "x04", es: "¿Quién te dio eso? [Me lo] dio mi viejo.", en: "Who gave you that? My dad gave it to me.", p: "me + lo" },
        { id: "x05", es: "Las fotos [se las] mando a mis amigos.", en: "I'll send the photos to my friends.", p: "les + las → se las" },
        { id: "x06", es: "¿Le contaste a tu mamá? Sí, ya [se lo] conté.", en: "Did you tell your mom? Yes, I already told her.", p: "le + lo → se lo" },
        { id: "x07", es: "No [te lo] puedo decir.", en: "I can't tell you.", p: "te + lo" },
        { id: "x08", es: "¿[Me lo] explicás otra vez?", en: "Can you explain it to me again?", p: "me + lo" },
        { id: "x09", es: "Voy a dár[selo] mañana.", en: "I'm going to give it to him tomorrow.", p: "pegado al infinitivo" },
        { id: "x10", es: "Las llaves [se las] dejé al portero.", en: "I left the keys with the doorman.", p: "le + las → se las" },
        { id: "x11", es: "¿El vino? [Nos lo] regalaron.", en: "The wine? They gave it to us.", p: "nos + lo" },
        { id: "x12", es: "[Te lo] juro.", en: "I swear.", p: "te + lo" }
      ]
    }
  );
  // Listed roughly in the order a learner meets them, A1 → B1 (mason,
  // 2026-10-06), with the level as a badge.
  var TOPIC_ORDER = [
    ["abecedario", "A1"], ["vocales", "A1"], ["consonantes", "A1"], ["c-g", "A1"], ["pronombres", "A1"],
    ["numeros", "A1"], ["precios", "A1"], ["hora", "A1"], ["fechas", "A1"],
    ["hay-que", "A2"], ["comparativos", "A2"], ["ya-todavia", "A2"], ["objeto-directo", "A2"], ["objeto-indirecto", "A2"],
    ["dobles", "B1"]
  ];
  TOPICS.forEach(function (tp) {
    var i = TOPIC_ORDER.findIndex(function (o) { return o[0] === tp.id; });
    tp.order = i === -1 ? 999 : i;
    tp.level = i === -1 ? "" : TOPIC_ORDER[i][1];
  });
  TOPICS.sort(function (a, b) { return a.order - b.order; });
  var TOPIC_DECK_SIZE = 20;
  var TOPIC_RANGES_KEY = "iv-topic-ranges";
  var topicData = {}; // id -> { topic: id } (the card's data object, shared per topic)
  TOPICS.forEach(function (tp) { topicData[tp.id] = { topic: tp.id }; });
  function topicById(id) { return TOPICS.find(function (tp) { return tp.id === id; }) || null; }
  function topicRange(tp, key) { return (tp.ranges || []).find(function (r) { return r.key === key; }) || null; }

  // "Este café es [más] caro [que] …" → pieces [{text, fill}]
  function topicPieces(es) {
    var out = [], re = /\[([^\]]*)\]/g, m, last = 0;
    while ((m = re.exec(es))) {
      if (m.index > last) out.push({ text: es.slice(last, m.index), fill: false });
      out.push({ text: m[1], fill: true });
      last = m.index + m[0].length;
    }
    if (last < es.length) out.push({ text: es.slice(last), fill: false });
    return out;
  }
  function topicPlain(es) { return es.replace(/[\[\]]/g, ""); }
  function topicGapped(es) { return es.replace(/\[[^\]]*\]/g, "___"); }
  // Fills the element with the sentence: gaps ("gap") or the filled words
  // highlighted ("fill"). Built from text nodes only.
  function topicSentenceInto(elm, es, how) {
    elm.textContent = "";
    topicPieces(es).forEach(function (p) {
      if (!p.fill) { elm.appendChild(document.createTextNode(p.text)); return; }
      var s = document.createElement("span");
      s.className = how === "gap" ? "topic-gap" : "topic-fill";
      if (how !== "gap") s.textContent = p.text;
      elm.appendChild(s);
    });
  }

  // One card. Generated: (range, value); pack: the sentence id.
  function topicCard(tp, unitKey) {
    var base = { kind: "topic", data: topicData[tp.id], formKey: unitKey, topicId: tp.id, frontSub: "" };
    if (tp.type === "pack") {
      var it = tp.items.find(function (x) { return x.id === unitKey; });
      if (!it) return null;
      var full = topicPlain(it.es);
      return Object.assign(base, {
        frontMain: topicGapped(it.es), backMain: full, backSpeak: full, backSub: it.p,
        sentence: it.es, cue: it.en, choice: tp.choice || "",
        listenTag: topicText(tp.tag), listenBackMain: full, listenBackSub: it.en
      });
    }
    var i = unitKey.indexOf(":");
    var range = unitKey.slice(0, i), value = unitKey.slice(i + 1);
    var r = topicRange(tp, range);
    if (!r) return null;
    var c = r.items ? wordCardFor(r, value) : tp.card(range, value);
    if (!c) return null;
    // Word topics (pronunciation, spelling): the tag is just the topic —
    // the range would tell you how the word sounds or is spelled.
    var tag = r.items || c.wordFront ? topicText(tp.tag) : topicText(tp.tag) + " · " + topicText(r.label);
    return Object.assign(base, c, { bigFront: !c.wordFront, backSub: c.backSub || "", listenTag: tag });
  }
  function topicCardFromUnit(topicId, formKey) {
    var tp = topicById(topicId);
    return tp && formKey ? topicCard(tp, formKey) : null;
  }

  // ---- what's been practised ----
  function topicRows(id) {
    return practiceAllRows().filter(function (r) { return r.item_kind === "topic" && r.item_key === id; });
  }
  // How solid one range (generated) is, from its last 30 graded cards.
  function topicStrength(events) {
    var recent = events.slice(-30);
    if (!recent.length) return { key: "none", cls: "h0" };
    var bien = recent.filter(function (e) { return e.grade === "bien"; }).length, rate = bien / recent.length;
    if (recent.length < 5) return { key: "few", cls: "h1" };
    if (rate >= 0.9 && recent.length >= 8) return { key: "firm", cls: "h4" };
    if (rate >= 0.75) return { key: "ok", cls: "h3" };
    return { key: "weak", cls: "h2" };
  }
  function topicStats(tp, rows) {
    rows = rows || topicRows(tp.id);
    var P = computeProgress(rows);
    var units = Object.keys(P.units).map(function (k) { return P.units[k]; });
    var out = { P: P, rows: rows, units: units };
    if (tp.type === "gen") {
      var byRange = {};
      P.events.forEach(function (r) {
        var k = String(r.form_key || "").split(":")[0];
        (byRange[k] || (byRange[k] = [])).push(r);
      });
      out.ranges = tp.ranges.map(function (r) { return { range: r, events: byRange[r.key] || [], strength: topicStrength(byRange[r.key] || []) }; });
      out.total = tp.ranges.length;
      out.firm = out.ranges.filter(function (x) { return x.strength.key === "firm"; }).length;
      out.practiced = out.ranges.filter(function (x) { return x.events.length; }).length;
    } else {
      var ids = {};
      tp.items.forEach(function (it) { ids[it.id] = true; });
      var mine = units.filter(function (u) { return ids[u.formKey]; });
      out.total = tp.items.length;
      out.firm = mine.filter(function (u) { return u.learned; }).length;
      out.practiced = mine.length;
    }
    // "Te cuestan": last time it came up, it was Otra vez (most recent first)
    out.hard = units.filter(function (u) { return u.last && u.last.grade === "otra"; })
      .sort(function (a, b) { return b.last.at - a.last.at; });
    return out;
  }
  function topicTrack(st) {
    var track = progEl("span", "prog-track");
    var l = st.total ? st.firm / st.total : 0, p = st.total ? (st.practiced - st.firm) / st.total : 0;
    if (l > 0) { var a = progEl("i", "l"); a.style.width = Math.round(l * 100) + "%"; track.appendChild(a); }
    if (p > 0) { var b = progEl("i", "p"); b.style.width = Math.round(p * 100) + "%"; track.appendChild(b); }
    return track;
  }

  // ---- the Temas tab ----
  var selectedTopicId = null;
  function topicHistoryReady() { return !!(practiceHistory.rows && currentUser && practiceHistory.userId === currentUser.id); }
  function renderTopicList() {
    if (!el.topicList) return;
    var keepScroll = el.topicList.scrollTop;
    el.topicList.innerHTML = "";
    var ready = topicHistoryReady() || practiceQueue.length;
    TOPICS.forEach(function (tp) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "card-row topic-row" + (tp.id === selectedTopicId ? " is-selected" : "");
      btn.dataset.topicId = tp.id;
      // No badges (mason, 2026-10-06): the level only sets the order, and
      // "generated" vs "sentences" is an implementation detail.
      btn.appendChild(progEl("span", "inf", topicText(tp.name)));
      btn.appendChild(progEl("span", "def", topicText(tp.desc)));
      if (ready) btn.appendChild(topicTrack(topicStats(tp)));
      btn.addEventListener("click", function () {
        if (selectedTopicId === tp.id) deselectTopic(); else selectTopic(tp.id);
      });
      li.appendChild(btn);
      el.topicList.appendChild(li);
    });
    fitTopicList();
    el.topicList.scrollTop = keepScroll;
  }
  // Same box as the Verbos / Vocabulario / Frases lists (mason, 2026-10-06:
  // "there will probably be MANY topics"): exactly 5 rows tall, the rest
  // behind the list's own scroller. Rows wrap differently by width, so the
  // height is measured from the rows themselves.
  function fitTopicList() {
    var list = el.topicList;
    if (!list || !list.offsetParent) return;
    var rows = list.children;
    if (rows.length <= 5) { list.style.height = ""; return; }
    var keep = list.scrollTop;
    list.style.height = "";
    var top = list.getBoundingClientRect().top;
    var cs = getComputedStyle(list);
    var h = rows[4].getBoundingClientRect().bottom - top + (parseFloat(cs.borderBottomWidth) || 0);
    list.style.height = Math.ceil(h) + "px";
    list.scrollTop = keep;
  }
  function scrollTopicRowIntoList(id) {
    var row = el.topicList.querySelector('[data-topic-id="' + id + '"]');
    if (!row) return;
    var li = row.parentNode, list = el.topicList;
    if (li.offsetTop < list.scrollTop || li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, li.offsetTop - 4);
    }
  }
  window.addEventListener("resize", function () { if (el.topicsPanel && !el.topicsPanel.hidden) fitTopicList(); });
  function deselectTopic() {
    selectedTopicId = null;
    el.topicDetail.hidden = true;
    renderTopicList();
  }
  function topicSavedRanges(tp) {
    try {
      var all = JSON.parse(localStorage.getItem(TOPIC_RANGES_KEY) || "{}");
      var mine = Array.isArray(all[tp.id]) ? all[tp.id].filter(function (k) { return topicRange(tp, k); }) : null;
      if (mine) return mine;
    } catch (e) {}
    return tp.defaults.slice();
  }
  function topicSaveRanges(tp, keys) {
    try {
      var all = JSON.parse(localStorage.getItem(TOPIC_RANGES_KEY) || "{}");
      all[tp.id] = keys;
      localStorage.setItem(TOPIC_RANGES_KEY, JSON.stringify(all));
    } catch (e) {}
  }
  function selectTopic(id, quiet) {
    var tp = topicById(id);
    if (!tp) return;
    selectedTopicId = id;
    el.tdName.textContent = topicText(tp.name);
    el.tdDesc.textContent = topicText(tp.desc);
    // the lesson
    el.tdLesson.innerHTML = "";
    tp.lesson.forEach(function (ln) {
      el.tdLesson.appendChild(progEl("p", "topic-lesson-f", ln.f));
      var ex = progEl("p", "topic-lesson-ex");
      topicSentenceInto(ex, ln.ex, "fill");
      el.tdLesson.appendChild(ex);
    });
    if (tp.tip) el.tdLesson.appendChild(progEl("p", "topic-lesson-tip", topicText(tp.tip)));
    el.tdMsg.textContent = "";
    renderTopicRanges();
    renderTopicModeControls();
    // a pack's sentences, behind their own disclosure
    el.tdSentencesWrap.hidden = tp.type !== "pack";
    el.tdSentences.hidden = true;
    el.tdSentencesToggle.classList.remove("open");
    el.tdSentencesToggle.setAttribute("aria-expanded", "false");
    el.tdSentences.innerHTML = "";
    if (tp.type === "pack") {
      tp.items.forEach(function (it) {
        var row = progEl("div", "topic-sentence");
        var es = progEl("p", "es");
        topicSentenceInto(es, it.es, "fill");
        row.appendChild(es);
        row.appendChild(progEl("p", "en", it.en));
        el.tdSentences.appendChild(row);
      });
    }
    el.topicDetail.hidden = false;
    renderTopicList();
    scrollTopicRowIntoList(id);
    renderItemHistory("topic");
    if (!quiet) el.topicDetail.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function renderTopicRanges() {
    var tp = topicById(selectedTopicId);
    if (!tp) return;
    el.tdRangesWrap.hidden = tp.type !== "gen";
    el.tdRanges.innerHTML = "";
    var on = tp.type === "gen" ? topicSavedRanges(tp) : [];
    el.tdCount.textContent = t("topic_count", { n: topicDeckSize(tp, on) });
    if (tp.type !== "gen") return;
    tp.ranges.forEach(function (r) {
      var active = on.indexOf(r.key) !== -1;
      el.tdRanges.appendChild(flashPickChip(topicText(r.label), active ? "all" : "none", function () {
        var now = topicSavedRanges(tp);
        var i = now.indexOf(r.key);
        if (i === -1) now.push(r.key); else now.splice(i, 1);
        topicSaveRanges(tp, now);
        el.tdMsg.textContent = "";
        renderTopicRanges();
      }));
    });
  }
  // How many cards Practicar makes: 20, or fewer when the chosen ranges
  // are short word lists (a pack: all its sentences, up to 20).
  function topicDeckSize(tp, on) {
    if (tp.type === "pack") return Math.min(TOPIC_DECK_SIZE, tp.items.length);
    var sized = on.map(function (k) { return topicRange(tp, k); }).filter(Boolean);
    if (!sized.length) return 0;
    if (sized.some(function (r) { return !r.size; })) return TOPIC_DECK_SIZE;
    return Math.min(TOPIC_DECK_SIZE, sized.reduce(function (s, r) { return s + r.size; }, 0));
  }
  function renderTopicModeControls() {
    if (!el.tdModeRead) return;
    var mode = effectiveFlashMode();
    el.tdModeRead.classList.toggle("active", mode === "leer");
    el.tdModeListen.classList.toggle("active", mode === "escuchar");
    el.tdModeSpeak.classList.toggle("active", mode === "hablar");
    el.tdModeListen.disabled = quietMode;
    el.tdModeSpeak.disabled = quietMode;
    el.tdModeNote.textContent = t(quietMode ? "flash_mode_note_quiet" : (mode === "escuchar" ? "topic_note_listen" : (mode === "hablar" ? (hablarSupported() ? "topic_note_speak" : "speak_unsupported") : "topic_note_read")));
    el.tdModeNote.classList.toggle("is-warn", quietMode);
  }

  // The deck: generated topics mix in what's been giving you trouble (up
  // to a quarter of the deck) with fresh values from the chosen ranges;
  // packs put due / missed sentences first, then ones not seen yet.
  function buildTopicDeck(tp) { return progModeCards(buildTopicCards(tp)); }
  // A topic's cards (as plain Leer cards): the deck Practicar starts, and
  // what Partida draws its topic cards from.
  function buildTopicCards(tp) {
    var st = topicStats(tp);
    var cards = [], seen = {};
    function add(key) { if (seen[key] || cards.length >= TOPIC_DECK_SIZE) return; var c = topicCard(tp, key); if (c) { seen[key] = true; cards.push(c); } }
    if (tp.type === "gen") {
      var on = topicSavedRanges(tp);
      if (!on.length) return [];
      st.hard.filter(function (u) { return on.indexOf(String(u.formKey).split(":")[0]) !== -1; })
        .slice(0, Math.floor(TOPIC_DECK_SIZE / 4)).forEach(function (u) { add(u.formKey); });
      for (var guard = 0; cards.length < TOPIC_DECK_SIZE && guard < 400; guard++) {
        var r = topicRange(tp, on[guard % on.length]);
        add(r.key + ":" + r.gen());
      }
    } else {
      var byId = {};
      st.units.forEach(function (u) { byId[u.formKey] = u; });
      var first = [], unseen = [], rest = [];
      shuffleArray(tp.items.slice()).forEach(function (it) {
        var u = byId[it.id];
        if (!u) unseen.push(it.id);
        else if (u.due || (u.last && u.last.grade === "otra")) first.push(it.id);
        else rest.push(it.id);
      });
      first.concat(unseen, rest).forEach(add);
    }
    return cards;
  }
  function startTopicDeck() {
    var tp = topicById(selectedTopicId);
    if (!tp) return;
    var cards = buildTopicDeck(tp);
    if (!cards.length) { el.tdMsg.textContent = t("topic_pick_one"); return; }
    el.tdMsg.textContent = "";
    openFlashDeck(cards, "practice");
  }

  // ---- the topic's own faces on the card ----
  function renderTopicFaces(card) {
    var topic = card && card.kind === "topic";
    el.flashKnownToggle.style.display = topic ? "none" : "";
    el.flashFrontMain.classList.toggle("is-number", !!(topic && card.bigFront && !card.listen));
    el.flashFrontMain.classList.toggle("is-word", !!(topic && card.wordFront && !card.listen));
    el.flashTopicTag.textContent = topic && !card.listen && card.choice ? card.choice : "";
    el.flashTopicTag.hidden = !el.flashTopicTag.textContent;
    if (!topic) return;
    if (card.sentence) {
      if (!card.listen) {
        topicSentenceInto(el.flashFrontMain, card.sentence, "gap");
        el.flashFrontCloze.textContent = card.cue || "";
        el.flashFrontCloze.hidden = !card.cue;
      }
      topicSentenceInto(el.flashBackMain, card.sentence, "fill");
    } else {
      // pronunciation words: the letters in focus highlighted
      if (card.frontRich && !card.listen) topicSentenceInto(el.flashFrontMain, card.frontRich, "fill");
      if (card.listen && card.listenBackRich) topicSentenceInto(el.flashBackMain, card.listenBackRich, "fill");
    }
  }

  // ---- Tu historial for a topic ----
  function drawTopicHistory(bodyEl, id) {
    var tp = topicById(id);
    bodyEl.innerHTML = "";
    if (!tp) return;
    var st = topicStats(tp);
    if (!st.rows.length) { bodyEl.appendChild(progEl("p", "prog-text", t("topic_h_none"))); return; }
    var P = st.P;
    var days = {};
    st.rows.forEach(function (r) { days[progDayNum(r.shown_at)] = true; });
    var nDays = Object.keys(days).length;
    var bien = P.events.filter(function (r) { return r.grade === "bien"; }).length;
    var flips = st.rows.filter(function (r) { return r.flipped && r.ms_to_flip != null; });
    var avgFlip = flips.length ? flips.reduce(function (s, r) { return s + r.ms_to_flip; }, 0) / flips.length : null;
    var grid = progEl("div", "history-grid");
    function stat(big, small) {
      var x = progEl("div");
      x.appendChild(progEl("b", null, big));
      x.appendChild(progEl("span", null, small));
      grid.appendChild(x);
    }
    stat(t(st.rows.length === 1 ? "topic_h_cards_1" : "topic_h_cards", { n: st.rows.length }), t(nDays === 1 ? "history_seen_sub_1" : "history_seen_sub", { d: nDays }));
    if (P.events.length) stat(t("prog_x_of_y", { b: bien, n: P.events.length }), t("history_grade_sub"));
    else stat("—", t("history_no_grades"));
    stat(avgFlip !== null ? progNum(avgFlip / 1000, 1) + " s" : "—", t("history_flip_sub"));
    stat(t("prog_x_of_y", { b: st.firm, n: st.total }), t(tp.type === "gen" ? "topic_h_firm_sub" : "topic_h_learned_sub"));
    bodyEl.appendChild(grid);
    if (tp.type === "gen") {
      bodyEl.appendChild(progEl("p", "topic-h-label", t("topic_h_ranges")));
      var heat = progEl("div", "topic-heat");
      st.ranges.forEach(function (x) {
        var cell = progEl("div", x.strength.cls);
        cell.appendChild(progEl("b", null, topicText(x.range.label)));
        cell.appendChild(progEl("span", null, t("topic_s_" + x.strength.key)));
        heat.appendChild(cell);
      });
      bodyEl.appendChild(heat);
    }
    if (st.hard.length) {
      bodyEl.appendChild(progEl("p", "topic-h-label", t("topic_h_hard")));
      var chips = progEl("div", "topic-hard");
      st.hard.slice(0, tp.type === "gen" ? 8 : 4).forEach(function (u) {
        var c = topicCard(tp, u.formKey);
        if (!c) return;
        chips.appendChild(progEl("span", "chip", tp.type === "gen" ? c.frontMain + " · " + c.backMain : c.backMain));
      });
      bodyEl.appendChild(chips);
      var btn = progButton(t("topic_h_hard_btn"), false, function () {
        startPracticeDeck(cardsForUnits(st.hard));
      });
      btn.classList.add("topic-hard-btn");
      bodyEl.appendChild(btn);
    }
    var lastTen = P.events.slice(-10).map(function (r) { return r.grade; });
    if (lastTen.length) {
      var line = progEl("div", "history-last");
      line.appendChild(progDots(lastTen));
      line.appendChild(progEl("span", null, t("history_last", { n: lastTen.length })));
      bodyEl.appendChild(line);
    }
  }

  // ---- Progreso: one quiet card linking back to the topics ----
  function drawTopicBars() {
    var any = TOPICS.map(function (tp) { return { tp: tp, st: topicStats(tp) }; }).filter(function (x) { return x.st.rows.length; });
    if (!any.length) return null;
    var c = progCard(t("prog_topics_title"));
    any.forEach(function (x) {
      var row = progEl("button", "prog-bar");
      row.type = "button";
      var top = progEl("div", "prog-bar-top");
      top.appendChild(progEl("span", null, topicText(x.tp.name)));
      top.appendChild(progEl("span", "count", t(x.tp.type === "gen" ? "topic_firm_of" : "topic_learned_of", { b: x.st.firm, n: x.st.total })));
      row.appendChild(top);
      row.appendChild(topicTrack(x.st));
      row.addEventListener("click", function () { setMainTab("topics"); selectTopic(x.tp.id); });
      c.appendChild(row);
    });
    return c;
  }

  el.tdModeRead.addEventListener("click", function () { setFlashMode("leer"); });
  el.tdModeListen.addEventListener("click", function () { setFlashMode("escuchar"); });
  el.tdModeSpeak.addEventListener("click", function () { setFlashMode("hablar"); });
  el.tdStart.addEventListener("click", startTopicDeck);
  el.tdSentencesToggle.addEventListener("click", function () {
    var open = el.tdSentences.hidden;
    el.tdSentences.hidden = !open;
    el.tdSentencesToggle.classList.toggle("open", open);
    el.tdSentencesToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  window.voseTopics = { topics: TOPICS, numWords: numWords, pesosWords: pesosWords, horaWords: horaWords, fechaWords: fechaWords, card: topicCardFromUnit, deck: function (id) { return buildTopicDeck(topicById(id)); } };

  // ================= Jugar: racha + álbum (2026-10-06) =================
  // The fourth-from-last tab (… Temas · Tarjetas · Jugar · Progreso ·
  // Listas). mason: the metrics are useful but don't pull you back; he
  // wants to "get sucked in for hours". This first piece is:
  //   · La racha — days in a row reaching a daily goal you pick (default
  //     20 cards), counting any card you turned over or graded, in any
  //     mode. One free day per calendar week (Mon–Sun) keeps it alive.
  //   · Premios — each one unlocks the next ALBUM item (lunfardo, sayings,
  //     customs) and adds it to your own Vocabulario or Frases and to a list
  //     «Álbum», so it gets drilled like everything else:
  //       racha of 7, 14, 21… days (any mode);
  //       50 and 100 Bien in one Hablar session, and 20 Bien in a row in
  //       Hablar (mason, 2026-10-06: "the progressive and bien related
  //       rewards should only be earned in hablar mode"). These count the
  //       AUTOMATIC grade, so switching Otra vez → Bien can't farm them; a
  //       card with no suggestion (unsure, nothing heard) neither counts nor
  //       breaks the run. Each Hablar reward can be won once a day.
  //   · Tu álbum — what you've won and how, plus how to win more.
  // Partida, Contrarreloj and Te reto come later, as rows on this tab.
  // Rewards live in the `rewards` table (pending_2026-10-06_jugar.sql);
  // until that has run they're kept on this device and sent later, and
  // the content they add goes in either way.
  // ---- the album: cosas de acá (2026-10-06) ----
  // What a reward unlocks, in this order (the useful, everyday ones first,
  // words and expressions mixed). Each one is added to the person's own
  // Vocabulario (k "w") or Frases (k "p") and to a list «Álbum», so it gets
  // drilled like anything else. `id` is what the rewards table stores:
  // never rename or reuse one — add new items at the end.
  //   es: the Spanish · def: English definition (the card's meaning)
  //   gloss: a short Spanish meaning (the album tile, the reward screen)
  //   ex: an example · cat: lunfardo | dicho | costumbre | de acá
  //   words: pos + g (gender) · phrases: fn + reg (+ idio, lit)
  //   note: goes into the item's notes
  var ALBUM = [
    { id: "bondi", k: "w", es: "bondi", def: "bus (slang for colectivo)", gloss: "el colectivo", ex: "Me tomo el bondi en la esquina.", cat: "lunfardo", pos: "sustantivo", g: "masculino", note: "Lunfardo; viene del portugués de Brasil «bonde» (tranvía)." },
    { id: "de-una", k: "p", es: "De una", def: "for sure! / absolutely / let's do it", gloss: "¡sí, claro!", ex: "—¿Vamos al cine? —¡De una!", cat: "dicho", fn: "acuerdo", reg: "coloquial", idio: true, lit: "of one (go)" },
    { id: "laburo", k: "w", es: "laburo", def: "work, job (slang)", gloss: "el trabajo", ex: "Mañana tengo mucho laburo.", cat: "lunfardo", pos: "sustantivo", g: "masculino", note: "Del italiano «lavoro». Laburar = trabajar." },
    { id: "al-toque", k: "p", es: "Al toque", def: "right away / in a sec", gloss: "enseguida", ex: "Te llamo al toque.", cat: "dicho", fn: "otro", reg: "coloquial", idio: true, lit: "at the touch" },
    { id: "che", k: "w", es: "che", def: "hey (to get someone's attention); also to address a friend", gloss: "oye", ex: "Che, ¿me pasás la sal?", cat: "de acá", pos: "interjección", g: "", note: "Tan argentino que al Che Guevara le quedó de apodo." },
    { id: "tener-fiaca", k: "p", es: "Tener fiaca", def: "to feel lazy / not feel like doing anything", gloss: "no tener ganas de hacer nada", ex: "Hoy tengo una fiaca bárbara.", cat: "dicho", fn: "otro", reg: "lunfardo", idio: true, lit: "to have laziness", note: "La fiaca, del italiano «fiacca» (cansancio)." },
    { id: "guita", k: "w", es: "guita", def: "money (slang)", gloss: "la plata", ex: "No tengo guita para el taxi.", cat: "lunfardo", pos: "sustantivo", g: "femenino" },
    { id: "me-cobras", k: "p", es: "¿Me cobrás?", def: "can I pay? (asking for the bill, in a shop or café)", gloss: "quiero pagar", ex: "Perdón, ¿me cobrás?", cat: "de acá", fn: "pregunta", reg: "neutro", idio: true, lit: "will you charge me?", note: "En el café también: «¿me traés la cuenta?»." },
    { id: "subte", k: "w", es: "subte", def: "the Buenos Aires subway / metro", gloss: "el metro", ex: "Tomo el subte en la línea D.", cat: "de acá", pos: "sustantivo", g: "masculino", note: "De «subterráneo». La línea A es de 1913, la primera de Latinoamérica." },
    { id: "buena-onda", k: "p", es: "Buena onda", def: "nice, friendly, good vibes (a person or place)", gloss: "simpático, agradable", ex: "El verdulero es re buena onda.", cat: "dicho", fn: "otro", reg: "coloquial", idio: true, lit: "good wave", note: "Lo contrario: mala onda." },
    { id: "re", k: "w", es: "re", def: "very, really (before an adjective or verb)", gloss: "muy", ex: "Está re lindo el día.", cat: "de acá", pos: "adverbio", g: "", note: "«Re bien», «re cansado», «me re gustó»." },
    { id: "cebar-mate", k: "p", es: "Cebar mate", def: "to prepare and serve mate, refilling it for each person in turn", gloss: "preparar y servir el mate", ex: "¿Quién ceba hoy?", cat: "costumbre", fn: "otro", reg: "neutro", idio: false, lit: "", note: "La ronda va de mano en mano. Decir «gracias» quiere decir «no quiero más»." },
    { id: "pibe", k: "w", es: "pibe", def: "kid, young guy (piba = girl)", gloss: "el chico", ex: "Ese pibe juega muy bien al fútbol.", cat: "lunfardo", pos: "sustantivo", g: "masculino", note: "Femenino: la piba." },
    { id: "estar-al-horno", k: "p", es: "Estar al horno", def: "to be in big trouble / to be done for", gloss: "estar en un gran problema", ex: "Si no llego al bondi, estoy al horno.", cat: "dicho", fn: "otro", reg: "coloquial", idio: true, lit: "to be in the oven" },
    { id: "medialuna", k: "w", es: "medialuna", def: "croissant-like pastry (de manteca: sweet; de grasa: plainer)", gloss: "el croissant de acá", ex: "Un café con leche con dos medialunas.", cat: "costumbre", pos: "sustantivo", g: "femenino" },
    { id: "que-garron", k: "p", es: "¡Qué garrón!", def: "what a drag! / what a bummer!", gloss: "¡qué mala suerte, qué fastidio!", ex: "Se cortó la luz otra vez, ¡qué garrón!", cat: "dicho", fn: "sorpresa", reg: "lunfardo", idio: true, lit: "what a (cut of) shank!" },
    { id: "quilombo", k: "w", es: "quilombo", def: "a mess, chaos, a big fuss", gloss: "el lío", ex: "Mi cuarto es un quilombo.", cat: "lunfardo", pos: "sustantivo", g: "masculino", note: "Muy usado y algo informal. «Se armó un quilombo» = se armó lío." },
    { id: "te-banco", k: "p", es: "Te banco", def: "I've got your back / I support you", gloss: "te apoyo", ex: "Si te querés mudar, te banco.", cat: "dicho", fn: "acuerdo", reg: "coloquial", idio: true, lit: "I bench you", note: "Bancar = apoyar, y también aguantar: «no lo banco» = no lo soporto." },
    { id: "facturas", k: "w", es: "facturas", def: "pastries from the bakery (medialunas, vigilantes, bolas de fraile...)", gloss: "masitas dulces de panadería", ex: "Compré media docena de facturas para la merienda.", cat: "costumbre", pos: "sustantivo", g: "femenino", note: "Se compran por docena." },
    { id: "que-se-yo", k: "p", es: "Qué sé yo", def: "I dunno / who knows (also a filler while thinking)", gloss: "no sé", ex: "—¿A qué hora viene? —Qué sé yo, a las ocho.", cat: "dicho", fn: "muletilla", reg: "coloquial", idio: true, lit: "what do I know" },
    { id: "birra", k: "w", es: "birra", def: "beer (slang)", gloss: "la cerveza", ex: "¿Tomamos una birra después del laburo?", cat: "lunfardo", pos: "sustantivo", g: "femenino", note: "Del italiano." },
    { id: "hacer-la-previa", k: "p", es: "Hacer la previa", def: "to get together for drinks before going out", gloss: "juntarse antes de salir", ex: "Hacemos la previa en casa y después vamos al boliche.", cat: "costumbre", fn: "otro", reg: "coloquial", idio: true, lit: "to do the before" },
    { id: "boliche", k: "w", es: "boliche", def: "nightclub", gloss: "la discoteca", ex: "El sábado vamos al boliche.", cat: "de acá", pos: "sustantivo", g: "masculino", note: "Se sale tarde: nadie llega antes de la una." },
    { id: "mira-vos", k: "p", es: "Mirá vos", def: "well, look at that / you don't say", gloss: "¡qué interesante!", ex: "—Mi abuela era de Rosario. —Mirá vos.", cat: "dicho", fn: "sorpresa", reg: "coloquial", idio: true, lit: "look, you" },
    { id: "kiosco", k: "w", es: "kiosco", def: "corner shop for sweets, drinks, cigarettes", gloss: "la tiendita de la esquina", ex: "Voy al kiosco a comprar un alfajor.", cat: "de acá", pos: "sustantivo", g: "masculino", note: "Muchos abren hasta tarde o todo el día." },
    { id: "ponerse-las-pilas", k: "p", es: "Ponerse las pilas", def: "to get one's act together / get going", gloss: "esforzarse, ponerse en marcha", ex: "Me tengo que poner las pilas con el castellano.", cat: "dicho", fn: "otro", reg: "coloquial", idio: true, lit: "to put one's batteries in" },
    { id: "alfajor", k: "w", es: "alfajor", def: "two soft biscuits with dulce de leche, often covered in chocolate", gloss: "la golosina más argentina", ex: "Un alfajor de chocolate, por favor.", cat: "costumbre", pos: "sustantivo", g: "masculino" },
    { id: "cortala", k: "p", es: "Cortala", def: "cut it out / stop it", gloss: "basta", ex: "Cortala con el celular, que estamos comiendo.", cat: "dicho", fn: "desacuerdo", reg: "coloquial", idio: true, lit: "cut it" },
    { id: "trucho", k: "w", es: "trucho", def: "fake, counterfeit, dodgy", gloss: "falso", ex: "Ese billete es trucho.", cat: "lunfardo", pos: "adjetivo", g: "", note: "Femenino: trucha." },
    { id: "ser-un-capo", k: "p", es: "Ser un capo", def: "to be a pro / a star / brilliant at something", gloss: "ser muy bueno en algo", ex: "Gracias por arreglarlo, sos un capo.", cat: "dicho", fn: "otro", reg: "coloquial", idio: true, lit: "to be a boss" },
    { id: "copado", k: "w", es: "copado", def: "cool, great (a person, plan or place)", gloss: "genial", ex: "Tu hermana es re copada.", cat: "de acá", pos: "adjetivo", g: "", note: "Femenino: copada." },
    { id: "la-sobremesa", k: "w", es: "sobremesa", def: "the long chat at the table after a meal", gloss: "la charla después de comer", ex: "La sobremesa duró dos horas.", cat: "costumbre", pos: "sustantivo", g: "femenino", note: "Levantarse enseguida queda mal." },
    { id: "dar-bola", k: "p", es: "Dar bola", def: "to pay attention to someone", gloss: "prestar atención", ex: "Le hablé y no me dio bola.", cat: "dicho", fn: "otro", reg: "coloquial", idio: true, lit: "to give ball" },
    { id: "posta", k: "w", es: "posta", def: "for real, really; the truth", gloss: "de verdad", ex: "¿Posta que te mudás?", cat: "de acá", pos: "adverbio", g: "", note: "«La posta» = la verdad, el dato bueno." },
    { id: "nioquis-del-29", k: "p", es: "Ñoquis del 29", def: "eating gnocchi on the 29th of the month, with money under the plate for luck", gloss: "la tradición de comer ñoquis el 29", ex: "Hoy es 29: ¡ñoquis con plata abajo del plato!", cat: "costumbre", fn: "otro", reg: "neutro", idio: true, lit: "gnocchi of the 29th", note: "Llegó con los inmigrantes italianos." },
    { id: "piola", k: "w", es: "piola", def: "cool, nice; also clever or easygoing", gloss: "bueno, tranquilo", ex: "Es un lugar piola para comer.", cat: "lunfardo", pos: "adjetivo", g: "" },
    { id: "esta-joya", k: "p", es: "Está joya", def: "it's great / perfect", gloss: "está perfecto", ex: "—¿Te queda bien el martes? —Está joya.", cat: "dicho", fn: "acuerdo", reg: "coloquial", idio: true, lit: "it's a jewel", note: "También solo: «¡Joya!»." },
    { id: "heladera", k: "w", es: "heladera", def: "fridge", gloss: "el refrigerador", ex: "La leche está en la heladera.", cat: "de acá", pos: "sustantivo", g: "femenino" },
    { id: "ni-ahi", k: "p", es: "Ni ahí", def: "not at all / no way", gloss: "para nada", ex: "—¿Estás cansada? —Ni ahí.", cat: "dicho", fn: "desacuerdo", reg: "coloquial", idio: true, lit: "not even there" },
    { id: "groso", k: "w", es: "groso", def: "great, awesome; someone impressive", gloss: "genial, un fenómeno", ex: "Messi es un groso.", cat: "lunfardo", pos: "adjetivo", g: "", note: "Del italiano «grosso». Femenino: grosa." },
    { id: "no-tengo-un-mango", k: "p", es: "No tengo un mango", def: "I'm broke / I don't have a cent", gloss: "no tengo plata", ex: "No puedo salir, no tengo un mango.", cat: "dicho", fn: "otro", reg: "lunfardo", idio: true, lit: "I don't have a mango", note: "Un mango = un peso." },
    { id: "la-merienda", k: "w", es: "merienda", def: "afternoon snack (around five: mate or coffee with something sweet)", gloss: "la comida de la tarde", ex: "A la merienda tomamos mate con facturas.", cat: "costumbre", pos: "sustantivo", g: "femenino", note: "Se cena tarde, a las nueve o diez, así que la merienda importa." },
    { id: "me-da-bronca", k: "p", es: "Me da bronca", def: "it makes me mad / it really annoys me", gloss: "me enoja", ex: "Me da bronca cuando el bondi no para.", cat: "dicho", fn: "otro", reg: "coloquial", idio: true, lit: "it gives me anger" },
    { id: "pileta", k: "w", es: "pileta", def: "swimming pool (also the kitchen sink)", gloss: "la piscina", ex: "En verano vamos a la pileta del club.", cat: "de acá", pos: "sustantivo", g: "femenino" },
    { id: "cargar-la-sube", k: "p", es: "Cargar la SUBE", def: "to top up the SUBE (the transit card for bus, subway and train)", gloss: "ponerle saldo a la tarjeta", ex: "Tengo que cargar la SUBE antes de tomar el subte.", cat: "costumbre", fn: "otro", reg: "neutro", idio: false, lit: "", note: "Se carga en el kiosco, en la estación o desde el celular." },
    { id: "chamuyo", k: "w", es: "chamuyo", def: "smooth talk, sweet talk; a line", gloss: "la charla para convencer", ex: "No le creas, es puro chamuyo.", cat: "lunfardo", pos: "sustantivo", g: "masculino", note: "Chamuyar = hablar para convencer o seducir." },
    { id: "mandar-fruta", k: "p", es: "Mandar fruta", def: "to talk nonsense / make things up", gloss: "decir cualquier cosa", ex: "No sabía la respuesta y mandó fruta.", cat: "dicho", fn: "otro", reg: "coloquial", idio: true, lit: "to send fruit" },
    { id: "frutilla", k: "w", es: "frutilla", def: "strawberry", gloss: "la fresa", ex: "Un licuado de frutilla, por favor.", cat: "de acá", pos: "sustantivo", g: "femenino" },
    { id: "que-bajon", k: "p", es: "¡Qué bajón!", def: "what a bummer! / how depressing!", gloss: "¡qué triste!", ex: "Llueve todo el fin de semana, ¡qué bajón!", cat: "dicho", fn: "sorpresa", reg: "coloquial", idio: true, lit: "what a big drop!" },
    { id: "bardo", k: "w", es: "bardo", def: "trouble, a mess; a hassle", gloss: "el lío, el problema", ex: "Sacar el turno fue un bardo.", cat: "lunfardo", pos: "sustantivo", g: "masculino", note: "Hacer bardo = hacer lío." },
    { id: "fin-de-semana-largo", k: "p", es: "Fin de semana largo", def: "long weekend (with a holiday on Friday or Monday)", gloss: "un finde con feriado", ex: "Este fin de semana largo nos vamos a la costa.", cat: "costumbre", fn: "otro", reg: "neutro", idio: false, lit: "", note: "Algunos feriados se mueven a un lunes para armarlo." },
    { id: "palta", k: "w", es: "palta", def: "avocado", gloss: "el aguacate", ex: "Un tostado con palta.", cat: "de acá", pos: "sustantivo", g: "femenino" },
    { id: "que-mala-leche", k: "p", es: "¡Qué mala leche!", def: "what bad luck!", gloss: "¡qué mala suerte!", ex: "Perdí el bondi por un segundo, ¡qué mala leche!", cat: "dicho", fn: "sorpresa", reg: "coloquial", idio: true, lit: "what bad milk!", note: "Acá «mala leche» es mala suerte; también, mala intención." },
    { id: "remera", k: "w", es: "remera", def: "T-shirt", gloss: "la camiseta", ex: "Me puse una remera blanca.", cat: "de acá", pos: "sustantivo", g: "femenino" },
    { id: "estar-podrido", k: "p", es: "Estar podrido", def: "to be fed up / sick of something", gloss: "estar harto", ex: "Estoy podrido de esperar.", cat: "dicho", fn: "otro", reg: "coloquial", idio: true, lit: "to be rotten" },
    { id: "campera", k: "w", es: "campera", def: "jacket", gloss: "la chaqueta", ex: "Llevá campera, que a la noche refresca.", cat: "de acá", pos: "sustantivo", g: "femenino" },
    { id: "ir-a-los-bifes", k: "p", es: "Ir a los bifes", def: "to get to the point", gloss: "ir al grano", ex: "Bueno, vamos a los bifes: ¿cuánto sale?", cat: "dicho", fn: "otro", reg: "coloquial", idio: true, lit: "to go to the steaks" },
    { id: "asado", k: "w", es: "asado", def: "barbecue — the meat, and the long gathering around it", gloss: "la carne a la parrilla, y la reunión", ex: "El domingo hay asado en lo de mis suegros.", cat: "costumbre", pos: "sustantivo", g: "masculino", note: "El asador recibe un aplauso: «¡un aplauso para el asador!»." },
    { id: "mas-vale", k: "p", es: "Más vale", def: "you bet / of course", gloss: "¡claro que sí!", ex: "—¿Venís al asado? —¡Más vale!", cat: "dicho", fn: "acuerdo", reg: "coloquial", idio: true, lit: "it's worth more" },
    { id: "birome", k: "w", es: "birome", def: "ballpoint pen", gloss: "el bolígrafo", ex: "¿Me prestás una birome?", cat: "de acá", pos: "sustantivo", g: "femenino", note: "Por Bíró y Meyne, que la fabricaron en Buenos Aires en los años cuarenta." },
    { id: "una-banda", k: "p", es: "Una banda", def: "a lot / loads", gloss: "mucho", ex: "Te extraño una banda.", cat: "dicho", fn: "otro", reg: "coloquial", idio: true, lit: "a band" },
    { id: "pochoclo", k: "w", es: "pochoclo", def: "popcorn", gloss: "las palomitas", ex: "Compramos pochoclo en el cine.", cat: "de acá", pos: "sustantivo", g: "masculino" },
    { id: "salir-de-joda", k: "p", es: "Salir de joda", def: "to go out partying", gloss: "salir a divertirse", ex: "El viernes salimos de joda.", cat: "dicho", fn: "otro", reg: "coloquial", idio: true, lit: "to go out on a spree", note: "Informal; entre amigos." },
    { id: "cortado", k: "w", es: "cortado", def: "espresso with a little milk", gloss: "el café con un poco de leche", ex: "Un cortado y una medialuna, por favor.", cat: "costumbre", pos: "sustantivo", g: "masculino", note: "Una lágrima es al revés: mucha leche y un poco de café." },
    { id: "chabon", k: "w", es: "chabón", def: "guy, dude", gloss: "el tipo", ex: "Un chabón me preguntó la hora.", cat: "lunfardo", pos: "sustantivo", g: "masculino" },
    { id: "luca", k: "w", es: "luca", def: "a thousand pesos (slang)", gloss: "mil pesos", ex: "La entrada sale diez lucas.", cat: "lunfardo", pos: "sustantivo", g: "femenino" },
    { id: "changuito", k: "w", es: "changuito", def: "shopping cart; a wheeled shopping trolley", gloss: "el carrito", ex: "Agarrá un changuito, que compramos mucho.", cat: "de acá", pos: "sustantivo", g: "masculino" },
    { id: "hincha", k: "w", es: "hincha", def: "fan of a football club", gloss: "el o la fan de un club", ex: "Soy hincha de Boca.", cat: "costumbre", pos: "sustantivo", g: "masculino", note: "El hincha, la hincha. La primera pregunta: «¿de qué cuadro sos?»." },
    { id: "feriado", k: "w", es: "feriado", def: "public holiday", gloss: "el día festivo", ex: "El lunes es feriado.", cat: "costumbre", pos: "sustantivo", g: "masculino" },
    { id: "canchero", k: "w", es: "canchero", def: "confident and savvy; a bit of a show-off", gloss: "que se las sabe todas", ex: "Se hace el canchero, pero está nervioso.", cat: "lunfardo", pos: "adjetivo", g: "", note: "Femenino: canchera. Tener cancha = tener experiencia." }
  ];

  var ALBUM_LIST_NAME = "Álbum";
  var PLAY_GOALS = [10, 20, 30, 50];
  var PLAY_GOAL_DEFAULT = 20;
  var PLAY_GOAL_KEY = "iv-daily-goal";
  var PLAY_RACHA_STEP = 7;
  var PLAY_SESSION_STEPS = [50, 100];
  var PLAY_COMBO = 20;
  var REWARDS_LOCAL_KEY = "iv-rewards";
  var REWARD_COLS = ["id", "user_id", "reason", "item_id", "earned_at"];

  var playGoal = PLAY_GOAL_DEFAULT;
  try { var savedGoal = parseInt(localStorage.getItem(PLAY_GOAL_KEY), 10); if (PLAY_GOALS.indexOf(savedGoal) !== -1) playGoal = savedGoal; } catch (e) {}
  var rewardsState = { userId: null, list: [], loaded: false, loading: null, flushing: false };
  var rewardScreens = [];   // reward screens waiting their turn: [{ rec, view }]
  var rewardShowing = null;
  var albumOpen = false;

  function albumItem(id) { for (var i = 0; i < ALBUM.length; i++) if (ALBUM[i].id === id) return ALBUM[i]; return null; }

  // ---- the daily goal (user_settings.daily_goal, and this device) ----
  function setPlayGoal(n) {
    if (PLAY_GOALS.indexOf(n) === -1 || n === playGoal) return;
    playGoal = n;
    try { localStorage.setItem(PLAY_GOAL_KEY, String(n)); } catch (e) {}
    renderPlay();
    if (currentUser) {
      supabaseClient.from("user_settings")
        .upsert({ user_id: currentUser.id, daily_goal: n, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
        .then(function (res) { if (res && res.error) console.warn("[jugar] daily goal kept on this device only:", res.error.message); });
    }
    playCheckRacha();
  }
  // Its own query, so a missing daily_goal column (SQL not run yet) can't
  // break loading the language and voice.
  function loadPlayGoal() {
    if (!currentUser) return;
    supabaseClient.from("user_settings").select("daily_goal").eq("user_id", currentUser.id).maybeSingle().then(function (res) {
      if (!res || res.error || !res.data) return;
      var n = parseInt(res.data.daily_goal, 10);
      if (PLAY_GOALS.indexOf(n) === -1 || n === playGoal) return;
      playGoal = n;
      try { localStorage.setItem(PLAY_GOAL_KEY, String(n)); } catch (e) {}
      renderPlay();
    });
  }

  // ---- the racha, from the practice log ----
  // A card counts toward the day's goal once it was turned over or graded
  // (just swiping past one doesn't).
  function playCounted(r) { return !!(r.flipped || r.grade === "bien" || r.grade === "otra"); }
  function playWeekOf(day) { return Math.floor((day - 4) / 7); } // day 4 (1970-01-05) was a Monday
  function playDayStr(day) { return new Date(day * 86400000).toISOString().slice(0, 10); }
  function playDayCounts(rows) {
    var c = {};
    rows.forEach(function (r) { if (playCounted(r)) { var d = progDayNum(r.shown_at); c[d] = (c[d] || 0) + 1; } });
    return c;
  }
  // Walks every day from the first one practised to today. A day under the
  // goal uses that week's free day if it's still unused and a racha is
  // running; otherwise the racha ends. Today never breaks it (the day isn't
  // over).
  function playStreak(counts, goal, today) {
    var days = Object.keys(counts).map(Number);
    var out = { cur: 0, start: null, best: 0, free: {}, today: counts[today] || 0, todayMet: (counts[today] || 0) >= goal };
    if (!days.length) return out;
    var first = Math.min.apply(null, days);
    var used = {};
    for (var d = first; d <= today; d++) {
      if ((counts[d] || 0) >= goal) {
        if (!out.cur) { out.start = d; out.free = {}; }
        out.cur++;
        if (out.cur > out.best) out.best = out.cur;
      } else if (d === today) {
        // still to play
      } else if (out.cur && !used[playWeekOf(d)]) {
        used[playWeekOf(d)] = true;
        out.free[d] = true;
      } else {
        out.cur = 0; out.start = null; out.free = {};
      }
    }
    return out;
  }

  // Sessions, from the log: cards per session, and in Hablar the automatic
  // Bien (grade_auto + bien: the suggestion, kept) and runs of them. An
  // automatic Otra vez ends a run; a card graded by hand neither counts nor
  // ends one. Each card counts once per pass.
  function playSessionStats(rows, today) {
    var s = {};
    rows.forEach(function (r) {
      var x = s[r.session_id] || (s[r.session_id] = { cards: 0, bien: 0, combo: 0, best: 0, day: null, seen: {} });
      if (playCounted(r)) x.cards++;
      var d = progDayNum(r.shown_at);
      if (x.day === null) x.day = d;
      if (r.mode !== "hablar" || !r.grade_auto) return;
      var k = r.pass + "|" + unitKey(r.item_kind, r.item_key, r.form_key);
      if (r.grade === "bien") {
        if (x.seen[k]) return;
        x.seen[k] = true;
        x.bien++; x.combo++;
        if (x.combo > x.best) x.best = x.combo;
      } else if (r.grade === "otra") {
        x.combo = 0;
      }
    });
    var out = { longest: 0, bestCombo: 0, todayBien: 0, todayCombo: 0 };
    Object.keys(s).forEach(function (id) {
      var x = s[id];
      if (x.cards > out.longest) out.longest = x.cards;
      if (x.best > out.bestCombo) out.bestCombo = x.best;
      if (x.day === today) {
        if (x.bien > out.todayBien) out.todayBien = x.bien;
        if (x.best > out.todayCombo) out.todayCombo = x.best;
      }
    });
    // the deck that's open right now (its newest card may not be logged yet)
    var live = practiceSession && practiceSession.play;
    if (live) {
      if (live.n > out.todayBien) out.todayBien = live.n;
      if (live.best > out.todayCombo) out.todayCombo = live.best;
      if (live.best > out.bestCombo) out.bestCombo = live.best;
    }
    return out;
  }

  function playHistoryReady() {
    return !!(currentUser && practiceHistory.rows && practiceHistory.userId === currentUser.id && !practiceHistory.error);
  }
  function playModel() {
    var rows = practiceAllRows();
    var today = progToday();
    var st = playStreak(playDayCounts(rows), playGoal, today);
    st.sessions = playSessionStats(rows, today);
    st.todayDay = today;
    return st;
  }

  // ---- rewards: stored, sent, and what they add ----
  function rewardsLocalAll() {
    try { return JSON.parse(localStorage.getItem(REWARDS_LOCAL_KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function rewardsSaveLocal() {
    if (!rewardsState.userId) return;
    var all = rewardsLocalAll();
    all[rewardsState.userId] = rewardsState.list;
    try { localStorage.setItem(REWARDS_LOCAL_KEY, JSON.stringify(all)); } catch (e) {}
  }
  function rewardsForUser() {
    if (!currentUser) return [];
    if (rewardsState.userId !== currentUser.id) {
      rewardsState = { userId: currentUser.id, list: rewardsLocalAll()[currentUser.id] || [], loaded: false, loading: null, flushing: false };
    }
    return rewardsState.list;
  }
  function rewardHas(reason) { return rewardsForUser().some(function (r) { return r.reason === reason; }); }
  function albumEarnedIds() {
    var ids = {};
    rewardsForUser().forEach(function (r) { if (r.item_id) ids[r.item_id] = true; });
    return ids;
  }
  function albumNextItem() {
    var have = albumEarnedIds();
    for (var i = 0; i < ALBUM.length; i++) if (!have[ALBUM[i].id]) return ALBUM[i];
    return null;
  }

  // Server rows win for a reason both sides have; this device's rows the
  // server hasn't got yet stay, marked to be sent.
  function loadRewards() {
    if (!currentUser) return Promise.resolve([]);
    rewardsForUser();
    if (rewardsState.loading) return rewardsState.loading;
    var uid = currentUser.id;
    rewardsState.loading = supabaseClient.from("rewards").select("id,reason,item_id,earned_at").then(function (res) {
      if (rewardsState.userId !== uid) return;
      rewardsState.loading = null;
      rewardsState.loaded = true;
      if (res && res.error) {
        console.warn("[jugar] rewards kept on this device for now:", res.error.message);
      } else {
        var byReason = {};
        (res.data || []).forEach(function (r) { byReason[r.reason] = { id: r.id, user_id: uid, reason: r.reason, item_id: r.item_id || null, earned_at: r.earned_at }; });
        rewardsState.list.forEach(function (r) {
          if (byReason[r.reason]) { if (r._add) byReason[r.reason]._add = true; return; }
          byReason[r.reason] = Object.assign({}, r, { _send: true });
        });
        rewardsState.list = Object.keys(byReason).map(function (k) { return byReason[k]; })
          .sort(function (a, b) { return Date.parse(a.earned_at) - Date.parse(b.earned_at); });
        rewardsSaveLocal();
      }
      rewardsFlush();
      rewardsRetryAdds();
      playCheckRacha();
      renderPlay();
    }, function (err) {
      rewardsState.loading = null;
      rewardsState.loaded = true;
      console.warn("[jugar] rewards kept on this device for now:", err && err.message);
      playCheckRacha();
    });
    return rewardsState.loading;
  }

  function rewardsFlush() {
    if (!currentUser || rewardsState.flushing || rewardsState.userId !== currentUser.id) return;
    var waiting = rewardsState.list.filter(function (r) { return r._send; });
    if (!waiting.length) return;
    var rows = waiting.map(function (r) { var o = {}; REWARD_COLS.forEach(function (k) { o[k] = r[k]; }); return o; });
    rewardsState.flushing = true;
    supabaseClient.from("rewards").upsert(rows, { onConflict: "user_id,reason", ignoreDuplicates: true }).then(function (res) {
      rewardsState.flushing = false;
      if (res && res.error) { console.warn("[jugar] rewards not sent yet (will retry):", res.error.message); return; }
      waiting.forEach(function (r) { delete r._send; });
      rewardsSaveLocal();
    }, function () { rewardsState.flushing = false; });
  }
  function rewardsRetryAdds() {
    rewardsForUser().forEach(function (r) { if (r._add) albumAdd(r); });
  }
  window.addEventListener("online", function () { if (currentUser) { rewardsFlush(); rewardsRetryAdds(); } });

  // Puts an album item into the person's own Vocabulario / Frases (unless
  // it's already there) and into the «Álbum» list. Safe to repeat.
  var albumAdding = {};
  function albumAdd(rec) {
    var item = albumItem(rec.item_id);
    if (!item || !currentUser || albumAdding[item.id]) return Promise.resolve(false);
    albumAdding[item.id] = true;
    var isWord = item.k === "w";
    var table = isWord ? "words" : "phrases";
    var col = isWord ? "word" : "phrase";
    var toData = isWord ? rowToWord : rowToPhrase;
    var notes = item.gloss ? ("= " + item.gloss + "." + (item.note ? " " + item.note : "")) : (item.note || "");
    var row = isWord
      ? { word: item.es, definition: item.def, part_of_speech: item.pos || "sustantivo", gender: item.g || "", notes: notes, example: item.ex || "" }
      : { phrase: item.es, definition: item.def, function: item.fn || "otro", register: item.reg || "coloquial", idiomatic: !!item.idio, literal: item.lit || "", notes: notes, example: item.ex || "" };
    var inserted = false;
    return supabaseClient.from(table).select("*").then(function (res) {
      if (res.error) throw res.error;
      var have = (res.data || []).filter(function (r) { return norm(r[col] || "") === norm(item.es); })[0];
      if (have) return toData(have).data;
      return supabaseClient.from(table).insert(row).select().single().then(function (ins) {
        if (ins.error) throw ins.error;
        inserted = true;
        return toData(ins.data).data;
      });
    }).then(function (data) {
      return findOrCreateListByName(ALBUM_LIST_NAME).then(function (lr) {
        if (lr.error) throw lr.error;
        return addImportSnapshotsToList(lr.id, isWord ? "word" : "phrase", [data]);
      });
    }).then(function (r) {
      if (r && r.error) throw r.error;
      delete albumAdding[item.id];
      if (inserted) { if (isWord) loadWords(); else loadPhrases(); }
      loadLists();
      if (rec._add) { delete rec._add; rewardsSaveLocal(); }
      return true;
    }).catch(function (err) {
      delete albumAdding[item.id];
      console.warn("[jugar] couldn't add " + item.es + " yet (will retry):", err && err.message);
      return false;
    });
  }

  // A new reward: the next album item, stored, sent, added to your content
  // and shown. Each reason can only be won once.
  function rewardEarn(reason) {
    if (!currentUser || rewardHas(reason)) return null;
    var item = albumNextItem();
    var rec = { id: practiceUuid(), user_id: currentUser.id, reason: reason, item_id: item ? item.id : null, earned_at: new Date().toISOString(), _send: true, _add: !!item };
    rewardsState.list.push(rec);
    rewardsSaveLocal();
    if (ptActive()) partida.rewards.push(rec);
    rewardsFlush();
    if (item) albumAdd(rec);
    showReward(rec, false);
    if (el.playPanel && !el.playPanel.hidden) renderPlay();
    return rec;
  }

  // Racha rewards: every multiple of 7 in the current racha that hasn't
  // been won yet. The reason names the racha's first day, so a new racha
  // can win its 7 again.
  function playCheckRacha() {
    if (!playHistoryReady() || !rewardsState.loaded || rewardsState.userId !== currentUser.id) return;
    var st = playStreak(playDayCounts(practiceAllRows()), playGoal, progToday());
    if (!st.cur || st.start === null) return;
    for (var m = PLAY_RACHA_STEP; m <= st.cur; m += PLAY_RACHA_STEP) rewardEarn("racha:" + playDayStr(st.start) + ":" + m);
  }

  // ---- in a deck ----
  function playDeckStart() {
    if (practiceSession) practiceSession.play = { seen: {}, n: 0, combo: 0, best: 0 };
    renderFlashCombo();
    if (!currentUser) return;
    loadPracticeHistory(false);
    if (!rewardsState.loaded || rewardsState.userId !== currentUser.id) loadRewards();
  }
  // Called for every card closed in a deck: maybe today's goal was just
  // reached and the racha hit a multiple of 7.
  function playAfterRow(row) {
    if (!row || !playCounted(row) || !playHistoryReady()) return;
    var today = progToday();
    var n = 0;
    practiceAllRows().forEach(function (r) { if (playCounted(r) && progDayNum(r.shown_at) === today) n++; });
    if (n >= playGoal) playCheckRacha();
  }
  // A Hablar result came back. Counts the automatic grade only.
  function playOnSpeech(card, result) {
    var live = practiceSession && practiceSession.play;
    if (!live || !card || !result) return;
    var key = practiceSession.pass + "|" + practiceCardKey(card);
    if (live.seen[key]) return; // this card already counted Bien in this pass
    if (result.auto_grade === "bien") {
      live.seen[key] = true;
      live.n++; live.combo++;
      if (live.combo > live.best) live.best = live.combo;
      var day = playDayStr(progToday());
      PLAY_SESSION_STEPS.forEach(function (s) { if (live.n === s) rewardEarn("hablar" + s + ":" + day); });
      if (live.combo === PLAY_COMBO) rewardEarn("combo" + PLAY_COMBO + ":" + day);
    } else if (result.auto_grade === "otra") {
      live.combo = 0;
    }
    renderFlashCombo();
  }
  // "×7" in the deck's top bar once two or more Bien in a row in Hablar.
  function renderFlashCombo() {
    if (!el.flashCombo) return;
    var live = practiceSession && practiceSession.play;
    var n = live ? live.combo : 0;
    el.flashCombo.hidden = n < 2 || el.flashOverlay.hidden;
    el.flashCombo.textContent = "";
    if (n < 2) return;
    el.flashCombo.appendChild(progEl("b", null, "×" + n));
    el.flashCombo.appendChild(document.createTextNode(" " + t("play_combo_hud")));
    el.flashCombo.setAttribute("aria-label", t("play_combo_aria", { n: n }));
  }

  // ---- labels ----
  function rewardParse(reason) {
    var m = /^racha:(\d{4}-\d{2}-\d{2}):(\d+)$/.exec(reason || "");
    if (m) return { kind: "racha", n: parseInt(m[2], 10) };
    m = /^hablar(\d+):/.exec(reason || "");
    if (m) return { kind: "hablar", n: parseInt(m[1], 10) };
    m = /^combo(\d+):/.exec(reason || "");
    if (m) return { kind: "combo", n: parseInt(m[1], 10) };
    return { kind: "otro", n: 0 };
  }
  function rewardHow(reason) { var p = rewardParse(reason); return t("play_how_" + p.kind, { n: p.n }); }
  function rewardKicker(reason) { var p = rewardParse(reason); return t("play_kick_" + p.kind, { n: p.n }); }
  function albumMeaning(item) { return currentLang === "es" ? (item.gloss || item.def) : item.def; }

  // ---- the reward screen ----
  function showReward(rec, view) {
    rewardScreens.push({ rec: rec, view: !!view });
    if (!rewardShowing) nextReward();
  }
  function nextReward() {
    rewardShowing = rewardScreens.shift() || null;
    if (!rewardShowing) { el.rewardOverlay.hidden = true; document.body.classList.remove("reward-open"); return; }
    renderReward();
    el.rewardOverlay.hidden = false;
    document.body.classList.add("reward-open");
    try { el.rewardGo.focus({ preventScroll: true }); } catch (e) {}
  }
  function renderReward() {
    var s = rewardShowing;
    if (!s) return;
    var rec = s.rec;
    var item = albumItem(rec.item_id);
    el.rewardKicker.textContent = s.view ? rewardHow(rec.reason) + " · " + new Date(rec.earned_at).toLocaleDateString(currentLang === "es" ? "es-AR" : "en-US", { day: "numeric", month: "long" }) : rewardKicker(rec.reason);
    el.rewardWord.textContent = item ? item.es : t("play_album_done_title");
    el.rewardGloss.textContent = item ? albumMeaning(item) : t("play_album_done_text");
    el.rewardExample.textContent = item && item.ex ? "«" + item.ex + "»" : "";
    el.rewardExample.hidden = !(item && item.ex);
    el.rewardNote.textContent = item && item.note ? item.note : "";
    el.rewardNote.hidden = !(item && item.note);
    el.rewardWhere.textContent = "";
    if (item) {
      var parts = t(item.k === "w" ? "play_added_word" : "play_added_phrase", { list: ALBUM_LIST_NAME }).split(/\*\*/);
      parts.forEach(function (p, i) { el.rewardWhere.appendChild(i % 2 ? progEl("b", null, p) : document.createTextNode(p)); });
    }
    el.rewardWhere.hidden = !item;
    el.rewardListen.hidden = !item;
    el.rewardMsg.textContent = "";
    var inDeck = !el.flashOverlay.hidden;
    el.rewardGo.textContent = s.view ? t("close") : (inDeck ? t("play_keep_playing") : t("play_to_album"));
  }
  function closeReward(toAlbum) {
    if (ttsAudioEl) { try { ttsAudioEl.pause(); } catch (e) {} }
    var s = rewardShowing;
    if (toAlbum && s && !s.view && el.flashOverlay.hidden) { setMainTab("play"); openAlbum(true); }
    nextReward();
  }

  // ---- the tab ----
  function renderPlay() {
    if (!el.playPanel || el.playPanel.hidden) return;
    el.playHome.hidden = albumOpen;
    el.playAlbum.hidden = !albumOpen;
    if (!currentUser) { el.playRacha.textContent = ""; return; }
    var m = playModel();
    if (albumOpen) { drawAlbum(); return; }
    drawRacha(m);
    drawPlayModes();
    drawPlayToday(m);
    drawAlbumEntry();
  }
  function openAlbum(open) {
    albumOpen = !!open;
    renderPlay();
    try { window.scrollTo({ top: 0 }); } catch (e) {}
  }

  function drawRacha(m) {
    var box = el.playRacha;
    box.innerHTML = "";
    var top = progEl("div", "play-racha-top");
    var n = progEl("div", "play-racha-n", String(m.cur));
    n.appendChild(progEl("span", null, t(m.cur === 1 ? "play_days_one" : "play_days")));
    top.appendChild(n);
    top.appendChild(progEl("div", "play-racha-goal" + (m.todayMet ? " is-met" : ""), t(m.todayMet ? "play_today_met" : "play_today", { n: m.today, goal: playGoal })));
    box.appendChild(top);

    var week = progEl("div", "play-week");
    var letters = t("prog_days").split(",");
    var start = progWeekStartDay();
    var counts = null;
    for (var i = 0; i < 7; i++) {
      var d = start + i;
      var cls = "";
      if (d === m.todayDay) cls = m.todayMet ? "on today" : "today";
      else if (d < m.todayDay) {
        if (!counts) counts = playDayCounts(practiceAllRows());
        if ((counts[d] || 0) >= playGoal) cls = "on";
        else if (m.free[d]) cls = "free";
      }
      var cell = progEl("div", "play-day");
      var dot = progEl("i", cls || null);
      if (cls.indexOf("free") !== -1) dot.title = t("play_free_day");
      cell.appendChild(dot);
      cell.appendChild(progEl("span", null, letters[i]));
      week.appendChild(cell);
    }
    box.appendChild(week);

    var track = progEl("div", "prog-track play-track");
    var fill = progEl("i", "l");
    fill.style.width = Math.min(100, Math.round(100 * m.today / playGoal)) + "%";
    track.appendChild(fill);
    box.appendChild(track);

    var next = progEl("p", "play-next");
    var left = Math.max(0, playGoal - m.today);
    var msg;
    if (!m.todayMet) msg = t((m.cur ? "play_next_keep" : "play_next_start") + (left === 1 ? "_one" : ""), { n: left });
    else { var toGo = PLAY_RACHA_STEP - (m.cur % PLAY_RACHA_STEP); msg = t(toGo === 1 ? "play_next_reward_one" : "play_next_reward", { n: toGo }); }
    msg.split(/\*\*/).forEach(function (p, i) { next.appendChild(i % 2 ? progEl("b", null, p) : document.createTextNode(p)); });
    box.appendChild(next);

    var goalRow = progEl("div", "play-goal-row");
    goalRow.appendChild(progEl("span", "play-goal-label", t("play_goal_label")));
    var tog = progEl("div", "lang-toggle play-goal-toggle");
    PLAY_GOALS.forEach(function (g) {
      var b = progEl("button", "lang-option" + (g === playGoal ? " active" : ""), String(g));
      b.type = "button";
      b.setAttribute("aria-pressed", g === playGoal ? "true" : "false");
      b.addEventListener("click", function () { setPlayGoal(g); });
      tog.appendChild(b);
    });
    goalRow.appendChild(tog);
    box.appendChild(goalRow);
    box.appendChild(progEl("p", "play-fine", t("play_racha_rule")));
  }

  function drawPlayToday(m) {
    var box = el.playToday;
    box.innerHTML = "";
    box.appendChild(progEl("h3", null, t("play_today_title")));
    box.appendChild(progEl("p", "prog-sub", t("play_today_sub")));
    var day = playDayStr(m.todayDay);
    var rows = [
      [t("play_goal_session", { n: PLAY_SESSION_STEPS[0] }), m.sessions.todayBien, PLAY_SESSION_STEPS[0], "hablar" + PLAY_SESSION_STEPS[0] + ":" + day],
      [t("play_goal_session", { n: PLAY_SESSION_STEPS[1] }), m.sessions.todayBien, PLAY_SESSION_STEPS[1], "hablar" + PLAY_SESSION_STEPS[1] + ":" + day],
      [t("play_goal_combo", { n: PLAY_COMBO }), m.sessions.todayCombo, PLAY_COMBO, "combo" + PLAY_COMBO + ":" + day]
    ];
    var list = progEl("div", "play-goals");
    rows.forEach(function (r) {
      var won = rewardHas(r[3]);
      var line = progEl("div", "play-goal" + (won ? " is-won" : ""));
      line.appendChild(progEl("span", "play-goal-name", r[0]));
      line.appendChild(progEl("span", "play-goal-val", won ? t("play_won_today") : Math.min(r[1], r[2]) + " / " + r[2]));
      var tr = progEl("div", "prog-track");
      var f = progEl("i", "l");
      f.style.width = (won ? 100 : Math.min(100, Math.round(100 * r[1] / r[2]))) + "%";
      tr.appendChild(f);
      line.appendChild(tr);
      list.appendChild(line);
    });
    box.appendChild(list);
    var go = progButton(t("play_speak_btn"), true, function () {
      setFlashMode("hablar");
      setMainTab("flashcards");
      try { window.scrollTo({ top: 0 }); } catch (e) {}
    });
    go.disabled = quietMode;
    box.appendChild(go);
    if (quietMode) box.appendChild(progEl("p", "play-fine", t("play_quiet_note")));
  }

  function drawAlbumEntry() {
    var b = el.playAlbumEntry;
    var n = Object.keys(albumEarnedIds()).length;
    el.playAlbumEntryText.textContent = t("play_album_entry", { n: n, total: ALBUM.length });
    b.setAttribute("aria-label", t("play_album_title") + ". " + el.playAlbumEntryText.textContent);
  }

  function drawAlbum() {
    var earned = rewardsForUser().filter(function (r) { return albumItem(r.item_id); });
    var seen = {};
    earned = earned.filter(function (r) { if (seen[r.item_id]) return false; seen[r.item_id] = true; return true; });
    el.playAlbumDesc.textContent = t("play_album_desc", { n: earned.length, total: ALBUM.length, list: ALBUM_LIST_NAME });
    var grid = el.playAlbumGrid;
    grid.innerHTML = "";
    earned.forEach(function (r) {
      var item = albumItem(r.item_id);
      var tile = progEl("button", "album-tile");
      tile.type = "button";
      tile.appendChild(progEl("b", null, item.es));
      tile.appendChild(progEl("span", null, albumMeaning(item) + " · " + rewardHow(r.reason)));
      tile.addEventListener("click", function () { showReward(r, true); });
      grid.appendChild(tile);
    });
    var left = ALBUM.length - earned.length;
    // fill the last row, plus one more row of "?"
    var locked = Math.min(left, earned.length % 3 ? (3 - earned.length % 3) + 3 : 6);
    for (var i = 0; i < locked; i++) {
      var lk = progEl("div", "album-tile is-locked", "?");
      lk.setAttribute("aria-hidden", "true");
      grid.appendChild(lk);
    }
    el.playAlbumLeft.textContent = left ? t("play_album_left", { n: left }) : t("play_album_done_text");
    var how = el.playAlbumHow;
    how.innerHTML = "";
    [[t("play_rule_racha", { a: PLAY_RACHA_STEP, b: 2 * PLAY_RACHA_STEP, c: 3 * PLAY_RACHA_STEP })],
     [t("play_rule_session", { a: PLAY_SESSION_STEPS[0], b: PLAY_SESSION_STEPS[1] })],
     [t("play_rule_combo", { n: PLAY_COMBO })]].forEach(function (r) {
      how.appendChild(progEl("span", null, r[0]));
      how.appendChild(progEl("span", "plus", "+1"));
    });
    el.playAlbumFine.textContent = t("play_rule_fine");
  }

  // ---- Progreso: the "Jugar" card ----
  function drawPlayCard() {
    if (!currentUser) return null;
    var m = playModel();
    var c = progCard(t("nav_play"));
    var stats = progEl("div", "play-stats");
    [[t(m.cur === 1 ? "play_stat_days_one" : "play_stat_days", { n: m.cur }), t("play_stat_racha", { n: m.best })],
     [String(m.sessions.longest), t("play_stat_longest")],
     [String(m.sessions.bestCombo), t("play_stat_combo")],
     [t("play_stat_album_n", { n: Object.keys(albumEarnedIds()).length, total: ALBUM.length }), t("play_stat_album")]
    ].forEach(function (s) {
      var x = progEl("div");
      x.appendChild(progEl("b", null, s[0]));
      x.appendChild(progEl("span", null, s[1]));
      stats.appendChild(x);
    });
    c.appendChild(stats);
    c.appendChild(progButton(t("play_go_btn"), false, function () { setMainTab("play"); try { window.scrollTo({ top: 0 }); } catch (e) {} }));
    return c;
  }

  // Test/debug hook.
  window.vosePlay = {
    album: ALBUM, streak: playStreak, sessions: playSessionStats, dayStr: playDayStr, weekOf: playWeekOf,
    rewards: function () { return rewardsForUser().slice(); }, goal: function () { return playGoal; },
    earn: rewardEarn, check: playCheckRacha, onSpeech: playOnSpeech,
    partida: function () { return partida; }, deck: function () { return { deck: flashDeck, index: flashIndex }; }, ptStart: ptStart
  };

  // ================= Partida (2026-10-06) =================
  // The first game on the Jugar tab (mockup partida_maqueta.png; mason:
  // "a ladder per card", "everything + Temas", "endless + summary").
  //   · One endless deck. New cards are drawn as you go: what's due for
  //     review, what you've missed lately, things you've never practised,
  //     and every PT_TOPIC_EVERY-th card a Tema you've practised.
  //   · Each card sits on a rung — Leer (0), Escuchar (1), Hablar (2). It
  //     starts where its history puts it (Progreso's review box: 0 → Leer,
  //     1–2 → Escuchar, 3+ → Hablar). Bien sends it back a few cards later
  //     one rung up; Otra vez sends it back sooner, one rung down; Bien on
  //     the top rung retires it for this game. A swipe with no grade sends
  //     it back later on the same rung.
  //   · Quiet mode keeps every card in Leer (Bien retires it); without a
  //     microphone the top rung is Escuchar.
  //   · A quiet tag on the front says why the card came up and in which
  //     mode; the hint line under the card says where a grade sends it.
  //   · Terminar shows a summary (cards, time, % Bien, best run, where the
  //     cards ended up, the ones you missed, what you won); Seguir jugando
  //     picks the same game back up.
  // Every card is logged like any other card, so Progreso, the racha and
  // the Hablar rewards all see it.
  var PT_AHEAD = 9;          // cards kept queued ahead of the current one
  var PT_UP_MIN = 5, PT_UP_MAX = 8;  // Bien → back this many cards later
  var PT_DOWN = 3;           // Otra vez → back this soon
  var PT_SAME = 10;          // no grade → back this much later
  var PT_TOPIC_EVERY = 8;
  var PT_PATTERN = ["due", "hard", "new", "due", "new", "due", "hard"];
  var PT_RECORDS_KEY = "iv-partidas";
  var PT_RECORDS_MAX = 50;
  var partida = null;

  function ptTop() { return quietMode ? 0 : (hablarSupported() ? 2 : 1); }
  function ptRungName(r) { return t(r === 2 ? "flash_mode_speak" : (r === 1 ? "flash_mode_listen" : "flash_mode_read")); }
  function ptRungFromBox(box) { return box >= PROG_LEARNED_BOX ? 2 : (box >= 1 ? 1 : 0); }

  // One unit's card on a rung. A ref is { kind, data, formKey } (topics:
  // { kind: "topic", tp, formKey }).
  function ptCardFor(ref, rung, why) {
    var base;
    var dir = rung === 2 ? "def2word" : "word2def";
    if (ref.kind === "topic") base = topicCard(ref.tp, ref.formKey);
    else if (ref.kind === "verb") base = verbCards(ref.data, function (fk) { return fk === ref.formKey; })[0];
    else if (ref.kind === "word") base = wordCard(ref.data, dir);
    else base = phraseCard(ref.data, dir);
    if (!base) return null;
    var card = rung === 2 ? speakCard(base) : (rung === 1 ? listenCard(base) : Object.assign({}, base));
    card.dir = ref.kind === "word" || ref.kind === "phrase" ? dir : null;
    card._pt = { ref: ref, rung: rung, why: why, unit: practiceCardKey(card) };
    return card;
  }

  // ---- what goes in ----
  function ptBuildPools() {
    var P = computeProgress(practiceAllRows());
    var idx = progContentIndex();
    var since = P.today - PROG_STRUGGLE_DAYS + 1;
    var pools = { due: [], hard: [], new: [], seen: [] };
    var used = {};
    var units = Object.keys(P.units).map(function (k) { return P.units[k]; });
    var tensesUsed = {};
    function refFor(u) {
      if (u.kind === "topic") { var tp = topicById(u.itemKey); return tp && u.formKey ? { kind: "topic", tp: tp, formKey: u.formKey } : null; }
      var item = progUnitItem(idx, u);
      if (!item) return null;
      if (u.kind === "verb") {
        if (!u.formKey) return null;
        if (!verbCards(item.data, function (fk) { return fk === u.formKey; }).length) return null;
        return { kind: "verb", data: item.data, formKey: u.formKey };
      }
      return { kind: u.kind, data: item.data, formKey: null };
    }
    function push(pool, u, why) {
      if (used[u.key]) return;
      var ref = refFor(u);
      if (!ref) return;
      used[u.key] = true;
      pools[pool].push({ ref: ref, rung: ptRungFromBox(u.box), why: why });
    }
    units.forEach(function (u) { if (u.kind === "verb" && u.formKey) tensesUsed[String(u.formKey).split("|")[0]] = true; });
    // Topic cards come in through their own rotation (ptTopicPools), so
    // the pools below are your collection only.
    var mine = units.filter(function (u) { return u.kind !== "topic"; });
    // Missed lately first (they're usually due too, and "te cuesta" says
    // more), then the rest of what's due, oldest first.
    shuffleArray(mine.filter(function (u) {
      return !u.learned && u.events.some(function (e) { return e.day >= since && e.grade === "otra"; });
    })).forEach(function (u) { push("hard", u, "hard"); });
    shuffleArray(mine.filter(function (u) { return u.due; }))
      .sort(function (a, b) { return a.dueDay - b.dueDay; })
      .forEach(function (u) { push("due", u, "due"); });
    // never practised: words and phrases, and one form per verb (a tense
    // you already practise, presente if none)
    var tenses = Object.keys(tensesUsed);
    if (!tenses.length) tenses = ["presente"];
    var fresh = [];
    allWords.forEach(function (w) { if (!P.items["word|" + practiceNorm(w.data.word)]) fresh.push({ kind: "word", data: w.data, formKey: null }); });
    allPhrases.forEach(function (ph) { if (!P.items["phrase|" + practiceNorm(ph.data.phrase)]) fresh.push({ kind: "phrase", data: ph.data, formKey: null }); });
    allVerbs.forEach(function (v) {
      if (P.items["verb|" + practiceNorm(v.data.infinitive)]) return;
      var forms = verbCards(v.data, function (fk) { return tenses.indexOf(String(fk).split("|")[0]) !== -1; });
      if (!forms.length) forms = verbCards(v.data, function () { return true; });
      if (forms.length) fresh.push({ kind: "verb", data: v.data, formKey: forms[Math.floor(Math.random() * forms.length)].formKey });
    });
    shuffleArray(fresh).forEach(function (ref) { pools.new.push({ ref: ref, rung: 0, why: "new" }); });
    // everything else you've practised, least recently seen first
    mine.slice()
      .sort(function (a, b) { return (a.last ? a.last.at : 0) - (b.last ? b.last.at : 0); })
      .forEach(function (u) { push("seen", u, "back"); });
    pools.topics = ptTopicPools(P);
    pools.P = P;
    return pools;
  }
  // The topics you've practised, each with a queue of its own cards.
  function ptTopicPools(P) {
    var ids = {};
    Object.keys(P.items).forEach(function (k) { var it = P.items[k]; if (it.kind === "topic" && topicById(it.key)) ids[it.key] = true; });
    // TOPICS is already in A1 → B1 order
    return TOPICS.filter(function (tp) { return ids[tp.id]; }).map(function (tp) { return { tp: tp, queue: [] }; });
  }
  function ptHasContent(pools) {
    return pools.due.length + pools.hard.length + pools.new.length + pools.seen.length + pools.topics.length > 0;
  }

  // ---- the queue ----
  function ptUpcomingUnits() {
    var u = {};
    for (var i = Math.max(0, flashIndex - 3); i < flashDeck.length; i++) { var c = flashDeck[i]; if (c && c._pt) u[c._pt.unit] = true; }
    return u;
  }
  function ptTake(pool, skip) {
    var list = partida.pools[pool];
    while (list.length) {
      var e = list.shift();
      var c = ptCardFor(e.ref, Math.min(e.rung, ptTop()), e.why);
      if (!c || skip[c._pt.unit] || (partida.units[c._pt.unit] && partida.units[c._pt.unit].retired)) continue;
      return c;
    }
    return null;
  }
  function ptTakeTopic(skip) {
    var tps = partida.pools.topics;
    for (var tries = 0; tries < tps.length; tries++) {
      var tq = tps[partida.topicN++ % tps.length];
      for (var guard = 0; guard < 3; guard++) {
        if (!tq.queue.length) tq.queue = buildTopicCards(tq.tp).map(function (c) { return c.formKey; });
        if (!tq.queue.length) break;
        var key = tq.queue.shift();
        var u = partida.pools.P.units[unitKey("topic", tq.tp.id, key)];
        var c = ptCardFor({ kind: "topic", tp: tq.tp, formKey: key }, Math.min(u ? ptRungFromBox(u.box) : 0, ptTop()), "topic");
        if (c && !skip[c._pt.unit]) return c;
      }
    }
    return null;
  }
  // The next new card for the queue: a topic every PT_TOPIC_EVERY, else
  // the pattern (due / hard / new), falling back to whatever is left.
  function ptDrawFresh() {
    var skip = ptUpcomingUnits();
    var n = partida.freshN++;
    var c = null;
    if (partida.pools.topics.length && n % PT_TOPIC_EVERY === PT_TOPIC_EVERY - 1) c = ptTakeTopic(skip);
    if (!c) {
      var first = PT_PATTERN[n % PT_PATTERN.length];
      [first, "due", "hard", "new", "seen"].some(function (p) { c = ptTake(p, skip); return !!c; });
    }
    if (!c && partida.pools.topics.length) c = ptTakeTopic(skip);
    if (!c) {
      // Everything has been played: start over with what this game saw.
      var again = Object.keys(partida.units).map(function (k) { return partida.units[k]; }).filter(function (s) { return !skip[s.unit]; });
      if (!again.length || partida.refills > 50) return null;
      partida.refills++;
      again.forEach(function (s) { s.retired = false; partida.pools.seen.push({ ref: s.ref, rung: s.rung, why: "back" }); });
      shuffleArray(partida.pools.seen);
      c = ptTake("seen", skip);
    }
    if (c) ptNote(c);
    return c;
  }
  // What the game knows about a unit: its rung and whether it's done.
  function ptNote(c) {
    var s = partida.units[c._pt.unit];
    if (!s) s = partida.units[c._pt.unit] = { unit: c._pt.unit, ref: c._pt.ref, rung: c._pt.rung, startRung: c._pt.rung, retired: false, label: ptLabel(ptCardFor(c._pt.ref, 0, "x") || c) };
    return s;
  }
  function ptEnsureAhead(n) {
    while (flashDeck.length - 1 - flashIndex < n) {
      var c = ptDrawFresh();
      if (!c) break;
      flashDeck.push(c);
    }
  }
  // Leaving a card going forward: where its grade sends it. Leaving it
  // again (after swiping back) replaces the return it scheduled before,
  // as long as that return hasn't been shown yet.
  function ptOnLeave(card) {
    var pt = card && card._pt;
    if (!pt || !partida) return;
    var s = ptNote(card);
    if (card._ptReturn) {
      var at = flashDeck.indexOf(card._ptReturn, flashIndex + 1);
      if (at === -1) return; // already played
      flashDeck.splice(at, 1);
      card._ptReturn = null;
    }
    var top = ptTop();
    var g = card._grade;
    var rung, offset, why;
    if (g === "bien") {
      if (pt.rung >= top) { s.rung = top; s.retired = true; s.reachedTop = true; return; }
      rung = pt.rung + 1; offset = PT_UP_MIN + Math.floor(Math.random() * (PT_UP_MAX - PT_UP_MIN + 1)); why = "up";
    } else if (g === "otra") {
      rung = Math.max(0, pt.rung - 1); offset = PT_DOWN; why = "again";
    } else {
      rung = pt.rung; offset = PT_SAME; why = "back";
    }
    s.retired = false;
    s.rung = rung;
    if (rung >= top) s.reachedTop = true;
    var next = ptCardFor(pt.ref, rung, why);
    if (!next) return;
    ptEnsureAhead(offset);
    flashDeck.splice(Math.min(flashDeck.length, flashIndex + offset), 0, next);
    card._ptReturn = next;
  }

  // ---- starting, stopping ----
  function ptStart() {
    if (!currentUser || partida) return;
    // inside the tap, so iOS allows the audio and asks for the mic here
    if (!quietMode) { unlockTtsAudio(); hablarPrepareMic(); }
    el.playMsg.textContent = "";
    loadPracticeHistory(false).then(function () {
      var pools = ptBuildPools();
      if (!ptHasContent(pools)) { el.playMsg.textContent = t("pt_nothing"); return; }
      partida = { id: practiceUuid(), started: Date.now(), pools: pools, units: {}, freshN: 0, topicN: 0, refills: 0, rewards: [], record: null };
      flashDeck = []; flashIndex = 0;
      ptEnsureAhead(PT_AHEAD);
      if (!flashDeck.length) { partida = null; el.playMsg.textContent = t("pt_nothing"); return; }
      openFlashDeck(flashDeck.slice(), "partida");
      // kept on the game, since closing the deck clears the session
      partida.sessionId = practiceSession ? practiceSession.id : null;
      partida.play = practiceSession ? practiceSession.play : null;
    });
  }
  function ptActive() { return !!partida && !el.flashOverlay.hidden; }

  // Terminar: the summary (the game stays open behind it).
  function ptShowSummary() {
    hablarAbort();
    practiceCloseView();
    practiceFlush();
    var cur = flashDeck[flashIndex];
    if (cur && cur._pt) ptOnLeave(cur);
    partida.paused = true;
    ptSaveRecord();
    drawPtSummary();
    el.flashOverlay.classList.add("is-summary");
    el.flashProgress.textContent = "";
    renderFlashCombo();
    ptRenderClose();
  }
  function ptResume() {
    partida.paused = false;
    el.flashOverlay.classList.remove("is-summary");
    ptEnsureAhead(PT_AHEAD);
    flashIndex = Math.min(flashIndex + 1, flashDeck.length - 1);
    ptEnsureAhead(PT_AHEAD);
    renderFlashCard();
    practiceOpenView(flashDeck[flashIndex]);
    renderFlashCombo();
    ptRenderClose();
  }
  // Called from closeFlashcards().
  function ptEnd() {
    if (!partida) return;
    ptSaveRecord();
    partida = null;
    el.flashOverlay.classList.remove("is-summary");
    ptRenderClose();
    if (el.playPanel && !el.playPanel.hidden) renderPlay();
  }
  function ptRenderClose() {
    var lab = el.flashCloseBtn && el.flashCloseBtn.querySelector("[data-i18n]");
    if (lab) lab.textContent = t(partida && !partida.paused && !el.flashOverlay.hidden ? "pt_end" : "close");
  }

  // ---- the numbers ----
  function ptStats() {
    var played = flashDeck.slice(0, flashIndex + 1).filter(function (c) { return c && c._pt; });
    var bien = 0, otra = 0, missed = {}, missedOrder = [];
    played.forEach(function (c) {
      if (c._grade === "bien") bien++;
      else if (c._grade === "otra") {
        otra++;
        if (!missed[c._pt.unit]) { missed[c._pt.unit] = true; missedOrder.push(c._pt.unit); }
      }
    });
    var sid = partida.sessionId;
    var ms = 0, cards = 0;
    practiceAllRows().forEach(function (r) { if (r.session_id === sid) { ms += (r.ms_front || 0) + (r.ms_back || 0); cards++; } });
    var rungs = [0, 0, 0], upTop = 0;
    Object.keys(partida.units).forEach(function (k) {
      var s = partida.units[k];
      if (!played.some(function (c) { return c._pt.unit === k; })) return;
      rungs[Math.min(2, s.rung)]++;
      if (s.reachedTop && s.startRung < ptTop()) upTop++;
    });
    var live = partida.play;
    return { cards: Math.max(cards, played.length), ms: ms, bien: bien, otra: otra, missed: missedOrder, rungs: rungs, upTop: upTop, best: live ? live.best : 0 };
  }
  function ptLabel(c) {
    var d = c.data || {};
    if (c.kind === "verb") { var who = String(c.frontSub || "").split(" · ")[0]; return c.backMain + (who ? " · " + who : ""); }
    if (c.kind === "topic") { var s = String(c.backMain || c.backSpeak || ""); return s.length > 30 ? s.slice(0, 29) + "…" : s; }
    return d.word || d.phrase || c.backMain || "";
  }

  // ---- records, per account ----
  // One row per game in public.game_records (pending_2026-10-06_records.sql;
  // mason: "i want the records to be per account"). This device keeps a
  // copy of its own games (iv-partidas) and sends any the server hasn't got
  // yet — offline, or before the SQL has run — on load, on `online` and
  // after each save. The Partida row's "más larga · combo" is the best of
  // the server's rows and this device's.
  var ptServer = { userId: null, rows: [], loaded: false, loading: null, flushing: false };
  function ptRecords() { try { return JSON.parse(localStorage.getItem(PT_RECORDS_KEY) || "[]") || []; } catch (e) { return []; } }
  function ptSaveLocal(all) {
    // keep every unsent game; of the sent ones, only the latest few
    var sent = all.filter(function (r) { return r.sent; });
    if (sent.length > PT_RECORDS_MAX) {
      var drop = {};
      sent.slice(0, sent.length - PT_RECORDS_MAX).forEach(function (r) { drop[r.id] = true; });
      all = all.filter(function (r) { return !drop[r.id]; });
    }
    try { localStorage.setItem(PT_RECORDS_KEY, JSON.stringify(all)); } catch (e) {}
  }
  function ptSaveRecord() {
    if (!partida || !currentUser) return;
    var st = ptStats();
    if (!st.cards) return;
    var all = ptRecords().filter(function (r) { return r.id !== partida.id; });
    all.push({ id: partida.id, user: currentUser.id, at: new Date(partida.started).toISOString(), cards: st.cards, best: st.best, ms: Math.round(st.ms), bien: st.bien, otra: st.otra, sent: false });
    ptSaveLocal(all);
    ptFlushRecords();
  }
  function ptRecordRow(r) {
    return { id: r.id, user_id: r.user, game: "partida", started_at: r.at, cards: r.cards || 0, best: r.best || 0, ms: Math.round(r.ms || 0), bien: r.bien || 0, otra: r.otra || 0, updated_at: new Date().toISOString() };
  }
  function ptFlushRecords() {
    if (!currentUser || ptServer.flushing) return;
    var uid = currentUser.id;
    var waiting = ptRecords().filter(function (r) { return r.user === uid && !r.sent; });
    if (!waiting.length) return;
    ptServer.flushing = true;
    supabaseClient.from("game_records").upsert(waiting.map(ptRecordRow), { onConflict: "id" }).then(function (res) {
      ptServer.flushing = false;
      if (res && res.error) { console.warn("[partida] records kept on this device for now:", res.error.message); return; }
      var sentNow = {};
      waiting.forEach(function (r) { sentNow[r.id] = r; });
      // a game saved again while this was on its way stays unsent
      var all = ptRecords();
      all.forEach(function (r) { var w = sentNow[r.id]; if (w && w.cards === r.cards && w.best === r.best && w.ms === r.ms) r.sent = true; });
      ptSaveLocal(all);
      if (ptServer.userId === uid) {
        waiting.forEach(function (w) {
          var have = ptServer.rows.find(function (x) { return x.id === w.id; });
          if (have) { have.cards = w.cards; have.best = w.best; } else ptServer.rows.push({ id: w.id, cards: w.cards, best: w.best });
        });
      }
      if (all.some(function (r) { return r.user === uid && !r.sent; })) ptFlushRecords();
    }, function (err) {
      ptServer.flushing = false;
      console.warn("[partida] records kept on this device for now:", err && err.message);
    });
  }
  function loadGameRecords() {
    if (!currentUser) return Promise.resolve();
    var uid = currentUser.id;
    if (ptServer.userId !== uid) ptServer = { userId: uid, rows: [], loaded: false, loading: null, flushing: false };
    if (ptServer.loading) return ptServer.loading;
    ptServer.loading = supabaseClient.from("game_records").select("id,cards,best").eq("game", "partida").then(function (res) {
      if (ptServer.userId !== uid) return;
      ptServer.loading = null;
      if (res && res.error) console.warn("[partida] records not loaded:", res.error.message);
      else { ptServer.rows = res.data || []; ptServer.loaded = true; }
      ptFlushRecords();
      if (el.playPanel && !el.playPanel.hidden && !albumOpen) drawPlayModes();
    }, function (err) {
      ptServer.loading = null;
      console.warn("[partida] records not loaded:", err && err.message);
    });
    return ptServer.loading;
  }
  window.addEventListener("online", function () { if (currentUser) ptFlushRecords(); });
  function ptBest() {
    var uid = currentUser ? currentUser.id : null;
    var out = { cards: 0, best: 0, n: 0 };
    var seen = {};
    function add(id, cards, best) {
      if (!seen[id]) { seen[id] = true; out.n++; }
      if (cards > out.cards) out.cards = cards;
      if (best > out.best) out.best = best;
    }
    if (ptServer.userId === uid) ptServer.rows.forEach(function (r) { add(r.id, r.cards || 0, r.best || 0); });
    ptRecords().forEach(function (r) { if (r.user === uid) add(r.id, r.cards || 0, r.best || 0); });
    return out;
  }

  // ---- on the card ----
  // Called at the end of renderFlashCard().
  function renderPartidaFaces(card) {
    var on = ptActive() && card && card._pt;
    el.ptWhy.hidden = !on;
    if (!on) { el.ptNote.hidden = true; el.flashHintLine.hidden = false; return; }
    el.flashTally.hidden = true; // the summary has the counts
    el.flashKnownToggle.style.display = "none";
    el.ptWhy.textContent = "";
    var why = card._pt.why;
    var lead = why === "topic" ? t("pt_why_topic") + " · " + topicText(card._pt.ref.tp.name) : t("pt_why_" + why);
    el.ptWhy.appendChild(progEl("b", null, lead));
    el.ptWhy.appendChild(document.createTextNode(" · " + ptRungName(card._pt.rung)));
    el.flashProgress.textContent = String(flashIndex + 1);
    ptRenderClose();
    renderPartidaNote(card);
  }
  // The hint line: where this card's grade sends it.
  function renderPartidaNote(card) {
    if (!ptActive() || !card || !card._pt || card !== flashDeck[flashIndex]) return;
    var g = card._grade;
    el.flashHintLine.hidden = !!g;
    el.ptNote.hidden = !g;
    el.ptNote.textContent = "";
    if (!g) return;
    var top = ptTop(), r = card._pt.rung, msg;
    if (g === "bien") msg = r >= top ? t("pt_note_done") : t("pt_note_up", { mode: ptRungName(r + 1) });
    else msg = r > 0 ? t("pt_note_down", { mode: ptRungName(r - 1) }) : t("pt_note_again");
    msg.split(/\*\*/).forEach(function (p, i) { el.ptNote.appendChild(i % 2 ? progEl("b", g === "otra" ? "o" : null, p) : document.createTextNode(p)); });
  }

  // ---- the summary ----
  function drawPtSummary() {
    var box = el.ptSummary;
    box.innerHTML = "";
    var st = ptStats();
    var m = playModel();
    box.appendChild(progEl("h2", null, t(st.cards >= 20 ? "pt_sum_title_good" : "pt_sum_title")));
    box.appendChild(progEl("p", "pt-sum-sub", t(m.todayMet ? (m.cur === 1 ? "pt_sum_today_met_one" : "pt_sum_today_met") : "pt_sum_today", { n: m.today, goal: playGoal, days: m.cur })));
    var stats = progEl("div", "prog-stats");
    var graded = st.bien + st.otra;
    [[String(st.cards), t("pt_sum_cards")],
     [progNum(Math.max(1, Math.round(st.ms / 60000))) + " min", t("pt_sum_min")],
     [graded ? Math.round(100 * st.bien / graded) + "%" : "—", t("pt_sum_bien")],
     [st.best ? "×" + st.best : "—", t("pt_sum_best")]].forEach(function (s) {
      var x = progEl("div"); x.appendChild(progEl("b", null, s[0])); x.appendChild(progEl("span", null, s[1])); stats.appendChild(x);
    });
    box.appendChild(stats);
    // where the cards ended up
    var top = ptTop();
    var blk = progEl("div", "pt-blk");
    blk.appendChild(progEl("p", "pt-lab", t("pt_sum_ladder")));
    var lad = progEl("div", "pt-ladder");
    var total = st.rungs[0] + st.rungs[1] + st.rungs[2] || 1;
    [0, 1, 2].forEach(function (r) {
      if (r > top) return;
      lad.appendChild(progEl("span", null, ptRungName(r)));
      var bar = progEl("span", "pt-bar"); var f = progEl("i"); f.style.width = Math.round(100 * st.rungs[r] / total) + "%"; bar.appendChild(f); lad.appendChild(bar);
      lad.appendChild(progEl("span", "pt-n", String(st.rungs[r])));
    });
    blk.appendChild(lad);
    blk.appendChild(progEl("p", "play-fine", top === 0 ? t("pt_sum_ladder_quiet") : t(st.upTop === 0 ? "pt_sum_ladder_note_zero" : (st.upTop === 1 ? "pt_sum_ladder_note_one" : "pt_sum_ladder_note"), { n: st.upTop, mode: ptRungName(top) })));
    box.appendChild(blk);
    // the ones that cost you
    if (st.missed.length) {
      var mb = progEl("div", "pt-blk");
      mb.appendChild(progEl("p", "pt-lab", t("pt_sum_missed")));
      var chips = progEl("div", "pt-chips");
      st.missed.slice(0, 12).forEach(function (k) { chips.appendChild(progEl("span", null, partida.units[k].label)); });
      mb.appendChild(chips);
      var n = st.missed.length;
      mb.appendChild(progButton(t(n === 1 ? "pt_sum_review_one" : "pt_sum_review", { n: n }), false, function () {
        var cards = st.missed.map(function (k) { var s = partida.units[k]; return ptCardFor(s.ref, Math.min(s.rung, ptTop()), "again"); }).filter(Boolean);
        cards.forEach(function (c) { delete c._pt; });
        closeFlashcards();
        startPracticeDeck(cards);
      }));
      box.appendChild(mb);
    }
    // what you won
    var won = partida.rewards.map(function (r) { return albumItem(r.item_id) ? r : null; }).filter(Boolean);
    if (won.length) {
      var wb = progEl("div", "pt-blk");
      wb.appendChild(progEl("p", "pt-lab", t("pt_sum_won")));
      won.forEach(function (r) {
        var line = progEl("div", "pt-prize");
        line.appendChild(progEl("b", null, albumItem(r.item_id).es));
        line.appendChild(progEl("span", null, rewardHow(r.reason)));
        wb.appendChild(line);
      });
      box.appendChild(wb);
    }
    var btns = progEl("div", "pt-btns");
    btns.appendChild(progButton(t("close"), false, closeFlashcards));
    var go = progButton(t("play_keep_playing"), true, ptResume);
    btns.appendChild(go);
    box.appendChild(btns);
  }

  // ---- the Jugar tab's list of games ----
  function drawPlayModes() {
    var ul = el.playModes;
    ul.innerHTML = "";
    var b = ptBest();
    function row(name, stat, def, onClick) {
      var li = document.createElement("li");
      var btn = progEl("button", "card-row play-mode" + (onClick ? "" : " is-soon"));
      btn.type = "button";
      btn.appendChild(progEl("span", "inf", name));
      if (stat) btn.appendChild(progEl("span", "stat", stat));
      btn.appendChild(progEl("span", "def", def));
      if (onClick) btn.addEventListener("click", onClick); else btn.disabled = true;
      li.appendChild(btn);
      ul.appendChild(li);
      return btn;
    }
    var stat = b.n ? t(b.best ? "pt_row_stat" : "pt_row_stat_cards", { cards: b.cards, best: b.best }) : "";
    var p = row(t("pt_name"), stat, t(quietMode ? "pt_row_def_quiet" : "pt_row_def"), ptStart);
    p.id = "play-partida";
    row(t("pt_crono_name"), t("pt_soon"), t("pt_crono_def"), null);
    row(t("pt_reto_name"), t("pt_soon"), t("pt_reto_def"), null);
  }

  // ================= Progreso + Tu historial (2026-10-03) =================
  // Everything here is computed on the device from the practice log (see
  // "Practice log" above): the server's rows, plus whatever is still queued
  // on this device. Mockups mason approved: maqueta_progreso/*.png.
  //
  // Spaced review is a plain Leitner scheme, easy to explain:
  //   - A "unit" is one card's content: a word, a phrase, or ONE verb form
  //     (tener · vos · presente). Direction and Leer/Escuchar are pooled.
  //   - Each unit sits in a box 0–5. Box b comes up for review
  //     PROG_INTERVAL_DAYS[b] days after it last moved.
  //   - "Otra vez" → back to box 0 (due again right away).
  //   - "Bien" when the unit is due → up one box. "Bien" before it's due
  //     (drilling the same card twice in a day) doesn't move it.
  //   - Box 3+ = "aprendida": it held up through reviews spread over days.
  //   - Within one pass of one deck only the last grade of a card counts
  //     (going back to a card and changing your mind isn't two answers).
  // Units never graded aren't "due" — they're simply new.

  var PROG_INTERVAL_DAYS = [0, 1, 3, 7, 21, 60];
  var PROG_LEARNED_BOX = 3;
  var PROG_WEEK_GOAL = 5;
  var PROG_STRUGGLE_DAYS = 14;
  var PROG_GRID_DAYS = 60;
  var PROG_DECK_MAX = 40;
  var HISTORY_OPEN_KEY = "iv-history-open";
  var PROG_COLS = "id,session_id,shown_at,item_kind,item_key,form_key,mode,direction,pass,grade,grade_auto,flipped,ms_to_flip,ms_front,ms_back";
  var PROG_GRID_TENSES = ["presente", "preterito", "imperfecto", "futuro", "condicional", "subjPresente", "subjPasado", "imperativo"];
  var PROG_GRID_PERSONS = ["yo", "vos", "el", "nosotros", "ellos"];

  var practiceHistory = { rows: null, userId: null, loadedAt: 0, loading: null, error: null };
  var historyOpen = false;
  try { historyOpen = localStorage.getItem(HISTORY_OPEN_KEY) === "1"; } catch (e) {}

  // ---- loading ----
  function loadPracticeHistory(force) {
    if (!currentUser) return Promise.resolve([]);
    var fresh = practiceHistory.rows && practiceHistory.userId === currentUser.id && (Date.now() - practiceHistory.loadedAt < 5 * 60 * 1000);
    if (fresh && !force) return Promise.resolve(practiceAllRows());
    if (practiceHistory.loading) return practiceHistory.loading;
    var uid = currentUser.id;
    var collected = [];
    var PAGE = 1000;
    function page(from) {
      return supabaseClient.from("practice_log").select(PROG_COLS).order("shown_at", { ascending: true }).range(from, from + PAGE - 1).then(function (res) {
        if (res.error) throw res.error;
        var rows = res.data || [];
        Array.prototype.push.apply(collected, rows);
        if (rows.length === PAGE && from < 200 * PAGE) return page(from + PAGE);
        return collected;
      });
    }
    practiceHistory.loading = page(0).then(function (rows) {
      practiceHistory.rows = rows;
      practiceHistory.userId = uid;
      practiceHistory.loadedAt = Date.now();
      practiceHistory.error = null;
      practiceHistory.loading = null;
      return practiceAllRows();
    }, function (err) {
      console.warn("[progreso] couldn't load the practice log:", err && err.message);
      practiceHistory.error = (err && err.message) || String(err);
      if (!practiceHistory.rows || practiceHistory.userId !== uid) { practiceHistory.rows = []; practiceHistory.userId = uid; }
      practiceHistory.loadedAt = Date.now();
      practiceHistory.loading = null;
      return practiceAllRows();
    });
    return practiceHistory.loading;
  }

  // Server rows + rows still waiting on this device (+ the rows sent since
  // the last load, which practiceFlush() appends), without duplicates.
  function practiceAllRows() {
    var uid = currentUser ? currentUser.id : null;
    var seen = {};
    var out = [];
    function add(r) { if (!r || seen[r.id]) return; seen[r.id] = true; out.push(r); }
    if (practiceHistory.rows && practiceHistory.userId === uid) practiceHistory.rows.forEach(add);
    practiceQueue.forEach(function (r) { if (r.user_id === uid) add(r); });
    out.sort(function (a, b) { return progTime(a) - progTime(b); });
    return out;
  }
  function practiceNoteSent(rows) {
    if (!practiceHistory.rows || !currentUser || practiceHistory.userId !== currentUser.id) return;
    Array.prototype.push.apply(practiceHistory.rows, rows);
  }

  // ---- dates (local time) ----
  // Server rows say "...+00:00", rows from this device "...Z" — compare as
  // times, never as strings.
  // (Cached in a WeakMap, not on the row: queued rows are sent to the server
  // as they are, and an extra property would be an unknown column there.)
  var progTimeCache = new WeakMap();
  function progTime(r) {
    var v = progTimeCache.get(r);
    if (v === undefined) { v = Date.parse(r.shown_at) || 0; progTimeCache.set(r, v); }
    return v;
  }
  function progDayNum(d) {
    var x = d instanceof Date ? d : new Date(d);
    return Math.floor(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86400000);
  }
  function progToday() { return progDayNum(new Date()); }
  function progWeekStartDay() { // Monday
    var now = new Date();
    var dow = (now.getDay() + 6) % 7; // Mon=0
    return progDayNum(now) - dow;
  }
  function progNum(n, digits) {
    return Number(n).toLocaleString(currentLang === "es" ? "es-AR" : "en-US", { maximumFractionDigits: digits || 0, minimumFractionDigits: digits || 0 });
  }

  // ---- the model ----
  function unitKey(kind, key, formKey) { return kind + "|" + key + "|" + (formKey || ""); }

  function computeProgress(rows) {
    var today = progToday();
    var units = {};   // unitKey -> state
    var items = {};   // kind|key -> {rows: [...]}
    var graded = {};  // session|pass|unitKey -> last graded row
    rows.forEach(function (r) {
      var ik = r.item_kind + "|" + r.item_key;
      (items[ik] || (items[ik] = { kind: r.item_kind, key: r.item_key, rows: [] })).rows.push(r);
      if (r.grade !== "bien" && r.grade !== "otra") return;
      var gk = r.session_id + "|" + r.pass + "|" + unitKey(r.item_kind, r.item_key, r.form_key);
      graded[gk] = r; // rows are in time order, so the last one wins
    });
    var events = Object.keys(graded).map(function (k) { return graded[k]; });
    events.sort(function (a, b) { return progTime(a) - progTime(b); });
    var learnedMoves = []; // {day, delta}
    events.forEach(function (r) {
      var uk = unitKey(r.item_kind, r.item_key, r.form_key);
      var u = units[uk] || (units[uk] = { key: uk, kind: r.item_kind, itemKey: r.item_key, formKey: r.form_key || null, box: 0, anchor: null, events: [], learnedSince: null });
      var day = progDayNum(r.shown_at);
      var wasLearned = u.box >= PROG_LEARNED_BOX;
      if (r.grade === "otra") {
        u.box = 0; u.anchor = day;
      } else if (u.anchor === null || day - u.anchor >= PROG_INTERVAL_DAYS[u.box]) {
        u.box = Math.min(u.box + 1, PROG_INTERVAL_DAYS.length - 1); u.anchor = day;
      }
      var isLearned = u.box >= PROG_LEARNED_BOX;
      var countMove = r.item_kind !== "topic"; // "Aprendidas" counts your collection only
      if (isLearned && !wasLearned) { if (countMove) learnedMoves.push({ day: day, delta: 1 }); u.learnedSince = day; }
      if (!isLearned && wasLearned) { if (countMove) learnedMoves.push({ day: day, delta: -1 }); u.learnedSince = null; }
      u.events.push({ day: day, at: progTime(r), grade: r.grade });
    });
    Object.keys(units).forEach(function (k) {
      var u = units[k];
      u.dueDay = u.anchor + PROG_INTERVAL_DAYS[u.box];
      u.due = u.dueDay <= today;
      u.learned = u.box >= PROG_LEARNED_BOX;
      u.last = u.events[u.events.length - 1];
    });
    return { rows: rows, units: units, items: items, events: events, learnedMoves: learnedMoves, today: today };
  }

  // ---- content lookups ----
  function progContentIndex() {
    var idx = { verb: {}, word: {}, phrase: {} };
    allVerbs.forEach(function (v) { idx.verb[practiceNorm(v.data.infinitive)] = v; });
    allWords.forEach(function (w) { idx.word[practiceNorm(w.data.word)] = w; });
    allPhrases.forEach(function (ph) { idx.phrase[practiceNorm(ph.data.phrase)] = ph; });
    return idx;
  }
  function progUnitItem(idx, u) { return (idx[u.kind] || {})[u.itemKey] || null; }

  // The flashcard(s) for some units, in the current Leer/Escuchar mode and
  // word direction. Units whose item (or verb form) no longer exists are
  // skipped.
  function progModeDirection() {
    var m = effectiveFlashMode();
    return m === "escuchar" ? "word2def" : (m === "hablar" ? "def2word" : flashDirection);
  }
  function progModeCards(cards) {
    var m = effectiveFlashMode();
    return m === "escuchar" ? cards.map(listenCard) : (m === "hablar" ? cards.map(speakCard) : cards);
  }
  function cardsForUnits(units) {
    var idx = progContentIndex();
    var dir = progModeDirection();
    var cards = [];
    var byVerb = {};
    units.forEach(function (u) {
      if (u.kind === "topic") { var tc = topicCardFromUnit(u.itemKey, u.formKey); if (tc) cards.push(tc); return; }
      var item = progUnitItem(idx, u);
      if (!item) return;
      if (u.kind === "verb") {
        if (!u.formKey) return;
        var b = byVerb[u.itemKey] || (byVerb[u.itemKey] = { data: item.data, keys: {} });
        b.keys[u.formKey] = true;
      } else if (u.kind === "word") cards.push(wordCard(item.data, dir));
      else cards.push(phraseCard(item.data, dir));
    });
    Object.keys(byVerb).forEach(function (k) {
      var b = byVerb[k];
      Array.prototype.push.apply(cards, verbCards(b.data, function (fk) { return !!b.keys[fk]; }));
    });
    return progModeCards(cards);
  }

  function startPracticeDeck(cards) {
    if (!cards.length) { showBanner(t("msg_nada_para_practicar")); return; }
    if (cards.length > PROG_DECK_MAX) cards = shuffleArray(cards).slice(0, PROG_DECK_MAX);
    openFlashDeck(cards, "practice");
  }

  function unitIsSabido(idx, u) {
    var item = progUnitItem(idx, u);
    if (!item) return false;
    if (item.data.known) return true;
    return u.kind === "verb" && !!u.formKey && !!((item.data.known_forms || {})[u.formKey]);
  }

  // What a unit is called in a list: the word/phrase, or the verb form with
  // which verb + person + tense it is.
  function unitLabel(idx, u) {
    var item = progUnitItem(idx, u);
    if (u.kind !== "verb") return { main: item ? (item.data.word || item.data.phrase) : u.itemKey, sub: "" };
    var cards = item && u.formKey ? verbCards(item.data, function (fk) { return fk === u.formKey; }) : [];
    if (!cards.length) return { main: item ? item.data.infinitive : u.itemKey, sub: "" };
    return { main: cards[0].backMain, sub: cards[0].frontMain + " · " + cards[0].frontSub };
  }

  // ---- shared bits of markup ----
  function progEl(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function progCard(title, sub) {
    var c = progEl("div", "prog-card");
    c.appendChild(progEl("h3", null, title));
    if (sub) c.appendChild(progEl("p", "prog-sub", sub));
    return c;
  }
  function progButton(text, primary, onClick) {
    var b = progEl("button", primary ? "btn-primary" : "btn-secondary", text);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }
  function progDots(grades) {
    var d = progEl("span", "prog-dots");
    d.setAttribute("aria-hidden", "true");
    grades.forEach(function (g) { d.appendChild(progEl("i", g === "bien" ? "b" : "o")); });
    return d;
  }

  // ---- the Progreso tab ----
  function renderProgress() {
    if (!el.progressBody || el.progressPanel.hidden) return;
    if (!currentUser) { el.progressBody.innerHTML = ""; return; }
    if (!practiceHistory.rows || practiceHistory.userId !== currentUser.id) {
      el.progressBody.innerHTML = "";
      el.progressBody.appendChild(progEl("p", "prog-loading", t("prog_loading")));
    }
    loadPracticeHistory(false).then(function (rows) {
      if (el.progressPanel.hidden) return;
      drawProgress(computeProgress(rows));
    });
  }

  function drawProgress(P) {
    var body = el.progressBody;
    body.innerHTML = "";
    var idx = progContentIndex();
    if (practiceHistory.error) body.appendChild(progEl("p", "prog-note", t("prog_error")));
    var unitList = Object.keys(P.units).map(function (k) { return P.units[k]; }).filter(function (u) { return !!progUnitItem(idx, u); });

    if (!P.events.length) {
      var intro = progCard(t("prog_intro_title"));
      intro.appendChild(progEl("p", "prog-text", t("prog_intro_text")));
      body.appendChild(intro);
      if (P.rows.length) body.appendChild(drawWeek(P));
      if (P.rows.length) { var pc0 = drawPlayCard(); if (pc0) body.appendChild(pc0); }
      var lb = drawListBars(P, idx);
      if (lb) body.appendChild(lb);
      var tb0 = drawTopicBars();
      if (tb0) body.appendChild(tb0);
      return;
    }
    body.appendChild(drawDue(P, unitList));
    body.appendChild(drawWeek(P));
    var pc = drawPlayCard();
    if (pc) body.appendChild(pc);
    var st = drawStruggles(P, unitList, idx);
    if (st) body.appendChild(st);
    var grid = drawVerbGrid(P);
    if (grid) body.appendChild(grid);
    body.appendChild(drawLearned(P, unitList));
    var lists = drawListBars(P, idx);
    if (lists) body.appendChild(lists);
    var topicsCard = drawTopicBars();
    if (topicsCard) body.appendChild(topicsCard);
    var still = drawStillKnown(P, unitList, idx);
    if (still) body.appendChild(still);
  }

  function drawDue(P, unitList) {
    var due = unitList.filter(function (u) { return u.due; });
    var c = progCard(t("prog_due_title"));
    c.classList.add("prog-due");
    if (!due.length) {
      c.appendChild(progEl("p", "prog-text", t("prog_due_none")));
      return c;
    }
    var hero = progEl("div", "prog-hero");
    hero.appendChild(progEl("span", "n", String(due.length)));
    hero.appendChild(progEl("span", "u", t(due.length === 1 ? "prog_card_1" : "prog_card_n")));
    c.appendChild(hero);
    var parts = [];
    var missed = due.filter(function (u) { return u.last && u.last.grade === "otra"; }).length;
    if (missed) parts.push(t("prog_due_missed", { n: missed }));
    var recent = P.rows.slice(-200).map(function (r) { return (r.ms_front || 0) + (r.ms_back || 0); }).filter(function (ms) { return ms > 0; }).sort(function (a, b) { return a - b; });
    if (recent.length >= 5) {
      var med = recent[Math.floor(recent.length / 2)];
      parts.push(t("prog_due_time", { n: Math.max(1, Math.round(med * Math.min(due.length, PROG_DECK_MAX) / 60000)) }));
    }
    if (parts.length) c.appendChild(progEl("p", "prog-sub", parts.join(" · ")));
    c.appendChild(progButton(t("prog_due_btn"), true, function () { startPracticeDeck(cardsForUnits(due)); }));
    return c;
  }

  function drawWeek(P) {
    var c = progCard(t("prog_week_title"));
    var start = progWeekStartDay();
    var today = P.today;
    var rows = P.rows.filter(function (r) { return progDayNum(r.shown_at) >= start; });
    var days = {};
    rows.forEach(function (r) { days[progDayNum(r.shown_at)] = true; });
    var nDays = Object.keys(days).length;
    c.appendChild(progEl("p", "prog-sub", t("prog_week_goal", { goal: PROG_WEEK_GOAL, n: nDays })));
    var week = progEl("div", "prog-week");
    var letters = t("prog_days").split(",");
    for (var i = 0; i < 7; i++) {
      var d = progEl("div", "prog-day" + (days[start + i] ? " on" : "") + (start + i === today ? " today" : ""));
      d.appendChild(progEl("i"));
      d.appendChild(progEl("span", null, letters[i]));
      week.appendChild(d);
    }
    c.appendChild(week);
    var ev = P.events.filter(function (r) { return progDayNum(r.shown_at) >= start; });
    var bien = ev.filter(function (r) { return r.grade === "bien"; }).length;
    var ms = rows.reduce(function (sum, r) { return sum + (r.ms_front || 0) + (r.ms_back || 0); }, 0);
    var flips = rows.filter(function (r) { return r.flipped && r.ms_to_flip != null; }).map(function (r) { return r.ms_to_flip; }).sort(function (a, b) { return a - b; });
    var stats = progEl("div", "prog-stats");
    [[String(rows.length), t("prog_stat_cards")],
     [progNum(Math.round(ms / 60000)) + " min", t("prog_stat_min")],
     [ev.length ? Math.round(100 * bien / ev.length) + "%" : "—", t("prog_stat_bien")],
     [flips.length ? progNum(flips[Math.floor(flips.length / 2)] / 1000, 1) + " s" : "—", t("prog_stat_resp")]
    ].forEach(function (s) {
      var x = progEl("div");
      x.appendChild(progEl("b", null, s[0]));
      x.appendChild(progEl("span", null, s[1]));
      stats.appendChild(x);
    });
    c.appendChild(stats);
    return c;
  }

  function drawStruggles(P, unitList, idx) {
    var since = P.today - PROG_STRUGGLE_DAYS + 1;
    var rowsOut = [];
    unitList.forEach(function (u) {
      if (u.learned) return;
      var recent = u.events.filter(function (e) { return e.day >= since; });
      var misses = recent.filter(function (e) { return e.grade === "otra"; }).length;
      if (!misses) return;
      rowsOut.push({ u: u, recent: recent, misses: misses, last: recent[recent.length - 1].at });
    });
    if (!rowsOut.length) return null;
    rowsOut.sort(function (a, b) { return b.misses - a.misses || b.last - a.last; });
    var c = progCard(t("prog_struggle_title"), t("prog_struggle_sub"));
    var ul = progEl("ul", "prog-rows");
    rowsOut.slice(0, 5).forEach(function (x) {
      var li = progEl("li");
      var lab = unitLabel(idx, x.u);
      var w = progEl("span", "w", lab.main);
      if (lab.sub) w.appendChild(progEl("span", "f", lab.sub));
      li.appendChild(w);
      var r = progEl("span", "r");
      r.appendChild(progDots(x.recent.slice(-6).map(function (e) { return e.grade; })));
      var b = x.recent.filter(function (e) { return e.grade === "bien"; }).length;
      r.appendChild(document.createTextNode(t("prog_x_of_y", { b: b, n: x.recent.length })));
      li.appendChild(r);
      ul.appendChild(li);
    });
    c.appendChild(ul);
    var units = rowsOut.map(function (x) { return x.u; });
    c.appendChild(progButton(t("prog_struggle_btn", { n: Math.min(units.length, PROG_DECK_MAX) }), false, function () { startPracticeDeck(cardsForUnits(units)); }));
    var save = progEl("button", "prog-link", t("prog_struggle_save"));
    save.type = "button";
    save.addEventListener("click", function () { saveUnitsAsList(units, save); });
    c.appendChild(save);
    return c;
  }

  function drawVerbGrid(P) {
    var since = P.today - PROG_GRID_DAYS + 1;
    var cells = {};
    var any = false;
    P.events.forEach(function (r) {
      if (r.item_kind !== "verb" || !r.form_key || progDayNum(r.shown_at) < since) return;
      var c = cells[r.form_key] || (cells[r.form_key] = { b: 0, n: 0 });
      c.n++; if (r.grade === "bien") c.b++;
      any = true;
    });
    if (!any) return null;
    var card = progCard(t("prog_grid_title"), t("prog_grid_sub"));
    var grid = progEl("div", "prog-grid");
    grid.appendChild(progEl("div"));
    PROG_GRID_PERSONS.forEach(function (p) { grid.appendChild(progEl("div", "h", t("prog_person_" + p))); });
    PROG_GRID_TENSES.forEach(function (tk) {
      grid.appendChild(progEl("div", "t", t("prog_tense_" + tk)));
      PROG_GRID_PERSONS.forEach(function (pk) {
        if (tk === "imperativo" && pk === "yo") { grid.appendChild(progEl("div", "c na", "—")); return; }
        var fk = flashCellKey(tk, pk);
        var c = cells[fk];
        var btn = progEl("button", "c");
        btn.type = "button";
        if (!c) {
          btn.classList.add("none");
          btn.setAttribute("aria-label", t("prog_grid_cell_none", { tense: t("prog_tense_" + tk), person: t("prog_person_" + pk) }));
        } else {
          var pct = Math.round(100 * c.b / c.n);
          var step = pct >= 85 ? 5 : pct >= 70 ? 4 : pct >= 55 ? 3 : pct >= 40 ? 2 : 1;
          btn.classList.add("s" + step);
          btn.textContent = String(pct);
          btn.setAttribute("aria-label", t("prog_grid_cell_aria", { tense: t("prog_tense_" + tk), person: t("prog_person_" + pk), pct: pct, n: c.n }));
          btn.title = t("prog_grid_cell_aria", { tense: t("prog_tense_" + tk), person: t("prog_person_" + pk), pct: pct, n: c.n });
        }
        btn.addEventListener("click", function () {
          var cards = [];
          allVerbs.forEach(function (v) { Array.prototype.push.apply(cards, verbCards(v.data, function (k) { return k === fk; })); });
          startPracticeDeck(progModeCards(cards));
        });
        grid.appendChild(btn);
      });
    });
    card.appendChild(grid);
    var legend = progEl("div", "prog-legend");
    legend.appendChild(progEl("span", null, t("prog_grid_none")));
    legend.appendChild(progEl("i", "none-swatch"));
    legend.appendChild(progEl("span", "gap", "0%"));
    var ramp = progEl("span", "ramp");
    for (var s = 1; s <= 5; s++) ramp.appendChild(progEl("i", "s" + s));
    legend.appendChild(ramp);
    legend.appendChild(progEl("span", null, "100%"));
    card.appendChild(legend);
    return card;
  }

  function drawLearned(P, unitList) {
    var c = progCard(t("prog_learned_title"), t("prog_learned_sub"));
    var weekAgo = P.today - 6;
    var tiles = progEl("div", "prog-tiles");
    [["word", "prog_learned_words"], ["verb", "prog_learned_forms"], ["phrase", "prog_learned_phrases"]].forEach(function (k) {
      var mine = unitList.filter(function (u) { return u.kind === k[0] && u.learned; });
      var fresh = mine.filter(function (u) { return u.learnedSince !== null && u.learnedSince >= weekAgo; }).length;
      var tile = progEl("div", "prog-tile");
      tile.appendChild(progEl("b", null, String(mine.length)));
      tile.appendChild(progEl("span", null, t(k[1])));
      if (fresh) tile.appendChild(progEl("em", null, "+" + fresh));
      tiles.appendChild(tile);
    });
    c.appendChild(tiles);
    c.appendChild(progEl("p", "prog-sub prog-tight", t("prog_learned_new")));
    // learned over the last 8 weeks (only once there's more than a week of it)
    var first = P.learnedMoves.length ? P.learnedMoves[0].day : null;
    if (first !== null && P.today - first >= 7) {
      var pts = [];
      for (var w = 8; w >= 0; w--) {
        var end = P.today - w * 7;
        pts.push(P.learnedMoves.reduce(function (s, m) { return m.day <= end ? s + m.delta : s; }, 0));
      }
      var max = Math.max.apply(null, pts.concat([1]));
      var W = 340, H = 70;
      var xy = pts.map(function (v, i) { return [Math.round(i * W / (pts.length - 1)), Math.round(H - 4 - (v / max) * (H - 10))]; });
      var ns = "http://www.w3.org/2000/svg";
      var svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "-6 -6 " + (W + 12) + " " + (H + 12));
      svg.setAttribute("class", "prog-spark");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", t("prog_spark_aria", { a: pts[0], b: pts[pts.length - 1] }));
      var path = document.createElementNS(ns, "path");
      path.setAttribute("d", "M" + xy.map(function (q) { return q.join(","); }).join(" L"));
      svg.appendChild(path);
      var dot = document.createElementNS(ns, "circle");
      dot.setAttribute("cx", xy[xy.length - 1][0]); dot.setAttribute("cy", xy[xy.length - 1][1]); dot.setAttribute("r", "4");
      svg.appendChild(dot);
      c.appendChild(svg);
      var axis = progEl("div", "prog-axis");
      axis.appendChild(progEl("span", null, t("prog_spark_from")));
      axis.appendChild(progEl("span", null, t("prog_spark_to", { n: pts[pts.length - 1] })));
      c.appendChild(axis);
    }
    return c;
  }

  // A list item's status from its units: "learned", "progress" or "new".
  // A verb counts as learned once at least 3 of its forms are, and at least
  // half of the forms you've practiced.
  function listItemStatus(P, item) {
    if (item.type !== "verb") {
      var u = P.units[unitKey(item.type, item.key, null)];
      return !u ? "new" : (u.learned ? "learned" : "progress");
    }
    var practiced = 0, learned = 0;
    Object.keys(P.units).forEach(function (k) {
      var u = P.units[k];
      if (u.kind !== "verb" || u.itemKey !== item.key) return;
      practiced++; if (u.learned) learned++;
    });
    if (!practiced) return "new";
    return (learned >= 3 && learned * 2 >= practiced) ? "learned" : "progress";
  }
  function listProgress(P, l) {
    var items = l.data.items || [];
    var out = { total: items.length, learned: 0, progress: 0, todo: [] };
    items.forEach(function (it) {
      var st = listItemStatus(P, it);
      if (st === "learned") out.learned++;
      else { if (st === "progress") out.progress++; out.todo.push(it); }
    });
    return out;
  }
  function cardsForListItems(items) {
    var idx = progContentIndex();
    var dir = progModeDirection();
    var cards = [];
    items.forEach(function (it) {
      var entry = (idx[it.type] || {})[it.key];
      if (!entry) return;
      if (it.type === "verb") Array.prototype.push.apply(cards, verbCards(entry.data, setupVerbWant));
      else if (it.type === "word") cards.push(wordCard(entry.data, dir));
      else cards.push(phraseCard(entry.data, dir));
    });
    return progModeCards(cards);
  }

  function drawListBars(P, idx) {
    var lists = allLists.filter(function (l) { return (l.data.items || []).length; });
    if (!lists.length) return null;
    var c = progCard(t("prog_lists_title"), t("prog_lists_sub"));
    lists.forEach(function (l) {
      var lp = listProgress(P, l);
      var row = progEl("button", "prog-bar");
      row.type = "button";
      var top = progEl("div", "prog-bar-top");
      top.appendChild(progEl("span", "name", l.data.name));
      top.appendChild(progEl("span", "count", t("prog_lists_count", { l: lp.learned, n: lp.total })));
      row.appendChild(top);
      row.appendChild(progTrack(lp));
      row.addEventListener("click", function () {
        if (!lp.todo.length) { showBanner(t("prog_lists_done")); return; }
        startPracticeDeck(cardsForListItems(lp.todo));
      });
      c.appendChild(row);
    });
    var keys = progEl("div", "prog-keys");
    var k1 = progEl("span"); k1.appendChild(progEl("i", "l")); k1.appendChild(document.createTextNode(t("prog_key_learned")));
    var k2 = progEl("span"); k2.appendChild(progEl("i", "p")); k2.appendChild(document.createTextNode(t("prog_key_progress")));
    keys.appendChild(k1); keys.appendChild(k2);
    c.appendChild(keys);
    return c;
  }
  function progTrack(lp) {
    var track = progEl("span", "prog-track");
    var a = progEl("i", "l"); a.style.width = (lp.total ? 100 * lp.learned / lp.total : 0) + "%";
    var b = progEl("i", "p"); b.style.width = (lp.total ? 100 * lp.progress / lp.total : 0) + "%";
    if (lp.learned) track.appendChild(a);
    if (lp.progress) track.appendChild(b);
    return track;
  }

  function drawStillKnown(P, unitList, idx) {
    var units = unitList.filter(function (u) { return u.last && u.last.grade === "otra" && unitIsSabido(idx, u); });
    if (!units.length) return null;
    var c = progCard(t("prog_known_title"), t("prog_known_sub"));
    var chips = progEl("div", "prog-chips");
    units.slice(0, 8).forEach(function (u) { chips.appendChild(progEl("span", "chip", unitLabel(idx, u).main)); });
    c.appendChild(chips);
    c.appendChild(progButton(t("prog_known_btn"), false, function () { startPracticeDeck(cardsForUnits(units)); }));
    return c;
  }

  // "Guardar como lista" under Te cuestan: a new list with those items
  // (whole verbs, since lists hold items, not forms).
  function saveUnitsAsList(units, btn) {
    var idx = progContentIndex();
    var seen = {};
    var rows = [];
    units.forEach(function (u) {
      var item = progUnitItem(idx, u);
      if (!item) return;
      var k = u.kind + "|" + u.itemKey;
      if (seen[k]) return;
      seen[k] = true;
      rows.push({ item_type: u.kind, data: listSnapshot(item.data) });
    });
    if (!rows.length) return;
    var d = new Date();
    var name = t("prog_struggle_list_name", { date: d.toLocaleDateString(currentLang === "es" ? "es-AR" : "en-US", { day: "numeric", month: "short" }) });
    btn.disabled = true;
    supabaseClient.from("lists").insert({ name: name, owner_label: shareOwnerLabel() }).select().single().then(function (res) {
      if (res.error) { btn.disabled = false; showBanner(t("msg_error_crear", { msg: res.error.message })); return; }
      var listId = res.data.id;
      supabaseClient.from("list_items").insert(rows.map(function (r) { return { list_id: listId, item_type: r.item_type, data: r.data }; })).then(function (res2) {
        btn.disabled = false;
        if (res2.error) { showBanner(t("msg_error_generic", { msg: res2.error.message })); return; }
        showBanner(t("prog_struggle_saved", { name: name, n: rows.length }));
        loadLists();
      });
    });
  }

  // ---- Última sesión (top of the Tarjetas setup) ----
  function renderLastSession() {
    if (!el.lastSession) return;
    if (!currentUser) { el.lastSession.hidden = true; return; }
    var rows = practiceAllRows();
    var last = null;
    for (var i = rows.length - 1; i >= 0; i--) { if (rows[i].session_id) { last = rows[i].session_id; break; } }
    if (!last) { el.lastSession.hidden = true; return; }
    var mine = rows.filter(function (r) { return r.session_id === last; });
    var when = new Date(mine[mine.length - 1].shown_at);
    var dayDiff = progToday() - progDayNum(when);
    if (dayDiff > 1) { el.lastSession.hidden = true; return; }
    var P = computeProgress(mine);
    var bien = P.events.filter(function (r) { return r.grade === "bien"; }).length;
    // "the ones that were hard": any card marked Otra vez at some point in
    // that session, even if a later pass got it right.
    var otraUnits = Object.keys(P.units).map(function (k) { return P.units[k]; }).filter(function (u) { return u.events.some(function (e) { return e.grade === "otra"; }); });
    var otra = P.events.length - bien;
    var ms = mine.reduce(function (s, r) { return s + (r.ms_front || 0) + (r.ms_back || 0); }, 0);
    var time = currentLang === "es"
      ? when.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })
      : when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    el.lastSession.innerHTML = "";
    el.lastSession.appendChild(progEl("p", "last-session-h", t("last_session_title", { when: t(dayDiff ? "last_session_yesterday" : "last_session_today", { time: time }) })));
    var nums = progEl("div", "last-session-nums");
    nums.appendChild(progEl("span", null, t(mine.length === 1 ? "last_session_cards_1" : "last_session_cards", { n: mine.length })));
    nums.appendChild(progEl("span", null, t("last_session_min", { n: Math.max(1, Math.round(ms / 60000)) })));
    if (P.events.length) {
      nums.appendChild(progEl("span", "b", t("last_session_bien", { n: bien })));
      nums.appendChild(progEl("span", "o", t("last_session_otra", { n: otra })));
    }
    el.lastSession.appendChild(nums);
    if (otraUnits.length) {
      el.lastSession.appendChild(progButton(t(otraUnits.length === 1 ? "last_session_btn_1" : "last_session_btn", { n: otraUnits.length }), false, function () {
        startPracticeDeck(cardsForUnits(otraUnits));
      }));
    }
    el.lastSession.hidden = false;
  }

  // ---- Tu historial (detail pages) ----
  function historyBlocks() { return document.querySelectorAll(".item-history"); }
  function renderItemHistory(kind) {
    historyBlocks().forEach(function (block) {
      var k = block.getAttribute("data-history-kind");
      if (kind && k !== kind) return;
      var toggle = block.querySelector(".item-history-toggle");
      var bodyEl = block.querySelector(".item-history-body");
      block.hidden = !currentUser;
      toggle.classList.toggle("open", historyOpen);
      toggle.setAttribute("aria-expanded", historyOpen ? "true" : "false");
      bodyEl.hidden = !historyOpen;
      if (!historyOpen) return;
      var data = historySelectedData(k);
      if (!data) return;
      if (!practiceHistory.rows || practiceHistory.userId !== (currentUser && currentUser.id)) {
        bodyEl.textContent = t("prog_loading");
        loadPracticeHistory(false).then(function () { if (historyOpen) drawItemHistory(bodyEl, k, historySelectedData(k)); });
        return;
      }
      drawItemHistory(bodyEl, k, data);
    });
  }
  function historySelectedData(kind) {
    if (kind === "topic") return selectedTopicId ? { topic: selectedTopicId } : null;
    var coll = kind === "verb" ? allVerbs : (kind === "word" ? allWords : allPhrases);
    var id = kind === "verb" ? selectedId : (kind === "word" ? selectedWordId : selectedPhraseId);
    var entry = id ? coll.find(function (x) { return x.id === id; }) : null;
    return entry ? entry.data : null;
  }
  function drawItemHistory(bodyEl, kind, data) {
    if (kind === "topic") { drawTopicHistory(bodyEl, data && data.topic); return; }
    bodyEl.innerHTML = "";
    if (!data) return;
    var key = practiceNorm(data.infinitive || data.word || data.phrase);
    var rows = practiceAllRows().filter(function (r) { return r.item_kind === kind && r.item_key === key; });
    if (!rows.length) { bodyEl.appendChild(progEl("p", "prog-text", t("history_none"))); return; }
    var P = computeProgress(rows);
    var days = {};
    rows.forEach(function (r) { days[progDayNum(r.shown_at)] = true; });
    var nDays = Object.keys(days).length;
    var bien = P.events.filter(function (r) { return r.grade === "bien"; }).length;
    var flips = rows.filter(function (r) { return r.flipped && r.ms_to_flip != null; });
    var avgFlip = flips.length ? flips.reduce(function (s, r) { return s + r.ms_to_flip; }, 0) / flips.length : null;
    var units = Object.keys(P.units).map(function (k) { return P.units[k]; });
    var nextDue = units.length ? Math.min.apply(null, units.map(function (u) { return u.dueDay; })) : null;
    var nextText = "—";
    if (nextDue !== null) {
      var dd = nextDue - P.today;
      nextText = dd <= 0 ? t("history_next_today") : (dd === 1 ? t("history_next_tomorrow") : t("history_next_days", { n: dd }));
    }
    var grid = progEl("div", "history-grid");
    function stat(big, small) {
      var x = progEl("div");
      x.appendChild(progEl("b", null, big));
      x.appendChild(progEl("span", null, small));
      grid.appendChild(x);
    }
    stat(t(rows.length === 1 ? "history_seen_1" : "history_seen", { n: rows.length }), t(nDays === 1 ? "history_seen_sub_1" : "history_seen_sub", { d: nDays }));
    if (P.events.length) stat(t("prog_x_of_y", { b: bien, n: P.events.length }), t("history_grade_sub"));
    else stat("—", t("history_no_grades"));
    stat(avgFlip !== null ? progNum(avgFlip / 1000, 1) + " s" : "—", t("history_flip_sub"));
    stat(nextText, t("history_next_sub"));
    if (kind === "verb") {
      var learned = units.filter(function (u) { return u.learned; }).length;
      stat(t("prog_x_of_y", { b: learned, n: units.length }), t("history_forms_sub"));
    }
    bodyEl.appendChild(grid);
    var lastTen = P.events.slice(-10).map(function (r) { return r.grade; });
    if (lastTen.length) {
      var line = progEl("div", "history-last");
      line.appendChild(progDots(lastTen));
      line.appendChild(progEl("span", null, t("history_last", { n: lastTen.length })));
      bodyEl.appendChild(line);
    }
  }
  function toggleHistoryOpen() {
    historyOpen = !historyOpen;
    try { localStorage.setItem(HISTORY_OPEN_KEY, historyOpen ? "1" : "0"); } catch (e) {}
    renderItemHistory(null);
  }
  document.querySelectorAll(".item-history-toggle").forEach(function (b) { b.addEventListener("click", toggleHistoryOpen); });

  // ---- list bars on the Listas tab ----
  function decorateListRows() {
    if (!currentUser || !practiceHistory.rows || practiceHistory.userId !== currentUser.id) return;
    var P = computeProgress(practiceAllRows());
    if (!P.events.length) return;
    allLists.forEach(function (l) {
      var row = el.listsList.querySelector('.list-row[data-list-id="' + l.id + '"]');
      if (!row || !(l.data.items || []).length) return;
      var lp = listProgress(P, l);
      var main = row.querySelector(".list-row-main");
      var count = main && main.querySelector(".def");
      if (count && !count.querySelector(".list-learned")) count.appendChild(progEl("span", "list-learned", t(lp.learned === 1 ? "list_meta_learned_1" : "list_meta_learned", { n: lp.learned })));
      if (main && !main.querySelector(".prog-track")) { main.appendChild(progTrack(lp)); row.classList.add("has-track"); }
    });
  }

  // Called when practice data changes on this device (a deck closed) or the
  // language changes.
  function refreshPracticeViews() {
    renderLastSession();
    if (el.progressPanel && !el.progressPanel.hidden) renderProgress();
    if (selectedId) renderItemHistory("verb");
    if (selectedWordId) renderItemHistory("word");
    if (selectedPhraseId) renderItemHistory("phrase");
    if (el.topicsPanel && !el.topicsPanel.hidden) renderTopicList();
    if (selectedTopicId) renderItemHistory("topic");
    if (el.playPanel && !el.playPanel.hidden) renderPlay();
  }

  // ================= Sabido (self-assessed "I know this one") =================
  // "known" is one person's own progress, not a property of the content. It
  // lives only on that user's own verbs/words/phrases rows (already private
  // per user via RLS) and is stripped from anything copied between accounts
  // — see listSnapshot() in the listas compartidas section.
  //
  // One on/off toggle, shown in two kinds of places: a row under the
  // flashcard (outside the card itself) and a pill at the end of each detail
  // page's badge row. Toggling never flips or advances a flashcard — the
  // first version ("Lo sé"/"Todavía no" buttons that auto-advanced) added a
  // second way to move between cards, which mason found disrupted the
  // tap-to-flip / swipe flow (2026-09-28).

  function knownCollection(kind) {
    return kind === "verb" ? allVerbs : (kind === "word" ? allWords : allPhrases);
  }

  // buildFlashDeck() pushes a live reference to each item's own data object
  // but not its id (a sibling of data). Personal collections are small, so
  // an O(n) reference-equality scan at click-time is cheap and avoids
  // threading id through every deck.push() call site.
  function findItemId(kind, data) {
    if (kind === "topic") return null; // built into the app, no row
    var found = knownCollection(kind).find(function (item) { return item.data === data; });
    return found ? found.id : null;
  }

  function setKnownToggleState(btn, known) {
    if (!btn) return;
    btn.setAttribute("aria-pressed", known ? "true" : "false");
    btn.setAttribute("aria-label", t(known ? "known_toggle_aria_on" : "known_toggle_aria_off"));
  }

  // select*() rebuilds each detail badge row with innerHTML = "", which
  // detaches the toggle; this re-appends the same persistent node (and so
  // the same click listener) rather than creating a new button per render.
  function appendKnownToggle(container, btn, known) {
    setKnownToggleState(btn, !!known);
    container.appendChild(btn);
  }

  function popKnownToggle(btn) {
    btn.classList.remove("pop");
    void btn.offsetWidth; // restart the animation on rapid repeat taps
    btn.classList.add("pop");
  }

  function knownMark() {
    var s = document.createElement("span");
    s.className = "known-mark";
    s.textContent = "✓";
    s.setAttribute("role", "img");
    s.setAttribute("aria-label", t("known_mark_aria"));
    return s;
  }

  function knownFilterActive(filters) {
    var f = filters.flag;
    return !!f && (f.include.has("known") || f.exclude.has("known"));
  }

  // ---- Per-form Sabido marks (verbs) ----
  // A verb flashcard is one conjugated form (tener · yo · presente), so its
  // Sabido toggle marks just that form, stored in verbs.known_forms as
  // { "<formKey>": true }. Form keys reuse the flashcard setup matrix's own
  // naming (flashCellKey): "presente|yo", "subjPasado|ellos",
  // "presente|impersonal", "imperativo|vos", plus "gerundio"/"participio".
  // This is independent of the verb-level `known` (the detail-page pill,
  // mason's choice 2026-09-28): a card counts as known if EITHER its own form
  // or its whole verb is marked.

  // Which cards carry over into the next pass (called at the end of each
  // pass): the same rule as the starting deck, cardPassesKnownFilter(), just
  // re-applied with whatever was marked during the pass. So it follows the
  // chip on the card's own tab, like every other filter in the app: chip
  // excluding Sabido → cards marked during the pass leave; chip on "only
  // Sabido" (review) → cards un-marked leave; chip neutral → nothing leaves,
  // since a neutral chip includes everything. mason, 2026-09-28, after a
  // brief detour where known cards always left: "if the token is neutral
  // going in... leave them in as a neutral chip is still inclusive."
  function cardInReviewMode(card) {
    var filters = card.kind === "verb" ? activeVerbFilters : (card.kind === "word" ? activeWordFilters : activePhraseFilters);
    return knownFilterMode(filters) === "include";
  }
  function cardStaysForNextPass(card) {
    return cardPassesKnownFilter(card);
  }

  function knownFilterMode(filters) {
    var f = filters.flag;
    if (!f) return null;
    if (f.include.has("known")) return "include";
    if (f.exclude.has("known")) return "exclude";
    return null;
  }

  function cardFormKnown(card) {
    return card.kind === "verb" && !!card.formKey && !!((card.data.known_forms || {})[card.formKey]);
  }

  function cardShowsKnown(card) {
    return !!card.data.known || cardFormKnown(card);
  }

  // Whether a card belongs in the deck under its own tab's Sabido chip:
  // chip excluding → only not-yet cards; chip including → only known cards;
  // chip neutral → everything.
  function cardPassesKnownFilter(card) {
    var filters = card.kind === "verb" ? activeVerbFilters : (card.kind === "word" ? activeWordFilters : activePhraseFilters);
    var mode = knownFilterMode(filters);
    if (!mode) return true;
    var known = cardShowsKnown(card);
    return mode === "include" ? known : !known;
  }

  // The verbs a flashcard deck draws from. Normally just the Verbos tab's
  // own filtered list — but when a Sabido chip is active there, that list
  // is filtered at the WHOLE-VERB level, while for flashcards the chip has to
  // apply per card (per form). So the deck starts from every verb passing
  // all the OTHER facets (and the search box), with the Sabido chip
  // temporarily set aside, and cardPassesKnownFilter() then applies it card
  // by card. Without this, "include" would miss forms marked on verbs that
  // aren't whole-marked.
  function verbFlashSource() {
    var f = activeVerbFilters.flag;
    var inc = f.include.has("known"), exc = f.exclude.has("known");
    if (!inc && !exc) return filtered;
    f.include.delete("known");
    f.exclude.delete("known");
    try {
      var q = norm(el.search.value);
      return allVerbs.filter(function (v) {
        return (!q || norm(v.data.infinitive || v.id).indexOf(q) !== -1) && verbPassesFacets(v, false);
      });
    } finally {
      if (inc) f.include.add("known");
      if (exc) f.exclude.add("known");
    }
  }

  // Every form key this verb actually has a value for — the same cells
  // buildFlashDeck() can make cards from (ignoring the setup matrix).
  function allVerbFormKeys(data) {
    return verbFormEntries(data).map(function (e) { return e.key; }); // see verbFormEntries()
  }


  // Marks/un-marks one form of a verb. Special case: un-marking a form of a
  // verb that's marked known as a WHOLE turns that whole-verb mark into
  // per-form marks on every other form — "I know all of it except this one"
  // — rather than silently losing what the whole-verb mark meant.
  function setVerbFormKnown(data, formKey, known) {
    var id = findItemId("verb", data);
    var prevForms = data.known_forms || {};
    var prevKnown = !!data.known;
    var next = Object.assign({}, prevForms);
    var patch = {};
    if (!known && prevKnown) {
      allVerbFormKeys(data).forEach(function (k) { next[k] = true; });
      delete next[formKey];
      data.known = false;
      patch.known = false;
    } else if (known) {
      next[formKey] = true;
    } else {
      delete next[formKey];
    }
    data.known_forms = next;
    patch.known_forms = next;
    refreshKnownUi("verb", id);
    if (!id) return;
    supabaseClient.from("verbs").update(patch).eq("id", id).then(function (res) {
      if (!res.error) return;
      data.known_forms = prevForms;
      data.known = prevKnown;
      refreshKnownUi("verb", id);
      showBanner(t("msg_error_guardar", { msg: res.error.message }));
    });
  }

  // Small check on each marked cell/tile of the verb detail page (cells and
  // tiles carry data-form-key, set in selectVerb() / index.html), plus the
  // legend line under the table, shown only when something is marked.
  function paintVerbFormMarks(data) {
    var kf = data.known_forms || {};
    var any = false;
    el.detail.querySelectorAll("[data-form-key]").forEach(function (n) {
      var on = !!kf[n.dataset.formKey];
      n.classList.toggle("form-known", on);
      if (on) { any = true; n.setAttribute("title", t("known_form_title")); }
      else n.removeAttribute("title");
    });
    if (el.dKnownLegend) el.dKnownLegend.hidden = !any;
  }

  function showFlashDone(reviewMode, textKey) {
    flashDeck = [];
    flashIndex = -1;
    el.flashProgress.textContent = "";
    el.flashDoneText.textContent = t(textKey || (reviewMode ? "flash_done_text_review" : "flash_done_text"));
    el.flashOverlay.classList.add("is-done");
  }

  // Brings every on-screen reflection of one item's known state up to date.
  // With a Sabido chip active on that item's tab, the whole list re-renders,
  // since the item may now fall on the other side of the filter. Otherwise
  // only that one row's check mark is patched in place — a full re-render
  // also resets the list's scroll position to the top, which is jarring
  // when all you did was tick one word.
  function refreshKnownUi(kind, id) {
    var entry = id ? knownCollection(kind).find(function (x) { return x.id === id; }) : null;
    var known = !!(entry && entry.data.known);
    var filters = kind === "verb" ? activeVerbFilters : (kind === "word" ? activeWordFilters : activePhraseFilters);
    var listEl = kind === "verb" ? el.list : (kind === "word" ? el.wordList : el.phraseList);
    if (knownFilterActive(filters)) {
      if (kind === "verb") renderList(); else if (kind === "word") renderWordList(); else renderPhraseList();
    } else if (id) {
      var inf = listEl.querySelector('.card-row[data-item-id="' + id + '"] .inf');
      if (inf) {
        var mark = inf.querySelector(".known-mark");
        if (known && !mark) inf.appendChild(knownMark());
        else if (!known && mark) mark.remove();
      }
    }
    var selected = kind === "verb" ? selectedId : (kind === "word" ? selectedWordId : selectedPhraseId);
    var toggle = kind === "verb" ? el.dKnown : (kind === "word" ? el.wdKnown : el.pdKnown);
    if (id && selected === id) setKnownToggleState(toggle, known);
    if (kind === "verb" && id && selected === id && entry) paintVerbFormMarks(entry.data);
    var card = flashDeck[flashIndex];
    if (card && entry && card.data === entry.data) setKnownToggleState(el.flashKnownToggle, cardShowsKnown(card));
  }

  // Updates the shared in-memory data object right away (the UI never waits
  // on the network), saves in the background, and rolls back with a banner
  // if the save fails. Deliberately does NOT call loadVerbs()/loadWords()/
  // loadPhrases(): those replace every data object with a fresh one, which
  // would orphan the references an open flashcard deck is holding.
  function setItemKnown(kind, data, known) {
    var id = findItemId(kind, data);
    data.known = known;
    refreshKnownUi(kind, id);
    if (!id) return;
    var table = kind === "verb" ? "verbs" : (kind === "word" ? "words" : "phrases");
    supabaseClient.from(table).update({ known: known }).eq("id", id).then(function (res) {
      if (!res.error) return;
      data.known = !known;
      refreshKnownUi(kind, id);
      showBanner(t("msg_error_guardar", { msg: res.error.message }));
    });
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

  // The drag/toss fade goes on the two FACES, never on .flash-card itself.
  // Bug fix (2026-09-28, mason: holding the answer side to swipe showed the
  // front side's text mirrored): opacity below 1 on the preserve-3d card —
  // and even just `will-change: opacity` — is a CSS "grouping property" that
  // flattens the card's 3D rendering context. Flattened, each face's
  // backface-visibility is judged against the card's own plane, so while
  // the card is rotated 180° the FRONT face is what paints, seen from
  // behind (mirrored), and the back face disappears. Same root cause as the
  // earlier tap-to-flip bug documented on .flash-card.no-anim in styles.css.
  // Fading each face individually looks identical and doesn't flatten
  // anything. Verified in Chromium with a real touch drag: fade on the card
  // → mirrored front; fade on the faces → correct back.
  var flashFaces = el.flashCard.querySelectorAll(".flash-face");
  function setFlashFaceFade(opacity, transition) {
    for (var i = 0; i < flashFaces.length; i++) {
      flashFaces[i].style.transition = transition || "";
      flashFaces[i].style.opacity = opacity;
    }
  }

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
    setFlashFaceFade(String(fade)); // not the card's own opacity — see setFlashFaceFade()
  }

  // Once the finger lifts, either let the tile finish flying off screen
  // (a real swipe) or spring it back to center (a drag that didn't go far
  // enough) — both as a quick, separate transition from the normal flip
  // animation, cleaned up afterward so later flips go back to that one.
  function settleFlashDrag(exit, isNext) {
    var flipped = el.flashCard.classList.contains("flipped");
    var easing = exit ? " 0.32s ease-in" : " 0.25s ease-out";
    el.flashCard.classList.remove("no-anim");
    el.flashCard.style.transition = "transform" + easing;
    if (exit) {
      var horizontal = Math.abs(flashDragDx) >= Math.abs(flashDragDy);
      var flyX = horizontal ? (isNext ? -1 : 1) * window.innerWidth * 0.9 : flashDragDx * 0.5;
      var flyY = horizontal ? flashDragDy * 0.5 : (isNext ? -1 : 1) * window.innerHeight * 0.6;
      // A gentler spin than the drag distance would suggest — enough to
      // read as a toss, not enough to look like a flip or a spill. Keeps
      // rotateY(180deg) on a flipped card: without it the transition
      // interpolates rotateY 180°→0° on the way out, so the card visibly
      // turned back over to its front mid-toss.
      el.flashCard.style.transform = "translate(" + flyX + "px, " + flyY + "px) rotate(" + (isNext ? -8 : 8) + "deg)" +
        (flipped ? " rotateY(180deg)" : "");
      setFlashFaceFade("0", "opacity" + easing);
    } else {
      // Same function list as the drag transform (translate, rotate, then
      // rotateY if flipped) so the spring-back interpolates each piece
      // directly, rather than the browser falling back to a matrix blend
      // between two mismatched lists.
      el.flashCard.style.transform = "translate(0px, 0px) rotate(0deg)" + (flipped ? " rotateY(180deg)" : "");
      setFlashFaceFade("", "opacity" + easing);
    }
    var done = false;
    function finish(evt) {
      // transitionend bubbles — only the card's own transform finishing
      // counts (the faces' opacity transitions end at the same moment, and
      // a speaker button's own transition could end at any time).
      if (evt && (evt.target !== el.flashCard || evt.propertyName !== "transform")) return;
      if (done) return;
      done = true;
      el.flashCard.removeEventListener("transitionend", finish);
      el.flashCard.style.transition = "";
      el.flashCard.style.transform = "";
      setFlashFaceFade("", "");
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

  // "known" (Sabido) is one person's own progress, not part of the content,
  // so it never goes into a list snapshot — lists are the one path by which
  // a verb/word/phrase's data crosses from one account to another (sharing
  // a list, then importing it). Every list_items insert and the shared-list
  // import's verb insert run their data through this. Words/phrases on
  // import were already safe (they map fields explicitly), but routing
  // everything through one helper keeps the rule in one place.
  function listSnapshot(data) {
    var copy = Object.assign({}, data);
    delete copy.known;
    delete copy.known_forms; // per-form marks are per-person progress too
    return copy;
  }

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

  // A list can hold verbs, vocabulary and phrases together (e.g. everything
  // useful for "la cocina"). Given a breakdown, show that split; otherwise
  // (before a list's items have been individually loaded) fall back to the
  // plain total.
  function listMetaText(count, verbCount, wordCount, phraseCount) {
    if (verbCount || wordCount || phraseCount) {
      var parts = [];
      if (verbCount) parts.push(verbCount + t(verbCount === 1 ? "unit_verbo_s" : "unit_verbo_pl"));
      if (wordCount) parts.push(wordCount + t(wordCount === 1 ? "unit_palabra_s" : "unit_palabra_pl"));
      if (phraseCount) parts.push(phraseCount + t(phraseCount === 1 ? "unit_frase_s" : "unit_frase_pl"));
      return parts.join(" · ");
    }
    return count + t(count === 1 ? "unit_item_bare_s" : "unit_item_bare_pl");
  }

  function rowsToLists(rows) {
    return (rows || []).map(function (row) {
      var entry = rowToList(row);
      entry.data.itemCount = (row.list_items && row.list_items.length) || 0;
      // Just what the progress bars need: each item's type + normalised text.
      entry.data.items = (row.list_items || []).map(function (it) {
        var d = it.data || {};
        return { type: it.item_type, key: practiceNorm(d.infinitive || d.word || d.phrase) };
      });
      return entry;
    });
  }

  // Rebuilds the norm(name) -> Set<listId> reverse-membership maps from the
  // full list_items rows (see the state-declaration comments above for why
  // this is matched by name, not id). Called as a side effect of every
  // loadLists() — success or offline-cache-fallback — so every place that
  // already refreshes the lists panel also keeps the "Listas" filter chips
  // and list-membership filtering current, with no extra call sites needed.
  function rebuildListMembership(rows) {
    verbListMembership = {};
    wordListMembership = {};
    phraseListMembership = {};
    (rows || []).forEach(function (row) {
      (row.list_items || []).forEach(function (item) {
        var data = item.data || {};
        var map, key;
        if (item.item_type === "verb") { map = verbListMembership; key = norm(data.infinitive || ""); }
        else if (item.item_type === "word") { map = wordListMembership; key = norm(data.word || ""); }
        else if (item.item_type === "phrase") { map = phraseListMembership; key = norm(data.phrase || ""); }
        else return;
        if (!key) return;
        if (!map[key]) map[key] = new Set();
        map[key].add(row.id);
      });
    });
  }

  // ================= "Listas" filter: compact trigger + picker modal =================
  // One inline chip per saved list stopped scaling once there were more
  // than a handful of lists (mason's own call, after seeing that design
  // running). Replaced with one compact trigger per tab that summarizes
  // the CURRENT selection of the "Listas" facet, opening a shared modal
  // (#list-filter-overlay) with a search box and every list as a tri-state
  // row. As of 2026-09-27 that facet is sharedListFilter — one selection
  // for all three tabs, not three separate ones — so every tab's trigger
  // shows the exact same selection and editing it from any tab (or from the
  // "Filtrar por esta lista" button in the Listas panel, see renderListsPanel
  // below) changes it everywhere at once. listFacetOk()/cycleFacetValue()/
  // chipVisualState() still work unchanged against it — see the
  // sharedListFilter declaration up top for why.
  function activeFiltersForTab(tab) {
    if (tab === "verbs") return activeVerbFilters;
    if (tab === "words") return activeWordFilters;
    return activePhraseFilters;
  }
  function rerenderTab(tab) {
    if (tab === "verbs") renderList();
    else if (tab === "words") renderWordList();
    else renderPhraseList();
  }
  function listsTriggerEls(tab) {
    if (tab === "verbs") return { group: el.verbListsGroup, trigger: el.verbListsTrigger, label: el.verbListsTriggerLabel, clearBtn: el.verbFiltersClear };
    if (tab === "words") return { group: el.wordListsGroup, trigger: el.wordListsTrigger, label: el.wordListsTriggerLabel, clearBtn: el.wordFiltersClear };
    return { group: el.phraseListsGroup, trigger: el.phraseListsTrigger, label: el.phraseListsTriggerLabel, clearBtn: el.phraseFiltersClear };
  }

  // Updates one tab's trigger button (label + has-selection styling) and
  // its "Limpiar filtros" visibility — the two things any change to the
  // shared list facet, or this tab's own tag facets, always needs refreshed
  // together. Also hides the whole "Listas" chip-group when there are no
  // saved lists yet, same as the old inline chip-group did. Reads
  // sharedListFilter directly (not activeFiltersForTab(tab)) for the list
  // counts/label, since that facet is the same for all three tabs now —
  // calling this once per tab is still right, since each tab has its own
  // trigger button/label element to refresh, they just all show the same
  // numbers. "Limpiar filtros" itself only clears this tab's own tag
  // facets (see clearTabFiltersOnly's comment above), so its visibility is
  // still keyed off just those, not the shared list facet.
  function updateListsTrigger(tab) {
    var refs = listsTriggerEls(tab);
    var filters = activeFiltersForTab(tab);
    refs.group.hidden = !allLists.length;
    refs.clearBtn.hidden = !anyFilterActive(filters);
    var incCount = sharedListFilter.list.include.size;
    var excCount = sharedListFilter.list.exclude.size;
    if (incCount + excCount === 0) {
      refs.trigger.classList.remove("has-selection");
      refs.label.textContent = t("chip_group_list");
      return;
    }
    refs.trigger.classList.add("has-selection");
    var parts = [];
    if (incCount === 1) {
      var onlyId = Array.from(sharedListFilter.list.include)[0];
      var entry = allLists.find(function (l) { return l.id === onlyId; });
      parts.push(entry ? entry.data.name : t("chip_group_list"));
    } else if (incCount > 1) {
      parts.push(t("lists_included_pl", { n: incCount }));
    }
    if (excCount === 1) parts.push(t("lists_excluded_s", { n: excCount }));
    else if (excCount > 1) parts.push(t("lists_excluded_pl", { n: excCount }));
    // Text nodes, never innerHTML: a list name can come from someone
    // else's shared list (saving it copies the name), so it must never be
    // read as HTML (risk review 2026-10-05, item 2).
    refs.label.textContent = t("lists_trigger_prefix") + parts.join(", ") + " ";
    var countBadge = document.createElement("span");
    countBadge.className = "count-badge";
    countBadge.textContent = String(incCount + excCount);
    refs.label.appendChild(countBadge);
  }

  // Drops any include/exclude selection that names a list which no longer
  // exists (deleted, or never synced) — the modal-picker equivalent of
  // what the old inline chip-group's rebuild used to do implicitly by
  // just not drawing a chip for it. Runs once against the shared facet now,
  // not once per tab.
  function pruneStaleListFilter() {
    var validIds = {};
    allLists.forEach(function (l) { validIds[l.id] = true; });
    ["include", "exclude"].forEach(function (side) {
      Array.from(sharedListFilter.list[side]).forEach(function (id) {
        if (!validIds[id]) sharedListFilter.list[side].delete(id);
      });
    });
  }

  // Called wherever allLists changes (every loadLists(), sign-out reset,
  // language switch) — prunes stale selections from the shared facet,
  // refreshes all three triggers, persists it, and if the picker modal
  // happens to be open right now (e.g. a background list refresh while
  // mason is mid-pick), re-renders its rows too rather than leaving them
  // stale underneath it.
  function refreshListFilterUI() {
    pruneStaleListFilter();
    saveFilters(SHARED_LIST_STORAGE_KEY, sharedListFilter);
    ["verbs", "words", "phrases"].forEach(function (tab) { updateListsTrigger(tab); });
    if (listFilterTarget && !el.listFilterOverlay.hidden) {
      renderListFilterRows(el.listFilterSearch.value);
    }
  }

  function openListFilterPicker(tab) {
    listFilterTarget = tab;
    el.listFilterSearch.value = "";
    renderListFilterRows("");
    el.listFilterOverlay.hidden = false;
    el.listFilterSearch.focus();
  }

  function closeListFilterPicker() {
    el.listFilterOverlay.hidden = true;
    listFilterTarget = null;
  }

  // Toggling a row here edits the ONE shared facet, so every tab — not just
  // whichever one's trigger opened the modal — needs its trigger label and
  // filtered content refreshed afterward.
  function renderListFilterRows(filterText) {
    if (!listFilterTarget) return;
    var q = norm(filterText || "");
    el.listFilterList.innerHTML = "";
    var matches = allLists.filter(function (l) { return !q || norm(l.data.name).indexOf(q) !== -1; });
    if (!matches.length) {
      var li = document.createElement("li");
      var note = document.createElement("div");
      note.className = "picker-empty";
      note.textContent = allLists.length === 0 ? t("empty_no_lists") : t("list_filter_no_matches", { q: filterText });
      li.appendChild(note);
      el.listFilterList.appendChild(li);
      return;
    }
    matches.forEach(function (l) {
      var liEl = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "picker-row state-" + chipVisualState(sharedListFilter, "list", l.id);
      var left = document.createElement("span");
      var name = document.createElement("span");
      name.className = "name";
      name.textContent = l.data.name;
      var meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = listMetaText(l.data.itemCount || 0);
      left.appendChild(name);
      left.appendChild(meta);
      var glyph = document.createElement("span");
      glyph.className = "state-glyph";
      btn.appendChild(left);
      btn.appendChild(glyph);
      btn.addEventListener("click", function () {
        cycleFacetValue(sharedListFilter, "list", l.id);
        saveFilters(SHARED_LIST_STORAGE_KEY, sharedListFilter);
        btn.className = "picker-row state-" + chipVisualState(sharedListFilter, "list", l.id);
        ["verbs", "words", "phrases"].forEach(function (tab) { updateListsTrigger(tab); rerenderTab(tab); });
      });
      liEl.appendChild(btn);
      el.listFilterList.appendChild(liEl);
    });
  }

  function loadLists() {
    return supabaseClient
      .from("lists")
      .select("*, list_items(id, item_type, data)")
      .order("created_at", { ascending: false })
      .then(function (res) {
        if (res.error) throw res.error;
        saveCache("lists", res.data || []);
        markOnline("lists");
        clearBanner();
        allLists = sortByText(rowsToLists(res.data), "name");
        rebuildListMembership(res.data);
        renderListsPanel();
        refreshListFilterUI();
        renderList();
        renderWordList();
        renderPhraseList();
        if (selectedListId) {
          var still = allLists.find(function (l) { return l.id === selectedListId; });
          if (still) selectListRow(selectedListId); else { el.listDetail.hidden = true; selectedListId = null; }
        }
      })
      .catch(function (err) {
        var cached = readCache("lists");
        if (!cached) { showBanner(t("msg_error_cargar_listas", { msg: (err && err.message) || err })); return; }
        allLists = sortByText(rowsToLists(cached.rows), "name");
        rebuildListMembership(cached.rows);
        markOffline("lists", cached.savedAt);
        renderListsPanel();
        refreshListFilterUI();
        renderList();
        renderWordList();
        renderPhraseList();
      });
  }

  function renderListsPanel() {
    el.listsList.innerHTML = "";
    el.listsEmptyMsg.hidden = allLists.length !== 0;
    allLists.forEach(function (l) {
      var li = document.createElement("li");
      // A div wrapper with two sibling buttons (not one button nested
      // inside another, which is invalid) — same pattern listItemRow()
      // below already uses for its own per-row action button. .card-row's
      // existing flex/padding styling now lives on this wrapper; .list-row-
      // main resets its own button-ness so the name/count still look and
      // flow exactly as they did when the whole row was one <button>.
      var wrap = document.createElement("div");
      wrap.className = "card-row list-row";
      wrap.dataset.listId = l.id;

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "list-row-main";

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

      // The same tri-state control as the Listas picker modal's rows
      // (renderListFilterRows above) — neutral -> include -> exclude ->
      // neutral, same accent/danger state-glyph — so toggling the shared
      // list filter looks and behaves identically whichever screen mason
      // does it from. Deliberately does NOT navigate anywhere: mason found
      // the old "Filtrar por esta lista" shortcut's jump-to-last-tab
      // unhelpful when toggling several lists in a row from this panel, so
      // this just updates the filter in place and leaves him on Listas.
      var toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "list-row-filter-toggle state-" + chipVisualState(sharedListFilter, "list", l.id);
      toggleBtn.setAttribute("aria-label", t("btn_filter_to_list") + " — " + l.data.name);
      var glyph = document.createElement("span");
      glyph.className = "state-glyph";
      toggleBtn.appendChild(glyph);
      toggleBtn.addEventListener("click", function () {
        cycleFacetValue(sharedListFilter, "list", l.id);
        saveFilters(SHARED_LIST_STORAGE_KEY, sharedListFilter);
        toggleBtn.className = "list-row-filter-toggle state-" + chipVisualState(sharedListFilter, "list", l.id);
        toggleBtn.setAttribute("aria-label", t("btn_filter_to_list") + " — " + l.data.name);
        ["verbs", "words", "phrases"].forEach(function (tab) { updateListsTrigger(tab); rerenderTab(tab); });
      });

      wrap.appendChild(btn);
      wrap.appendChild(toggleBtn);
      li.appendChild(wrap);
      el.listsList.appendChild(li);
    });
    decorateListRows();
  }

  function listItemRow(row) {
    var li = document.createElement("li");
    var wrap = document.createElement("div");
    wrap.className = "card-row";

    var main = document.createElement("span");
    main.className = "inf";
    main.textContent = row.item_type === "verb" ? (row.data.infinitive || "")
      : row.item_type === "word" ? (row.data.word || "")
      : (row.data.phrase || "");
    wrap.appendChild(main);

    var def = document.createElement("span");
    def.className = "def";
    def.textContent = row.data.definition || "";
    wrap.appendChild(def);

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "icon-btn danger";
    removeBtn.textContent = t("remove_btn");
    removeBtn.addEventListener("click", function () {
      supabaseClient.from("list_items").delete().eq("id", row.id).then(function (res) {
        if (res.error) { el.ldShareMsg.textContent = t("msg_error_generic", { msg: res.error.message }); return; }
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
    el.ldPhrasesItems.innerHTML = "";
    el.ldVerbsGroup.hidden = true;
    el.ldWordsGroup.hidden = true;
    el.ldPhrasesGroup.hidden = true;
    supabaseClient.from("list_items").select("*").eq("list_id", id).then(function (res) {
      if (res.error) { el.ldShareMsg.textContent = t("msg_error_cargar_items", { msg: res.error.message }); return; }
      var rows = sortItemRows(res.data || []);
      var verbRows = rows.filter(function (r) { return r.item_type === "verb"; });
      var wordRows = rows.filter(function (r) { return r.item_type === "word"; });
      var phraseRows = rows.filter(function (r) { return r.item_type === "phrase"; });
      el.ldMeta.textContent = listMetaText(rows.length, verbRows.length, wordRows.length, phraseRows.length);
      // Shown as separate groups (rather than one flat list) now that a
      // single list can hold all three — e.g. a "La cocina" list mixing
      // kitchen verbs, nouns and phrases reads much more clearly split apart.
      el.ldVerbsGroup.hidden = verbRows.length === 0;
      el.ldWordsGroup.hidden = wordRows.length === 0;
      el.ldPhrasesGroup.hidden = phraseRows.length === 0;
      verbRows.forEach(function (row) { el.ldVerbsItems.appendChild(listItemRow(row)); });
      wordRows.forEach(function (row) { el.ldWordsItems.appendChild(listItemRow(row)); });
      phraseRows.forEach(function (row) { el.ldPhrasesItems.appendChild(listItemRow(row)); });
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
    if (!name) { el.listFormMsg.textContent = t("msg_falta_nombre"); return; }
    el.listFormMsg.textContent = t("msg_creando");
    supabaseClient.from("lists").insert({
      name: name,
      owner_label: shareOwnerLabel()
    }).select().single().then(function (res) {
      if (res.error) { el.listFormMsg.textContent = t("msg_error_guardar", { msg: res.error.message }); return; }
      var savedId = res.data.id;
      closeListForm();
      loadLists().then(function () { selectListRow(savedId); });
    });
  }

  function handleListDelete() {
    if (!selectedListId) return;
    if (!window.confirm(t("confirm_delete_list"))) return;
    supabaseClient.from("lists").delete().eq("id", selectedListId).then(function (res) {
      if (res.error) { showBanner(t("msg_no_pudo_eliminar", { msg: res.error.message })); return; }
      el.listDetail.hidden = true;
      selectedListId = null;
      loadLists();
    });
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
        el.ldShareMsg.textContent = t("msg_enlace_copiado");
      }).catch(function () {
        el.ldShareLink.select();
        el.ldShareMsg.textContent = t("msg_no_pudo_copiar");
      });
    } else {
      el.ldShareLink.select();
      el.ldShareMsg.textContent = t("msg_enlace_seleccionado");
    }
  }

  function handleNativeShare() {
    var link = el.ldShareLink.value;
    if (!link || !navigator.share) return;
    var entry = allLists.find(function (l) { return l.id === selectedListId; });
    var name = entry ? entry.data.name : t("share_fallback_name");
    el.ldShareMsg.textContent = "";
    navigator.share({
      title: "voseá — " + name,
      text: t("share_native_text", { name: name }),
      url: link
    }).catch(function (err) {
      // AbortError just means the person closed the share sheet without
      // picking anything — not worth surfacing as an error.
      if (err && err.name === "AbortError") return;
      el.ldShareMsg.textContent = t("msg_no_pudo_compartir", { msg: (err && err.message) || err });
    });
  }

  // ---- "agregar a lista" desde el detalle de un verbo/palabra ----

  function openListPicker(itemType, items) {
    if (!items || items.length === 0) {
      showBanner(t("msg_no_items_filtro"));
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
      p.textContent = t("empty_no_lists");
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
    el.listPickerMsg.textContent = t("msg_agregando");
    // Only dedupe against the target list's existing items of the SAME
    // type — a list mixing verbs and words could otherwise have a word
    // wrongly skipped because its text happens to match an unrelated verb.
    supabaseClient.from("list_items").select("data").eq("list_id", listId).eq("item_type", itemType).then(function (res) {
      if (res.error) { el.listPickerMsg.textContent = t("msg_error_generic", { msg: res.error.message }); return; }
      var existing = {};
      (res.data || []).forEach(function (row) {
        var d = row.data || {};
        existing[norm(d.infinitive || d.word || d.phrase || "")] = true;
      });
      var toInsert = [];
      var skipped = 0;
      items.forEach(function (data) {
        var key = norm(data.infinitive || data.word || data.phrase || "");
        if (existing[key]) { skipped++; return; }
        existing[key] = true; // also guards against dupes within this same batch
        toInsert.push({ list_id: listId, item_type: itemType, data: listSnapshot(data) });
      });
      if (toInsert.length === 0) {
        el.listPickerMsg.textContent = skipped
          ? t("msg_ya_estaban_todos", { n: skipped })
          : t("msg_nada_para_agregar");
        return;
      }
      supabaseClient.from("list_items").insert(toInsert).then(function (res2) {
        if (res2.error) { el.listPickerMsg.textContent = t("msg_error_generic", { msg: res2.error.message }); return; }
        closeListPicker();
        var msg = toInsert.length === 1 ? t("msg_agrego_1") : t("msg_agregaron_n", { n: toInsert.length });
        if (skipped) msg += t("msg_ya_estaban_paren", { n: skipped });
        showBanner(msg);
        loadLists();
      });
    });
  }

  function handleListPickerCreate() {
    if (!listPickerTarget) return;
    var name = el.listPickerNewName.value.trim();
    if (!name) { el.listPickerMsg.textContent = t("msg_poner_nombre"); return; }
    el.listPickerMsg.textContent = t("msg_creando");
    supabaseClient.from("lists").insert({
      name: name,
      owner_label: shareOwnerLabel()
    }).select().single().then(function (res) {
      if (res.error) { el.listPickerMsg.textContent = t("msg_error_crear", { msg: res.error.message }); return; }
      addItemToList(res.data.id);
    });
  }

  // ---- previsualización + importación de un enlace compartido ----

  function openSharePreview(token) {
    el.shareOverlay.hidden = false;
    el.shareName.textContent = t("msg_cargando");
    el.shareMeta.textContent = "";
    el.shareMsg.textContent = "";
    el.shareItems.innerHTML = "";
    el.shareImportResult.textContent = "";
    el.shareImportBtn.disabled = false;
    supabaseClient.rpc("get_shared_list", { p_token: token }).then(function (res) {
      if (res.error || !res.data || res.data.length === 0) {
        currentShareList = null;
        el.shareName.textContent = t("msg_enlace_invalido");
        el.shareMsg.textContent = t("msg_enlace_no_existe");
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
        items: sortItemRows(rows.map(function (r) { return { itemType: r.item_type, data: r.data }; }))
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
    var phraseCount = s.items.filter(function (it) { return it.itemType === "phrase"; }).length;
    el.shareMeta.textContent = listMetaText(s.items.length, verbCount, wordCount, phraseCount) +
      (s.ownerLabel ? t("share_shared_by", { label: s.ownerLabel }) : "");
    el.shareItems.innerHTML = "";
    s.items.forEach(function (it) {
      var li = document.createElement("li");
      var row = document.createElement("div");
      row.className = "card-row";
      var main = document.createElement("span");
      main.className = "inf";
      main.textContent = it.itemType === "verb" ? (it.data.infinitive || "")
        : it.itemType === "word" ? (it.data.word || "")
        : (it.data.phrase || "");
      row.appendChild(main);
      if (it.itemType === "verb" && it.data.type) row.appendChild(badge("type", tagLabel(it.data.type)));
      if (it.itemType === "word" && it.data.partOfSpeech) row.appendChild(badge("type", tagLabel(it.data.partOfSpeech)));
      if (it.itemType === "phrase" && it.data.function) row.appendChild(badge("type", tagLabel(it.data.function)));
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
  //
  // Beyond adding the underlying verbs/words to the recipient's own
  // collection, importing also creates a list of their own with the same
  // name and the same items. That's the actual point of a themed list
  // (e.g. "la cocina") — the person it's shared with should end up with
  // the same grouped/filterable set to study, not just those words
  // scattered into their general index with no grouping left. The new
  // list's items are a snapshot of everything that was shared, including
  // anything skipped as a duplicate — a word she already had should still
  // land in the new list, same as it did for the sender.
  function handleShareImport() {
    if (!currentShareList || !currentUser) return;
    el.shareImportBtn.disabled = true;
    el.shareImportResult.textContent = t("msg_importando");
    var s = currentShareList;

    var existingInf = {};
    allVerbs.forEach(function (v) { existingInf[norm(v.data.infinitive || "")] = true; });
    var existingWord = {};
    allWords.forEach(function (w) { existingWord[norm(w.data.word || "")] = true; });
    var existingPhrase = {};
    allPhrases.forEach(function (p) { existingPhrase[norm(p.data.phrase || "")] = true; });

    var toInsertV = [], skippedV = [];
    var toInsertW = [], skippedW = [];
    var toInsertP = [], skippedP = [];

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
      } else if (it.itemType === "phrase") {
        var ph = it.data.phrase || "";
        if (existingPhrase[norm(ph)]) { skippedP.push(ph); return; }
        existingPhrase[norm(ph)] = true;
        toInsertP.push({
          phrase: it.data.phrase || "",
          definition: it.data.definition || "",
          function: it.data.function || "otro",
          register: it.data.register || "neutro",
          idiomatic: !!it.data.idiomatic,
          literal: it.data.literal || "",
          notes: it.data.notes || "",
          example: it.data.example || ""
        });
      } else {
        var inf = it.data.infinitive || "";
        if (existingInf[norm(inf)]) { skippedV.push(inf); return; }
        existingInf[norm(inf)] = true;
        // verb data keys already match column names 1:1; listSnapshot() also
        // drops any "known" an older snapshot might still carry, so the
        // recipient always starts at "todavía no" on everything imported.
        toInsertV.push(listSnapshot(it.data));
      }
    });

    var verbsPromise = toInsertV.length ? supabaseClient.from("verbs").insert(toInsertV) : Promise.resolve({ error: null });
    var wordsPromise = toInsertW.length ? supabaseClient.from("words").insert(toInsertW) : Promise.resolve({ error: null });
    var phrasesPromise = toInsertP.length ? supabaseClient.from("phrases").insert(toInsertP) : Promise.resolve({ error: null });

    Promise.all([verbsPromise, wordsPromise, phrasesPromise]).then(function (results) {
      var failed = results.filter(function (r) { return r && r.error; });
      if (failed.length) {
        el.shareImportBtn.disabled = false;
        el.shareImportResult.textContent = t("msg_error_importar", { msg: failed[0].error.message });
        return;
      }
      if (toInsertV.length) loadVerbs();
      if (toInsertW.length) loadWords();
      if (toInsertP.length) loadPhrases();

      var importedCount = toInsertV.length + toInsertW.length + toInsertP.length;
      var skipped = skippedV.concat(skippedW).concat(skippedP);
      var msg = t("msg_imported_prefix", { n: importedCount }) + t(importedCount === 1 ? "unit_item_singular" : "unit_item_plural");
      if (skipped.length) {
        msg += " " + skipped.length + t(skipped.length === 1 ? "msg_ya_estaba_singular" : "msg_ya_estaban_plural") +
          t("msg_en_tu_coleccion", { list: skipped.join(", ") });
      }

      // Now build the recipient's own copy of the list itself, so it shows
      // up in her Lists panel with the same items grouped together — the
      // button stays disabled either way (success or failure here) so a
      // second click on the same open share preview can't create a
      // second, duplicate list.
      supabaseClient.from("lists").insert({
        name: s.listName,
        owner_label: shareOwnerLabel()
      }).select().single().then(function (listRes) {
        if (listRes.error) {
          msg += t("msg_no_pudo_crear_lista_cuenta", { msg: listRes.error.message });
          el.shareImportResult.textContent = msg;
          return;
        }
        var listItemRows = s.items.map(function (it) {
          return { list_id: listRes.data.id, item_type: it.itemType, data: listSnapshot(it.data) };
        });
        supabaseClient.from("list_items").insert(listItemRows).then(function (itemsRes) {
          if (itemsRes.error) {
            msg += t("msg_lista_creada_sin_items", { msg: itemsRes.error.message });
          } else {
            msg += t("msg_se_creo_lista", { name: s.listName });
          }
          el.shareImportResult.textContent = msg;
          loadLists();
        });
      });
    });
  }

  // ================= import content from JSON =================
  // Lets someone hand a formatting spec + source material to their own LLM,
  // get back a JSON file, and import it directly instead of hand-typing
  // conjugation tables/vocab one row at a time. Purely additive — the single
  // add-verb/add-word forms above are untouched. See index.html's
  // #import-json-overlay for the modal this drives.
  //
  // Two-step flow: "Validate" (handleImportJsonValidate) only parses and
  // checks the JSON, never touching Supabase; "Confirm import"
  // (handleImportJsonConfirm) is enabled only once a validation pass came
  // back with zero blocking errors, and is what actually writes rows.
  // Embedded verbatim from the standalone import-format spec document (the
  // same one people paste into their own LLM before generating an import
  // file) so it can be viewed/copied right from this modal instead of
  // requiring a separate document. This is a point-in-time copy, not a
  // live reference — if that source document changes, this copy needs to
  // be updated by hand too, since there is no build step tying them
  // together.
  var IMPORT_FORMAT_SPEC = "# voseá — Custom Content Import Format (v1)\n\nPaste this whole document into your preferred LLM, along with the source\nmaterial you want turned into study content (a webpage, a PDF, your own\nlist of words), and ask it to produce one JSON file matching the shape\nbelow. Then point voseá's import screen at that file.\n\nEverything imported lands in **your own** verbs/words/phrases — never the\napp's shared starter content — the same as adding an item by hand.\n\n## Top-level shape\n\n```json\n{\n  \"version\": 1,\n  \"list_name\": \"Petrofísica y Perfilaje de Pozos\",\n  \"verbs\": [ /* verb objects, see below */ ],\n  \"words\": [ /* word objects, see below */ ],\n  \"phrases\": [ /* phrase objects, see below */ ]\n}\n```\n\n- `version` — always `1` for this format. Lets the app detect and reject a\n  future incompatible format instead of silently importing garbage.\n- `list_name` — optional. If present, every verb/word/phrase below is also\n  added to a list with this exact name (a new list is created if none\n  matches; an existing one with the same name is added to instead of\n  duplicated). Omit this to just add items to your collection without\n  creating a list.\n- `verbs`, `words` and `phrases` are all optional arrays — include\n  whichever you have.\n\n## Verb object shape\n\n```json\n{\n  \"infinitive\": \"escalar\",\n  \"definition\": \"to climb; to scale\",\n  \"notes\": \"en perfilaje: escalar una curva = to set a log curve's scale\",\n  \"example\": \"Escalamos el cerro en tres horas. / Escalá la resistividad en logarítmico.\",\n  \"type\": \"-ar\",\n  \"reflexive\": false,\n  \"irregularity\": \"regular\",\n  \"pattern\": \"\",\n  \"transitivity\": \"transitivo\",\n  \"preposicion\": \"\",\n  \"auxiliar\": false,\n  \"gustar_like\": false,\n  \"forms\": {\n    \"presente\":     { \"yo\": \"escalo\",    \"vos\": \"escalás\",   \"el\": \"escala\",    \"nosotros\": \"escalamos\",    \"ellos\": \"escalan\" },\n    \"preterito\":    { \"yo\": \"escalé\",    \"vos\": \"escalaste\", \"el\": \"escaló\",    \"nosotros\": \"escalamos\",    \"ellos\": \"escalaron\" },\n    \"imperfecto\":   { \"yo\": \"escalaba\",  \"vos\": \"escalabas\", \"el\": \"escalaba\",  \"nosotros\": \"escalábamos\",  \"ellos\": \"escalaban\" },\n    \"futuro\":       { \"yo\": \"escalaré\",  \"vos\": \"escalarás\", \"el\": \"escalará\",  \"nosotros\": \"escalaremos\",  \"ellos\": \"escalarán\" },\n    \"condicional\":  { \"yo\": \"escalaría\", \"vos\": \"escalarías\",\"el\": \"escalaría\", \"nosotros\": \"escalaríamos\", \"ellos\": \"escalarían\" },\n    \"subjPresente\": { \"yo\": \"escale\",    \"vos\": \"escales\",   \"el\": \"escale\",    \"nosotros\": \"escalemos\",    \"ellos\": \"escalen\" },\n    \"subjPasado\":   { \"yo\": \"escalara\",  \"vos\": \"escalaras\", \"el\": \"escalara\",  \"nosotros\": \"escaláramos\",  \"ellos\": \"escalaran\" },\n    \"imperativo\":   { \"vos\": \"escalá\", \"usted\": \"escale\", \"nosotros\": \"escalemos\", \"ustedes\": \"escalen\" },\n    \"gerundio\": \"escalando\",\n    \"participio\": \"escalado\"\n  }\n}\n```\n\nField notes:\n- `type` — one of `-ar` / `-er` / `-ir`, must match the infinitive's ending.\n- `irregularity` — one of `regular` / `cambio de raíz` / `irregular (yo)` / `irregular (total)`.\n- `pattern` — a short free-text note on what's irregular (e.g. `\"e→i en formas acentuadas\"`), blank if fully regular.\n- `transitivity` — one of `transitivo` / `intransitivo` / `ambos`.\n- `preposicion` — a fixed preposition the verb idiomatically takes (`\"a\"`, `\"de\"`, `\"en\"`...), or `\"\"`.\n- `notes` and `example` — optional free text, same rules as for words (see \"Definitions, notes and examples\" below).\n- `forms` — every tense object must have all five persons: `yo`, `vos`, `el`, `nosotros`, `ellos`. `imperativo` has only `vos`/`usted`/`nosotros`/`ustedes` (no `yo` — you can't command yourself). `gerundio` and `participio` are plain strings, not person tables.\n- Impersonal weather verbs (`llover`, `nevar`) skip the person tables entirely and use `\"forms\": { \"impersonal\": { \"presente\": \"llueve\", \"subjPasado\": \"lloviera\", ... } }` instead — there's no \"yo llueve.\"\n- Reflexive verbs (e.g. `levantarse`) write `forms` WITH the reflexive pronoun already baked into every single-table cell (`\"yo\": \"me levanto\"`, NOT just `\"levanto\"`) — the app displays exactly what's stored here, it does not add the pronoun itself at display time. `imperativo` includes it too, wherever it attaches: enclitic on `vos` (`\"vos\": \"levantate\"`), proclitic on the other three (`\"usted\": \"se levante\"`, `\"nosotros\": \"nos levantemos\"`, `\"ustedes\": \"se levanten\"`).\n\n## Word object shape\n\n```json\n{\n  \"word\": \"porosidad\",\n  \"definition\": \"porosity\",\n  \"part_of_speech\": \"sustantivo\",\n  \"gender\": \"femenino\",\n  \"notes\": \"φ; se mide con los perfiles de densidad, neutrón o sónico\",\n  \"example\": \"Esta arenisca tiene buena porosidad.\"\n}\n```\n\n- `part_of_speech` — one of `sustantivo` / `adjetivo` / `adverbio` / `pronombre` / `preposición` / `conjunción` / `interjección`.\n- `gender` — one of `masculino` / `femenino` / `neutro` / `\"\"` (blank for anything ungendered, e.g. most adverbs).\n- `notes` and `example` are both optional free text; `example` is a Spanish sentence using the word, if you want one.\n\n## Phrase object shape\n\nShort common phrases/expressions — kept separate from single-word\nvocabulary because a phrase doesn't have one part of speech or gender.\nInstead it has its own two facets: what it's *for* (`function`) and how\nformal/slangy it is (`register`).\n\n```json\n{\n  \"phrase\": \"Dale\",\n  \"definition\": \"okay / sure / sounds good\",\n  \"function\": \"acuerdo\",\n  \"register\": \"coloquial\",\n  \"idiomatic\": true,\n  \"literal\": \"give it / go\",\n  \"notes\": \"\",\n  \"example\": \"\"\n}\n```\n\n- `function` — the phrase's communicative role, one of `saludo` (greeting) / `despedida` (farewell) / `cortesía` (courtesy — please, thanks, excuse me) / `acuerdo` (agreement) / `desacuerdo` (disagreement) / `sorpresa` (surprise/reaction) / `pregunta` (question) / `muletilla` (filler/discourse marker) / `otro` (other).\n- `register` — one of `neutro` (standard, textbook-safe) / `coloquial` (everyday informal) / `lunfardo` (Buenos Aires-specific slang).\n- `idiomatic` — `true` if the meaning isn't guessable word-by-word (e.g. \"ni en pedo\" doesn't mean anything about being drunk), `false` if it's a plain, literal combination of words.\n- `literal` — only meaningful when `idiomatic` is `true`: a short word-by-word gloss, so both the real meaning and the literal words are visible. Leave `\"\"` when `idiomatic` is `false`.\n- `notes` and `example` are both optional free text, same as for words.\n\n## Definitions, notes and examples (verbs, words and phrases)\n\n- `definition` starts with the item's **everyday meaning**, never just\n  the list's topic: \"carrito\" is \"cart\" (not \"luggage cart\") even in an\n  airport list. One item can belong to several lists, and it has only one\n  definition.\n- When the list uses a word in a **genuinely different meaning** — not\n  just a narrower case of the everyday one — add that meaning after the\n  everyday one, with a short qualifier in parentheses:\n  `\"revoque\": \"plaster (on a wall); mudcake (in a well)\"`,\n  `\"carrera\": \"race; career; logging run (in a well)\"`. \"Carrito\" gets no\n  second meaning: an airport cart is still a cart. Keep it to one added\n  meaning. The definition is what a flashcard shows as the answer, so it\n  has to contain the meaning being studied.\n- **Verbs are the exception:** keep a verb's definition to its everyday\n  meaning (\"correr\": \"to run\") and put the list's sense in `notes` and\n  `example`. A verb's flashcards show the English of each conjugated form,\n  which is generated from the definition, so a second meaning there would\n  muddle every form.\n- The list's context also goes in `example` and `notes`. `example` gives a\n  typical sentence first; if the list's use is very different from the\n  everyday one, add a second, list-specific sentence after \" / \" (the\n  flashcards show that last sentence under the answer):\n  `\"Agarrá un carrito en la entrada del súper. / Pusimos las valijas en un carrito.\"`\n- `notes` says what the item means in the list's world when that isn't\n  obvious from the definition: `\"en perfilaje: una carrera = one logging run\"`.\n  Don't use notes for bare topic labels (\"petrofísica\", \"aeropuerto\") —\n  the list itself already says that.\n\n## ⚠️ Dialect requirement — this app uses Rioplatense Spanish (voseo)\n\nEvery verb form below MUST use **vos**, never tú. This is the single\nmost common mistake a general-purpose LLM makes here, so check it\ncarefully — a wrong-but-fluent \"tú\" conjugation will look completely\nplausible and still be wrong for this app:\n\n- Present tense **does not diphthongize** for vos, even for stem-changing\n  verbs: **vos podés** (not \"puedés\"), **vos mostrás** (not \"muestrás\"),\n  **vos pedís** (not \"pidís\"), **vos medís** (not \"midís\"). Stress falls\n  on the ending, not the stem — so vos present tense is always the\n  \"regular-looking\" stem plus `-ás`/`-és`/`-ís`.\n- Affirmative vos imperative = the infinitive's stem + its final accented\n  vowel, no `-s`: **hablá, comé, viví, tené, poné, vení, decí** — never\n  the tú-form (habla, ven, di).\n- Preterite, imperfecto, futuro, condicional, and both subjunctives all\n  use the vos-shaped ending shown in the example above (which mirrors\n  \"tú\" minus the final `-s` for most tenses, except present and imperative\n  where the difference is larger).\n- Compounds of irregular verbs keep the irregularity: **obtener → obtengo,\n  obtuve, obtendré** (not a regular pattern), because it's built on\n  \"tener.\" Same logic for any verb built on **poner**, **venir**,\n  **decir**, etc.\n- Phrases should also reflect real rioplatense usage (e.g. \"¿Vos querés\n  algo?\" not \"¿Tú quieres algo?\") — a phrase generated by an LLM defaulting\n  to Spain/Mexico Spanish will read as noticeably foreign here.\n\n## What the app checks before saving anything\n\n- The file must be valid JSON matching this shape, or the whole import is\n  rejected with an error — nothing partial gets written.\n- Every verb's `forms` must have all required tense/person cells filled in.\n- Before you confirm the import, you'll see a preview of every parsed\n  verb/word/phrase. For verbs, any cell that doesn't match the app's own\n  built-in *regular* conjugation pattern is highlighted — same highlight\n  used everywhere else in the app for irregular verbs. If you marked\n  something `\"irregularity\": \"regular\"` and cells still light up, that's\n  usually the LLM having made a mistake; fix it before confirming. The\n  exception is a spelling-only change (sacar → saqué, llegar → llegue,\n  empezar → empecé, surgir → surjo): those cells light up too, are\n  correct, and stay `\"regular\"` with the change described in `pattern`.\n- Duplicates are matched by infinitive/word/phrase (case- and\n  accent-insensitive), same as the existing \"add to list\" flow — importing\n  the same file twice won't create duplicate rows.\n";

  var IMPORT_VALID_TYPES = ["-ar", "-er", "-ir"];
  var IMPORT_VALID_IRREGULARITY = ["regular", "cambio de raíz", "irregular (yo)", "irregular (total)"];
  var IMPORT_VALID_TRANSITIVITY = ["transitivo", "intransitivo", "ambos"];
  var IMPORT_VALID_POS = ["sustantivo", "adjetivo", "adverbio", "pronombre", "preposición", "conjunción", "interjección"];
  var IMPORT_VALID_GENDER = ["masculino", "femenino", "neutro", ""];
  var IMPORT_VALID_FUNCTION = ["saludo", "despedida", "cortesía", "acuerdo", "desacuerdo", "sorpresa", "pregunta", "muletilla", "otro"];
  var IMPORT_VALID_REGISTER = ["neutro", "coloquial", "lunfardo"];
  var IMPORT_TYPE_ENDING = { "-ar": "ar", "-er": "er", "-ir": "ir" };

  // Set by handleImportJsonValidate once a pass comes back clean (zero
  // blocking errors); cleared by any further edit/re-validate/close, and is
  // what handleImportJsonConfirm actually writes to Supabase.
  var importParsed = null;

  function resetImportJsonModal() {
    el.importJsonFile.value = "";
    el.importJsonTextarea.value = "";
    el.importJsonParseMsg.textContent = "";
    el.importJsonPreview.hidden = true;
    el.importJsonErrorsWrap.hidden = true;
    el.importJsonErrors.innerHTML = "";
    el.importJsonWarningsWrap.hidden = true;
    el.importJsonWarnings.innerHTML = "";
    el.importJsonPreviewListWrap.hidden = true;
    el.importJsonPreviewList.innerHTML = "";
    el.importJsonSummary.textContent = "";
    el.importJsonResultMsg.textContent = "";
    el.importJsonConfirmBtn.hidden = true;
    el.importJsonConfirmBtn.disabled = true;
    el.importSpecCopyMsg.textContent = "";
    importParsed = null;
  }

  function openImportJsonModal() {
    resetImportJsonModal();
    el.importJsonOverlay.hidden = false;
  }

  function closeImportJsonModal() {
    el.importJsonOverlay.hidden = true;
    resetImportJsonModal();
  }

  // Mirrors handleCopyLink's exact UX (same clipboard-API-then-fallback
  // shape, same "brief transient confirmation" wording style) for
  // consistency, just copying the embedded format spec instead of a share
  // link — see the <details> disclosure right below the import intro text.
  function handleCopySpec() {
    var text = IMPORT_FORMAT_SPEC;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        el.importSpecCopyMsg.textContent = t("msg_enlace_copiado");
      }).catch(function () {
        selectPreText(el.importSpecPre);
        if (tryExecCommandCopy()) el.importSpecCopyMsg.textContent = t("msg_enlace_copiado");
        else el.importSpecCopyMsg.textContent = t("msg_enlace_seleccionado");
      });
    } else {
      selectPreText(el.importSpecPre);
      if (tryExecCommandCopy()) el.importSpecCopyMsg.textContent = t("msg_enlace_copiado");
      else el.importSpecCopyMsg.textContent = t("msg_enlace_seleccionado");
    }
  }

  // <pre> isn't a form field, so there's no .select() to call — select its
  // text content via a Range/Selection instead, then try the legacy
  // execCommand("copy") fallback for browsers without navigator.clipboard.
  function selectPreText(node) {
    try {
      var range = document.createRange();
      range.selectNodeContents(node);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
  }
  function tryExecCommandCopy() {
    try { return document.execCommand("copy"); } catch (e) { return false; }
  }

  function handleImportJsonFile() {
    var file = el.importJsonFile.files && el.importJsonFile.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      el.importJsonTextarea.value = String(reader.result || "");
    };
    reader.readAsText(file);
  }

  // Structural (blocking) validation of one verb's "forms" object — every
  // one of the 7 tense keys with all 5 persons, imperativo's 4 persons, and
  // gerundio/participio, all non-empty strings. EXCEPTION: an impersonal
  // weather-type verb may supply forms.impersonal (a flat tense->string map)
  // instead, which skips the per-person checks below (gerundio/participio
  // are still required either way).
  function validateImportVerbForms(v, inf, n, rowErrors) {
    var forms = v.forms;
    if (!forms || typeof forms !== "object") {
      rowErrors.push(t("import_err_verb_missing_forms", { n: n, inf: inf }));
      return null;
    }
    var isImpersonal = !!(forms.impersonal && typeof forms.impersonal === "object");
    if (!isImpersonal) {
      TENSES.concat(SUBJ_TENSES).forEach(function (tense) {
        var block = forms[tense.key];
        if (!block || typeof block !== "object") {
          rowErrors.push(t("import_err_verb_missing_field", { n: n, inf: inf, field: tense.key }));
          return;
        }
        PERSONS.forEach(function (p) {
          var val = block[p.key];
          if (typeof val !== "string" || !val.trim()) {
            rowErrors.push(t("import_err_verb_missing_field", { n: n, inf: inf, field: tense.key + "." + p.key }));
          }
        });
      });
      var imp = forms.imperativo;
      if (!imp || typeof imp !== "object") {
        rowErrors.push(t("import_err_verb_missing_field", { n: n, inf: inf, field: "imperativo" }));
      } else {
        IMPERATIVE_PERSONS.forEach(function (p) {
          var val = imp[p.key];
          if (typeof val !== "string" || !val.trim()) {
            rowErrors.push(t("import_err_verb_missing_field", { n: n, inf: inf, field: "imperativo." + p.key }));
          }
        });
      }
    }
    if (typeof forms.gerundio !== "string" || !forms.gerundio.trim()) {
      rowErrors.push(t("import_err_verb_missing_field", { n: n, inf: inf, field: "gerundio" }));
    }
    if (typeof forms.participio !== "string" || !forms.participio.trim()) {
      rowErrors.push(t("import_err_verb_missing_field", { n: n, inf: inf, field: "participio" }));
    }
    return isImpersonal;
  }

  // Non-blocking QA pass: reuses the app's own isCellIrregular (the exact
  // same check the real conjugation table uses to shade a cell) against
  // every incoming cell of a verb declared "regular". Never blocks import —
  // just returns the mismatching cells so the preview can flag them.
  function findImportVerbWarningCells(v, inf) {
    var forms = v.forms || {};
    if (forms.impersonal && typeof forms.impersonal === "object") return [];
    var flagged = [];
    TENSES.concat(SUBJ_TENSES).forEach(function (tense) {
      var block = forms[tense.key];
      if (!block) return;
      PERSONS.forEach(function (p) {
        var val = block[p.key];
        if (typeof val === "string" && val && isCellIrregular({ infinitive: inf, reflexive: !!v.reflexive }, tense.key, p.key, val)) {
          flagged.push({ tense: tense.key, person: p.key, val: val });
        }
      });
    });
    return flagged;
  }

  function validateImportVerb(v, idx, errorsOut, warningsOut) {
    var n = idx + 1;
    var inf = (v && typeof v.infinitive === "string") ? v.infinitive.trim() : "";
    if (!inf) { errorsOut.push(t("import_err_verb_missing_infinitive", { n: n })); return null; }

    var rowErrors = [];
    var type = v && v.type;
    if (IMPORT_VALID_TYPES.indexOf(type) === -1) {
      rowErrors.push(t("import_err_verb_bad_type", { n: n, inf: inf }));
    } else {
      var base = baseInfinitive(inf, !!(v && v.reflexive));
      if (base.slice(-2).toLowerCase() !== IMPORT_TYPE_ENDING[type]) {
        rowErrors.push(t("import_err_verb_type_mismatch", { n: n, inf: inf, type: type }));
      }
    }
    if (IMPORT_VALID_IRREGULARITY.indexOf(v && v.irregularity) === -1) {
      rowErrors.push(t("import_err_verb_bad_irregularity", { n: n, inf: inf }));
    }
    if (IMPORT_VALID_TRANSITIVITY.indexOf(v && v.transitivity) === -1) {
      rowErrors.push(t("import_err_verb_bad_transitivity", { n: n, inf: inf }));
    }
    validateImportVerbForms(v || {}, inf, n, rowErrors);

    if (rowErrors.length) {
      errorsOut.push.apply(errorsOut, rowErrors);
      return null;
    }

    if (v.irregularity === "regular") {
      var flagged = findImportVerbWarningCells(v, inf);
      if (flagged.length) warningsOut.push({ n: n, inf: inf, cells: flagged });
    }

    return {
      infinitive: inf,
      definition: (typeof v.definition === "string") ? v.definition.trim() : "",
      type: type,
      irregularity: v.irregularity,
      pattern: (typeof v.pattern === "string") ? v.pattern.trim() : "",
      notes: (typeof v.notes === "string") ? v.notes.trim() : "",
      example: (typeof v.example === "string") ? v.example.trim() : "",
      transitivity: v.transitivity,
      preposicion: (typeof v.preposicion === "string") ? v.preposicion.trim() : "",
      reflexive: !!v.reflexive,
      auxiliar: !!v.auxiliar,
      gustar_like: !!v.gustar_like,
      // Optional, defaults false — an older-format import file (or one from
      // before this feature existed) simply won't have it, which is fine:
      // validation never blocks on its absence.
      also_personal_use: !!v.also_personal_use,
      forms: v.forms
    };
  }

  function validateImportWord(w, idx, errorsOut) {
    var n = idx + 1;
    var word = (w && typeof w.word === "string") ? w.word.trim() : "";
    var definition = (w && typeof w.definition === "string") ? w.definition.trim() : "";
    if (!word || !definition) { errorsOut.push(t("import_err_word_missing", { n: n })); return null; }

    var rowErrors = [];
    var pos = w.part_of_speech;
    if (IMPORT_VALID_POS.indexOf(pos) === -1) rowErrors.push(t("import_err_word_bad_pos", { n: n, word: word }));
    var gender = (w.gender === undefined || w.gender === null) ? "" : w.gender;
    if (IMPORT_VALID_GENDER.indexOf(gender) === -1) rowErrors.push(t("import_err_word_bad_gender", { n: n, word: word }));

    if (rowErrors.length) { errorsOut.push.apply(errorsOut, rowErrors); return null; }

    return {
      word: word,
      definition: definition,
      partOfSpeech: pos,
      gender: gender,
      notes: (typeof w.notes === "string") ? w.notes.trim() : "",
      example: (typeof w.example === "string") ? w.example.trim() : ""
    };
  }

  function validateImportPhrase(p, idx, errorsOut) {
    var n = idx + 1;
    var phrase = (p && typeof p.phrase === "string") ? p.phrase.trim() : "";
    var definition = (p && typeof p.definition === "string") ? p.definition.trim() : "";
    if (!phrase || !definition) { errorsOut.push(t("import_err_phrase_missing", { n: n })); return null; }

    var rowErrors = [];
    var func = p.function;
    if (IMPORT_VALID_FUNCTION.indexOf(func) === -1) rowErrors.push(t("import_err_phrase_bad_function", { n: n, phrase: phrase }));
    var register = (p.register === undefined || p.register === null || p.register === "") ? "neutro" : p.register;
    if (IMPORT_VALID_REGISTER.indexOf(register) === -1) rowErrors.push(t("import_err_phrase_bad_register", { n: n, phrase: phrase }));

    if (rowErrors.length) { errorsOut.push.apply(errorsOut, rowErrors); return null; }

    var idiomatic = !!p.idiomatic;
    return {
      phrase: phrase,
      definition: definition,
      function: func,
      register: register,
      idiomatic: idiomatic,
      literal: idiomatic && typeof p.literal === "string" ? p.literal.trim() : "",
      notes: (typeof p.notes === "string") ? p.notes.trim() : "",
      example: (typeof p.example === "string") ? p.example.trim() : ""
    };
  }

  function renderImportJsonPreview(errors, warnings, previewRows, verbCount, wordCount, phraseCount) {
    el.importJsonPreview.hidden = false;
    el.importJsonSummary.textContent = t("import_json_summary_line", { v: verbCount, w: wordCount, p: phraseCount, e: errors.length, warn: warnings.length });

    el.importJsonErrors.innerHTML = "";
    el.importJsonErrorsWrap.hidden = errors.length === 0;
    errors.forEach(function (msg) {
      var li = document.createElement("li");
      li.textContent = msg;
      el.importJsonErrors.appendChild(li);
    });

    el.importJsonWarnings.innerHTML = "";
    el.importJsonWarningsWrap.hidden = warnings.length === 0;
    warnings.forEach(function (warn) {
      var li = document.createElement("li");
      var head = document.createElement("div");
      head.textContent = t("import_warn_verb_cells", { n: warn.n, inf: warn.inf });
      li.appendChild(head);
      var chips = document.createElement("div");
      chips.className = "import-cell-chips";
      warn.cells.forEach(function (c) {
        var span = document.createElement("span");
        span.className = "irreg";
        span.textContent = c.tense + "." + c.person + ": " + c.val;
        chips.appendChild(span);
      });
      li.appendChild(chips);
      el.importJsonWarnings.appendChild(li);
    });

    el.importJsonPreviewList.innerHTML = "";
    el.importJsonPreviewListWrap.hidden = previewRows.length === 0;
    previewRows.forEach(function (row) {
      var li = document.createElement("li");
      var wrap = document.createElement("div");
      wrap.className = "card-row";
      var main = document.createElement("span");
      main.className = "inf";
      main.textContent = row.label;
      wrap.appendChild(main);
      var def = document.createElement("span");
      def.className = "def";
      def.textContent = row.definition || "";
      wrap.appendChild(def);
      li.appendChild(wrap);
      el.importJsonPreviewList.appendChild(li);
    });
  }

  function handleImportJsonValidate() {
    importParsed = null;
    el.importJsonConfirmBtn.hidden = true;
    el.importJsonConfirmBtn.disabled = true;
    el.importJsonResultMsg.textContent = "";

    var raw = el.importJsonTextarea.value.trim();
    if (!raw) {
      el.importJsonParseMsg.textContent = t("import_json_no_content");
      el.importJsonPreview.hidden = true;
      return;
    }

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      el.importJsonParseMsg.textContent = t("import_json_parse_error", { msg: e.message });
      el.importJsonPreview.hidden = true;
      return;
    }
    el.importJsonParseMsg.textContent = "";

    var errors = [];
    var warnings = [];
    var previewRows = [];
    var verbsToImport = [];
    var wordsToImport = [];
    var phrasesToImport = [];
    var listName = null;
    var rawVerbCount = 0;
    var rawWordCount = 0;
    var rawPhraseCount = 0;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      errors.push(t("import_err_not_object"));
    } else if (parsed.version !== 1) {
      // "Any other value → reject the whole file" — no per-row validation
      // is worth running against a format we don't recognize.
      errors.push(t("import_err_bad_version"));
      rawVerbCount = Array.isArray(parsed.verbs) ? parsed.verbs.length : 0;
      rawWordCount = Array.isArray(parsed.words) ? parsed.words.length : 0;
      rawPhraseCount = Array.isArray(parsed.phrases) ? parsed.phrases.length : 0;
    } else {
      if (typeof parsed.list_name === "string" && parsed.list_name.trim()) {
        listName = parsed.list_name.trim();
      }

      var verbsArr = parsed.verbs;
      if (verbsArr !== undefined && verbsArr !== null && !Array.isArray(verbsArr)) {
        errors.push(t("import_err_verbs_not_array"));
        verbsArr = [];
      }
      verbsArr = verbsArr || [];
      rawVerbCount = verbsArr.length;

      var wordsArr = parsed.words;
      if (wordsArr !== undefined && wordsArr !== null && !Array.isArray(wordsArr)) {
        errors.push(t("import_err_words_not_array"));
        wordsArr = [];
      }
      wordsArr = wordsArr || [];
      rawWordCount = wordsArr.length;

      var phrasesArr = parsed.phrases;
      if (phrasesArr !== undefined && phrasesArr !== null && !Array.isArray(phrasesArr)) {
        errors.push(t("import_err_phrases_not_array"));
        phrasesArr = [];
      }
      phrasesArr = phrasesArr || [];
      rawPhraseCount = phrasesArr.length;

      verbsArr.forEach(function (v, idx) {
        var result = validateImportVerb(v, idx, errors, warnings);
        if (result) {
          verbsToImport.push(result);
          previewRows.push({ label: result.infinitive, definition: result.definition });
        }
      });

      wordsArr.forEach(function (w, idx) {
        var result = validateImportWord(w, idx, errors);
        if (result) {
          wordsToImport.push(result);
          previewRows.push({ label: result.word, definition: result.definition });
        }
      });

      phrasesArr.forEach(function (p, idx) {
        var result = validateImportPhrase(p, idx, errors);
        if (result) {
          phrasesToImport.push(result);
          previewRows.push({ label: result.phrase, definition: result.definition });
        }
      });
    }

    renderImportJsonPreview(errors, warnings, previewRows, rawVerbCount, rawWordCount, rawPhraseCount);

    if (errors.length === 0) {
      importParsed = { verbs: verbsToImport, words: wordsToImport, phrases: phrasesToImport, listName: listName };
      el.importJsonConfirmBtn.hidden = false;
      el.importJsonConfirmBtn.disabled = false;
    }
  }

  // Finds an existing list owned by the current user with this EXACT name
  // (plain .eq() equality, scoped to the owner automatically by that
  // table's own RLS policy — see schema.sql), or creates one. Mirrors
  // handleListSubmit/handleListPickerCreate's insert shape exactly.
  function findOrCreateListByName(name) {
    return supabaseClient.from("lists").select("id, name").eq("name", name).then(function (res) {
      if (res.error) return { error: res.error };
      var match = (res.data || [])[0];
      if (match) return { id: match.id, created: false };
      return supabaseClient.from("lists").insert({
        name: name,
        owner_label: shareOwnerLabel()
      }).select().single().then(function (insRes) {
        if (insRes.error) return { error: insRes.error };
        return { id: insRes.data.id, created: true };
      });
    });
  }

  // Adds a batch of verb/word data snapshots to a list, deduping against
  // that list's EXISTING items of the same item_type — the exact same
  // normalized-infinitive/word approach addItemToList() already uses above,
  // so re-importing the same file twice never creates duplicate list_items.
  function addImportSnapshotsToList(listId, itemType, snapshots) {
    if (!snapshots.length) return Promise.resolve({ added: 0, already: 0, error: null });
    return supabaseClient.from("list_items").select("data").eq("list_id", listId).eq("item_type", itemType).then(function (res) {
      if (res.error) return { added: 0, already: 0, error: res.error };
      var existing = {};
      (res.data || []).forEach(function (row) {
        var d = row.data || {};
        existing[norm(d.infinitive || d.word || d.phrase || "")] = true;
      });
      var toInsert = [];
      var already = 0;
      snapshots.forEach(function (data) {
        var key = norm(data.infinitive || data.word || data.phrase || "");
        if (existing[key]) { already++; return; }
        existing[key] = true;
        toInsert.push({ list_id: listId, item_type: itemType, data: listSnapshot(data) });
      });
      if (!toInsert.length) return { added: 0, already: already, error: null };
      return supabaseClient.from("list_items").insert(toInsert).then(function (insRes) {
        if (insRes.error) return { added: 0, already: already, error: insRes.error };
        return { added: toInsert.length, already: already, error: null };
      });
    });
  }

  function handleImportJsonConfirm() {
    if (!importParsed || !currentUser) return;
    el.importJsonConfirmBtn.disabled = true;
    el.importJsonResultMsg.textContent = t("msg_importando");

    // Fetch the account's CURRENT verbs/words fresh (rather than trusting
    // whatever allVerbs/allWords happen to hold in memory) so the
    // already-exists check is accurate even if this tab hasn't been
    // reloaded recently.
    Promise.all([
      supabaseClient.from("verbs").select("*"),
      supabaseClient.from("words").select("*"),
      supabaseClient.from("phrases").select("*")
    ]).then(function (fetchResults) {
      var vFetch = fetchResults[0], wFetch = fetchResults[1], pFetch = fetchResults[2];
      if (vFetch.error || wFetch.error || pFetch.error) {
        var ferr = vFetch.error || wFetch.error || pFetch.error;
        el.importJsonResultMsg.textContent = t("msg_error_importar", { msg: ferr.message });
        el.importJsonConfirmBtn.disabled = false;
        return;
      }
      var existingInf = {};
      (vFetch.data || []).map(rowToVerb).forEach(function (v) { existingInf[norm(v.data.infinitive || "")] = v.data; });
      var existingWordMap = {};
      (wFetch.data || []).map(rowToWord).forEach(function (w) { existingWordMap[norm(w.data.word || "")] = w.data; });
      var existingPhraseMap = {};
      (pFetch.data || []).map(rowToPhrase).forEach(function (p) { existingPhraseMap[norm(p.data.phrase || "")] = p.data; });

      var toInsertV = [], alreadyHaveV = [];
      importParsed.verbs.forEach(function (v) {
        var key = norm(v.infinitive);
        if (existingInf[key]) { alreadyHaveV.push(existingInf[key]); return; }
        existingInf[key] = v; // guard against dupes within this same import batch
        toInsertV.push(v);
      });

      var toInsertW = [], alreadyHaveW = [];
      importParsed.words.forEach(function (w) {
        var key = norm(w.word);
        if (existingWordMap[key]) { alreadyHaveW.push(existingWordMap[key]); return; }
        existingWordMap[key] = w;
        toInsertW.push({
          word: w.word,
          definition: w.definition,
          part_of_speech: w.partOfSpeech,
          gender: w.gender,
          notes: w.notes,
          example: w.example
        });
      });

      var toInsertP = [], alreadyHaveP = [];
      importParsed.phrases.forEach(function (p) {
        var key = norm(p.phrase);
        if (existingPhraseMap[key]) { alreadyHaveP.push(existingPhraseMap[key]); return; }
        existingPhraseMap[key] = p;
        toInsertP.push({
          phrase: p.phrase,
          definition: p.definition,
          function: p.function,
          register: p.register,
          idiomatic: p.idiomatic,
          literal: p.literal,
          notes: p.notes,
          example: p.example
        });
      });

      var verbsPromise = toInsertV.length ? supabaseClient.from("verbs").insert(toInsertV).select() : Promise.resolve({ data: [], error: null });
      var wordsPromise = toInsertW.length ? supabaseClient.from("words").insert(toInsertW).select() : Promise.resolve({ data: [], error: null });
      var phrasesPromise = toInsertP.length ? supabaseClient.from("phrases").insert(toInsertP).select() : Promise.resolve({ data: [], error: null });

      Promise.all([verbsPromise, wordsPromise, phrasesPromise]).then(function (results) {
        var vRes = results[0], wRes = results[1], pRes = results[2];
        if (vRes.error || wRes.error || pRes.error) {
          var err = vRes.error || wRes.error || pRes.error;
          el.importJsonResultMsg.textContent = t("msg_error_importar", { msg: err.message });
          el.importJsonConfirmBtn.disabled = false;
          return;
        }
        if (toInsertV.length) loadVerbs();
        if (toInsertW.length) loadWords();
        if (toInsertP.length) loadPhrases();

        var insertedVerbData = (vRes.data || []).map(rowToVerb).map(function (x) { return x.data; });
        var insertedWordData = (wRes.data || []).map(rowToWord).map(function (x) { return x.data; });
        var insertedPhraseData = (pRes.data || []).map(rowToPhrase).map(function (x) { return x.data; });

        var summaryMsg = t("import_json_result_summary", {
          vIns: toInsertV.length, wIns: toInsertW.length, pIns: toInsertP.length,
          vSkip: alreadyHaveV.length, wSkip: alreadyHaveW.length, pSkip: alreadyHaveP.length
        });

        if (!importParsed.listName) {
          el.importJsonResultMsg.textContent = summaryMsg;
          return;
        }

        var allVerbSnapshots = insertedVerbData.concat(alreadyHaveV);
        var allWordSnapshots = insertedWordData.concat(alreadyHaveW);
        var allPhraseSnapshots = insertedPhraseData.concat(alreadyHaveP);

        findOrCreateListByName(importParsed.listName).then(function (listResult) {
          if (listResult.error) {
            el.importJsonResultMsg.textContent = summaryMsg + t("import_json_result_list_error", { msg: listResult.error.message });
            return;
          }
          var createdNote = listResult.created ? t("import_json_result_list_created", { name: importParsed.listName }) : "";

          Promise.all([
            addImportSnapshotsToList(listResult.id, "verb", allVerbSnapshots),
            addImportSnapshotsToList(listResult.id, "word", allWordSnapshots),
            addImportSnapshotsToList(listResult.id, "phrase", allPhraseSnapshots)
          ]).then(function (addResults) {
            var vAdd = addResults[0], wAdd = addResults[1], pAdd = addResults[2];
            var listErr = vAdd.error || wAdd.error || pAdd.error;
            var msg = summaryMsg + createdNote;
            if (listErr) {
              msg += t("import_json_result_list_error", { msg: listErr.message });
            } else {
              var addedTotal = (vAdd.added || 0) + (wAdd.added || 0) + (pAdd.added || 0);
              var alreadyTotal = (vAdd.already || 0) + (wAdd.already || 0) + (pAdd.already || 0);
              msg += t("import_json_result_list_added", { name: importParsed.listName, added: addedTotal, already: alreadyTotal });
            }
            el.importJsonResultMsg.textContent = msg;
            loadLists();
          });
        });
      });
    });
  }

  // ================= auth =================
  var authMode = "login";

  function setAuthMode(mode) {
    authMode = mode;
    el.tabLogin.classList.toggle("active", mode === "login");
    el.tabSignup.classList.toggle("active", mode === "signup");
    el.authSubmit.textContent = mode === "login" ? t("auth_submit_login") : t("auth_signup_tab");
    el.authMsg.textContent = "";
  }

  function renderAuthState() {
    if (currentUser) {
      el.authScreen.hidden = true;
      el.appScreen.hidden = false;
      el.acctMenuEmail.textContent = currentUser.email || "";
      loadUserSettings();
      loadVerbs();
      loadWords();
      loadPhrases();
      loadLists();
      loadRewards();
      loadGameRecords();
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

      allPhrases = [];
      filteredPhrases = [];
      selectedPhraseId = null;
      editingPhraseId = null;
      el.phraseDetail.hidden = true;
      el.phraseForm.hidden = true;
      el.toggleAddPhrase.hidden = false;
      el.seedPhrasesToolbarBtn.hidden = false;
      el.phraseList.innerHTML = "";
      el.phraseCount.textContent = "";

      allLists = [];
      selectedListId = null;
      el.listDetail.hidden = true;
      el.listForm.hidden = true;
      el.toggleAddList.hidden = false;
      el.listsList.innerHTML = "";
      verbListMembership = {};
      wordListMembership = {};
      phraseListMembership = {};
      refreshListFilterUI();
      offlineKinds = {};
      renderOfflineBanner();
      if (currentShareList) renderSharePreview();
    }
  }

  // What a shared-list link shows as "shared by": the name part of your
  // email, never the address itself (risk review 2026-10-05, item 6;
  // get_shared_list() also strips anything after an "@" server-side, for
  // lists saved before this).
  function shareOwnerLabel() {
    var email = (currentUser && currentUser.email) || "";
    return email.split("@")[0];
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
            el.authMsg.textContent = t("msg_email_confirmacion", { email: email });
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
  el.acctTrigger.addEventListener("click", toggleAcctMenu);
  el.acctMenuSettings.addEventListener("click", function () {
    closeAcctMenu();
    openSettings();
  });
  el.acctMenuLogout.addEventListener("click", function () {
    closeAcctMenu();
    supabaseClient.auth.signOut();
  });
  // Only this one document-level listener is needed for the outside-click
  // close, since the account menu is the only popover of its kind in the
  // app right now — if a second one is ever added, this should become a
  // shared helper rather than duplicated.
  document.addEventListener("click", function (evt) {
    if (!el.acctMenu.hidden && !evt.target.closest(".acct-menu-wrap")) {
      closeAcctMenu();
    }
  });
  el.settingsClose.addEventListener("click", closeSettings);
  el.langEs.addEventListener("click", function () { setLang("es"); });
  el.langEn.addEventListener("click", function () { setLang("en"); });
  el.settingsVoiceElena.addEventListener("click", function () { setTtsVoice("elena"); });
  el.settingsVoiceTomas.addEventListener("click", function () { setTtsVoice("tomas"); });
  el.settingsQuietOn.addEventListener("click", function () { setQuietMode(true); });
  el.settingsQuietOff.addEventListener("click", function () { setQuietMode(false); });
  el.quietToastSettings.addEventListener("click", function () { hideQuietToast(); openSettings(); });
  el.backupCreate.addEventListener("click", onBackupCreateClick);
  el.backupRestore.addEventListener("click", onBackupRestoreClick);
  el.backupDelete.addEventListener("click", function () { if (backupInfo && !backupBusy) openBackupPanel("delete"); });
  el.backupCancel.addEventListener("click", function () { closeBackupPanel(); setBackupMsg(""); });
  el.backupConfirm.addEventListener("click", onBackupConfirm);
  el.backupTypedInput.addEventListener("input", updateBackupConfirmState);
  el.backupTypedInput.addEventListener("keydown", function (e) { if (e.key === "Enter") onBackupConfirm(); });
  el.backupChoice.addEventListener("change", updateBackupConfirmState);
  document.querySelectorAll(".flash-speak-btn, .detail-speak-btn").forEach(function (b) {
    b.addEventListener("animationend", function () { b.classList.remove("quiet-nudge"); });
  });
  applyQuietMode();

  // The shared Listas facet loads once, before any tab's own filters or
  // trigger — migrateLegacyPerTabListFilters() upgrades old per-tab list
  // selections into it the first time this runs post-update (see its own
  // comment up top), and every updateListsTrigger() call below reads it.
  migrateLegacyPerTabListFilters();
  loadFilters(SHARED_LIST_STORAGE_KEY, sharedListFilter);

  el.search.addEventListener("input", renderList);
  loadFilters(filtersStorageKey("verbs"), activeVerbFilters);
  refreshChipVisuals(el.verbFilters, activeVerbFilters);
  el.verbFiltersClear.hidden = !anyFilterActive(activeVerbFilters);
  updateListsTrigger("verbs");
  wireFilterChips(el.verbFilters, el.verbFiltersClear, activeVerbFilters, filtersStorageKey("verbs"), function () {
    renderList();
    updateListsTrigger("verbs");
  });
  el.verbShowAllBtn.addEventListener("click", function () {
    clearExcludesOnly(activeVerbFilters);
    refreshChipVisuals(el.verbFilters, activeVerbFilters);
    el.verbFiltersClear.hidden = !anyFilterActive(activeVerbFilters);
    saveFilters(filtersStorageKey("verbs"), activeVerbFilters);
    renderList();
    updateListsTrigger("verbs");
  });
  el.verbListsTrigger.addEventListener("click", function () { openListFilterPicker("verbs"); });
  el.toggleAdd.addEventListener("click", function () { openForm("add"); });
  el.seedToolbarBtn.addEventListener("click", seedStarterVerbs);
  el.formCancel.addEventListener("click", closeForm);
  el.form.addEventListener("submit", handleSubmit);
  el.fRaeLookup.addEventListener("click", function () { lookupInRae("verb"); });
  el.fGustarLike.addEventListener("change", function () {
    el.fAlsoPersonalUseWrap.hidden = !el.fGustarLike.checked;
    if (!el.fGustarLike.checked) el.fAlsoPersonalUse.checked = false;
  });
  el.dGustarTabPersonal.addEventListener("click", function () {
    if (detailGustarTab === "personal") return;
    detailGustarTab = "personal";
    if (selectedId) selectVerb(selectedId);
  });
  el.dGustarTabDativo.addEventListener("click", function () {
    if (detailGustarTab === "dativo") return;
    detailGustarTab = "dativo";
    if (selectedId) selectVerb(selectedId);
  });
  el.dSpeak.addEventListener("click", function () {
    var entry = allVerbs.find(function (v) { return v.id === selectedId; });
    if (entry) playTts(entry.data.infinitive, el.dSpeak, el.dTtsMsg);
  });
  // Tap-any-conjugated-form-to-hear-it: one delegated listener on the whole
  // tbody rather than a button per cell (there are 35+ of them) — see
  // selectVerb() above for where td.speakable gets added (only to cells
  // that actually have a real form, never a bare "—"). The merged
  // usted/ustedes imperativo cell ("— / — / <real>", td.imp-col) is a
  // special case: its speakable text is just the .real span, not the
  // cell's full textContent, which would otherwise include the dash
  // placeholder and slashes — see speakableCellText() above, shared with
  // the row/column prefetch this tap also kicks off below.
  el.dConjBody.addEventListener("click", function (evt) {
    var td = evt.target.closest("td.speakable");
    if (!td || !el.dConjBody.contains(td)) return;
    playTts(speakableCellText(td), td, el.dTtsMsg);
    // See prefetchAdjacentConjugationCells() above: quietly gets a head
    // start on this cell's row and column, since either is a reasonable
    // guess at what gets tapped next.
    prefetchAdjacentConjugationCells(td);
  });
  el.dGerundio.addEventListener("click", function () {
    if (!el.dGerundio.classList.contains("speakable")) return;
    // Passes the surrounding .tile (not the .val word span itself) as the
    // element playTts() puts its .tts-active chasing-border ring on — see
    // styles.css's .nonpersonal .tile comment (2026-09-26, mason's ask):
    // the ring should trace the whole tile's box, matching how it already
    // traces a conjugation-table cell, not just hug the word's own text.
    // The click target and hover affordance stay on the word itself; only
    // which element the ring is drawn against changes.
    playTts(el.dGerundio.textContent, el.dGerundio.closest(".tile"), el.dTtsMsg);
  });
  el.dParticipio.addEventListener("click", function () {
    if (!el.dParticipio.classList.contains("speakable")) return;
    playTts(el.dParticipio.textContent, el.dParticipio.closest(".tile"), el.dTtsMsg);
  });
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
  loadFilters(filtersStorageKey("words"), activeWordFilters);
  refreshChipVisuals(el.wordFilters, activeWordFilters);
  el.wordFiltersClear.hidden = !anyFilterActive(activeWordFilters);
  updateListsTrigger("words");
  wireFilterChips(el.wordFilters, el.wordFiltersClear, activeWordFilters, filtersStorageKey("words"), function () {
    renderWordList();
    updateListsTrigger("words");
  });
  el.wordShowAllBtn.addEventListener("click", function () {
    clearExcludesOnly(activeWordFilters);
    refreshChipVisuals(el.wordFilters, activeWordFilters);
    el.wordFiltersClear.hidden = !anyFilterActive(activeWordFilters);
    saveFilters(filtersStorageKey("words"), activeWordFilters);
    renderWordList();
    updateListsTrigger("words");
  });
  el.wordListsTrigger.addEventListener("click", function () { openListFilterPicker("words"); });
  el.toggleAddWord.addEventListener("click", function () { openWordForm("add"); });
  el.seedWordsToolbarBtn.addEventListener("click", seedStarterWords);
  el.wordFormCancel.addEventListener("click", closeWordForm);
  el.wordForm.addEventListener("submit", handleWordSubmit);
  el.wfRaeLookup.addEventListener("click", function () { lookupInRae("word"); });
  el.wdSpeak.addEventListener("click", function () {
    var entry = allWords.find(function (v) { return v.id === selectedWordId; });
    if (entry) playTts(entry.data.word, el.wdSpeak, el.wdTtsMsg);
  });
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

  el.tabPhrases.addEventListener("click", function () { setMainTab("phrases"); });
  el.phraseSearch.addEventListener("input", renderPhraseList);
  loadFilters(filtersStorageKey("phrases"), activePhraseFilters);
  refreshChipVisuals(el.phraseFilters, activePhraseFilters);
  el.phraseFiltersClear.hidden = !anyFilterActive(activePhraseFilters);
  updateListsTrigger("phrases");
  wireFilterChips(el.phraseFilters, el.phraseFiltersClear, activePhraseFilters, filtersStorageKey("phrases"), function () {
    renderPhraseList();
    updateListsTrigger("phrases");
  });
  el.phraseShowAllBtn.addEventListener("click", function () {
    clearExcludesOnly(activePhraseFilters);
    refreshChipVisuals(el.phraseFilters, activePhraseFilters);
    el.phraseFiltersClear.hidden = !anyFilterActive(activePhraseFilters);
    saveFilters(filtersStorageKey("phrases"), activePhraseFilters);
    renderPhraseList();
    updateListsTrigger("phrases");
  });
  el.phraseListsTrigger.addEventListener("click", function () { openListFilterPicker("phrases"); });
  el.toggleAddPhrase.addEventListener("click", function () { openPhraseForm("add"); });
  el.seedPhrasesToolbarBtn.addEventListener("click", seedStarterPhrases);
  el.phraseFormCancel.addEventListener("click", closePhraseForm);
  el.phraseForm.addEventListener("submit", handlePhraseSubmit);
  el.pfIdiomatic.addEventListener("change", function () {
    el.pfLiteralWrap.hidden = !el.pfIdiomatic.checked;
  });
  el.pdSpeak.addEventListener("click", function () {
    var entry = allPhrases.find(function (v) { return v.id === selectedPhraseId; });
    if (entry) playTts(entry.data.phrase, el.pdSpeak, el.pdTtsMsg);
  });
  el.pdEdit.addEventListener("click", function () {
    var entry = allPhrases.find(function (v) { return v.id === selectedPhraseId; });
    if (entry) openPhraseForm("edit", entry.data);
  });
  el.pdDelete.addEventListener("click", handlePhraseDelete);
  el.pdAddToList.addEventListener("click", function () {
    var entry = allPhrases.find(function (v) { return v.id === selectedPhraseId; });
    if (entry) openListPicker("phrase", [entry.data]);
  });
  el.addFilteredPhrasesToList.addEventListener("click", function () {
    openListPicker("phrase", filteredPhrases.map(function (p) { return p.data; }));
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
  el.flashSrcPhrases.addEventListener("change", function () {
    activeFlashSources.phrases = el.flashSrcPhrases.checked;
    renderFlashSetup();
  });
  el.flashDirDef.addEventListener("change", function () { if (el.flashDirDef.checked) flashDirection = "def2word"; });
  el.flashDirWord.addEventListener("change", function () { if (el.flashDirWord.checked) flashDirection = "word2def"; });
  el.flashStartBtn.addEventListener("click", startFlashcards);
  // In a Partida, × is "Terminar": the summary first (closing is from there).
  el.flashCloseBtn.addEventListener("click", function () { if (ptActive() && !partida.paused) ptShowSummary(); else closeFlashcards(); });
  // stopPropagation on both speaker buttons — without it, a tap would also
  // bubble up to el.flashCard's own click listener (toggleFlashFlip) below
  // and flip the card at the same time as playing the audio.
  el.flashFrontSpeak.addEventListener("click", function (evt) {
    evt.stopPropagation();
    var card = flashDeck[flashIndex];
    if (card) { practiceNoteAudio(); playTts(card.frontSpeak, el.flashFrontSpeak); }
  });
  el.flashListenBtn.addEventListener("click", function (evt) {
    evt.stopPropagation();
    var card = flashDeck[flashIndex];
    if (card) { practiceNoteAudio(); playTts(card.audio, el.flashListenBtn); }
  });
  el.flashModeRead.addEventListener("click", function () { setFlashMode("leer"); renderFlashSetup(); });
  el.flashModeListen.addEventListener("click", function () { setFlashMode("escuchar"); renderFlashSetup(); });
  el.flashModeSpeak.addEventListener("click", function () { setFlashMode("hablar"); renderFlashSetup(); });
  el.flashAutoplay.addEventListener("change", function () {
    if (el.flashAutoplay.disabled) return;
    flashAutoPlay = el.flashAutoplay.checked;
    try { localStorage.setItem(FLASH_AUTOPLAY_LOCAL_KEY, flashAutoPlay ? "1" : "0"); } catch (e) {}
    renderFlashModeControls();
  });
  el.flashBackSpeak.addEventListener("click", function (evt) {
    evt.stopPropagation();
    var card = flashDeck[flashIndex];
    if (card) { hablarStopPlayback(); practiceNoteAudio(); playTts(card.backSpeak, el.flashBackSpeak); }
  });
  // Sabido toggles — see setItemKnown(). The flashcard one sits outside
  // .flash-card, so unlike the speaker buttons it needs no stopPropagation
  // to keep a tap from also flipping the card.
  el.flashKnownToggle.addEventListener("click", function () {
    var card = flashDeck[flashIndex];
    if (!card) return;
    // A verb card is one form, so it marks just that form (setVerbFormKnown);
    // words/phrases mark the item itself.
    if (card.kind === "verb" && card.formKey) setVerbFormKnown(card.data, card.formKey, !cardShowsKnown(card));
    else setItemKnown(card.kind, card.data, !card.data.known);
    setKnownToggleState(el.flashKnownToggle, cardShowsKnown(card));
    popKnownToggle(el.flashKnownToggle);
  });
  el.dKnown.addEventListener("click", function () {
    var entry = allVerbs.find(function (v) { return v.id === selectedId; });
    if (!entry) return;
    setItemKnown("verb", entry.data, !entry.data.known);
    popKnownToggle(el.dKnown);
  });
  el.wdKnown.addEventListener("click", function () {
    var entry = allWords.find(function (v) { return v.id === selectedWordId; });
    if (!entry) return;
    setItemKnown("word", entry.data, !entry.data.known);
    popKnownToggle(el.wdKnown);
  });
  el.pdKnown.addEventListener("click", function () {
    var entry = allPhrases.find(function (v) { return v.id === selectedPhraseId; });
    if (!entry) return;
    setItemKnown("phrase", entry.data, !entry.data.known);
    popKnownToggle(el.pdKnown);
  });
  el.flashGradeOtra.addEventListener("click", function () { setFlashGrade("otra"); });
  el.flashGradeBien.addEventListener("click", function () { setFlashGrade("bien"); });
  el.flashDoneClose.addEventListener("click", closeFlashcards);
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
  el.tabProgress.addEventListener("click", function () { setMainTab("progress"); });
  el.tabTopics.addEventListener("click", function () { setMainTab("topics"); });
  el.tabPlay.addEventListener("click", function () { setMainTab("play"); });
  el.playAlbumEntry.addEventListener("click", function () { openAlbum(true); });
  el.playAlbumBack.addEventListener("click", function () { openAlbum(false); });
  el.rewardGo.addEventListener("click", function () { closeReward(true); });
  el.rewardClose.addEventListener("click", function () { closeReward(false); });
  el.rewardListen.addEventListener("click", function () {
    var item = rewardShowing && albumItem(rewardShowing.rec.item_id);
    if (item) playTts(item.es, el.rewardListen, el.rewardMsg);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !el.rewardOverlay.hidden) closeReward(false);
  });
  el.toggleAddList.addEventListener("click", openListForm);
  el.listFormCancel.addEventListener("click", closeListForm);
  el.listForm.addEventListener("submit", handleListSubmit);
  el.ldShareBtn.addEventListener("click", handleShareClick);
  el.ldCopyLink.addEventListener("click", handleCopyLink);
  el.ldNativeShare.addEventListener("click", handleNativeShare);
  el.ldDelete.addEventListener("click", handleListDelete);

  el.listPickerClose.addEventListener("click", closeListPicker);
  el.listPickerCreateBtn.addEventListener("click", handleListPickerCreate);

  el.listFilterSearch.addEventListener("input", function () { renderListFilterRows(el.listFilterSearch.value); });
  el.listFilterClose.addEventListener("click", closeListFilterPicker);
  el.listFilterClearBtn.addEventListener("click", function () {
    if (!listFilterTarget) return;
    sharedListFilter.list.include.clear();
    sharedListFilter.list.exclude.clear();
    saveFilters(SHARED_LIST_STORAGE_KEY, sharedListFilter);
    renderListFilterRows(el.listFilterSearch.value);
    ["verbs", "words", "phrases"].forEach(function (tab) { updateListsTrigger(tab); rerenderTab(tab); });
  });

  el.shareCloseBtn.addEventListener("click", closeSharePreview);
  el.shareImportBtn.addEventListener("click", handleShareImport);

  el.toggleImportJson.addEventListener("click", openImportJsonModal);
  el.importJsonCancelBtn.addEventListener("click", closeImportJsonModal);
  el.importJsonFile.addEventListener("change", handleImportJsonFile);
  el.importJsonValidateBtn.addEventListener("click", handleImportJsonValidate);
  el.importJsonConfirmBtn.addEventListener("click", handleImportJsonConfirm);
  el.importSpecCopyBtn.addEventListener("click", handleCopySpec);
  el.importSpecPre.textContent = IMPORT_FORMAT_SPEC;

  // Apply the current language (the localStorage guess at this point,
  // since we don't know who's logged in yet — see loadUserSettings())
  // before anything gets built, so the very first paint is already in the
  // right language instead of flashing Spanish and then switching.
  applyGrammarLabels();
  applyI18n();

  buildConjFormTable();
  buildImperativoFormRow();
  buildTenseHeader();
  renderFlashPicker();
  el.flashCustomToggle.addEventListener("click", function () { flashCustomOpen = !flashCustomOpen; renderFlashPicker(); });
  el.flashPickAll.addEventListener("click", function () { setFlashPickAll(true); });
  el.flashPickNone.addEventListener("click", function () { setFlashPickAll(false); });

  (function restoreMainTab() {
    var saved = null;
    try { saved = localStorage.getItem("iv-main-tab"); } catch (e) {}
    if (saved === "words") setMainTab("words");
    else if (saved === "phrases") setMainTab("phrases");
    else if (saved === "flashcards") setMainTab("flashcards");
    else if (saved === "lists") setMainTab("lists");
    else if (saved === "progress") setMainTab("progress");
    else if (saved === "topics") setMainTab("topics");
    else if (saved === "play") setMainTab("play");
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
    practiceFlush();
    refreshPracticeViews();
  });
  supabaseClient.auth.getSession().then(function (res) {
    currentUser = (res.data && res.data.session) ? res.data.session.user : null;
    renderAuthState();
    practiceFlush();
    refreshPracticeViews();
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

  // PWA: register the service worker (app-shell caching for offline/
  // fast-load use). Feature-detected — no-ops in browsers without support.
  //
  // "Nueva versión" (2026-10-04): the service worker serves the saved copy
  // first and installs a new release in the background, so a new version
  // used to show up only on the NEXT start — and an installed iPhone app
  // often isn't restarted at all, just resumed. Now:
  //   - the app also checks for a new version whenever it comes back to the
  //     foreground, and every 30 minutes while open;
  //   - when a new version has taken over (controllerchange), a small toast
  //     offers "Actualizar", which reloads into it. Never automatic, so a
  //     deck in progress is never yanked away (and the practice log parks
  //     the card on screen on reload anyway — see practiceOnHide()).
  // The first-ever install also fires controllerchange; that one is ignored.
  function watchForAppUpdates() {
    if (!("serviceWorker" in navigator)) return;
    var hadController = !!navigator.serviceWorker.controller;
    var reg = null;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!hadController) { hadController = true; return; }
      showUpdateToast();
    });
    function check() { if (reg) reg.update().catch(function () {}); }
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").then(function (r) { reg = r; }).catch(function (err) {
        console.warn("No se pudo registrar el service worker:", err);
      });
    });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) check(); });
    setInterval(check, 30 * 60 * 1000);
  }
  function showUpdateToast() {
    var toast = document.getElementById("update-toast");
    if (toast) toast.hidden = false;
  }
  (function wireUpdateToast() {
    var btn = document.getElementById("update-toast-btn");
    var close = document.getElementById("update-toast-close");
    if (btn) btn.addEventListener("click", function () { window.location.reload(); });
    if (close) close.addEventListener("click", function () { document.getElementById("update-toast").hidden = true; });
  })();
  watchForAppUpdates();
})();