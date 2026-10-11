// voseá — Escenas (2026-10-10): short everyday conversations, played in
// Hablar, from the Jugar tab. See app.js's "Escenas" section for how they
// run and claude/vosea-roadmap.md for the design (mason's picks: solo, a
// 4th Jugar game, a missed turn only costs stars, each role's voice
// selectable, some scenes with two people who also talk to each other,
// the other person's line hidden until you answer, the cue in English).
//
// Each scene:
//   id, level, name {es,en}, sub {es,en}, desc {es,en}
//   open: true          — playable from the start (the others unlock)
//   roles: [{ key, name {es,en}, sub {es,en}, voice: "elena"|"tomas" }]
//   prep: [{ id, es, en, p }] — what the scene uses, as a sentence pack
//                         (the [gaps] are the words to know). It becomes a
//                         hidden Tema "esc-<id>": "Practicar estas" drills
//                         it, and the scene unlocks when most of it was
//                         last answered Bien.
//   vars: { name: [[right, other, other], ...] } — one set is picked per
//         play. Numbers are said in words ("precio" as pesos, others as
//         plain numbers), "HH:MM" as a time; the other two are the
//         choices in a listening turn.
//   steps, in order:
//     { r: "role", es: ["line", "or another way"], to: "role"? }
//         — someone talks ({var} fills in a value). Lines in a row play
//           one after another.
//     { you: "English cue", ok: [...], best: "what a native would say",
//       wrong: [{ said: [...], r: "role", es: [...] }]?, prep: [ids]? }
//         — your turn, spoken. ok: a string must appear as words in what
//           you said; a list means every piece must appear (pieces match
//           inside words: "carg" matches cargás/cargar). Accents and case
//           don't matter. wrong: what gets a reply and counts as missed.
//     { check: "var", q: {es, en} } — tap the value you heard.

