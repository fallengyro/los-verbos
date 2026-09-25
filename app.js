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
  // synced) preference loads — see loadUserSettings().
  var LANG_LOCAL_KEY = "iv-lang";
  var currentLang = (function () {
    try {
      var saved = localStorage.getItem(LANG_LOCAL_KEY);
      return (saved === "en" || saved === "es") ? saved : "es";
    } catch (e) {
      return "es";
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
      seed_verbs_btn: "Cargar {n} verbos de ejemplo",
      btn_add_filtered_to_list: "Agregar filtrados a una lista",
      form_title_add_verb: "Agregar verbo",
      label_infinitivo: "Infinitivo",
      label_definicion: "Definición",
      label_patron: "Patrón / notas",
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
      seed_words_btn: "Cargar {n} palabras de ejemplo",
      form_title_add_word: "Agregar palabra",
      label_palabra: "Palabra",
      label_categoria_gramatical: "Categoría gramatical",
      label_notas: "Notas / excepciones",
      placeholder_notas: "ej. femenino, pero usa “el”: el agua",
      label_ejemplo: "Oración de ejemplo",
      placeholder_ejemplo: "ej. Tomo mucha agua todos los días.",
      phrase_search_placeholder: "Escribí una frase… (ej. dale)",
      btn_add_phrase_toggle: "+ Agregar frase",
      seed_phrases_btn: "Cargar {n} frases de ejemplo",
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
      tts_play_aria: "Escuchar pronunciación",
      tts_error: "No se pudo reproducir el audio. Probá de nuevo.",
      tts_voice_elena_aria: "Voz: Elena",
      tts_voice_tomas_aria: "Voz: Tomás",
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
      seed_verbs_btn: "Load {n} example verbs",
      btn_add_filtered_to_list: "Add filtered to a list",
      form_title_add_verb: "Add verb",
      label_infinitivo: "Infinitive",
      label_definicion: "Definition",
      label_patron: "Pattern / notes",
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
      seed_words_btn: "Load {n} example words",
      form_title_add_word: "Add word",
      label_palabra: "Word",
      label_categoria_gramatical: "Part of speech",
      label_notas: "Notes / exceptions",
      placeholder_notas: "e.g. feminine, but uses “el”: el agua",
      label_ejemplo: "Example sentence",
      placeholder_ejemplo: "e.g. Tomo mucha agua todos los días.",
      phrase_search_placeholder: "Type a phrase… (e.g. dale)",
      btn_add_phrase_toggle: "+ Add phrase",
      seed_phrases_btn: "Load {n} example phrases",
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
      tts_play_aria: "Hear pronunciation",
      tts_error: "Couldn't play the audio. Try again.",
      tts_voice_elena_aria: "Voice: Elena",
      tts_voice_tomas_aria: "Voice: Tomás",
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
    "idiomática": { es: "idiomática", en: "idiomatic" }
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
    // The two toolbar "load example X" buttons include a count, so unlike
    // everything else with a data-i18n attribute they need a variable —
    // set directly here rather than through the attribute walk above.
    if (el.seedToolbarBtn) el.seedToolbarBtn.textContent = t("seed_verbs_btn", { n: STARTER_VERBS.length });
    if (el.seedWordsToolbarBtn) el.seedWordsToolbarBtn.textContent = t("seed_words_btn", { n: STARTER_WORDS.length });
    if (el.seedPhrasesToolbarBtn) el.seedPhrasesToolbarBtn.textContent = t("seed_phrases_btn", { n: STARTER_PHRASES.length });
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

  function openSettings() {
    el.settingsMsg.textContent = "";
    renderLangButtons();
    renderVoiceButtons();
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
  // means the default ('es') stands until the person picks something in
  // settings.
  function loadUserSettings() {
    if (!currentUser) return;
    supabaseClient.from("user_settings").select("lang, tts_voice").eq("user_id", currentUser.id).maybeSingle().then(function (res) {
      if (res.error) return;
      var lang = (res.data && res.data.lang) || "es";
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
    { phrase: "Todo bien", definition: "all good / no worries / it's fine", function: "otro", register: "coloquial", idiomatic: true, literal: "all good" }
  ];

  // ================= state =================
  var allVerbs = [];      // [{id, data}]
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
  // same OR-within-include / excludes-win rule as tag facets.
  var activeVerbFilters = {
    type: { include: new Set(), exclude: new Set() },
    irregularity: { include: new Set(), exclude: new Set() },
    transitivity: { include: new Set(), exclude: new Set() },
    flag: { include: new Set(), exclude: new Set() },
    list: { include: new Set(), exclude: new Set() }
  };

  var allWords = [];      // [{id, data}] — vocabulario (nouns, adjectives, etc.)
  var filteredWords = [];
  var selectedWordId = null;
  var editingWordId = null;
  var activeWordFilters = {
    pos: { include: new Set(), exclude: new Set() },
    gender: { include: new Set(), exclude: new Set() },
    list: { include: new Set(), exclude: new Set() }
  };

  var allPhrases = [];    // [{id, data}] — short common phrases/expressions
  var filteredPhrases = [];
  var selectedPhraseId = null;
  var editingPhraseId = null;
  var activePhraseFilters = {
    function: { include: new Set(), exclude: new Set() },
    register: { include: new Set(), exclude: new Set() },
    flag: { include: new Set(), exclude: new Set() },
    list: { include: new Set(), exclude: new Set() }
  };

  // shared lists — see schema.sql for the lists/list_items tables. Each list
  // is a named, curated subset of the user's own verbs or words; items are
  // stored as denormalized snapshots (see rowToList/addItemToList below).
  var allLists = [];      // [{id, data}]
  var selectedListId = null;
  var listPickerTarget = null; // { itemType: "verb"|"word", data } while #list-picker-overlay is open
  var listFilterTarget = null; // "verbs" | "words" | "phrases" while #list-filter-overlay is open — which tab's activeFilters.list the modal is currently editing
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
    dTenseRow: document.getElementById("d-tense-row"),
    dConjBody: document.getElementById("d-conj-body"),
    dConjPronounBody: document.getElementById("d-conj-pronoun-body"),
    dConjLegend: document.getElementById("d-conj-legend"),
    dGustarLegend: document.getElementById("d-gustar-legend"),
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
    flashFrontSpeak: document.getElementById("flash-front-speak"),
    flashBackMain: document.getElementById("flash-back-main"),
    flashBackSub: document.getElementById("flash-back-sub"),
    flashBackSpeak: document.getElementById("flash-back-speak"),
    flashBackBadges: document.getElementById("flash-back-badges"),
    flashTtsMsg: document.getElementById("flash-tts-msg"),
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

    var inf = document.createElement("span");
    inf.className = "inf";
    inf.textContent = data.infinitive || id;
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
      return false;
    }, ignoreExcludes)) return false;
    if (!listFacetOk(activeVerbFilters, verbListMembership[norm(v.data.infinitive || "")], ignoreExcludes)) return false;
    return true;
  }

  function renderList() {
    var q = norm(el.search.value);
    var searchOk = function (v) { return !q || norm(v.data.infinitive || v.id).indexOf(q) !== -1; };
    filtered = allVerbs.filter(function (v) { return searchOk(v) && verbPassesFacets(v, false); });
    var wouldShow = allVerbs.filter(function (v) { return searchOk(v) && verbPassesFacets(v, true); });
    filtered.sort(function (a, b) {
      return (a.data.infinitive || a.id).localeCompare(b.data.infinitive || b.id, "es");
    });
    renderHiddenCount(el.verbHiddenRow, el.verbHiddenText, wouldShow.length - filtered.length);

    el.list.innerHTML = "";
    if (filtered.length === 0) {
      var li = document.createElement("li");
      var note = document.createElement("div");
      note.className = "empty-note";
      var p = document.createElement("p");
      p.textContent = allVerbs.length === 0
        ? t("empty_no_verbs")
        : t("empty_no_verb_match", { q: el.search.value });
      note.appendChild(p);
      if (allVerbs.length === 0) {
        var seedBtn = document.createElement("button");
        seedBtn.type = "button";
        seedBtn.className = "seed-btn";
        seedBtn.textContent = t("seed_verbs_btn", { n: STARTER_VERBS.length });
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
    updateFlashCounts();
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
    el.dPattern.textContent = data.pattern || "";
    el.dPattern.style.display = data.pattern ? "" : "none";
    el.dPreposicion.textContent = data.preposicion ? t("preposicion_note", { prep: data.preposicion }) : "";
    el.dPreposicion.style.display = data.preposicion ? "" : "none";
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
        return td;
      }
      if (personKey === "nosotros") {
        td.textContent = imper.nosotros || "—";
        if (imper.nosotros) td.classList.add("speakable");
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
        impTr.appendChild(td);
      });
      SUBJ_TENSES.forEach(function (t) {
        var impTdSubj = document.createElement("td");
        impTdSubj.textContent = imp[t.key] || "—";
        if (imp[t.key]) impTdSubj.classList.add("speakable");
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
        transitivity: row.transitivity || "transitivo",
        preposicion: row.preposicion || "",
        reflexive: !!row.reflexive,
        auxiliar: !!row.auxiliar,
        gustar_like: !!row.gustar_like,
        also_personal_use: !!row.also_personal_use,
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
        allVerbs = (res.data || []).map(rowToVerb);
        renderList();
        if (selectedId) {
          var still = allVerbs.find(function (v) { return v.id === selectedId; });
          if (still) selectVerb(selectedId); else { el.detail.hidden = true; selectedId = null; }
        }
      })
      .catch(function (err) {
        var cached = readCache("verbs");
        if (!cached) { showBanner(t("msg_error_cargar_verbos", { msg: (err && err.message) || err })); return; }
        allVerbs = cached.rows.map(rowToVerb);
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
      reflexive: !!sv.reflexive,
      transitivity: sv.transitivity || "transitivo",
      preposicion: sv.preposicion || "",
      auxiliar: !!sv.auxiliar,
      gustar_like: !!sv.gustar_like,
      also_personal_use: !!sv.also_personal_use,
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
    el.verbsPanel.hidden = tab !== "verbs";
    el.wordsPanel.hidden = tab !== "words";
    el.phrasesPanel.hidden = tab !== "phrases";
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
    if (!listFacetOk(activeWordFilters, wordListMembership[norm(v.data.word || "")], ignoreExcludes)) return false;
    return true;
  }

  function renderWordList() {
    var q = norm(el.wordSearch.value);
    var searchOk = function (v) { return !q || norm(v.data.word || v.id).indexOf(q) !== -1; };
    filteredWords = allWords.filter(function (v) { return searchOk(v) && wordPassesFacets(v, false); });
    var wouldShow = allWords.filter(function (v) { return searchOk(v) && wordPassesFacets(v, true); });
    filteredWords.sort(function (a, b) {
      return (a.data.word || a.id).localeCompare(b.data.word || b.id, "es");
    });
    renderHiddenCount(el.wordHiddenRow, el.wordHiddenText, wouldShow.length - filteredWords.length);

    el.wordList.innerHTML = "";
    if (filteredWords.length === 0) {
      var li = document.createElement("li");
      var note = document.createElement("div");
      note.className = "empty-note";
      var p = document.createElement("p");
      p.textContent = allWords.length === 0
        ? t("empty_no_words")
        : t("empty_no_word_match", { q: el.wordSearch.value });
      note.appendChild(p);
      if (allWords.length === 0) {
        var seedWordsBtn = document.createElement("button");
        seedWordsBtn.type = "button";
        seedWordsBtn.className = "seed-btn";
        seedWordsBtn.textContent = t("seed_words_btn", { n: STARTER_WORDS.length });
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

    el.wdWord.textContent = data.word || id;
    el.wdDefinition.textContent = data.definition || "";
    el.wdBadges.innerHTML = "";
    if (data.partOfSpeech) el.wdBadges.appendChild(badge("type", tagLabel(data.partOfSpeech)));
    if (data.gender) el.wdBadges.appendChild(badge("gender", tagLabel(data.gender)));
    el.wdNotes.textContent = data.notes || "";
    el.wdNotes.style.display = data.notes ? "" : "none";
    el.wdExample.textContent = data.example || "";
    el.wdExample.style.display = data.example ? "" : "none";
    el.wdTtsMsg.textContent = "";

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
        if (res.error) throw res.error;
        saveCache("words", res.data || []);
        markOnline("words");
        clearBanner();
        allWords = (res.data || []).map(rowToWord);
        renderWordList();
        if (selectedWordId) {
          var still = allWords.find(function (v) { return v.id === selectedWordId; });
          if (still) selectWord(selectedWordId); else { el.wordDetail.hidden = true; selectedWordId = null; }
        }
      })
      .catch(function (err) {
        var cached = readCache("words");
        if (!cached) { showBanner(t("msg_error_cargar_vocab", { msg: (err && err.message) || err })); return; }
        allWords = cached.rows.map(rowToWord);
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

    var p = document.createElement("span");
    p.className = "inf";
    p.textContent = data.phrase || id;
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
      return false;
    }, ignoreExcludes)) return false;
    if (!listFacetOk(activePhraseFilters, phraseListMembership[norm(v.data.phrase || "")], ignoreExcludes)) return false;
    return true;
  }

  function renderPhraseList() {
    var q = norm(el.phraseSearch.value);
    var searchOk = function (v) { return !q || norm(v.data.phrase || v.id).indexOf(q) !== -1; };
    filteredPhrases = allPhrases.filter(function (v) { return searchOk(v) && phrasePassesFacets(v, false); });
    var wouldShow = allPhrases.filter(function (v) { return searchOk(v) && phrasePassesFacets(v, true); });
    filteredPhrases.sort(function (a, b) {
      return (a.data.phrase || a.id).localeCompare(b.data.phrase || b.id, "es");
    });
    renderHiddenCount(el.phraseHiddenRow, el.phraseHiddenText, wouldShow.length - filteredPhrases.length);

    el.phraseList.innerHTML = "";
    if (filteredPhrases.length === 0) {
      var li = document.createElement("li");
      var note = document.createElement("div");
      note.className = "empty-note";
      var p = document.createElement("p");
      p.textContent = allPhrases.length === 0
        ? t("empty_no_phrases")
        : t("empty_no_phrase_match", { q: el.phraseSearch.value });
      note.appendChild(p);
      if (allPhrases.length === 0) {
        var seedPhrasesBtn = document.createElement("button");
        seedPhrasesBtn.type = "button";
        seedPhrasesBtn.className = "seed-btn";
        seedPhrasesBtn.textContent = t("seed_phrases_btn", { n: STARTER_PHRASES.length });
        seedPhrasesBtn.addEventListener("click", seedStarterPhrases);
        note.appendChild(seedPhrasesBtn);
      }
      li.appendChild(note);
      el.phraseList.appendChild(li);
    } else {
      filteredPhrases.forEach(function (v) { el.phraseList.appendChild(phraseCardRow(v.id, v.data)); });
    }
    el.phraseList.scrollTop = 0;
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

    el.pdPhrase.textContent = data.phrase || id;
    el.pdDefinition.textContent = data.definition || "";
    el.pdBadges.innerHTML = "";
    if (data.function) el.pdBadges.appendChild(badge("type", tagLabel(data.function)));
    if (data.register && data.register !== "neutro") el.pdBadges.appendChild(badge("register", registerLabel(data.register)));
    if (data.idiomatic) el.pdBadges.appendChild(badge("idiomatic", tagLabel("idiomática")));
    el.pdLiteral.textContent = data.literal || "";
    el.pdLiteral.style.display = (data.idiomatic && data.literal) ? "" : "none";
    el.pdNotes.textContent = data.notes || "";
    el.pdNotes.style.display = data.notes ? "" : "none";
    el.pdExample.textContent = data.example || "";
    el.pdExample.style.display = data.example ? "" : "none";
    el.pdTtsMsg.textContent = "";

    el.phraseDetail.hidden = false;
    el.phraseDetail.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
        example: row.example || ""
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
        allPhrases = (res.data || []).map(rowToPhrase);
        renderPhraseList();
        if (selectedPhraseId) {
          var still = allPhrases.find(function (v) { return v.id === selectedPhraseId; });
          if (still) selectPhrase(selectedPhraseId); else { el.phraseDetail.hidden = true; selectedPhraseId = null; }
        }
      })
      .catch(function (err) {
        var cached = readCache("phrases");
        if (!cached) { showBanner(t("msg_error_cargar_frases", { msg: (err && err.message) || err })); return; }
        allPhrases = cached.rows.map(rowToPhrase);
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

    // Mood row: groups the tense/imperativo columns exactly like the real
    // conjugation table's own two-row header (#detail table.conj-tenses,
    // see the "mood-row"/"tense-row" rows and their .mood-row CSS) — so
    // indicative "Presente" and subjunctive "Presente" (etc.) read as
    // members of different groups instead of looking like duplicate
    // columns. The corner toggle-all cell gets rowspan="2" so it spans
    // down through both header rows.
    var moodRow = document.createElement("tr");
    moodRow.className = "mood-row";
    var cornerTh = document.createElement("th");
    cornerTh.className = "flash-matrix-corner";
    cornerTh.rowSpan = 2;
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
    moodRow.appendChild(cornerTh);

    var indicativoTh = document.createElement("th");
    indicativoTh.colSpan = TENSES.length;
    indicativoTh.textContent = t("mood_indicativo");
    moodRow.appendChild(indicativoTh);

    var subjuntivoTh = document.createElement("th");
    subjuntivoTh.colSpan = SUBJ_TENSES.length;
    subjuntivoTh.textContent = t("mood_subjuntivo");
    moodRow.appendChild(subjuntivoTh);

    var imperativoMoodTh = document.createElement("th");
    imperativoMoodTh.className = "imp-head";
    imperativoMoodTh.textContent = t("mood_imperativo");
    moodRow.appendChild(imperativoMoodTh);

    thead.appendChild(moodRow);

    var headRow = document.createElement("tr");
    headRow.className = "tense-row";

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
    [{ key: "gerundio", i18nKey: "tile_gerundio" }, { key: "participio", i18nKey: "tile_participio" }].forEach(function (item) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = t(item.i18nKey);
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
  }

  function renderFlashSetup() {
    updateFlashCounts();
    el.flashVerbOptions.hidden = !activeFlashSources.verbs;
    // The "card direction" panel is shared by words AND phrases — both are
    // plain front/back cards (no tense/person matrix), so one direction
    // toggle covers both rather than duplicating the same two radio buttons
    // a second time for phrases.
    el.flashWordOptions.hidden = !activeFlashSources.words && !activeFlashSources.phrases;

    var noSource = !activeFlashSources.verbs && !activeFlashSources.words && !activeFlashSources.phrases;
    el.flashStartBtn.disabled = noSource;
    el.flashSetupMsg.textContent = noSource ? t("flash_no_source") : "";
  }

  // A flashcard is { kind: "verb"|"word"|"phrase", data, frontMain, frontSub, backMain, backSub,
  // frontSpeak, backSpeak }. frontMain/backMain are the big headline text; the *Sub lines and
  // badges are secondary. frontSpeak/backSpeak are the TTS-friendly text for a face, and are
  // only set on the side(s) that are actually Spanish — a verb's front and back are both
  // Spanish (infinitive, conjugated form), while a word/phrase card only has one Spanish side,
  // depending on flashDirection; the other side is left undefined so renderFlashCard hides that
  // face's speaker button rather than reading an English definition in an Argentine accent.
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
              backMain: val, backSub: def ? "(" + def + ")" : "",
              frontSpeak: inf, backSpeak: val
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
            backMain: val, backSub: def ? "(" + def + ")" : "",
            frontSpeak: inf, backSpeak: val
          });
        });

        if (forms.imperativo) {
          Object.keys(IMPERATIVO_FORM_KEY).forEach(function (personKey) {
            if (!activeFlashCells.has(flashCellKey("imperativo", personKey))) return;
            var val = forms.imperativo[IMPERATIVO_FORM_KEY[personKey]] || "";
            if (!val) return;
            deck.push({
              kind: "verb", data: data,
              frontMain: inf, frontSub: IMPERATIVO_DISPLAY[personKey] + " · " + t("mood_imperativo").toLowerCase(),
              backMain: val, backSub: def ? "(" + def + ")" : "",
              frontSpeak: inf, backSpeak: val
            });
          });
        }

        [{ key: "gerundio", i18nKey: "tile_gerundio" }, { key: "participio", i18nKey: "tile_participio" }].forEach(function (item) {
          if (!activeFlashStandalone.has(item.key)) return;
          var val = forms[item.key] || "";
          if (!val) return;
          deck.push({
            kind: "verb", data: data,
            frontMain: inf, frontSub: t(item.i18nKey),
            backMain: val, backSub: def ? "(" + def + ")" : "",
            frontSpeak: inf, backSpeak: val
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
          // Front is the Spanish word (speakable); back is the English
          // definition, which a Rioplatense voice would just mangle — no
          // backSpeak here.
          deck.push({ kind: "word", data: data, frontMain: word, frontSub: "", backMain: def || "—", backSub: "", frontSpeak: word });
        } else {
          deck.push({ kind: "word", data: data, frontMain: def || word, frontSub: "", backMain: word, backSub: "", backSpeak: word });
        }
      });
    }

    if (activeFlashSources.phrases) {
      filteredPhrases.forEach(function (ph) {
        var data = ph.data;
        var phrase = data.phrase || ph.id;
        var def = data.definition || "";
        // Same shared flashDirection as words above (see renderFlashSetup's
        // comment) — "word2def" here reads as "phrase → definition".
        if (flashDirection === "word2def") {
          deck.push({ kind: "phrase", data: data, frontMain: phrase, frontSub: "", backMain: def || "—", backSub: "", frontSpeak: phrase });
        } else {
          deck.push({ kind: "phrase", data: data, frontMain: def || phrase, frontSub: "", backMain: phrase, backSub: "", backSpeak: phrase });
        }
      });
    }

    return deck;
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

  // Plays `text` in the currently-selected Azure voice, via the "tts" Edge
  // Function (see supabase/functions/tts/index.ts) — app.js never talks to
  // Azure directly, and never sees the Azure key. `btn` is the speaker
  // button (or, for the verb conjugation table, the table cell) that was
  // tapped, purely so we can show a brief "..." while the request is in
  // flight and restore it after; it plays fine without one. `msgEl` is
  // where a "couldn't play that" error gets shown — each screen with a
  // speaker button has its own small message element (flashcards:
  // flash-tts-msg, word/phrase detail: wd-tts-msg/pd-tts-msg) since only
  // one of them is ever visible at a time; defaults to flash-tts-msg so
  // existing flashcard call sites don't need to change.
  function playTts(text, btn, msgEl) {
    if (!text || ttsInFlight) return;
    if (!msgEl) msgEl = el.flashTtsMsg;
    ttsInFlight = true;
    msgEl.textContent = "";
    var originalLabel = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.innerHTML = "&hellip;"; }

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
    var ttsStartedAt = (window.performance && performance.now) ? performance.now() : Date.now();

    supabaseClient.functions.invoke("tts", { body: { text: text, voice: TTS_VOICES[ttsVoiceKey] } })
      .then(function (res) {
        var elapsedMs = Math.round(((window.performance && performance.now) ? performance.now() : Date.now()) - ttsStartedAt);
        if (res.error || !res.data || !res.data.url) throw (res.error || new Error("no_url"));
        if (res.data.cached) {
          console.log("%c[tts] cache hit%c — " + elapsedMs + "ms — \"" + text + "\"", "color:#2a8f4f;font-weight:bold", "color:inherit");
        } else {
          console.log("%c[tts] AZURE SYNTHESIS (cache miss)%c — " + elapsedMs + "ms — \"" + text + "\"", "color:#c0392b;font-weight:bold", "color:inherit");
        }
        if (!ttsAudioEl) ttsAudioEl = new Audio();
        ttsAudioEl.src = res.data.url;
        return ttsAudioEl.play();
      })
      .catch(function (err) {
        var elapsedMs = Math.round(((window.performance && performance.now) ? performance.now() : Date.now()) - ttsStartedAt);
        console.log("[tts] request failed — " + elapsedMs + "ms — \"" + text + "\"", err);
        msgEl.textContent = t("tts_error");
      })
      .then(function () {
        ttsInFlight = false;
        if (btn) { btn.disabled = false; btn.innerHTML = originalLabel; }
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
    el.flashFrontMain.textContent = card.frontMain;
    el.flashFrontSub.textContent = card.frontSub || "";
    el.flashFrontSub.style.display = card.frontSub ? "" : "none";
    el.flashBackMain.textContent = card.backMain;
    el.flashBackSub.textContent = card.backSub || "";
    el.flashBackSub.style.display = card.backSub ? "" : "none";
    el.flashBackBadges.innerHTML = "";
    el.flashBackBadges.appendChild(flashBackBadges(card));
    // A speak button only shows on a face whose text is actually Spanish —
    // for verbs that's both faces (infinitive front, conjugated form back),
    // for words/phrases only whichever side isn't the English definition
    // (see buildFlashDeck's frontSpeak/backSpeak). Reading the definition
    // aloud in an Argentine Spanish voice would just be noise.
    el.flashFrontSpeak.hidden = !card.frontSpeak;
    el.flashBackSpeak.hidden = !card.backSpeak;
    el.flashTtsMsg.textContent = "";
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
      el.flashSetupMsg.textContent = t("flash_no_cards");
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
  // the tab's list-facet selection, opening a shared modal (#list-filter-
  // overlay) with a search box and every list as a tri-state row. The
  // underlying facet — activeVerbFilters.list / activeWordFilters.list /
  // activePhraseFilters.list, each {include, exclude} — is unchanged from
  // the inline-chip version; only how it's presented changed, so
  // listFacetOk()/cycleFacetValue()/chipVisualState() are reused as-is.
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
  // its "Limpiar filtros" visibility — the two things any change to that
  // tab's list facet always needs refreshed together. Also hides the
  // whole "Listas" chip-group when there are no saved lists yet, same as
  // the old inline chip-group did.
  function updateListsTrigger(tab) {
    var refs = listsTriggerEls(tab);
    var filters = activeFiltersForTab(tab);
    refs.group.hidden = !allLists.length;
    refs.clearBtn.hidden = !anyFilterActive(filters);
    var incCount = filters.list.include.size;
    var excCount = filters.list.exclude.size;
    if (incCount + excCount === 0) {
      refs.trigger.classList.remove("has-selection");
      refs.label.textContent = t("chip_group_list");
      return;
    }
    refs.trigger.classList.add("has-selection");
    var parts = [];
    if (incCount === 1) {
      var onlyId = Array.from(filters.list.include)[0];
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
  // just not drawing a chip for it.
  function pruneStaleListFilters(tab) {
    var filters = activeFiltersForTab(tab);
    var validIds = {};
    allLists.forEach(function (l) { validIds[l.id] = true; });
    ["include", "exclude"].forEach(function (side) {
      Array.from(filters.list[side]).forEach(function (id) {
        if (!validIds[id]) filters.list[side].delete(id);
      });
    });
  }

  // Called wherever allLists changes (every loadLists(), sign-out reset,
  // language switch) — prunes stale selections, refreshes all three
  // triggers, persists, and if the picker modal happens to be open right
  // now (e.g. a background list refresh while mason is mid-pick), re-
  // renders its rows too rather than leaving them stale underneath it.
  function refreshListFilterUI() {
    ["verbs", "words", "phrases"].forEach(function (tab) {
      pruneStaleListFilters(tab);
      updateListsTrigger(tab);
      saveFilters(filtersStorageKey(tab), activeFiltersForTab(tab));
    });
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

  function renderListFilterRows(filterText) {
    if (!listFilterTarget) return;
    var tab = listFilterTarget;
    var filters = activeFiltersForTab(tab);
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
      btn.className = "picker-row state-" + chipVisualState(filters, "list", l.id);
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
        cycleFacetValue(filters, "list", l.id);
        saveFilters(filtersStorageKey(tab), filters);
        btn.className = "picker-row state-" + chipVisualState(filters, "list", l.id);
        updateListsTrigger(tab);
        rerenderTab(tab);
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
        allLists = rowsToLists(res.data);
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
        allLists = rowsToLists(cached.rows);
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
      var rows = res.data || [];
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
        toInsert.push({ list_id: listId, item_type: itemType, data: data });
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
        toInsertV.push(Object.assign({}, it.data)); // verb data keys already match column names 1:1
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
          return { list_id: listRes.data.id, item_type: it.itemType, data: it.data };
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
  var IMPORT_FORMAT_SPEC = "# voseá — Custom Content Import Format (v1)\n\nPaste this whole document into your preferred LLM, along with the source\nmaterial you want turned into study content (a webpage, a PDF, your own\nlist of words), and ask it to produce one JSON file matching the shape\nbelow. Then point voseá's import screen at that file.\n\nEverything imported lands in **your own** verbs/words/phrases — never the\napp's shared starter content — the same as adding an item by hand.\n\n## Top-level shape\n\n```json\n{\n  \"version\": 1,\n  \"list_name\": \"Petrofísica y Perfilaje de Pozos\",\n  \"verbs\": [ /* verb objects, see below */ ],\n  \"words\": [ /* word objects, see below */ ],\n  \"phrases\": [ /* phrase objects, see below */ ]\n}\n```\n\n- `version` — always `1` for this format. Lets the app detect and reject a\n  future incompatible format instead of silently importing garbage.\n- `list_name` — optional. If present, every verb/word/phrase below is also\n  added to a list with this exact name (a new list is created if none\n  matches; an existing one with the same name is added to instead of\n  duplicated). Omit this to just add items to your collection without\n  creating a list.\n- `verbs`, `words` and `phrases` are all optional arrays — include\n  whichever you have.\n\n## Verb object shape\n\n```json\n{\n  \"infinitive\": \"escalar\",\n  \"definition\": \"to scale (a log curve)\",\n  \"type\": \"-ar\",\n  \"reflexive\": false,\n  \"irregularity\": \"regular\",\n  \"pattern\": \"\",\n  \"transitivity\": \"transitivo\",\n  \"preposicion\": \"\",\n  \"auxiliar\": false,\n  \"gustar_like\": false,\n  \"forms\": {\n    \"presente\":     { \"yo\": \"escalo\",    \"vos\": \"escalás\",   \"el\": \"escala\",    \"nosotros\": \"escalamos\",    \"ellos\": \"escalan\" },\n    \"preterito\":    { \"yo\": \"escalé\",    \"vos\": \"escalaste\", \"el\": \"escaló\",    \"nosotros\": \"escalamos\",    \"ellos\": \"escalaron\" },\n    \"imperfecto\":   { \"yo\": \"escalaba\",  \"vos\": \"escalabas\", \"el\": \"escalaba\",  \"nosotros\": \"escalábamos\",  \"ellos\": \"escalaban\" },\n    \"futuro\":       { \"yo\": \"escalaré\",  \"vos\": \"escalarás\", \"el\": \"escalará\",  \"nosotros\": \"escalaremos\",  \"ellos\": \"escalarán\" },\n    \"condicional\":  { \"yo\": \"escalaría\", \"vos\": \"escalarías\",\"el\": \"escalaría\", \"nosotros\": \"escalaríamos\", \"ellos\": \"escalarían\" },\n    \"subjPresente\": { \"yo\": \"escale\",    \"vos\": \"escales\",   \"el\": \"escale\",    \"nosotros\": \"escalemos\",    \"ellos\": \"escalen\" },\n    \"subjPasado\":   { \"yo\": \"escalara\",  \"vos\": \"escalaras\", \"el\": \"escalara\",  \"nosotros\": \"escaláramos\",  \"ellos\": \"escalaran\" },\n    \"imperativo\":   { \"vos\": \"escalá\", \"usted\": \"escale\", \"nosotros\": \"escalemos\", \"ustedes\": \"escalen\" },\n    \"gerundio\": \"escalando\",\n    \"participio\": \"escalado\"\n  }\n}\n```\n\nField notes:\n- `type` — one of `-ar` / `-er` / `-ir`, must match the infinitive's ending.\n- `irregularity` — one of `regular` / `cambio de raíz` / `irregular (yo)` / `irregular (total)`.\n- `pattern` — a short free-text note on what's irregular (e.g. `\"e→i en formas acentuadas\"`), blank if fully regular.\n- `transitivity` — one of `transitivo` / `intransitivo` / `ambos`.\n- `preposicion` — a fixed preposition the verb idiomatically takes (`\"a\"`, `\"de\"`, `\"en\"`...), or `\"\"`.\n- `forms` — every tense object must have all five persons: `yo`, `vos`, `el`, `nosotros`, `ellos`. `imperativo` has only `vos`/`usted`/`nosotros`/`ustedes` (no `yo` — you can't command yourself). `gerundio` and `participio` are plain strings, not person tables.\n- Impersonal weather verbs (`llover`, `nevar`) skip the person tables entirely and use `\"forms\": { \"impersonal\": { \"presente\": \"llueve\", \"subjPasado\": \"lloviera\", ... } }` instead — there's no \"yo llueve.\"\n- Reflexive verbs (e.g. `levantarse`) write `forms` WITH the reflexive pronoun already baked into every single-table cell (`\"yo\": \"me levanto\"`, NOT just `\"levanto\"`) — the app displays exactly what's stored here, it does not add the pronoun itself at display time. `imperativo` includes it too, wherever it attaches: enclitic on `vos` (`\"vos\": \"levantate\"`), proclitic on the other three (`\"usted\": \"se levante\"`, `\"nosotros\": \"nos levantemos\"`, `\"ustedes\": \"se levanten\"`).\n\n## Word object shape\n\n```json\n{\n  \"word\": \"porosidad\",\n  \"definition\": \"porosity\",\n  \"part_of_speech\": \"sustantivo\",\n  \"gender\": \"femenino\",\n  \"notes\": \"petrofísica — measured via density or sonic logs\",\n  \"example\": \"\"\n}\n```\n\n- `part_of_speech` — one of `sustantivo` / `adjetivo` / `adverbio` / `pronombre` / `preposición` / `conjunción` / `interjección`.\n- `gender` — one of `masculino` / `femenino` / `neutro` / `\"\"` (blank for anything ungendered, e.g. most adverbs).\n- `notes` and `example` are both optional free text; `example` is a Spanish sentence using the word, if you want one.\n\n## Phrase object shape\n\nShort common phrases/expressions — kept separate from single-word\nvocabulary because a phrase doesn't have one part of speech or gender.\nInstead it has its own two facets: what it's *for* (`function`) and how\nformal/slangy it is (`register`).\n\n```json\n{\n  \"phrase\": \"Dale\",\n  \"definition\": \"okay / sure / sounds good\",\n  \"function\": \"acuerdo\",\n  \"register\": \"coloquial\",\n  \"idiomatic\": true,\n  \"literal\": \"give it / go\",\n  \"notes\": \"\",\n  \"example\": \"\"\n}\n```\n\n- `function` — the phrase's communicative role, one of `saludo` (greeting) / `despedida` (farewell) / `cortesía` (courtesy — please, thanks, excuse me) / `acuerdo` (agreement) / `desacuerdo` (disagreement) / `sorpresa` (surprise/reaction) / `pregunta` (question) / `muletilla` (filler/discourse marker) / `otro` (other).\n- `register` — one of `neutro` (standard, textbook-safe) / `coloquial` (everyday informal) / `lunfardo` (Buenos Aires-specific slang).\n- `idiomatic` — `true` if the meaning isn't guessable word-by-word (e.g. \"ni en pedo\" doesn't mean anything about being drunk), `false` if it's a plain, literal combination of words.\n- `literal` — only meaningful when `idiomatic` is `true`: a short word-by-word gloss, so both the real meaning and the literal words are visible. Leave `\"\"` when `idiomatic` is `false`.\n- `notes` and `example` are both optional free text, same as for words.\n\n## ⚠️ Dialect requirement — this app uses Rioplatense Spanish (voseo)\n\nEvery verb form below MUST use **vos**, never tú. This is the single\nmost common mistake a general-purpose LLM makes here, so check it\ncarefully — a wrong-but-fluent \"tú\" conjugation will look completely\nplausible and still be wrong for this app:\n\n- Present tense **does not diphthongize** for vos, even for stem-changing\n  verbs: **vos podés** (not \"puedés\"), **vos mostrás** (not \"muestrás\"),\n  **vos pedís** (not \"pidís\"), **vos medís** (not \"midís\"). Stress falls\n  on the ending, not the stem — so vos present tense is always the\n  \"regular-looking\" stem plus `-ás`/`-és`/`-ís`.\n- Affirmative vos imperative = the infinitive's stem + its final accented\n  vowel, no `-s`: **hablá, comé, viví, tené, poné, vení, decí** — never\n  the tú-form (habla, ven, di).\n- Preterite, imperfecto, futuro, condicional, and both subjunctives all\n  use the vos-shaped ending shown in the example above (which mirrors\n  \"tú\" minus the final `-s` for most tenses, except present and imperative\n  where the difference is larger).\n- Compounds of irregular verbs keep the irregularity: **obtener → obtengo,\n  obtuve, obtendré** (not a regular pattern), because it's built on\n  \"tener.\" Same logic for any verb built on **poner**, **venir**,\n  **decir**, etc.\n- Phrases should also reflect real rioplatense usage (e.g. \"¿Vos querés\n  algo?\" not \"¿Tú quieres algo?\") — a phrase generated by an LLM defaulting\n  to Spain/Mexico Spanish will read as noticeably foreign here.\n\n## What the app checks before saving anything\n\n- The file must be valid JSON matching this shape, or the whole import is\n  rejected with an error — nothing partial gets written.\n- Every verb's `forms` must have all required tense/person cells filled in.\n- Before you confirm the import, you'll see a preview of every parsed\n  verb/word/phrase. For verbs, any cell that doesn't match the app's own\n  built-in *regular* conjugation pattern is highlighted — same highlight\n  used everywhere else in the app for irregular verbs. If you marked\n  something `\"irregularity\": \"regular\"` and cells still light up, that's\n  the LLM having made a mistake; fix it before confirming.\n- Duplicates are matched by infinitive/word/phrase (case- and\n  accent-insensitive), same as the existing \"add to list\" flow — importing\n  the same file twice won't create duplicate rows.\n";

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
        toInsert.push({ list_id: listId, item_type: itemType, data: data });
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
  // placeholder and slashes.
  el.dConjBody.addEventListener("click", function (evt) {
    var td = evt.target.closest("td.speakable");
    if (!td || !el.dConjBody.contains(td)) return;
    var real = td.querySelector(".real");
    var text = real ? real.textContent : td.textContent;
    playTts(text, td, el.dTtsMsg);
  });
  el.dGerundio.addEventListener("click", function () {
    if (!el.dGerundio.classList.contains("speakable")) return;
    playTts(el.dGerundio.textContent, el.dGerundio, el.dTtsMsg);
  });
  el.dParticipio.addEventListener("click", function () {
    if (!el.dParticipio.classList.contains("speakable")) return;
    playTts(el.dParticipio.textContent, el.dParticipio, el.dTtsMsg);
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
    if (card) playTts(card.frontSpeak, el.flashFrontSpeak);
  });
  el.flashBackSpeak.addEventListener("click", function (evt) {
    evt.stopPropagation();
    var card = flashDeck[flashIndex];
    if (card) playTts(card.backSpeak, el.flashBackSpeak);
  });
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
    var tab = listFilterTarget;
    var filters = activeFiltersForTab(tab);
    filters.list.include.clear();
    filters.list.exclude.clear();
    saveFilters(filtersStorageKey(tab), filters);
    renderListFilterRows(el.listFilterSearch.value);
    updateListsTrigger(tab);
    rerenderTab(tab);
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
  buildFlashMatrix();
  buildFlashStandaloneToggles();

  (function restoreMainTab() {
    var saved = null;
    try { saved = localStorage.getItem("iv-main-tab"); } catch (e) {}
    if (saved === "words") setMainTab("words");
    else if (saved === "phrases") setMainTab("phrases");
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