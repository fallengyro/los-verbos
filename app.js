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
      grade_bien: "Bien",
      grade_group_aria: "Cómo te fue con esta tarjeta",
      flash_tally: "{b} bien · {o} otra vez",
      nav_progress: "Progreso",
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
      flash_mode_note_quiet: "El modo silencio está activado, así que «Escuchar» no está disponible. Podés desactivarlo en Configuración.",
      flash_autoplay: "Reproducir el audio solo",
      flash_autoplay_note: "El español suena apenas aparece (al frente, o al dar vuelta).",
      flash_autoplay_note_listen: "En «Escuchar» siempre suena.",
      flash_autoplay_note_quiet: "Silenciado por el modo silencio.",
      flash_listen_hint: "Escuchá y pensá qué es",
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
      grade_bien: "Got it",
      grade_group_aria: "How this card went",
      flash_tally: "{b} got it · {o} again",
      nav_progress: "Progress",
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
      flash_mode_note_quiet: "Quiet mode is on, so Listen isn't available. You can turn it off in Settings.",
      flash_autoplay: "Play the audio automatically",
      flash_autoplay_note: "The Spanish plays as soon as it appears (on the front, or when you flip).",
      flash_autoplay_note_listen: "In Listen it always plays.",
      flash_autoplay_note_quiet: "Muted by quiet mode.",
      flash_listen_hint: "Listen and think what it is",
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
  var flashMode = (function () { try { return localStorage.getItem(FLASH_MODE_LOCAL_KEY) === "escuchar" ? "escuchar" : "leer"; } catch (e) { return "leer"; } })();
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
    flashListenHint: document.getElementById("flash-listen-hint"),
    flashBackMeta: document.getElementById("flash-back-meta"),
    flashModeRead: document.getElementById("flash-mode-read"),
    flashModeListen: document.getElementById("flash-mode-listen"),
    flashModeNote: document.getElementById("flash-mode-note"),
    flashAutoplay: document.getElementById("flash-autoplay"),
    flashAutoplayLabel: document.getElementById("flash-autoplay-label"),
    flashAutoplayNote: document.getElementById("flash-autoplay-note"),
    flashBackMain: document.getElementById("flash-back-main"),
    flashBackSub: document.getElementById("flash-back-sub"),
    flashBackSpeak: document.getElementById("flash-back-speak"),
    flashBackBadges: document.getElementById("flash-back-badges"),
    flashBackExample: document.getElementById("flash-back-example"),
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
        msgEl.textContent = t("rae_lookup_error");
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
    el.flashFrontSub.textContent = card.frontSub || "";
    el.flashFrontSub.style.display = card.frontSub && !listen ? "" : "none";
    el.flashListenBtn.hidden = !listen;
    el.flashListenHint.hidden = !listen;
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
    renderFlashGrade(card);
    renderFlashTally();
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
    } else if (flashAutoPlayOn() && card.frontSpeak) {
      setTimeout(function () { autoPlayFlash(card.frontSpeak, el.flashFrontSpeak, token); }, 200);
    }
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

  // The sentence shown under a card's answer: an example written as
  // "everyday sentence / list sentence" shows its last part (the one in the
  // list's context); a single sentence shows as is.
  function flashExampleText(data) {
    var ex = String((data && data.example) || "").trim();
    if (!ex) return "";
    var parts = ex.split(" / ").map(function (s) { return s.trim(); }).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  }
  // Whether the back face's content is taller than the card (a long
  // definition on a short phone screen). Layout sizes, so the card's 3D
  // rotation doesn't matter.
  function flashBackOverflows() {
    var back = el.flashBackMain.parentNode;
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

  function renderFlashModeControls() {
    if (!el.flashModeRead) return;
    var mode = effectiveFlashMode();
    el.flashModeRead.classList.toggle("active", mode === "leer");
    el.flashModeListen.classList.toggle("active", mode === "escuchar");
    el.flashModeListen.disabled = quietMode;
    el.flashModeNote.textContent = t(quietMode ? "flash_mode_note_quiet" : (mode === "escuchar" ? "flash_mode_note_listen" : "flash_mode_note_read"));
    el.flashModeNote.classList.toggle("is-warn", quietMode);
    var locked = quietMode || mode === "escuchar";
    el.flashAutoplay.checked = flashAutoPlayOn();
    el.flashAutoplay.disabled = locked;
    el.flashAutoplayLabel.classList.toggle("is-disabled", locked);
    el.flashAutoplayNote.textContent = t(quietMode ? "flash_autoplay_note_quiet" : (mode === "escuchar" ? "flash_autoplay_note_listen" : "flash_autoplay_note"));
    if (el.flashWordOptions) el.flashWordOptions.hidden = (!activeFlashSources.words && !activeFlashSources.phrases) || mode === "escuchar";
  }

  function setFlashMode(mode) {
    if (mode === "escuchar" && quietMode) return;
    flashMode = mode === "escuchar" ? "escuchar" : "leer";
    try { localStorage.setItem(FLASH_MODE_LOCAL_KEY, flashMode); } catch (e) {}
    renderFlashModeControls();
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

  // One ordinary card turned into a listening card. Words/phrases must be
  // built "word2def" (Spanish on the front) before this.
  function listenCard(c) {
    var out = Object.assign({}, c, { listen: true, frontMain: "", frontSub: "", frontSpeak: "" });
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
    var cards = effectiveFlashMode() === "escuchar" ? buildListenDeck() : buildFlashDeck();
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
    flashDeck = shuffleArray(cards);
    flashIndex = 0;
    el.flashOverlay.classList.remove("is-done");
    // only the card itself flips to the opposite theme — the overlay's
    // background, topbar, and controls stay in the app's actual theme.
    el.flashCard.setAttribute("data-theme", ambientIsDark() ? "light" : "dark");
    el.flashOverlay.hidden = false;
    practiceStartSession();
    renderFlashCard();
    practiceOpenView(flashDeck[flashIndex]);
    return true;
  }

  function nextFlashCard() {
    if (!flashDeck.length) return;
    practiceCloseView();
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
    practiceCloseView();
    flashIndex--;
    renderFlashCard();
    practiceOpenView(flashDeck[flashIndex]);
  }

  function closeFlashcards() {
    practiceCloseView();
    practiceSession = null;
    practiceFlush();
    el.flashOverlay.hidden = true;
    el.flashOverlay.classList.remove("is-done");
    refreshPracticeViews();
  }

  function toggleFlashFlip() {
    el.flashCard.classList.toggle("flipped");
    practiceNoteFlip(el.flashCard.classList.contains("flipped"));
    // Leer + audio automático: the back's Spanish plays as it turns over
    // (Escuchar already played it on the front; its back has a speaker).
    var card = flashDeck[flashIndex];
    if (card && !card.listen && el.flashCard.classList.contains("flipped") && flashAutoPlayOn() && card.backSpeak) {
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
    return card.kind + "|" + practiceNorm(d.infinitive || d.word || d.phrase) + "|" + (card.formKey || "");
  }

  function practiceStartSession() {
    practiceSession = { id: practiceUuid(), pass: 1, position: 0, seen: {} };
    practiceTallyBase = { bien: 0, otra: 0 };
    flashDeck.forEach(function (c) { c._grade = null; });
    practiceView = null;
  }

  // Grades belong to a card for one pass; the next pass starts ungraded.
  function practiceEndPass() {
    if (!practiceSession) return;
    flashDeck.forEach(function (c) {
      if (c._grade) practiceTallyBase[c._grade]++;
      c._grade = null;
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
        item_key: practiceNorm(d.infinitive || d.word || d.phrase),
        form_key: card.formKey || null,
        mode: card.listen ? "escuchar" : "leer",
        direction: card.listen ? "audio" : (card.kind === "verb" ? "inf2form" : flashDirection),
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
  }

  function practiceFlush() {
    if (practiceFlushing || !currentUser || !practiceQueue.length) return;
    var mine = practiceQueue.filter(function (r) { return r.user_id === currentUser.id; });
    if (!mine.length) return;
    var batch = mine.slice(0, PRACTICE_BATCH);
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
  }

  // "5 bien · 1 otra vez" in the top bar, for this deck so far; hidden until
  // the first grade.
  function renderFlashTally() {
    if (!el.flashTally) return;
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
  var PROG_COLS = "id,session_id,shown_at,item_kind,item_key,form_key,mode,direction,pass,grade,flipped,ms_to_flip,ms_front,ms_back";
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
      if (isLearned && !wasLearned) { learnedMoves.push({ day: day, delta: 1 }); u.learnedSince = day; }
      if (!isLearned && wasLearned) { learnedMoves.push({ day: day, delta: -1 }); u.learnedSince = null; }
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
  function cardsForUnits(units) {
    var idx = progContentIndex();
    var listen = effectiveFlashMode() === "escuchar";
    var dir = listen ? "word2def" : flashDirection;
    var cards = [];
    var byVerb = {};
    units.forEach(function (u) {
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
    return listen ? cards.map(listenCard) : cards;
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
      var lb = drawListBars(P, idx);
      if (lb) body.appendChild(lb);
      return;
    }
    body.appendChild(drawDue(P, unitList));
    body.appendChild(drawWeek(P));
    var st = drawStruggles(P, unitList, idx);
    if (st) body.appendChild(st);
    var grid = drawVerbGrid(P);
    if (grid) body.appendChild(grid);
    body.appendChild(drawLearned(P, unitList));
    var lists = drawListBars(P, idx);
    if (lists) body.appendChild(lists);
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
          if (effectiveFlashMode() === "escuchar") cards = cards.map(listenCard);
          startPracticeDeck(cards);
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
    var listen = effectiveFlashMode() === "escuchar";
    var dir = listen ? "word2def" : flashDirection;
    var cards = [];
    items.forEach(function (it) {
      var entry = (idx[it.type] || {})[it.key];
      if (!entry) return;
      if (it.type === "verb") Array.prototype.push.apply(cards, verbCards(entry.data, setupVerbWant));
      else if (it.type === "word") cards.push(wordCard(entry.data, dir));
      else cards.push(phraseCard(entry.data, dir));
    });
    return listen ? cards.map(listenCard) : cards;
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
    supabaseClient.from("lists").insert({ name: name, owner_label: currentUser ? currentUser.email : "" }).select().single().then(function (res) {
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
    var coll = kind === "verb" ? allVerbs : (kind === "word" ? allWords : allPhrases);
    var id = kind === "verb" ? selectedId : (kind === "word" ? selectedWordId : selectedPhraseId);
    var entry = id ? coll.find(function (x) { return x.id === id; }) : null;
    return entry ? entry.data : null;
  }
  function drawItemHistory(bodyEl, kind, data) {
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
    refs.label.innerHTML = t("lists_trigger_prefix") + parts.join(", ") +
      ' <span class="count-badge">' + (incCount + excCount) + "</span>";
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
      owner_label: currentUser ? currentUser.email : ""
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
      owner_label: currentUser ? currentUser.email : ""
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
        owner_label: currentUser.email || ""
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
        owner_label: currentUser ? currentUser.email : ""
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
  el.flashCloseBtn.addEventListener("click", closeFlashcards);
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
  el.flashAutoplay.addEventListener("change", function () {
    if (el.flashAutoplay.disabled) return;
    flashAutoPlay = el.flashAutoplay.checked;
    try { localStorage.setItem(FLASH_AUTOPLAY_LOCAL_KEY, flashAutoPlay ? "1" : "0"); } catch (e) {}
    renderFlashModeControls();
  });
  el.flashBackSpeak.addEventListener("click", function (evt) {
    evt.stopPropagation();
    var card = flashDeck[flashIndex];
    if (card) { practiceNoteAudio(); playTts(card.backSpeak, el.flashBackSpeak); }
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
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function (err) {
        console.warn("No se pudo registrar el service worker:", err);
      });
    });
  }
})();