window.VOSEA_ESCENAS = [
  {
    id: "panaderia", level: "A1", open: true,
    name: { es: "En la panadería", en: "At the bakery" },
    sub: { es: "Medialunas, facturas, el precio", en: "Croissants, pastries, the price" },
    desc: { es: "Es sábado a la mañana y vas a la panadería de la esquina a comprar algo para el desayuno.", en: "It's Saturday morning and you go to the corner bakery to get something for breakfast." },
    roles: [{ key: "e", name: { es: "La empleada", en: "The clerk" }, sub: { es: "atiende", en: "serves you" }, voice: "elena" }],
    prep: [
      { id: "p01", es: "Quiero [media docena] de medialunas.", en: "I'd like half a dozen croissants.", p: "media docena = seis" },
      { id: "p02", es: "¿[De manteca] o [de grasa]?", en: "Butter or lard?", p: "las dos medialunas porteñas" },
      { id: "p03", es: "No, [nada más], gracias.", en: "No, nothing else, thanks.", p: "nada más" },
      { id: "p04", es: "¿[Cuánto es]?", en: "How much is it?", p: "cuánto es" },
      { id: "p05", es: "Pago [con tarjeta].", en: "I'll pay by card.", p: "con tarjeta · en efectivo" },
      { id: "p06", es: "¡Gracias, [igualmente]!", en: "Thanks, you too!", p: "igualmente" }
    ],
    vars: { precio: [[2400, 4200, 2040], [3600, 6300, 3060], [2800, 8200, 2080], [4500, 5400, 4050]] },
    steps: [
      { r: "e", es: ["¡Hola! ¿Qué te doy?", "Buen día, ¿qué te doy?", "Hola, ¿qué llevás?"] },
      { you: "Ask for half a dozen medialunas.", ok: [["media docena", "medialuna"]], best: "Media docena de medialunas, por favor.", prep: ["p01"] },
      { r: "e", es: ["¿De manteca o de grasa?", "¿Las querés de manteca o de grasa?"] },
      { you: "The butter ones.", ok: ["manteca"], best: "De manteca.", prep: ["p02"],
        wrong: [{ said: ["grasa"], r: "e", es: ["Uy, de grasa no me quedan. Te doy de manteca."] }] },
      { r: "e", es: ["Listo. ¿Algo más?", "¿Algo más?", "¿Te doy algo más?"] },
      { you: "Say no, nothing else, and ask how much it is.", ok: [["nada mas", "cuanto"], ["no", "cuanto"], ["todo", "cuanto"], ["no", "que te debo"]], best: "No, nada más. ¿Cuánto es?", prep: ["p03", "p04"] },
      { r: "e", es: ["Son {precio}.", "Serían {precio}."] },
      { check: "precio", q: { es: "¿Cuánto dijo?", en: "How much did she say?" } },
      { r: "e", es: ["¿Efectivo o tarjeta?", "¿Pagás en efectivo o con tarjeta?"] },
      { you: "Pay by card.", ok: ["tarjeta"], best: "Con tarjeta.", prep: ["p05"],
        wrong: [{ said: ["efectivo"], r: "e", es: ["Uy, no tengo cambio. Mejor con tarjeta, ¿dale?"] }] },
      { r: "e", es: ["Acercala acá nomás. Listo, ¡que tengas buen día!", "Apoyala acá. ¡Listo, que tengas lindo día!"] },
      { you: "Thank her and wish her the same.", ok: ["igualmente", ["gracias", "vos tambien"], ["gracias", "tambien"]], best: "¡Gracias, igualmente!", prep: ["p06"] }
    ]
  },
  {
    id: "kiosco", level: "A1",
    name: { es: "En el kiosco", en: "At the kiosco" },
    sub: { es: "Cargar la SUBE, pedir cambio", en: "Put money on your SUBE, ask for change" },
    desc: { es: "Te quedaste sin saldo en la SUBE. Entrás al kiosco de la parada a cargarla, y de paso comprás algo.", en: "Your SUBE card is out of money. You go into the kiosco by the bus stop to put money on it, and buy something while you're there." },
    roles: [{ key: "k", name: { es: "El kiosquero", en: "The kiosco owner" }, sub: { es: "atiende", en: "serves you" }, voice: "tomas" }],
    prep: [
      { id: "k01", es: "¿Me [cargás] la SUBE?", en: "Can you put money on my SUBE card?", p: "cargar la SUBE" },
      { id: "k02", es: "[Cinco mil] pesos, por favor.", en: "Five thousand pesos, please.", p: "cinco mil" },
      { id: "k03", es: "Y [un alfajor], también.", en: "And an alfajor, too.", p: "también" },
      { id: "k04", es: "[De chocolate], por favor.", en: "A chocolate one, please.", p: "de + sabor" },
      { id: "k05", es: "¿Tenés [cambio] de diez mil?", en: "Do you have change for ten thousand?", p: "cambio de…" },
      { id: "k06", es: "Acá tenés [el vuelto].", en: "Here's your change.", p: "el vuelto" }
    ],
    vars: { precio: [[6800, 8600, 6080], [7200, 2700, 7020], [6500, 5600, 6050]] },
    steps: [
      { r: "k", es: ["Hola, ¿qué necesitás?", "Buenas, decime.", "Hola, ¿qué andás buscando?"] },
      { you: "Ask him to put money on your SUBE card.", ok: [["carg", "sube"]], best: "Hola, ¿me cargás la SUBE?", prep: ["k01"] },
      { r: "k", es: ["Dale. ¿Cuánto te cargo?", "Sí, ¿cuánto le cargo?"] },
      { you: "Five thousand pesos.", ok: ["cinco mil", "5000", "5 000", "5 mil"], best: "Cinco mil pesos.", prep: ["k02"] },
      { r: "k", es: ["Pasame la tarjeta. Listo, cargada. ¿Algo más?", "Apoyala acá. Ya está. ¿Algo más?"] },
      { you: "Ask for an alfajor too.", ok: ["alfajor"], best: "Sí, un alfajor también.", prep: ["k03"] },
      { r: "k", es: ["¿De qué lo querés? Tengo de chocolate y de dulce de leche.", "¿Chocolate o dulce de leche?"] },
      { you: "A chocolate one.", ok: ["chocolate"], best: "De chocolate, por favor.", prep: ["k04"],
        wrong: [{ said: ["dulce de leche"], r: "k", es: ["Uh, el de dulce de leche se me terminó. Te doy uno de chocolate."] }] },
      { r: "k", es: ["Todo junto son {precio}.", "Son {precio} en total."] },
      { check: "precio", q: { es: "¿Cuánto es en total?", en: "How much is it altogether?" } },
      { you: "You only have a big bill. Ask if he has change for ten thousand.", ok: [["cambio", "diez mil"], ["cambio", "10000"], ["cambio", "10 000"], ["cambio", "10 mil"]], best: "¿Tenés cambio de diez mil?", prep: ["k05"] },
      { r: "k", es: ["Sí, tranqui. Acá tenés el vuelto.", "Sí, no hay drama. Tomá el vuelto."] },
      { you: "Thank him and say bye.", ok: ["gracias", "chau"], best: "¡Gracias! Chau.", prep: ["k06"] }
    ]
  },
  {
    id: "cafe", level: "A1",
    name: { es: "En el café", en: "At the café" },
    sub: { es: "Con Lucía y el mozo", en: "With Lucía and the waiter" },
    desc: { es: "Lucía te invitó a tomar algo en un café de Palermo. Charlan un poco, y el mozo viene a tomar el pedido.", en: "Lucía invited you out for coffee at a café in Palermo. You chat a bit, and the waiter comes to take the order." },
    roles: [
      { key: "l", name: { es: "Lucía", en: "Lucía" }, sub: { es: "tu amiga", en: "your friend" }, voice: "elena" },
      { key: "m", name: { es: "El mozo", en: "The waiter" }, sub: { es: "toma el pedido", en: "takes the order" }, voice: "tomas" }
    ],
    prep: [
      { id: "c01", es: "Para mí, [un cortado].", en: "A cortado for me.", p: "para mí" },
      { id: "c02", es: "[Una factura], por favor.", en: "A pastry, please.", p: "la factura" },
      { id: "c03", es: "¿Y vos [qué pedís]?", en: "And what are you having?", p: "pedir" },
      { id: "c04", es: "[De a poco].", en: "Little by little.", p: "de a poco" },
      { id: "c05", es: "¿Nos [traés] la cuenta, por favor?", en: "Can you bring us the check, please?", p: "traer" },
      { id: "c06", es: "Hoy [invito yo].", en: "Today it's on me.", p: "invitar" },
      { id: "c07", es: "Se [nos terminaron] las medialunas.", en: "We've run out of croissants.", p: "se + terminar" }
    ],
    vars: { precio: [[7400, 4700, 7040], [9600, 6900, 9060], [8300, 3800, 8030]] },
    steps: [
      { r: "l", es: ["¡Qué lindo este lugar! ¿Vos qué vas a pedir?", "Me encanta este café. ¿Qué vas a tomar?"] },
      { you: "Say you'll probably have a cortado.", ok: ["cortado"], best: "Un cortado, creo.", prep: ["c01"] },
      { r: "m", es: ["Buenas tardes. ¿Qué les traigo?", "Buenas, ¿qué les sirvo?"] },
      { r: "l", to: "m", es: ["Para mí un té con leche. ¿Tienen medialunas?"] },
      { r: "m", to: "l", es: ["Uh, se nos terminaron. Quedan otras facturas nomás.", "Medialunas ya no nos quedan. Tengo facturas."] },
      { r: "l", es: ["Qué lástima. ¿Y vos qué pedís?"] },
      { you: "Order your coffee and something to eat that they still have.", ok: [["cortado", "factura"]], best: "Para mí, un cortado y una factura.", prep: ["c01", "c02", "c07"],
        wrong: [{ said: ["medialuna"], r: "m", es: ["Medialunas no quedan, eh. Te traigo una factura."] }] },
      { r: "m", es: ["¿La factura de qué la querés? Hay de dulce de leche o de crema.", "¿De dulce de leche o de crema pastelera?"] },
      { you: "Dulce de leche.", ok: ["dulce de leche"], best: "De dulce de leche.", prep: ["c02"] },
      { r: "m", es: ["Perfecto. Ya se los traigo."] },
      { r: "l", es: ["Che, ¿y cómo te va con el castellano?", "¿Y cómo vas con el castellano?"] },
      { you: "Say it's going well, little by little.", ok: [["bien", "de a poco"], ["bien", "poco a poco"]], best: "¡Bien! De a poco.", prep: ["c04"] },
      { r: "l", es: ["¡Se nota! Hablás re bien. Bueno, ¿pedimos la cuenta? Hoy invito yo."] },
      { you: "Ask the waiter to bring you the check.", ok: [["cuenta"], ["cobr"]], best: "¿Nos traés la cuenta, por favor?", prep: ["c05", "c06"] },
      { r: "m", es: ["Ahí va. Son {precio}.", "Sí, ya te la traigo. Son {precio}."] },
      { check: "precio", q: { es: "¿Cuánto dijo el mozo?", en: "How much did the waiter say?" } },
      { r: "l", to: "m", es: ["Tomá. Quedate con el vuelto."] },
      { r: "m", to: "l", es: ["¡Muchas gracias! Que tengan buena tarde."] },
      { you: "Thank him and wish him the same.", ok: ["igualmente", ["gracias", "vos tambien"], ["gracias", "tambien"]], best: "¡Gracias, igualmente!", prep: [] }
    ]
  },
  {
    id: "colectivo", level: "A2",
    name: { es: "En el colectivo", en: "On the bus" },
    sub: { es: "El chofer y una señora", en: "The driver and a lady" },
    desc: { es: "Vas a Plaza Italia y no conocés el recorrido. Le preguntás al chofer, y una señora que va al mismo lugar te da una mano.", en: "You're going to Plaza Italia and don't know the route. You ask the driver, and a lady going the same way gives you a hand." },
    roles: [
      { key: "c", name: { es: "El chofer", en: "The driver" }, sub: { es: "maneja", en: "drives" }, voice: "tomas" },
      { key: "s", name: { es: "La señora", en: "The lady" }, sub: { es: "va al mismo lugar", en: "is going the same way" }, voice: "elena" }
    ],
    prep: [
      { id: "b01", es: "¿[Pasa por] Plaza Italia?", en: "Does it go past Plaza Italia?", p: "pasar por" },
      { id: "b02", es: "¿Me avisás [cuando lleguemos]?", en: "Will you let me know when we get there?", p: "cuando + subjuntivo" },
      { id: "b03", es: "[Muchas gracias].", en: "Thank you very much.", p: "muchas gracias" },
      { id: "b04", es: "[Permiso], bajo en la próxima.", en: "Excuse me, I'm getting off at the next one.", p: "permiso" },
      { id: "b05", es: "Bajo [en la próxima].", en: "I'm getting off at the next stop.", p: "la próxima (parada)" },
      { id: "b06", es: "Faltan [tres paradas].", en: "There are three stops to go.", p: "faltar" }
    ],
    vars: { paradas: [[3, 4, 2], [5, 6, 4], [4, 3, 5]] },
    steps: [
      { r: "c", es: ["Buenas.", "Buen día."] },
      { you: "Ask the driver if this bus goes past Plaza Italia.", ok: [["pasa", "plaza italia"], ["va", "plaza italia"], ["lleg", "plaza italia"]], best: "Buenas, ¿pasa por Plaza Italia?", prep: ["b01"] },
      { r: "c", es: ["Sí, pasa. Apoyá la SUBE ahí.", "Sí. Apoyá la tarjeta acá."] },
      { you: "Ask him to let you know when you get there.", ok: [["avis", "llegu"], ["avis", "cuando"]], best: "¿Me avisás cuando lleguemos?", prep: ["b02"] },
      { r: "c", es: ["Uy, con este tránsito me voy a olvidar. Preguntale a la señora, que se baja ahí."] },
      { r: "s", es: ["Sí, yo me bajo en Plaza Italia. Te aviso, no te preocupes."] },
      { you: "Thank her.", ok: ["gracias"], best: "¡Muchas gracias!", prep: ["b03"] },
      { r: "s", to: "c", es: ["Disculpe, ¿hoy desvía por la manifestación?", "¿Hoy sigue derecho por Santa Fe, o desvía?"] },
      { r: "c", to: "s", es: ["Desvío por Córdoba, señora. Faltan {paradas} paradas.", "Hoy voy por Córdoba. Son {paradas} paradas más."] },
      { check: "paradas", q: { es: "¿Cuántas paradas faltan?", en: "How many stops to go?" } },
      { r: "s", es: ["Bueno, tenemos tiempo. ¿Vos vas a pasear?"] },
      { you: "Say yes, you're going to meet a friend.", ok: [["amig"]], best: "Sí, voy a encontrarme con una amiga.", prep: [] },
      { r: "s", es: ["¡Ah, mirá qué lindo! Uy, ya llegamos. Nos bajamos en la próxima."] },
      { you: "There are people in the way. Say excuse me, you're getting off at the next one.", ok: [["permiso", "proxima"], ["bajo", "proxima"], ["permiso", "bajo"]], best: "Permiso, bajo en la próxima.", prep: ["b04", "b05"] },
      { r: "s", es: ["Listo, llegamos. Plaza Italia está a dos cuadras, para allá. ¡Suerte!"] },
      { you: "Thank her and say goodbye.", ok: ["gracias", "chau"], best: "¡Gracias por todo! Chau.", prep: ["b03"] }
    ]
  },
  {
    id: "farmacia", level: "A2",
    name: { es: "En la farmacia", en: "At the pharmacy" },
    sub: { es: "Tos, dolor de cabeza, cada cuántas horas", en: "A cough, a headache, how often" },
    desc: { es: "Te levantaste con tos y dolor de cabeza. Pasás por la farmacia a ver qué te recomiendan.", en: "You woke up with a cough and a headache. You stop by the pharmacy to see what they recommend." },
    roles: [{ key: "f", name: { es: "La farmacéutica", en: "The pharmacist" }, sub: { es: "atiende", en: "serves you" }, voice: "elena" }],
    prep: [
      { id: "f01", es: "¿Tenés algo [para la tos]?", en: "Do you have something for a cough?", p: "para + síntoma" },
      { id: "f02", es: "[Desde ayer].", en: "Since yesterday.", p: "desde" },
      { id: "f03", es: "No, pero [me duele] la cabeza.", en: "No, but I have a headache.", p: "doler, como gustar" },
      { id: "f04", es: "¿[Cada cuántas horas] lo tomo?", en: "How often do I take it?", p: "cada cuántas horas" },
      { id: "f05", es: "Cada [ocho] horas.", en: "Every eight hours.", p: "cada + número" },
      { id: "f06", es: "¿[Necesito] receta?", en: "Do I need a prescription?", p: "la receta" }
    ],
    vars: { horas: [[8, 6, 12], [6, 8, 4], [12, 2, 8]], precio: [[12500, 15200, 12050], [9800, 8900, 9080], [14300, 13400, 14030]] },
    steps: [
      { r: "f", es: ["Hola, ¿en qué te puedo ayudar?", "Buenas, ¿qué necesitás?"] },
      { you: "Say you have a cough and ask if she has something for it.", ok: [["tos"]], best: "Tengo tos. ¿Tenés algo para la tos?", prep: ["f01"] },
      { r: "f", es: ["¿Hace cuánto que tenés tos?", "¿Desde cuándo tenés tos?"] },
      { you: "Since yesterday.", ok: ["ayer"], best: "Desde ayer.", prep: ["f02"] },
      { r: "f", es: ["¿Y fiebre tenés?", "¿Tenés fiebre?"] },
      { you: "Say no, but you have a headache.", ok: [["no", "cabeza"]], best: "No, pero me duele la cabeza.", prep: ["f03"] },
      { r: "f", es: ["Bueno, te doy este jarabe para la tos."] },
      { you: "Ask if you need a prescription.", ok: [["receta"]], best: "¿Necesito receta?", prep: ["f06"] },
      { r: "f", es: ["No, es de venta libre."] },
      { you: "Ask how often you take it.", ok: [["cada", "hora"], ["cada cuanto"], ["cuantas veces"]], best: "¿Cada cuántas horas lo tomo?", prep: ["f04"] },
      { r: "f", es: ["Cada {horas} horas, con las comidas.", "Tomalo cada {horas} horas."] },
      { check: "horas", q: { es: "¿Cada cuántas horas?", en: "How many hours apart?" } },
      { r: "f", es: ["Y si en tres días no mejorás, andá al médico, ¿sí?"] },
      { you: "Say OK and ask how much it is.", ok: [["cuanto"], ["que te debo"]], best: "Dale. ¿Cuánto es?", prep: [] },
      { r: "f", es: ["Son {precio}.", "Serían {precio}."] },
      { check: "precio", q: { es: "¿Cuánto dijo?", en: "How much did she say?" } },
      { r: "f", es: ["¡Que te mejores!"] },
      { you: "Thank her.", ok: ["gracias"], best: "¡Gracias!", prep: [] }
    ]
  },
  {
    id: "juntada", level: "A1",
    name: { es: "Una juntada", en: "A get-together" },
    sub: { es: "Martín y Sofi, presentarse", en: "Martín and Sofi, introductions" },
    desc: { es: "Llegás a una juntada en lo de Martín, un amigo de Lucía. Te recibe con su hermana Sofi, que te hace preguntas.", en: "You arrive at a get-together at Martín's, a friend of Lucía's. You meet him and his sister Sofi, who ask you some questions." },
    roles: [
      { key: "m", name: { es: "Martín", en: "Martín" }, sub: { es: "el dueño de casa", en: "the host" }, voice: "tomas" },
      { key: "s", name: { es: "Sofi", en: "Sofi" }, sub: { es: "su hermana", en: "his sister" }, voice: "elena" }
    ],
    prep: [
      { id: "j01", es: "¡Hola! [Mucho gusto].", en: "Hi! Nice to meet you.", p: "mucho gusto" },
      { id: "j02", es: "[Soy de] Estados Unidos.", en: "I'm from the United States.", p: "ser de" },
      { id: "j03", es: "[Hace un año] que vivo acá.", en: "I've lived here for a year.", p: "hace + tiempo + que" },
      { id: "j04", es: "Estoy [aprendiendo] castellano.", en: "I'm learning Spanish.", p: "estar + gerundio" },
      { id: "j05", es: "¿Qué [traigo]?", en: "What should I bring?", p: "traer: traigo" },
      { id: "j06", es: "Ya [vuelvo].", en: "I'll be right back.", p: "volver: vuelvo" }
    ],
    vars: { hora: [["21:00", "20:00", "22:00"], ["20:30", "21:30", "19:30"], ["21:15", "20:15", "21:45"]] },
    steps: [
      { r: "m", es: ["¡Hola! ¿Cómo andás? Yo soy Martín.", "¡Hola! Pasá, pasá. Yo soy Martín."] },
      { you: "Say hi and that it's nice to meet him.", ok: ["mucho gusto", "un gusto", ["encantad"]], best: "¡Hola, Martín! Mucho gusto.", prep: ["j01"] },
      { r: "m", es: ["Igualmente. Ella es Sofi, mi hermana."] },
      { r: "s", es: ["¡Hola! ¿Y vos de dónde sos?", "Hola, ¿de dónde sos?"] },
      { you: "Say you're from the United States.", ok: ["estados unidos", "ee uu", "eeuu"], best: "Soy de Estados Unidos.", prep: ["j02"] },
      { r: "s", to: "m", es: ["¡Mirá! ¿Te acordás cuando fuimos a Nueva York?"] },
      { r: "m", to: "s", es: ["¡Cómo no me voy a acordar! Hacía un frío terrible."] },
      { r: "s", es: ["¿Y hace cuánto que vivís acá?"] },
      { you: "Say you've lived here for a year.", ok: [["un ano"], ["1 ano"]], best: "Hace un año que vivo acá.", prep: ["j03"] },
      { r: "m", es: ["¡Y ya hablás un montón! ¿Estudiás en algún lado?"] },
      { you: "Say you're learning Spanish with an app.", ok: [["aprend"], ["estudi"], ["app"], ["aplicacion"]], best: "Estoy aprendiendo castellano con una app.", prep: ["j04"] },
      { r: "s", to: "m", es: ["¡Qué bueno! Che, ¿a qué hora arranca el partido?"] },
      { r: "m", to: "s", es: ["A {hora}. Tenemos tiempo.", "Arranca a {hora}, hay tiempo."] },
      { check: "hora", q: { es: "¿A qué hora arranca el partido?", en: "What time does the game start?" } },
      { r: "m", es: ["¿Te quedás a verlo con nosotros?"] },
      { you: "Say yes, great, and ask what you can bring.", ok: [["traigo"], ["llevo"], ["traer"]], best: "¡Dale, buenísimo! ¿Qué traigo?", prep: ["j05"] },
      { r: "s", es: ["Nada, nada. Bueno, si querés, unas papitas."] },
      { you: "Say sure, you'll go get some and be right back.", ok: [["vuelvo"], ["dale"]], best: "¡Dale! Voy al kiosco y vuelvo.", prep: ["j06"] }
    ]
  }
];
