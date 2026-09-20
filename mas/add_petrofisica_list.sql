-- Índice Verbal — "Petrofísica y Perfilaje de Pozos" personal content
--
-- Run this ONCE in Supabase (Database → SQL Editor → New query), while
-- logged in as mason (the script uses auth.uid() via each table's default,
-- exactly like adding a verb/word by hand in the app). It does three things:
--   1. Inserts 20 verbs (with full conjugation tables) into your own
--      `verbs` rows.
--   2. Inserts 33 words into your own `words` rows.
--   3. Creates one new list, "Petrofísica y Perfilaje de Pozos", and adds
--      all 53 of the above to it as a snapshot (same shape the app's own
--      "add to list" button writes), so you can filter to just this set
--      from "Mis Listas" whenever you want to study it specifically.
--
-- This never touches the shared starter/default content — every insert
-- below writes to *your* verbs/words tables (RLS-scoped to your user_id
-- the same way every other row you've added by hand already is), so a
-- fresh account someone else creates is completely unaffected.
--
-- Source: the petrophysics/well-logging vocabulary project (9 Venezuela
-- articles, El Trapial paper, GEOLOGIA-CUENCA-NEUQUINA book, and the Sieben
-- thesis on Vaca Muerta well-log characterization), frequency-ranked from
-- real source text plus a "well-logging emphasis" set of the highest-value
-- terms (Passey method, Vsh, brittleness index, named logs).

-- ===========================================================================
-- 1. VERBS
-- ===========================================================================

insert into public.verbs (infinitive, definition, type, irregularity, pattern, reflexive, transitivity, preposicion, auxiliar, forms) values

('utilizar', 'to use, to utilize', '-ar', 'regular', 'cambio ortográfico z→c ante "e" (utilicé, utilice...)', false, 'transitivo', '', false,
'{"presente":{"yo":"utilizo","vos":"utilizás","el":"utiliza","nosotros":"utilizamos","ellos":"utilizan"},"preterito":{"yo":"utilicé","vos":"utilizaste","el":"utilizó","nosotros":"utilizamos","ellos":"utilizaron"},"imperfecto":{"yo":"utilizaba","vos":"utilizabas","el":"utilizaba","nosotros":"utilizábamos","ellos":"utilizaban"},"futuro":{"yo":"utilizaré","vos":"utilizarás","el":"utilizará","nosotros":"utilizaremos","ellos":"utilizarán"},"condicional":{"yo":"utilizaría","vos":"utilizarías","el":"utilizaría","nosotros":"utilizaríamos","ellos":"utilizarían"},"subjPresente":{"yo":"utilice","vos":"utilices","el":"utilice","nosotros":"utilicemos","ellos":"utilicen"},"subjPasado":{"yo":"utilizara","vos":"utilizaras","el":"utilizara","nosotros":"utilizáramos","ellos":"utilizaran"},"imperativo":{"vos":"utilizá","usted":"utilice","nosotros":"utilicemos","ustedes":"utilicen"},"gerundio":"utilizando","participio":"utilizado"}'::jsonb),

('obtener', 'to obtain', '-er', 'cambio de raíz', 'irregular como "tener" (obtengo, obtuve, obtendré...)', false, 'transitivo', '', false,
'{"presente":{"yo":"obtengo","vos":"obtenés","el":"obtiene","nosotros":"obtenemos","ellos":"obtienen"},"preterito":{"yo":"obtuve","vos":"obtuviste","el":"obtuvo","nosotros":"obtuvimos","ellos":"obtuvieron"},"imperfecto":{"yo":"obtenía","vos":"obtenías","el":"obtenía","nosotros":"obteníamos","ellos":"obtenían"},"futuro":{"yo":"obtendré","vos":"obtendrás","el":"obtendrá","nosotros":"obtendremos","ellos":"obtendrán"},"condicional":{"yo":"obtendría","vos":"obtendrías","el":"obtendría","nosotros":"obtendríamos","ellos":"obtendrían"},"subjPresente":{"yo":"obtenga","vos":"obtengas","el":"obtenga","nosotros":"obtengamos","ellos":"obtengan"},"subjPasado":{"yo":"obtuviera","vos":"obtuvieras","el":"obtuviera","nosotros":"obtuviéramos","ellos":"obtuvieran"},"imperativo":{"vos":"obtené","usted":"obtenga","nosotros":"obtengamos","ustedes":"obtengan"},"gerundio":"obteniendo","participio":"obtenido"}'::jsonb),

('interpretar', 'to interpret (a well log)', '-ar', 'regular', '', false, 'transitivo', '', false,
'{"presente":{"yo":"interpreto","vos":"interpretás","el":"interpreta","nosotros":"interpretamos","ellos":"interpretan"},"preterito":{"yo":"interpreté","vos":"interpretaste","el":"interpretó","nosotros":"interpretamos","ellos":"interpretaron"},"imperfecto":{"yo":"interpretaba","vos":"interpretabas","el":"interpretaba","nosotros":"interpretábamos","ellos":"interpretaban"},"futuro":{"yo":"interpretaré","vos":"interpretarás","el":"interpretará","nosotros":"interpretaremos","ellos":"interpretarán"},"condicional":{"yo":"interpretaría","vos":"interpretarías","el":"interpretaría","nosotros":"interpretaríamos","ellos":"interpretarían"},"subjPresente":{"yo":"interprete","vos":"interpretes","el":"interprete","nosotros":"interpretemos","ellos":"interpreten"},"subjPasado":{"yo":"interpretara","vos":"interpretaras","el":"interpretara","nosotros":"interpretáramos","ellos":"interpretaran"},"imperativo":{"vos":"interpretá","usted":"interprete","nosotros":"interpretemos","ustedes":"interpreten"},"gerundio":"interpretando","participio":"interpretado"}'::jsonb),

('presentar', 'to present, to display (data/results)', '-ar', 'regular', '', false, 'transitivo', '', false,
'{"presente":{"yo":"presento","vos":"presentás","el":"presenta","nosotros":"presentamos","ellos":"presentan"},"preterito":{"yo":"presenté","vos":"presentaste","el":"presentó","nosotros":"presentamos","ellos":"presentaron"},"imperfecto":{"yo":"presentaba","vos":"presentabas","el":"presentaba","nosotros":"presentábamos","ellos":"presentaban"},"futuro":{"yo":"presentaré","vos":"presentarás","el":"presentará","nosotros":"presentaremos","ellos":"presentarán"},"condicional":{"yo":"presentaría","vos":"presentarías","el":"presentaría","nosotros":"presentaríamos","ellos":"presentarían"},"subjPresente":{"yo":"presente","vos":"presentes","el":"presente","nosotros":"presentemos","ellos":"presenten"},"subjPasado":{"yo":"presentara","vos":"presentaras","el":"presentara","nosotros":"presentáramos","ellos":"presentaran"},"imperativo":{"vos":"presentá","usted":"presente","nosotros":"presentemos","ustedes":"presenten"},"gerundio":"presentando","participio":"presentado"}'::jsonb),

('permitir', 'to allow, to permit', '-ir', 'regular', '', false, 'transitivo', '', false,
'{"presente":{"yo":"permito","vos":"permitís","el":"permite","nosotros":"permitimos","ellos":"permiten"},"preterito":{"yo":"permití","vos":"permitiste","el":"permitió","nosotros":"permitimos","ellos":"permitieron"},"imperfecto":{"yo":"permitía","vos":"permitías","el":"permitía","nosotros":"permitíamos","ellos":"permitían"},"futuro":{"yo":"permitiré","vos":"permitirás","el":"permitirá","nosotros":"permitiremos","ellos":"permitirán"},"condicional":{"yo":"permitiría","vos":"permitirías","el":"permitiría","nosotros":"permitiríamos","ellos":"permitirían"},"subjPresente":{"yo":"permita","vos":"permitas","el":"permita","nosotros":"permitamos","ellos":"permitan"},"subjPasado":{"yo":"permitiera","vos":"permitieras","el":"permitiera","nosotros":"permitiéramos","ellos":"permitieran"},"imperativo":{"vos":"permití","usted":"permita","nosotros":"permitamos","ustedes":"permitan"},"gerundio":"permitiendo","participio":"permitido"}'::jsonb),

('medir', 'to measure', '-ir', 'cambio de raíz', 'e→i en formas acentuadas y en 3ª persona del pretérito', false, 'transitivo', '', false,
'{"presente":{"yo":"mido","vos":"medís","el":"mide","nosotros":"medimos","ellos":"miden"},"preterito":{"yo":"medí","vos":"mediste","el":"midió","nosotros":"medimos","ellos":"midieron"},"imperfecto":{"yo":"medía","vos":"medías","el":"medía","nosotros":"medíamos","ellos":"medían"},"futuro":{"yo":"mediré","vos":"medirás","el":"medirá","nosotros":"mediremos","ellos":"medirán"},"condicional":{"yo":"mediría","vos":"medirías","el":"mediría","nosotros":"mediríamos","ellos":"medirían"},"subjPresente":{"yo":"mida","vos":"midas","el":"mida","nosotros":"midamos","ellos":"midan"},"subjPasado":{"yo":"midiera","vos":"midieras","el":"midiera","nosotros":"midiéramos","ellos":"midieran"},"imperativo":{"vos":"medí","usted":"mida","nosotros":"midamos","ustedes":"midan"},"gerundio":"midiendo","participio":"medido"}'::jsonb),

('observar', 'to observe', '-ar', 'regular', '', false, 'transitivo', '', false,
'{"presente":{"yo":"observo","vos":"observás","el":"observa","nosotros":"observamos","ellos":"observan"},"preterito":{"yo":"observé","vos":"observaste","el":"observó","nosotros":"observamos","ellos":"observaron"},"imperfecto":{"yo":"observaba","vos":"observabas","el":"observaba","nosotros":"observábamos","ellos":"observaban"},"futuro":{"yo":"observaré","vos":"observarás","el":"observará","nosotros":"observaremos","ellos":"observarán"},"condicional":{"yo":"observaría","vos":"observarías","el":"observaría","nosotros":"observaríamos","ellos":"observarían"},"subjPresente":{"yo":"observe","vos":"observes","el":"observe","nosotros":"observemos","ellos":"observen"},"subjPasado":{"yo":"observara","vos":"observaras","el":"observara","nosotros":"observáramos","ellos":"observaran"},"imperativo":{"vos":"observá","usted":"observe","nosotros":"observemos","ustedes":"observen"},"gerundio":"observando","participio":"observado"}'::jsonb),

('mostrar', 'to show', '-ar', 'cambio de raíz', 'o→ue en formas acentuadas', false, 'transitivo', '', false,
'{"presente":{"yo":"muestro","vos":"mostrás","el":"muestra","nosotros":"mostramos","ellos":"muestran"},"preterito":{"yo":"mostré","vos":"mostraste","el":"mostró","nosotros":"mostramos","ellos":"mostraron"},"imperfecto":{"yo":"mostraba","vos":"mostrabas","el":"mostraba","nosotros":"mostrábamos","ellos":"mostraban"},"futuro":{"yo":"mostraré","vos":"mostrarás","el":"mostrará","nosotros":"mostraremos","ellos":"mostrarán"},"condicional":{"yo":"mostraría","vos":"mostrarías","el":"mostraría","nosotros":"mostraríamos","ellos":"mostrarían"},"subjPresente":{"yo":"muestre","vos":"muestres","el":"muestre","nosotros":"mostremos","ellos":"muestren"},"subjPasado":{"yo":"mostrara","vos":"mostraras","el":"mostrara","nosotros":"mostráramos","ellos":"mostraran"},"imperativo":{"vos":"mostrá","usted":"muestre","nosotros":"mostremos","ustedes":"muestren"},"gerundio":"mostrando","participio":"mostrado"}'::jsonb),

('generar', 'to generate (hydrocarbons)', '-ar', 'regular', '', false, 'transitivo', '', false,
'{"presente":{"yo":"genero","vos":"generás","el":"genera","nosotros":"generamos","ellos":"generan"},"preterito":{"yo":"generé","vos":"generaste","el":"generó","nosotros":"generamos","ellos":"generaron"},"imperfecto":{"yo":"generaba","vos":"generabas","el":"generaba","nosotros":"generábamos","ellos":"generaban"},"futuro":{"yo":"generaré","vos":"generarás","el":"generará","nosotros":"generaremos","ellos":"generarán"},"condicional":{"yo":"generaría","vos":"generarías","el":"generaría","nosotros":"generaríamos","ellos":"generarían"},"subjPresente":{"yo":"genere","vos":"generes","el":"genere","nosotros":"generemos","ellos":"generen"},"subjPasado":{"yo":"generara","vos":"generaras","el":"generara","nosotros":"generáramos","ellos":"generaran"},"imperativo":{"vos":"generá","usted":"genere","nosotros":"generemos","ustedes":"generen"},"gerundio":"generando","participio":"generado"}'::jsonb),

('determinar', 'to determine', '-ar', 'regular', '', false, 'transitivo', '', false,
'{"presente":{"yo":"determino","vos":"determinás","el":"determina","nosotros":"determinamos","ellos":"determinan"},"preterito":{"yo":"determiné","vos":"determinaste","el":"determinó","nosotros":"determinamos","ellos":"determinaron"},"imperfecto":{"yo":"determinaba","vos":"determinabas","el":"determinaba","nosotros":"determinábamos","ellos":"determinaban"},"futuro":{"yo":"determinaré","vos":"determinarás","el":"determinará","nosotros":"determinaremos","ellos":"determinarán"},"condicional":{"yo":"determinaría","vos":"determinarías","el":"determinaría","nosotros":"determinaríamos","ellos":"determinarían"},"subjPresente":{"yo":"determine","vos":"determines","el":"determine","nosotros":"determinemos","ellos":"determinen"},"subjPasado":{"yo":"determinara","vos":"determinaras","el":"determinara","nosotros":"determináramos","ellos":"determinaran"},"imperativo":{"vos":"determiná","usted":"determine","nosotros":"determinemos","ustedes":"determinen"},"gerundio":"determinando","participio":"determinado"}'::jsonb),

('representar', 'to represent, to plot', '-ar', 'regular', '', false, 'transitivo', '', false,
'{"presente":{"yo":"represento","vos":"representás","el":"representa","nosotros":"representamos","ellos":"representan"},"preterito":{"yo":"representé","vos":"representaste","el":"representó","nosotros":"representamos","ellos":"representaron"},"imperfecto":{"yo":"representaba","vos":"representabas","el":"representaba","nosotros":"representábamos","ellos":"representaban"},"futuro":{"yo":"representaré","vos":"representarás","el":"representará","nosotros":"representaremos","ellos":"representarán"},"condicional":{"yo":"representaría","vos":"representarías","el":"representaría","nosotros":"representaríamos","ellos":"representarían"},"subjPresente":{"yo":"represente","vos":"representes","el":"represente","nosotros":"representemos","ellos":"representen"},"subjPasado":{"yo":"representara","vos":"representaras","el":"representara","nosotros":"representáramos","ellos":"representaran"},"imperativo":{"vos":"representá","usted":"represente","nosotros":"representemos","ustedes":"representen"},"gerundio":"representando","participio":"representado"}'::jsonb),

('contener', 'to contain', '-er', 'cambio de raíz', 'irregular como "tener" (contengo, contuve, contendré...)', false, 'transitivo', '', false,
'{"presente":{"yo":"contengo","vos":"contenés","el":"contiene","nosotros":"contenemos","ellos":"contienen"},"preterito":{"yo":"contuve","vos":"contuviste","el":"contuvo","nosotros":"contuvimos","ellos":"contuvieron"},"imperfecto":{"yo":"contenía","vos":"contenías","el":"contenía","nosotros":"conteníamos","ellos":"contenían"},"futuro":{"yo":"contendré","vos":"contendrás","el":"contendrá","nosotros":"contendremos","ellos":"contendrán"},"condicional":{"yo":"contendría","vos":"contendrías","el":"contendría","nosotros":"contendríamos","ellos":"contendrían"},"subjPresente":{"yo":"contenga","vos":"contengas","el":"contenga","nosotros":"contengamos","ellos":"contengan"},"subjPasado":{"yo":"contuviera","vos":"contuvieras","el":"contuviera","nosotros":"contuviéramos","ellos":"contuvieran"},"imperativo":{"vos":"contené","usted":"contenga","nosotros":"contengamos","ustedes":"contengan"},"gerundio":"conteniendo","participio":"contenido"}'::jsonb),

('fracturar', 'to fracture (hydraulically)', '-ar', 'regular', '', false, 'transitivo', '', false,
'{"presente":{"yo":"fracturo","vos":"fracturás","el":"fractura","nosotros":"fracturamos","ellos":"fracturan"},"preterito":{"yo":"fracturé","vos":"fracturaste","el":"fracturó","nosotros":"fracturamos","ellos":"fracturaron"},"imperfecto":{"yo":"fracturaba","vos":"fracturabas","el":"fracturaba","nosotros":"fracturábamos","ellos":"fracturaban"},"futuro":{"yo":"fracturaré","vos":"fracturarás","el":"fracturará","nosotros":"fracturaremos","ellos":"fracturarán"},"condicional":{"yo":"fracturaría","vos":"fracturarías","el":"fracturaría","nosotros":"fracturaríamos","ellos":"fracturarían"},"subjPresente":{"yo":"fracture","vos":"fractures","el":"fracture","nosotros":"fracturemos","ellos":"fracturen"},"subjPasado":{"yo":"fracturara","vos":"fracturaras","el":"fracturara","nosotros":"fracturáramos","ellos":"fracturaran"},"imperativo":{"vos":"fracturá","usted":"fracture","nosotros":"fracturemos","ustedes":"fracturen"},"gerundio":"fracturando","participio":"fracturado"}'::jsonb),

('caracterizar', 'to characterize', '-ar', 'regular', 'cambio ortográfico z→c ante "e" (caractericé, caracterice...)', false, 'transitivo', '', false,
'{"presente":{"yo":"caracterizo","vos":"caracterizás","el":"caracteriza","nosotros":"caracterizamos","ellos":"caracterizan"},"preterito":{"yo":"caractericé","vos":"caracterizaste","el":"caracterizó","nosotros":"caracterizamos","ellos":"caracterizaron"},"imperfecto":{"yo":"caracterizaba","vos":"caracterizabas","el":"caracterizaba","nosotros":"caracterizábamos","ellos":"caracterizaban"},"futuro":{"yo":"caracterizaré","vos":"caracterizarás","el":"caracterizará","nosotros":"caracterizaremos","ellos":"caracterizarán"},"condicional":{"yo":"caracterizaría","vos":"caracterizarías","el":"caracterizaría","nosotros":"caracterizaríamos","ellos":"caracterizarían"},"subjPresente":{"yo":"caracterice","vos":"caracterices","el":"caracterice","nosotros":"caractericemos","ellos":"caractericen"},"subjPasado":{"yo":"caracterizara","vos":"caracterizaras","el":"caracterizara","nosotros":"caracterizáramos","ellos":"caracterizaran"},"imperativo":{"vos":"caracterizá","usted":"caracterice","nosotros":"caractericemos","ustedes":"caractericen"},"gerundio":"caracterizando","participio":"caracterizado"}'::jsonb),

('escalar', 'to scale (a log curve)', '-ar', 'regular', '', false, 'transitivo', '', false,
'{"presente":{"yo":"escalo","vos":"escalás","el":"escala","nosotros":"escalamos","ellos":"escalan"},"preterito":{"yo":"escalé","vos":"escalaste","el":"escaló","nosotros":"escalamos","ellos":"escalaron"},"imperfecto":{"yo":"escalaba","vos":"escalabas","el":"escalaba","nosotros":"escalábamos","ellos":"escalaban"},"futuro":{"yo":"escalaré","vos":"escalarás","el":"escalará","nosotros":"escalaremos","ellos":"escalarán"},"condicional":{"yo":"escalaría","vos":"escalarías","el":"escalaría","nosotros":"escalaríamos","ellos":"escalarían"},"subjPresente":{"yo":"escale","vos":"escales","el":"escale","nosotros":"escalemos","ellos":"escalen"},"subjPasado":{"yo":"escalara","vos":"escalaras","el":"escalara","nosotros":"escaláramos","ellos":"escalaran"},"imperativo":{"vos":"escalá","usted":"escale","nosotros":"escalemos","ustedes":"escalen"},"gerundio":"escalando","participio":"escalado"}'::jsonb),

('calcular', 'to calculate', '-ar', 'regular', '', false, 'transitivo', '', false,
'{"presente":{"yo":"calculo","vos":"calculás","el":"calcula","nosotros":"calculamos","ellos":"calculan"},"preterito":{"yo":"calculé","vos":"calculaste","el":"calculó","nosotros":"calculamos","ellos":"calcularon"},"imperfecto":{"yo":"calculaba","vos":"calculabas","el":"calculaba","nosotros":"calculábamos","ellos":"calculaban"},"futuro":{"yo":"calcularé","vos":"calcularás","el":"calculará","nosotros":"calcularemos","ellos":"calcularán"},"condicional":{"yo":"calcularía","vos":"calcularías","el":"calcularía","nosotros":"calcularíamos","ellos":"calcularían"},"subjPresente":{"yo":"calcule","vos":"calcules","el":"calcule","nosotros":"calculemos","ellos":"calculen"},"subjPasado":{"yo":"calculara","vos":"calcularas","el":"calculara","nosotros":"calculáramos","ellos":"calcularan"},"imperativo":{"vos":"calculá","usted":"calcule","nosotros":"calculemos","ustedes":"calculen"},"gerundio":"calculando","participio":"calculado"}'::jsonb),

('registrar', 'to log, to record (a well)', '-ar', 'regular', '', false, 'transitivo', '', false,
'{"presente":{"yo":"registro","vos":"registrás","el":"registra","nosotros":"registramos","ellos":"registran"},"preterito":{"yo":"registré","vos":"registraste","el":"registró","nosotros":"registramos","ellos":"registraron"},"imperfecto":{"yo":"registraba","vos":"registrabas","el":"registraba","nosotros":"registrábamos","ellos":"registraban"},"futuro":{"yo":"registraré","vos":"registrarás","el":"registrará","nosotros":"registraremos","ellos":"registrarán"},"condicional":{"yo":"registraría","vos":"registrarías","el":"registraría","nosotros":"registraríamos","ellos":"registrarían"},"subjPresente":{"yo":"registre","vos":"registres","el":"registre","nosotros":"registremos","ellos":"registren"},"subjPasado":{"yo":"registrara","vos":"registraras","el":"registrara","nosotros":"registráramos","ellos":"registraran"},"imperativo":{"vos":"registrá","usted":"registre","nosotros":"registremos","ustedes":"registren"},"gerundio":"registrando","participio":"registrado"}'::jsonb),

('perfilar', 'to log (run a wireline log)', '-ar', 'regular', '', false, 'transitivo', '', false,
'{"presente":{"yo":"perfilo","vos":"perfilás","el":"perfila","nosotros":"perfilamos","ellos":"perfilan"},"preterito":{"yo":"perfilé","vos":"perfilaste","el":"perfiló","nosotros":"perfilamos","ellos":"perfilaron"},"imperfecto":{"yo":"perfilaba","vos":"perfilabas","el":"perfilaba","nosotros":"perfilábamos","ellos":"perfilaban"},"futuro":{"yo":"perfilaré","vos":"perfilarás","el":"perfilará","nosotros":"perfilaremos","ellos":"perfilarán"},"condicional":{"yo":"perfilaría","vos":"perfilarías","el":"perfilaría","nosotros":"perfilaríamos","ellos":"perfilarían"},"subjPresente":{"yo":"perfile","vos":"perfiles","el":"perfile","nosotros":"perfilemos","ellos":"perfilen"},"subjPasado":{"yo":"perfilara","vos":"perfilaras","el":"perfilara","nosotros":"perfiláramos","ellos":"perfilaran"},"imperativo":{"vos":"perfilá","usted":"perfile","nosotros":"perfilemos","ustedes":"perfilen"},"gerundio":"perfilando","participio":"perfilado"}'::jsonb),

('superponer', 'to overlay, to superimpose (log curves)', '-er', 'irregular (yo)', 'irregular como "poner" (superpongo; participio irregular: superpuesto)', false, 'transitivo', '', false,
'{"presente":{"yo":"superpongo","vos":"superponés","el":"superpone","nosotros":"superponemos","ellos":"superponen"},"preterito":{"yo":"superpuse","vos":"superpusiste","el":"superpuso","nosotros":"superpusimos","ellos":"superpusieron"},"imperfecto":{"yo":"superponía","vos":"superponías","el":"superponía","nosotros":"superponíamos","ellos":"superponían"},"futuro":{"yo":"superpondré","vos":"superpondrás","el":"superpondrá","nosotros":"superpondremos","ellos":"superpondrán"},"condicional":{"yo":"superpondría","vos":"superpondrías","el":"superpondría","nosotros":"superpondríamos","ellos":"superpondrían"},"subjPresente":{"yo":"superponga","vos":"superpongas","el":"superponga","nosotros":"superpongamos","ellos":"superpongan"},"subjPasado":{"yo":"superpusiera","vos":"superpusieras","el":"superpusiera","nosotros":"superpusiéramos","ellos":"superpusieran"},"imperativo":{"vos":"superponé","usted":"superponga","nosotros":"superpongamos","ustedes":"superpongan"},"gerundio":"superponiendo","participio":"superpuesto"}'::jsonb),

('evidenciar', 'to reveal, to show evidence of', '-ar', 'regular', '', false, 'transitivo', '', false,
'{"presente":{"yo":"evidencio","vos":"evidenciás","el":"evidencia","nosotros":"evidenciamos","ellos":"evidencian"},"preterito":{"yo":"evidencié","vos":"evidenciaste","el":"evidenció","nosotros":"evidenciamos","ellos":"evidenciaron"},"imperfecto":{"yo":"evidenciaba","vos":"evidenciabas","el":"evidenciaba","nosotros":"evidenciábamos","ellos":"evidenciaban"},"futuro":{"yo":"evidenciaré","vos":"evidenciarás","el":"evidenciará","nosotros":"evidenciaremos","ellos":"evidenciarán"},"condicional":{"yo":"evidenciaría","vos":"evidenciarías","el":"evidenciaría","nosotros":"evidenciaríamos","ellos":"evidenciarían"},"subjPresente":{"yo":"evidencie","vos":"evidencies","el":"evidencie","nosotros":"evidenciemos","ellos":"evidencien"},"subjPasado":{"yo":"evidenciara","vos":"evidenciaras","el":"evidenciara","nosotros":"evidenciáramos","ellos":"evidenciaran"},"imperativo":{"vos":"evidenciá","usted":"evidencie","nosotros":"evidenciemos","ustedes":"evidencien"},"gerundio":"evidenciando","participio":"evidenciado"}'::jsonb)

;

-- ===========================================================================
-- 2. WORDS
-- ===========================================================================

insert into public.words (word, definition, part_of_speech, gender, notes) values
('registro', 'log (well log)', 'sustantivo', 'masculino', 'petrofísica / perfilaje de pozos — sinónimo: "perfil"'),
('perfil', 'log, profile (well log)', 'sustantivo', 'masculino', 'petrofísica / perfilaje de pozos — sinónimo: "registro"'),
('pozo', 'well', 'sustantivo', 'masculino', 'petrofísica / perfilaje de pozos'),
('formación', 'formation', 'sustantivo', 'femenino', 'petrofísica / geología — p. ej. "Formación Vaca Muerta"'),
('roca', 'rock', 'sustantivo', 'femenino', 'petrofísica / geología'),
('porosidad', 'porosity', 'sustantivo', 'femenino', 'petrofísica — φ; medida vía perfil de densidad o sónico'),
('arcilla', 'clay', 'sustantivo', 'femenino', 'petrofísica — ver también "arcillosidad", "Vsh"'),
('rayos gamma', 'gamma ray (GR)', 'sustantivo', 'masculino', 'perfilaje de pozos — perfil de rayos gamma, GR espectral (NGT)'),
('materia orgánica', 'organic matter', 'sustantivo', 'femenino', 'geoquímica — ver "COT%", "querógeno"'),
('cuenca', 'basin', 'sustantivo', 'femenino', 'geología — p. ej. "cuenca Neuquina"'),
('mineralogía', 'mineralogy', 'sustantivo', 'femenino', 'petrofísica / geoquímica'),
('litología', 'lithology', 'sustantivo', 'femenino', 'petrofísica / geología — ver también "litofacies"'),
('afloramiento', 'outcrop', 'sustantivo', 'masculino', 'geología — usado para calibrar registros de pozo'),
('densidad', 'density', 'sustantivo', 'femenino', 'perfilaje de pozos — perfil de densidad (bulk density)'),
('testigo', 'core (sample)', 'sustantivo', 'masculino', 'petrofísica — "testigo corona"'),
('intervalo', 'interval', 'sustantivo', 'masculino', 'petrofísica / perfilaje de pozos'),
('herramienta', 'tool', 'sustantivo', 'femenino', 'perfilaje de pozos — herramienta de perfilaje'),
('espesor', 'thickness', 'sustantivo', 'masculino', 'petrofísica / geología'),
('neutrón', 'neutron', 'sustantivo', 'masculino', 'perfilaje de pozos — perfil de neutrón; ver también "RMN/NMR"'),
('interpretación', 'interpretation', 'sustantivo', 'femenino', 'perfilaje de pozos — interpretación de registros'),
('resistividad', 'resistivity', 'sustantivo', 'femenino', 'perfilaje de pozos — resistividad profunda / inducción'),
('hidrocarburo', 'hydrocarbon', 'sustantivo', 'masculino', 'petrofísica / geoquímica'),
('fluido', 'fluid', 'sustantivo', 'masculino', 'petrofísica'),
('madurez', 'maturity', 'sustantivo', 'femenino', 'geoquímica — madurez térmica de la materia orgánica'),
('sónico', 'sonic (log)', 'sustantivo', 'masculino', 'perfilaje de pozos — perfil sónico compresional / shear; ecuación de Wyllie'),
('profundidad', 'depth', 'sustantivo', 'femenino', 'petrofísica / perfilaje de pozos'),
('fragilidad', 'brittleness', 'sustantivo', 'femenino', 'perfilaje de pozos — índice de fragilidad (BI), fragilidad promedio (BA)'),
('querógeno', 'kerogen', 'sustantivo', 'masculino', 'geoquímica'),
('pirólisis', 'pyrolysis', 'sustantivo', 'femenino', 'geoquímica — método usado para evaluar roca generadora'),
('vitrinita', 'vitrinite', 'sustantivo', 'femenino', 'geoquímica — reflectancia de la vitrinita (Ro), indicador de madurez'),
('matriz', 'matrix (rock matrix)', 'sustantivo', 'femenino', 'petrofísica — matriz de roca'),
('impedancia acústica', 'acoustic impedance', 'sustantivo', 'femenino', 'perfilaje de pozos / sísmica — Z = ρ·Vp'),
('caliper', 'caliper (log)', 'sustantivo', 'masculino', 'perfilaje de pozos — mide el diámetro del pozo')
;

-- ===========================================================================
-- 3. LIST — "Petrofísica y Perfilaje de Pozos"
--    Snapshots every verb/word just inserted above (matched by infinitive/
--    word, scoped to your own rows) into one new filterable list.
-- ===========================================================================

with new_list as (
  insert into public.lists (name, owner_label)
  values ('Petrofísica y Perfilaje de Pozos', 'mason')
  returning id
),
petro_verbs as (
  select id, to_jsonb(v) - 'id' - 'user_id' - 'created_at' as data
  from public.verbs v
  where user_id = auth.uid()
    and infinitive in (
      'utilizar','obtener','interpretar','presentar','permitir','medir','observar','mostrar',
      'generar','determinar','representar','contener','fracturar','caracterizar','escalar',
      'calcular','registrar','perfilar','superponer','evidenciar'
    )
),
petro_words as (
  select id, to_jsonb(w) - 'id' - 'user_id' - 'created_at' as data
  from public.words w
  where user_id = auth.uid()
    and word in (
      'registro','perfil','pozo','formación','roca','porosidad','arcilla','rayos gamma',
      'materia orgánica','cuenca','mineralogía','litología','afloramiento','densidad','testigo',
      'intervalo','herramienta','espesor','neutrón','interpretación','resistividad','hidrocarburo',
      'fluido','madurez','sónico','profundidad','fragilidad','querógeno','pirólisis','vitrinita',
      'matriz','impedancia acústica','caliper'
    )
)
insert into public.list_items (list_id, item_type, data)
select (select id from new_list), 'verb', data from petro_verbs
union all
select (select id from new_list), 'word', data from petro_words;
