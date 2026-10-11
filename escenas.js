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
//   roles: [{ key, voice: "elena"|"tomas", f: { name {es,en}, sub {es,en} },
//             m: { name, sub } }] — a role is a woman when Elena plays it
//         and a man with Tomás (the voice is chosen per role, so both
//         forms are needed). Any text can say {key:feminine|masculine}:
//         "Thank {e:her|him}", "{d:Doctora|Doctor}, ya llegó…". Nothing
//         is ever gender-marked toward the learner.
//   prep: [{ id, es, en, p }] — what the scene uses, as a sentence pack
//                         (the [gaps] are the words to know). It becomes a
//                         hidden Tema "esc-<id>": "Practicar estas" drills
//                         it, and the scene unlocks when most of it was
//                         last answered Bien.
//   vars: { name: [[right, other, other], ...] } — one set is picked per
//         play. Numbers are said in words (names starting "precio" as pesos, others as
//         plain numbers), "HH:MM" as a time; the other two are the
//         choices in a listening turn.
//   steps, in order:
//     { r: "role", es: ["line", "another way", "a third way"], to: "role"? }
//         — someone talks ({var} fills in a value). One way is picked per
//           play (at least three, same meaning, same {vars}). Lines in a
//           row play one after another.
//     { you: "English cue", ok: [...], best: "what a native would say",
//       alts: ["other natural answers"], wrong: [{ said: [...], r, es: [...] }]?,
//       prep: [ids]? }
//         — your turn, spoken. ok: a string must appear as words in what
//           you said; a list means every piece must appear (pieces match
//           inside words: "carg" matches cargás/cargar). Accents and case
//           don't matter. A reply containing best or an alt also counts.
//           After the turn, "otras formas (n)" shows best + alts. wrong:
//           checked first; any one piece of said gets that reply and
//           counts as missed. Heard numbers usually come back as words.
//     { check: "var", q: {es, en} } — tap the value you heard.

window.VOSEA_ESCENAS = [
  {
    id: "panaderia", level: "A1", open: true,
    name: { es: "En la panadería", en: "At the bakery" },
    sub: { es: "Medialunas, facturas, el precio", en: "Croissants, pastries, the price" },
    desc: { es: "Es sábado a la mañana y vas a la panadería de la esquina a comprar algo para el desayuno. Te atiende {e:la empleada|el empleado}.", en: "It's Saturday morning and you go to the corner bakery to get something for breakfast. The clerk waits on you." },
    roles: [
      { key: "e", voice: "elena", f: { name: { es: "La empleada", en: "The clerk" }, sub: { es: "atiende", en: "serves you" } }, m: { name: { es: "El empleado", en: "The clerk" }, sub: { es: "atiende", en: "serves you" } } }
    ],
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
      { r: "e", es: ["¡Hola! ¿Qué te doy?", "Buen día, ¿qué andás buscando?", "Hola, ¿qué llevás?", "Buenas, decime qué te doy."] },
      { you: "Ask for half a dozen medialunas.", ok: [["media docena", "medialuna"], ["seis", "medialuna"]], best: "Media docena de medialunas, por favor.", alts: ["¿Me das media docena de medialunas?", "Quería media docena de medialunas.", "Dame seis medialunas, por favor."], prep: ["p01"] },
      { r: "e", es: ["¿De manteca o de grasa?", "¿Las querés de manteca o de grasa?", "Tengo de manteca y de grasa. ¿Cuáles te doy?", "¿Te las pongo de manteca o de grasa?"] },
      { you: "The butter ones.", ok: ["manteca"], best: "De manteca.", alts: ["Las de manteca, por favor.", "Dame de manteca.", "Prefiero las de manteca."], prep: ["p02"], wrong: [{ said: ["grasa"], r: "e", es: ["Uy, de grasa no me quedan. Te doy de manteca.", "Ay, las de grasa se terminaron. Te pongo de manteca, ¿dale?"] }] },
      { r: "e", es: ["Listo. ¿Algo más?", "¿Te doy algo más?", "Acá tenés. ¿Querés algo más?", "Bueno, ¿alguna cosita más?"] },
      { you: "Say no, nothing else, and ask how much it is.", ok: [["nada mas", "cuanto"], ["no", "cuanto"], ["todo", "cuanto"], ["no", "que te debo"], ["nada mas", "debo"], ["todo", "debo"]], best: "No, nada más. ¿Cuánto es?", alts: ["No, eso es todo. ¿Cuánto te debo?", "Nada más, gracias. ¿Cuánto sale?", "No, está bien así. ¿Qué te debo?"], prep: ["p03", "p04"] },
      { r: "e", es: ["Son {precio}.", "Serían {precio}.", "En total son {precio}.", "Todo junto te sale {precio}."] },
      { check: "precio", q: { es: "¿Cuánto dijo?", en: "How much did {e:she|he} say?" } },
      { r: "e", es: ["¿Efectivo o tarjeta?", "¿Pagás en efectivo o con tarjeta?", "¿Cómo vas a pagar? ¿Efectivo o tarjeta?", "¿Con qué pagás, efectivo o tarjeta?"] },
      { you: "Pay by card.", ok: ["tarjeta", "debito", "credito"], best: "Con tarjeta.", alts: ["Con tarjeta, por favor.", "Te pago con tarjeta.", "Con débito."], prep: ["p05"], wrong: [{ said: ["efectivo"], r: "e", es: ["Uy, no tengo cambio. Mejor con tarjeta, ¿dale?", "Ay, no me queda nada de cambio. ¿Me pagás con tarjeta?"] }] },
      { r: "e", es: ["Acercala acá nomás. Listo, ¡que tengas buen día!", "Apoyala acá. ¡Listo, que tengas lindo día!", "Pasala por acá. Ya está, aprobada. ¡Buen día!", "Dale, acercala al posnet. Listo. ¡Que tengas buen finde!"] },
      { you: "Thank the clerk and wish {e:her|him} the same.", ok: ["igualmente", ["gracias", "vos tambien"], ["gracias", "tambien"], ["gracias", "igual"]], best: "¡Gracias, igualmente!", alts: ["Gracias, vos también.", "¡Muchas gracias! Igualmente.", "Gracias, igual para vos."], prep: ["p06"] }
    ]
  },
  {
    id: "kiosco", level: "A1",
    name: { es: "En el kiosco", en: "At the kiosco" },
    sub: { es: "Cargar la SUBE, pedir cambio", en: "Put money on your SUBE, ask for change" },
    desc: { es: "Te quedaste sin saldo en la SUBE. Entrás al kiosco de la parada a cargarla, y de paso comprás algo. Te atiende {k:la kiosquera|el kiosquero}.", en: "Your SUBE card is out of money. You go into the kiosco by the bus stop to put money on it, and buy something while you're there. The kiosco owner waits on you." },
    roles: [
      { key: "k", voice: "tomas", f: { name: { es: "La kiosquera", en: "The kiosco owner" }, sub: { es: "atiende", en: "serves you" } }, m: { name: { es: "El kiosquero", en: "The kiosco owner" }, sub: { es: "atiende", en: "serves you" } } }
    ],
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
      { r: "k", es: ["Hola, ¿qué necesitás?", "Buenas, decime.", "Hola, ¿qué andás buscando?", "Buenas, ¿qué te doy?"] },
      { you: "Ask the kiosco owner to put money on your SUBE card.", ok: [["carg", "sube"]], best: "Hola, ¿me cargás la SUBE?", alts: ["Quería cargar la SUBE.", "¿Se puede cargar la SUBE acá?", "Buenas, ¿me hacés una carga de SUBE?"], prep: ["k01"] },
      { r: "k", es: ["Dale. ¿Cuánto te cargo?", "Sí, cómo no. ¿Cuánto le ponemos?", "Bueno, ¿de cuánto es la carga?", "Sí, ¿cuánto querés cargar?"] },
      { you: "Five thousand pesos.", ok: ["cinco mil", "5000", "5 000", "5 mil"], best: "Cinco mil pesos.", alts: ["Cinco mil, por favor.", "Poneme cinco mil.", "Cargame cinco mil pesos."], prep: ["k02"] },
      { r: "k", es: ["Pasame la tarjeta. Listo, cargada. ¿Algo más?", "Apoyala acá. Ya está. ¿Algo más?", "Dámela que la apoyo. Listo, ya tiene saldo. ¿Necesitás algo más?", "Listo, ya te la cargué. ¿Te doy algo más?"] },
      { you: "Ask for an alfajor too.", ok: [["alfajor"]], best: "Sí, un alfajor también.", alts: ["Sí, dame un alfajor.", "¿Me das un alfajor también?", "Y un alfajor, por favor."], prep: ["k03"] },
      { r: "k", es: ["¿De qué lo querés? Tengo de chocolate y de dulce de leche.", "¿Chocolate o dulce de leche?", "Tengo de chocolate o de dulce de leche. ¿Cuál querés?", "¿Lo querés de chocolate o de dulce de leche?"] },
      { you: "A chocolate one.", ok: ["chocolate"], best: "De chocolate, por favor.", alts: ["El de chocolate.", "Dame uno de chocolate.", "De chocolate, dale."], prep: ["k04"], wrong: [{ said: ["dulce de leche"], r: "k", es: ["Uh, el de dulce de leche se me terminó. Te doy uno de chocolate.", "Ay, de dulce de leche no me quedan. Te doy uno de chocolate, ¿dale?"] }] },
      { r: "k", es: ["Todo junto son {precio}.", "Son {precio} en total.", "Con la carga y el alfajor, son {precio}.", "Te cobro {precio} por todo."] },
      { check: "precio", q: { es: "¿Cuánto es en total?", en: "How much is it altogether?" } },
      { you: "You only have a big bill. Ask if {k:she|he} has change for ten thousand.", ok: [["cambi", "diez mil"], ["cambi", "10000"], ["cambi", "10 000"], ["cambi", "10 mil"]], best: "¿Tenés cambio de diez mil?", alts: ["Tengo uno de diez mil, ¿tenés cambio?", "¿Me cambiás un billete de diez mil?", "Perdón, solo tengo de diez mil. ¿Tenés cambio?"], prep: ["k05"] },
      { r: "k", es: ["Sí, tranqui. Acá tenés el vuelto.", "Sí, no hay drama. Tomá el vuelto.", "Sí, tengo. Ahí va tu vuelto.", "Dale, sin problema. Tomá, acá está el vuelto."] },
      { you: "Thank the kiosco owner and say bye.", ok: ["gracias", "chau"], best: "¡Gracias! Chau.", alts: ["Muchas gracias, hasta luego.", "Dale, gracias. ¡Nos vemos!", "Gracias, ¡que andes bien!"], prep: ["k06"] }
    ]
  },
  {
    id: "cafe", level: "A1",
    name: { es: "En el café", en: "At the café" },
    sub: { es: "Con {l:Lucía|Lucas} y {m:la moza|el mozo}", en: "With {l:Lucía|Lucas} and the {m:waitress|waiter}" },
    desc: { es: "{l:Lucía|Lucas} te invitó a tomar algo en un café de Palermo. Charlan un poco, y {m:la moza|el mozo} viene a tomar el pedido.", en: "{l:Lucía|Lucas} invited you out for coffee at a café in Palermo. You chat a bit, and the {m:waitress|waiter} comes to take the order." },
    roles: [
      { key: "l", voice: "elena", f: { name: { es: "Lucía", en: "Lucía" }, sub: { es: "tu amiga", en: "your friend" } }, m: { name: { es: "Lucas", en: "Lucas" }, sub: { es: "tu amigo", en: "your friend" } } },
      { key: "m", voice: "tomas", f: { name: { es: "La moza", en: "The waitress" }, sub: { es: "toma el pedido", en: "takes the order" } }, m: { name: { es: "El mozo", en: "The waiter" }, sub: { es: "toma el pedido", en: "takes the order" } } }
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
      { r: "l", es: ["¡Qué lindo este lugar! ¿Vos qué vas a pedir?", "Me encanta este café. ¿Qué vas a tomar?", "Está buenísimo este lugar, ¿no? ¿Qué te vas a pedir?", "Che, qué lindo acá. ¿Vos qué tomás?"] },
      { you: "Say you'll probably have a cortado.", ok: ["cortado"], best: "Un cortado, creo.", alts: ["Creo que me pido un cortado.", "Seguramente un cortado.", "Mmm, un cortado, me parece."], prep: ["c01"] },
      { r: "m", es: ["Buenas tardes. ¿Qué les traigo?", "Buenas, ¿qué les sirvo?", "Hola, buenas tardes. ¿Ya saben qué van a pedir?", "Buenas. ¿Qué van a tomar?"] },
      { r: "l", to: "m", es: ["Para mí un té con leche. ¿Tienen medialunas?", "Yo quiero un té con leche. ¿Hay medialunas?", "Un té con leche para mí, por favor. ¿Les quedan medialunas?"] },
      { r: "m", to: "l", es: ["Uh, se nos terminaron. Quedan otras facturas nomás.", "Medialunas ya no nos quedan. Tengo otras facturas.", "No, perdoname, las medialunas se terminaron. Tenemos otras facturas, eso sí."] },
      { r: "l", es: ["Qué lástima. ¿Y vos qué pedís?", "Uf, bueno. ¿Y vos qué te pedís?", "Una pena. ¿Vos qué vas a pedir?"] },
      { you: "Order your coffee and something to eat that they still have.", ok: [["cortado", "factura"]], best: "Para mí, un cortado y una factura.", alts: ["Un cortado y una factura, por favor.", "Yo quiero un cortado con una factura.", "¿Me traés un cortado y una factura?"], prep: ["c01", "c02", "c07"], wrong: [{ said: ["medialuna"], r: "m", es: ["Medialunas no quedan, eh. Te traigo una factura.", "Ojo que medialunas no hay más. Te pongo una factura, ¿dale?"] }] },
      { r: "m", es: ["¿La factura de qué la querés? Hay de dulce de leche o de crema.", "¿De dulce de leche o de crema pastelera?", "Las facturas son de dulce de leche o de crema. ¿Cuál preferís?", "Tengo con dulce de leche y con crema pastelera. ¿Cuál te traigo?"] },
      { you: "Dulce de leche.", ok: ["dulce de leche"], best: "De dulce de leche.", alts: ["La de dulce de leche.", "Con dulce de leche, por favor.", "Una de dulce de leche."], prep: ["c02"] },
      { r: "m", es: ["Perfecto. Ya se los traigo.", "Bárbaro. Enseguida se los traigo.", "Dale. Ya les traigo todo.", "Listo, ahora vengo con todo."] },
      { r: "l", es: ["Che, ¿y cómo te va con el castellano?", "¿Y cómo vas con el castellano?", "Contame, ¿cómo venís con el castellano?", "¿Y qué tal el castellano? ¿Cómo lo llevás?"] },
      { you: "Say it's going well, little by little.", ok: [["bien", "de a poco"], ["bien", "poco a poco"], ["mejor", "de a poco"]], best: "¡Bien! De a poco.", alts: ["Bastante bien, de a poco.", "Bien, voy poco a poco.", "Cada vez mejor, de a poco."], prep: ["c04"] },
      { r: "l", es: ["¡Se nota! Hablás re bien. Bueno, ¿pedimos la cuenta? Hoy invito yo.", "¡Sí, se te nota un montón! Che, ¿pedimos la cuenta? Hoy te invito yo.", "Se te escucha re bien, eh. Bueno, pidamos la cuenta, que hoy invito yo."] },
      { you: "Ask the {m:waitress|waiter} to bring you the check.", ok: [["cuenta"], ["cobr"]], best: "¿Nos traés la cuenta, por favor?", alts: ["La cuenta, por favor.", "¿Nos cobrás, por favor?", "Disculpá, ¿nos traés la cuenta cuando puedas?"], prep: ["c05", "c06"] },
      { r: "m", es: ["Ahí va. Son {precio}.", "Sí, ya te la traigo. Son {precio}.", "Cómo no. En total son {precio}.", "Acá está la cuenta: {precio} todo junto."] },
      { check: "precio", q: { es: "¿Cuánto dijo {m:la moza|el mozo}?", en: "How much did the {m:waitress|waiter} say?" } },
      { r: "l", to: "m", es: ["Tomá. Quedate con el vuelto.", "Acá tenés. El vuelto es para vos.", "Tomá, está bien así. Quedate con el cambio."] },
      { r: "m", to: "l", es: ["¡Muchas gracias! Que tengan buena tarde.", "¡Gracias, muy amable! Que sigan bien.", "¡Muchísimas gracias! Que disfruten la tarde."] },
      { you: "Thank the {m:waitress|waiter} and wish {m:her|him} the same.", ok: ["igualmente", ["gracias", "vos tambien"], ["gracias", "tambien"], ["gracias", "igual"]], best: "¡Gracias, igualmente!", alts: ["Gracias, vos también.", "¡Muchas gracias! Igualmente.", "Gracias, igual para vos."], prep: [] }
    ]
  },
  {
    id: "colectivo", level: "A2",
    name: { es: "En el colectivo", en: "On the bus" },
    sub: { es: "{c:La chofer|El chofer} y {s:una señora|un señor}", en: "The driver and {s:a lady|a man}" },
    desc: { es: "Vas a Plaza Italia y no conocés el recorrido. Le preguntás {c:a la chofer|al chofer}, y {s:una señora|un señor} que va al mismo lugar te da una mano.", en: "You're going to Plaza Italia and don't know the route. You ask the driver, and {s:a lady|a man} going the same way gives you a hand." },
    roles: [
      { key: "c", voice: "tomas", f: { name: { es: "La chofer", en: "The driver" }, sub: { es: "maneja", en: "drives" } }, m: { name: { es: "El chofer", en: "The driver" }, sub: { es: "maneja", en: "drives" } } },
      { key: "s", voice: "elena", f: { name: { es: "La señora", en: "The lady" }, sub: { es: "va al mismo lugar", en: "is going the same way" } }, m: { name: { es: "El señor", en: "The man" }, sub: { es: "va al mismo lugar", en: "is going the same way" } } }
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
      { r: "c", es: ["Buenas.", "Buen día.", "Hola, buenas.", "Buenas, ¿qué tal?"] },
      { you: "Ask the driver if this bus goes past Plaza Italia.", ok: [["pasa", "plaza italia"], ["va", "plaza italia"], ["lleg", "plaza italia"], ["dej", "plaza italia"]], best: "Buenas, ¿pasa por Plaza Italia?", alts: ["Hola, ¿este va a Plaza Italia?", "Disculpá, ¿pasás por Plaza Italia?", "¿Me deja cerca de Plaza Italia este colectivo?"], prep: ["b01"] },
      { r: "c", es: ["Sí, pasa. Apoyá la SUBE ahí.", "Sí. Apoyá la tarjeta acá.", "Sí, te deja ahí. Apoyá la SUBE.", "Pasa, sí. Marcá la SUBE en la maquinita."] },
      { you: "Ask the driver to let you know when you get there.", ok: [["avis", "llegu"], ["avis", "cuando"], ["avis", "plaza"], ["avis", "baj"]], best: "¿Me avisás cuando lleguemos?", alts: ["¿Me avisás cuando estemos llegando?", "¿Me podés avisar cuando lleguemos a Plaza Italia?", "Dale, ¿me avisás dónde me tengo que bajar?"], prep: ["b02"] },
      { r: "c", es: ["Uy, con este tránsito me voy a olvidar. Preguntale {s:a la señora|al señor}, que se baja ahí.", "Mirá, con todo este tráfico seguro me olvido. {s:La señora|El señor} se baja ahí, preguntale.", "Uf, no te prometo nada con este tránsito. Preguntale {s:a la señora|al señor} de acá, que se baja en Plaza Italia.", "Ay, me voy a olvidar, eh. Pero {s:la señora|el señor} se baja ahí, preguntale {s:a ella|a él}."] },
      { r: "s", es: ["Sí, yo me bajo en Plaza Italia. Te aviso, no te preocupes.", "Yo también voy a Plaza Italia. Quedate tranqui, yo te aviso.", "Ah, sí, me bajo ahí. Yo te aviso cuando lleguemos.", "Sí, sí, voy para ahí. No te hagas problema, te aviso."] },
      { you: "Thank {s:the lady|the man}.", ok: ["gracias"], best: "¡Muchas gracias!", alts: ["Mil gracias.", "Gracias, muy amable.", "¡Gracias, sos un sol!"], prep: ["b03"] },
      { r: "s", to: "c", es: ["Disculpe, ¿hoy desvía por la manifestación?", "¿Hoy sigue derecho por Santa Fe, o desvía?", "Perdone, ¿hoy hay desvío por la marcha?", "Disculpe, con la manifestación, ¿va por Santa Fe o se desvía?"] },
      { r: "c", to: "s", es: ["Desvío por Córdoba, {s:señora|señor}. Faltan {paradas} paradas.", "Hoy voy por Córdoba. Son {paradas} paradas más.", "Sí, {s:señora|señor}, vamos por Córdoba. Quedan {paradas} paradas.", "Desviamos por Córdoba. De acá son {paradas} paradas."] },
      { check: "paradas", q: { es: "¿Cuántas paradas faltan?", en: "How many stops to go?" } },
      { r: "s", es: ["Bueno, tenemos tiempo. ¿Vos vas a pasear?", "Ah, bueno, falta un ratito. ¿Y vos? ¿Vas a pasear?", "Tenemos un rato, entonces. ¿Vas a pasear por ahí?", "Bueno, hay tiempo. ¿Vos vas de paseo?"] },
      { you: "Say yes, you're going to meet a friend.", ok: [["amig"]], best: "Sí, voy a encontrarme con una amiga.", alts: ["Sí, me voy a juntar con un amigo.", "Sí, voy a ver a una amiga.", "Sí, quedé con unos amigos."], prep: [] },
      { r: "s", es: ["¡Ah, mirá qué lindo! Uy, ya llegamos. Nos bajamos en la próxima.", "¡Qué bueno! Uy, mirá, ya casi llegamos. La próxima es la nuestra.", "¡Ah, qué lindo! Bueno, ya estamos. Nos bajamos en la que viene.", "¡Mirá vos, qué bien! Uy, en la próxima nos bajamos."] },
      { you: "There are people in the way. Say excuse me, you're getting off at the next one.", ok: [["permiso", "proxima"], ["baj", "proxima"], ["permiso", "baj"]], best: "Permiso, bajo en la próxima.", alts: ["Permiso, me bajo en la próxima.", "Perdón, ¿me das permiso? Bajo en la próxima.", "Con permiso, me bajo en la que viene."], prep: ["b04", "b05"] },
      { r: "s", es: ["Listo, llegamos. Plaza Italia está a dos cuadras, para allá. ¡Suerte!", "Bueno, acá es. Caminá dos cuadras para allá y estás en Plaza Italia. ¡Que te vaya bien!", "Ya está, llegamos. Plaza Italia queda a dos cuadras, para aquel lado. ¡Suerte!", "Acá bajamos. Son dos cuadras por allá hasta Plaza Italia. ¡Suerte, eh!"] },
      { you: "Thank {s:the lady|the man} and say goodbye.", ok: ["gracias", "chau"], best: "¡Gracias por todo! Chau.", alts: ["Muchas gracias por la ayuda. ¡Chau!", "Mil gracias, ¡que tengas lindo día!", "¡Gracias! Chau, buen día."], prep: ["b03"] }
    ]
  },
  {
    id: "farmacia", level: "A2",
    name: { es: "En la farmacia", en: "At the pharmacy" },
    sub: { es: "Tos, dolor de cabeza, cada cuántas horas", en: "A cough, a headache, how often" },
    desc: { es: "Te levantaste con tos y dolor de cabeza. Pasás por la farmacia a ver qué te recomienda {f:la farmacéutica|el farmacéutico}.", en: "You woke up with a cough and a headache. You stop by the pharmacy to see what the pharmacist recommends." },
    roles: [
      { key: "f", voice: "elena", f: { name: { es: "La farmacéutica", en: "The pharmacist" }, sub: { es: "atiende", en: "serves you" } }, m: { name: { es: "El farmacéutico", en: "The pharmacist" }, sub: { es: "atiende", en: "serves you" } } }
    ],
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
      { r: "f", es: ["Hola, ¿en qué te puedo ayudar?", "Buenas, ¿qué necesitás?", "Buen día, decime, ¿qué andás buscando?", "Hola, ¿qué tal? ¿Qué te hace falta?"] },
      { you: "Say you have a cough and ask if {f:she|he} has something for it.", ok: [["tos"]], best: "Tengo tos. ¿Tenés algo para la tos?", alts: ["Buenas, quería algo para la tos.", "Hola, ando con mucha tos. ¿Tenés algo para eso?", "Tengo una tos bastante fuerte. ¿Qué me recomendás?"], prep: ["f01"] },
      { r: "f", es: ["¿Hace cuánto que tenés tos?", "¿Desde cuándo tenés tos?", "¿Y hace cuánto que estás con esa tos?", "¿Cuándo te empezó la tos?"] },
      { you: "Since yesterday.", ok: ["ayer"], best: "Desde ayer.", alts: ["Me empezó ayer.", "Desde ayer a la mañana, más o menos.", "Ayer a la noche empecé con tos."], prep: ["f02"] },
      { r: "f", es: ["¿Y fiebre tenés?", "¿Tenés fiebre?", "¿Te tomaste la temperatura? ¿Tenés fiebre?", "¿Y tuviste fiebre?"] },
      { you: "Say no, but you have a headache.", ok: [["no", "cabeza"]], best: "No, pero me duele la cabeza.", alts: ["Fiebre no, pero tengo dolor de cabeza.", "Creo que no, pero me duele mucho la cabeza.", "No, no tengo. Eso sí, me duele la cabeza."], prep: ["f03"] },
      { r: "f", es: ["Bueno, te doy este jarabe para la tos.", "Bien, entonces te recomiendo este jarabe para la tos.", "Mirá, para la tos llevate este jarabe.", "Dale. Para la tos tenés este jarabe, que anda muy bien."] },
      { you: "Ask if you need a prescription.", ok: [["receta"]], best: "¿Necesito receta?", alts: ["¿Hace falta receta?", "¿Se puede comprar sin receta?", "¿Es con receta o no?"], prep: ["f06"] },
      { r: "f", es: ["No, es de venta libre.", "No, no hace falta. Es de venta libre.", "No, ese lo podés llevar sin receta.", "Para nada, es de venta libre."] },
      { you: "Ask how often you take it.", ok: [["cada", "hora"], ["cada cuanto"], ["cuantas veces"]], best: "¿Cada cuántas horas lo tomo?", alts: ["¿Cada cuánto lo tengo que tomar?", "¿Cuántas veces por día lo tomo?", "¿Y cómo lo tomo? ¿Cada cuánto?"], prep: ["f04"] },
      { r: "f", es: ["Cada {horas} horas.", "Tomalo cada {horas} horas.", "Tenés que tomarlo cada {horas} horas, ¿sí?", "Lo tomás cada {horas} horas, no más seguido."] },
      { check: "horas", q: { es: "¿Cada cuántas horas?", en: "How many hours apart?" } },
      { r: "f", es: ["Y si en tres días no mejorás, andá al médico, ¿sí?", "Si en tres días no estás mejor, consultá con un médico.", "Ah, y si en tres días seguís igual, tenés que ir al médico, ¿eh?", "Y cualquier cosa, si en tres días no mejorás, andá a ver a un médico."] },
      { you: "Say OK and ask how much it is.", ok: [["cuanto"], ["que te debo"]], best: "Dale. ¿Cuánto es?", alts: ["Bueno, dale. ¿Cuánto te debo?", "Perfecto. ¿Cuánto sale?", "Listo, ¿qué te debo?"], prep: [] },
      { r: "f", es: ["Son {precio}.", "Serían {precio}.", "Te sale {precio}.", "En total son {precio}."] },
      { check: "precio", q: { es: "¿Cuánto dijo?", en: "How much did {f:she|he} say?" } },
      { r: "f", es: ["¡Que te mejores!", "¡Que te mejores pronto!", "Bueno, ¡que te recuperes rápido!", "Listo, ¡cuidate y que te mejores!"] },
      { you: "Thank the pharmacist.", ok: ["gracias"], best: "¡Gracias!", alts: ["¡Muchas gracias!", "Gracias, ¡chau!", "Gracias por todo. ¡Que andes bien!"], prep: [] }
    ]
  },
  {
    id: "juntada", level: "A1",
    name: { es: "Una juntada", en: "A get-together" },
    sub: { es: "{m:Martina|Martín} y {s:Sofi|Santi}, presentarse", en: "{m:Martina|Martín} and {s:Sofi|Santi}, introductions" },
    desc: { es: "Llegás a una juntada en lo de {m:Martina|Martín}, {m:una amiga|un amigo} de unos amigos. Te recibe con {s:su hermana Sofi|su hermano Santi}, que te hace preguntas.", en: "You arrive at a get-together at {m:Martina's|Martín's}, a friend of some friends. {m:She|He} welcomes you with {m:her|his} {s:sister Sofi|brother Santi}, who asks you some questions." },
    roles: [
      { key: "m", voice: "tomas", f: { name: { es: "Martina", en: "Martina" }, sub: { es: "la dueña de casa", en: "the host" } }, m: { name: { es: "Martín", en: "Martín" }, sub: { es: "el dueño de casa", en: "the host" } } },
      { key: "s", voice: "elena", f: { name: { es: "Sofi", en: "Sofi" }, sub: { es: "su hermana", en: "{m:her|his} sister" } }, m: { name: { es: "Santi", en: "Santi" }, sub: { es: "su hermano", en: "{m:her|his} brother" } } }
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
      { r: "m", es: ["¡Hola! ¿Cómo andás? Yo soy {m:Martina|Martín}.", "¡Hola! Pasá, pasá. Yo soy {m:Martina|Martín}.", "¡Hola, qué tal! Me llamo {m:Martina|Martín}. Pasá.", "¡Ey, hola! Soy {m:Martina|Martín}, ¿todo bien?"] },
      { you: "Say hi and that it's nice to meet {m:her|him}.", ok: ["mucho gusto", "un gusto", "un placer", "el gusto", ["encantad"]], best: "¡Hola, {m:Martina|Martín}! Mucho gusto.", alts: ["¡Hola! Un gusto.", "Hola, ¿qué tal? Un placer.", "¡Hola, {m:Martina|Martín}! Un gusto conocerte."], prep: ["j01"] },
      { r: "m", es: ["Igualmente. {s:Ella es Sofi, mi hermana|Él es Santi, mi hermano}.", "Un gusto. Te presento a {s:mi hermana, Sofi|mi hermano, Santi}.", "Igualmente. Mirá, {s:esta es mi hermana Sofi|este es mi hermano Santi}.", "El gusto es mío. {s:Ella es mi hermana, Sofi|Él es mi hermano, Santi}."] },
      { r: "s", es: ["¡Hola! ¿Y vos de dónde sos?", "Hola, ¿de dónde sos?", "¡Hola! Che, ¿de qué país sos?", "Hola, ¿qué tal? ¿Y vos de dónde sos, de acá?"] },
      { you: "Say you're from the United States.", ok: ["estados unidos", "ee uu", "eeuu", "estadounidense"], best: "Soy de Estados Unidos.", alts: ["De Estados Unidos.", "Vengo de Estados Unidos.", "Soy estadounidense."], prep: ["j02"] },
      { r: "s", to: "m", es: ["¡Mirá! ¿Te acordás cuando fuimos a Nueva York?", "¡Qué bueno! Che, ¿te acordás de nuestro viaje a Nueva York?", "¡Ah, mirá vos! ¿Te acordás cuando estuvimos en Nueva York?"] },
      { r: "m", to: "s", es: ["¡Cómo no me voy a acordar! Hacía un frío terrible.", "¡Obvio que me acuerdo! Hacía un frío tremendo.", "¡Sí, claro! Nos moríamos de frío.", "¿Cómo me voy a olvidar? ¡Qué frío que hacía!"] },
      { r: "s", es: ["¿Y hace cuánto que vivís acá?", "¿Y cuánto hace que estás en Buenos Aires?", "¿Y desde cuándo vivís acá?", "¿Y hace mucho que vivís en Buenos Aires?"] },
      { you: "Say you've lived here for a year.", ok: [["un ano"], ["1 ano"]], best: "Hace un año que vivo acá.", alts: ["Un año, más o menos.", "Vivo acá desde hace un año.", "Ya hace un año, ¡cómo pasa el tiempo!"], prep: ["j03"] },
      { r: "m", es: ["¡Y ya hablás un montón! ¿Estudiás en algún lado?", "¡Y ya hablás re bien! ¿Estás estudiando en algún lado?", "¡Qué bien que hablás! ¿Tomás clases en algún lado?", "¡Pero ya hablás un montón! ¿Dónde estudiás?"] },
      { you: "Say you're learning Spanish with an app.", ok: [["aprend"], ["estudi"], ["app"], ["aplicacion"]], best: "Estoy aprendiendo castellano con una app.", alts: ["Estudio con una aplicación en el celular.", "Con una app, de a poco.", "Voy aprendiendo con una aplicación."], prep: ["j04"] },
      { r: "s", to: "m", es: ["¡Qué bueno! Che, ¿a qué hora arranca el partido?", "¡Genial! Che, ¿a qué hora empieza el partido?", "¡Buenísimo! Che, {m:Martina|Martín}, ¿a qué hora es el partido?"] },
      { r: "m", to: "s", es: ["A {hora}. Tenemos tiempo.", "Arranca a {hora}, hay tiempo.", "Empieza a {hora}, tranqui, hay tiempo.", "Es a {hora}. Todavía falta."] },
      { check: "hora", q: { es: "¿A qué hora arranca el partido?", en: "What time does the game start?" } },
      { r: "m", es: ["¿Te quedás a verlo con nosotros?", "¿Te querés quedar a verlo con nosotros?", "¿Por qué no te quedás a ver el partido?", "¿Te prendés a verlo con nosotros?"] },
      { you: "Say yes, great, and ask what you can bring.", ok: [["traigo"], ["llevo"], ["traer"], ["traiga"]], best: "¡Dale, buenísimo! ¿Qué traigo?", alts: ["¡Sí, genial! ¿Qué puedo traer?", "¡Me encanta! ¿Querés que traiga algo?", "Dale, me quedo. ¿Hace falta traer algo?"], prep: ["j05"] },
      { r: "s", es: ["Nada, nada. Bueno, si querés, unas papitas.", "No hace falta. Bueno... si querés, traé unas papitas.", "Nada, en serio. Aunque unas papitas no vendrían mal.", "No, nada. Bueno, unas papitas, si tenés ganas."] },
      { you: "Say sure, you'll go get some and be right back.", ok: [["vuelvo"], ["dale"]], best: "¡Dale! Voy al kiosco y vuelvo.", alts: ["Bueno, voy al chino y ya vuelvo.", "Listo, bajo al kiosco y vuelvo enseguida.", "¡Obvio! Ya vuelvo con las papitas."], prep: ["j06"] }
    ]
  },
  {
    id: "portero", level: "A1",
    name: { es: "Con {j:la encargada|el encargado}", en: "With the building manager" },
    sub: { es: "Un paquete, el agua, el ascensor", en: "A package, the water, the elevator" },
    desc: { es: "Bajás a la entrada de tu edificio. {j:Julia, la encargada|Julio, el encargado}, tiene un paquete para vos, y aparece {r:Rosa, la vecina|Rodolfo, el vecino} del quinto.", en: "You go down to your building's lobby. {j:Julia|Julio}, the building manager, has a package for you, and {r:Rosa|Rodolfo}, the neighbor from the fifth floor, shows up." },
    roles: [
      { key: "j", voice: "tomas", f: { name: { es: "Julia", en: "Julia" }, sub: { es: "la encargada", en: "the building manager" } }, m: { name: { es: "Julio", en: "Julio" }, sub: { es: "el encargado", en: "the building manager" } } },
      { key: "r", voice: "elena", f: { name: { es: "Rosa", en: "Rosa" }, sub: { es: "la vecina del quinto", en: "the neighbor from the fifth floor" } }, m: { name: { es: "Rodolfo", en: "Rodolfo" }, sub: { es: "el vecino del quinto", en: "the neighbor from the fifth floor" } } }
    ],
    prep: [
      { id: "e01", es: "¿Llegó [un paquete] para mí?", en: "Did a package come for me?", p: "llegar" },
      { id: "e02", es: "Soy del [cuarto A].", en: "I'm in 4A.", p: "piso + letra" },
      { id: "e03", es: "¿[A qué hora] cortan el agua?", en: "What time are they turning off the water?", p: "a qué hora" },
      { id: "e04", es: "El ascensor [no anda].", en: "The elevator isn't working.", p: "andar = funcionar" },
      { id: "e05", es: "No, gracias, [está bien].", en: "No, thanks, it's fine.", p: "está bien" },
      { id: "e06", es: "Gracias [por avisar].", en: "Thanks for letting me know.", p: "avisar" }
    ],
    vars: { hora: [["9:00", "7:00", "10:00"], ["8:30", "9:30", "8:00"], ["10:00", "12:00", "11:00"]] },
    steps: [
      { r: "j", es: ["¡Buen día! ¿Todo bien?", "¡Hola! ¿Cómo andás?", "¡Buenas! ¿Qué tal, cómo va?", "¡Buen día! ¿Cómo estás?"] },
      { you: "Say good morning and ask if a package came for you.", ok: [["paquete"]], best: "Buen día. ¿Llegó un paquete para mí?", alts: ["Buen día. ¿Me llegó algún paquete?", "Todo bien, gracias. ¿Hay un paquete para mí?", "Hola, buen día. Estoy esperando un paquete, ¿llegó?"], prep: ["e01"] },
      { r: "j", es: ["Sí, hoy llegaron varios. ¿De qué departamento sos?", "Llegaron un par. ¿Vos de qué departamento sos?", "Hoy vinieron unos cuantos paquetes. ¿En qué departamento vivís?", "Puede ser, hay varios. ¿Qué departamento sos?"] },
      { you: "Say you're in 4A.", ok: [["cuarto"], ["cuatro"], ["4"]], best: "Soy del cuarto A.", alts: ["Del cuatro A.", "Vivo en el cuarto A.", "Cuarto A."], prep: ["e02"] },
      { r: "j", es: ["Ah, sí, acá está. Pesa, eh. Y te aviso: mañana cortan el agua.", "Sí, este es tuyo. ¡Es pesado, eh! Ah, y mañana cortan el agua.", "Acá lo tengo. Cuidado que pesa. Y ojo, que mañana van a cortar el agua.", "Sí, tomá, acá está. Pesadito, eh. Te aviso que mañana cortan el agua."] },
      { you: "Ask what time they're turning off the water.", ok: [["hora"], ["cuando"]], best: "¿A qué hora cortan el agua?", alts: ["¿A qué hora la cortan?", "¿Desde qué hora?", "Uh, ¿y cuándo, más o menos?"], prep: ["e03"] },
      { r: "j", es: ["Desde {hora} hasta el mediodía, más o menos.", "Cortan desde {hora}, hasta el mediodía.", "A partir de {hora} y hasta el mediodía.", "La cortan desde {hora}. Vuelve al mediodía, más o menos."] },
      { check: "hora", q: { es: "¿Desde qué hora cortan el agua?", en: "What time does the water go off?" } },
      { r: "r", to: "j", es: ["{j:Julia|Julio}, ¿y el ascensor? Otra vez no anda.", "Che, {j:Julia|Julio}, el ascensor no funciona de nuevo.", "{j:Julia|Julio}, ¿viste que el ascensor se rompió otra vez?", "Ay, {j:Julia|Julio}, ¿qué pasa con el ascensor? Otra vez está parado."] },
      { r: "j", to: "r", es: ["Ya llamé al técnico, {r:Rosa|Rodolfo}. Viene a la tarde.", "Sí, {r:Rosa|Rodolfo}, ya le avisé al técnico. Pasa esta tarde.", "Ya sé, {r:Rosa|Rodolfo}. El técnico viene a la tarde, ya lo llamé.", "Quedate tranqui, {r:Rosa|Rodolfo}, ya llamé al técnico y viene a la tarde."] },
      { r: "r", es: ["¡Hola! ¿Vos también subís por la escalera?", "Hola, ¿qué tal? ¿A vos también te toca la escalera?", "¡Hola! ¿Vos también vas a tener que subir a pie?", "Hola. ¿Así que vos también vas por la escalera?"] },
      { you: "Say yes, the elevator isn't working.", ok: [["no anda"], ["no funciona"], ["ascensor"], ["roto"]], best: "Sí, el ascensor no anda.", alts: ["Sí, el ascensor no funciona.", "Y sí, no queda otra. El ascensor no anda.", "Sí, otra vez está roto el ascensor."], prep: ["e04"] },
      { r: "r", es: ["¡Y con ese paquete! ¿Querés que te ayude?", "¡Uh, con ese paquete! ¿Te doy una mano?", "¿Y con semejante paquete? ¿Te ayudo a subirlo?", "Ay, ese paquete parece pesado. ¿Querés una mano?"] },
      { you: "Say no thanks, it's fine.", ok: [["no", "gracias"], ["no", "esta bien"]], best: "No, gracias, está bien.", alts: ["No te preocupes, gracias.", "Gracias, pero no hace falta.", "No, está bien, lo subo yo. ¡Gracias!"], prep: ["e05"] },
      { r: "j", es: ["Bueno. Y acordate: mañana sin agua, eh.", "Dale. Y no te olvides de que mañana cortan el agua.", "Bueno, y acordate de lo del agua mañana, eh.", "Listo. Ojo mañana con el agua, que la cortan."] },
      { you: "Thank {j:Julia|Julio} for letting you know about the water.", ok: [["gracias"]], best: "Gracias por avisar, {j:Julia|Julio}.", alts: ["¡Gracias por el aviso!", "Sí, gracias, {j:Julia|Julio}. Hoy lleno unas botellas.", "Gracias, lo tengo en cuenta."], prep: ["e06"] }
    ]
  },
  {
    id: "taxi", level: "A2",
    name: { es: "En el taxi", en: "In a taxi" },
    sub: { es: "Adónde, por dónde, cuánto", en: "Where to, which way, how much" },
    desc: { es: "Tomás un taxi en el centro para ir a Palermo. {t:La taxista es charlatana|El taxista es charlatán}.", en: "Downtown, you hail a taxi to Palermo. The driver is chatty." },
    roles: [
      { key: "t", voice: "tomas", f: { name: { es: "La taxista", en: "The taxi driver" }, sub: { es: "maneja", en: "drives" } }, m: { name: { es: "El taxista", en: "The taxi driver" }, sub: { es: "maneja", en: "drives" } } }
    ],
    prep: [
      { id: "t01", es: "¿Me [llevás a] Palermo?", en: "Can you take me to Palermo?", p: "llevar a" },
      { id: "t02", es: "A Santa Fe [y] Coronel Díaz.", en: "To Santa Fe and Coronel Díaz (the corner).", p: "la esquina: calle y calle" },
      { id: "t03", es: "[Por la autopista] está bien.", en: "The highway is fine.", p: "por + camino" },
      { id: "t04", es: "¿[Aceptás] tarjeta?", en: "Do you take cards?", p: "aceptar" },
      { id: "t05", es: "[Acá] está bien, gracias.", en: "Here's fine, thanks.", p: "acá" },
      { id: "t06", es: "[Quedate] con el vuelto.", en: "Keep the change.", p: "quedarse con" }
    ],
    vars: { minutos: [[15, 50, 5], [20, 12, 25], [30, 13, 40]], precio: [[9800, 8900, 9080], [11500, 15100, 11050], [12700, 7200, 12070]] },
    steps: [
      { r: "t", es: ["Buenas, ¿adónde vamos?", "Hola, ¿adónde te llevo?", "¡Buenas! ¿Para dónde vamos?", "Hola, ¿qué tal? Decime adónde vamos."] },
      { you: "Ask the driver to take you to the corner of Santa Fe and Coronel Díaz.", ok: [["santa fe", "coronel diaz"]], best: "A Santa Fe y Coronel Díaz, por favor.", alts: ["¿Me llevás a Santa Fe y Coronel Díaz?", "Voy a Palermo, a Santa Fe y Coronel Díaz.", "Santa Fe esquina Coronel Díaz, por favor."], prep: ["t01", "t02"] },
      { r: "t", es: ["Dale. ¿Vamos por la autopista o por Libertador? A esta hora la autopista va más rápido.", "Bárbaro. ¿Querés ir por la autopista o por Libertador? Ahora la autopista está más rápida.", "Perfecto. ¿Autopista o Libertador? A esta hora conviene la autopista.", "Listo. ¿Por la autopista o preferís Libertador? Ahora por la autopista se tarda menos."] },
      { you: "Say the highway is fine.", ok: [["autopista"]], best: "Por la autopista está bien.", alts: ["Sí, por la autopista.", "Dale, vamos por la autopista.", "Lo que sea más rápido. La autopista, entonces."], prep: ["t03"], wrong: [{ said: ["libertador"], r: "t", es: ["Por Libertador vamos a tardar bastante más, eh. Mejor la autopista.", "Uh, por Libertador a esta hora hay un tránsito terrible. Mejor por la autopista, ¿dale?", "Mirá que por Libertador tardamos el doble. ¿Y si vamos por la autopista?"] }] },
      { r: "t", es: ["Hablás bien castellano, eh. ¿Estás estudiando?", "¡Qué bien que hablás! ¿Lo estás estudiando?", "Che, hablás muy bien el castellano. ¿Estudiás?", "Se nota que hablás bastante bien, eh. ¿Tomás clases?"] },
      { you: "Say thanks, you're learning little by little.", ok: [["gracias", "de a poco"], ["gracias", "poco a poco"], ["gracias", "aprend"], ["gracias", "estudi"]], best: "¡Gracias! Estoy aprendiendo de a poco.", alts: ["Gracias, voy aprendiendo de a poco.", "¡Gracias! Sí, estudio un poco todos los días.", "Muchas gracias. Sí, poco a poco."], prep: [] },
      { r: "t", es: ["Llegamos en unos {minutos} minutos, más o menos.", "En {minutos} minutos estamos.", "Calculo que en {minutos} minutos llegamos.", "Son unos {minutos} minutos hasta allá."] },
      { check: "minutos", q: { es: "¿En cuántos minutos llegan?", en: "How many minutes until you get there?" } },
      { you: "Ask if {t:she|he} takes cards.", ok: [["tarjeta"]], best: "¿Aceptás tarjeta?", alts: ["¿Puedo pagar con tarjeta?", "¿Se puede pagar con tarjeta?", "Che, ¿tomás tarjeta?"], prep: ["t04"] },
      { r: "t", es: ["No, solo efectivo o transferencia. Perdoná.", "Uy, no, perdoná. Efectivo o transferencia nomás.", "Tarjeta no, perdón. Te acepto efectivo o transferencia.", "No, lamentablemente no. Solo efectivo o transferencia."] },
      { r: "t", es: ["Bueno, ya estamos. ¿Dónde te dejo?", "Llegamos. ¿Dónde te dejo?", "Bueno, esta es la esquina. ¿Te dejo por acá?", "Ya estamos llegando. ¿En qué parte te dejo?"] },
      { you: "Say right here is fine.", ok: [["aca"], ["aqui"]], best: "Acá está bien, gracias.", alts: ["Acá nomás, gracias.", "Dejame acá, por favor.", "Sí, acá en la esquina está perfecto."], prep: ["t05"] },
      { r: "t", es: ["Son {precio}.", "Serían {precio}.", "Te sale {precio}.", "El reloj marca {precio}."] },
      { check: "precio", q: { es: "¿Cuánto es?", en: "How much is it?" } },
      { you: "Pay in cash and tell {t:her|him} to keep the change.", ok: [["quedate", "vuelto"], ["quedate", "cambio"], ["esta bien asi"], ["vuelto", "para vos"]], best: "Tomá. Quedate con el vuelto.", alts: ["Tomá, está bien así.", "Acá tenés. Quedate con el cambio.", "Tomá, el vuelto es para vos."], prep: ["t06"] },
      { r: "t", es: ["¡Gracias, che! Que andes bien.", "¡Muchas gracias! Que te vaya bien.", "¡Gracias! Que tengas un lindo día.", "¡Qué amable, gracias! Que andes bien."] },
      { you: "Thank the driver and wish {t:her|him} the same.", ok: ["igualmente", ["gracias", "vos tambien"], ["gracias", "tambien"], ["gracias", "para vos"]], best: "¡Gracias, igualmente!", alts: ["Gracias, vos también.", "¡Gracias! Igualmente, chau.", "Gracias, ¡igual para vos!"], prep: [] }
    ]
  },
  {
    id: "delivery", level: "A2",
    name: { es: "Pedir un delivery", en: "Ordering delivery" },
    sub: { es: "Por teléfono: la pizza, la dirección, el cambio", en: "By phone: the pizza, the address, the change" },
    desc: { es: "Es domingo a la noche y no tenés ganas de cocinar. Llamás a la pizzería del barrio.", en: "It's Sunday night and you don't feel like cooking. You call the neighborhood pizzeria." },
    roles: [
      { key: "p", voice: "elena", f: { name: { es: "La pizzería", en: "The pizzeria" }, sub: { es: "la empleada que toma el pedido", en: "the woman taking the order" } }, m: { name: { es: "La pizzería", en: "The pizzeria" }, sub: { es: "el empleado que toma el pedido", en: "the man taking the order" } } }
    ],
    prep: [
      { id: "v01", es: "Quería pedir [una pizza] de muzzarella.", en: "I'd like to order a mozzarella pizza.", p: "quería: más amable que quiero" },
      { id: "v02", es: "[Una grande], por favor.", en: "A large one, please.", p: "grande · chica" },
      { id: "v03", es: "Media docena de empanadas [de carne].", en: "Half a dozen beef empanadas.", p: "de + relleno" },
      { id: "v04", es: "[Tercer piso], departamento B.", en: "Third floor, apartment B.", p: "tercer + sustantivo" },
      { id: "v05", es: "Pago [en efectivo].", en: "I'll pay in cash.", p: "en efectivo" },
      { id: "v06", es: "Pago [con cincuenta mil].", en: "I'll pay with fifty thousand.", p: "pagar con" }
    ],
    vars: { precio: [[24500, 25400, 24050], [31800, 38100, 31080], [27600, 26700, 27060]], minutos: [[40, 14, 45], [30, 13, 35], [45, 54, 15]] },
    steps: [
      { r: "p", es: ["Pizzería Los Amigos, hola. ¿Qué vas a pedir?", "Hola, Los Amigos. ¿Qué te mando?", "Los Amigos, buenas noches. Decime.", "Pizzería Los Amigos, buenas. ¿Qué te preparo?"] },
      { you: "Say you'd like to order a large mozzarella pizza.", ok: [["pizza", "muz"], ["pizza", "moz"], ["grande", "muz"], ["grande", "moz"], ["muzza", "grande"]], best: "Hola, quería pedir una pizza grande de muzzarella.", prep: ["v01", "v02"], wrong: [{ said: ["chica"], r: "p", es: ["¿Chica? Mirá que la grande rinde más. Te pongo una grande, ¿dale?", "¿Una chica? Para dos conviene la grande. Te anoto una grande, ¿sí?"] }], alts: ["Buenas, ¿me mandás una grande de muzza?", "Hola, quería una muzzarella grande.", "Sí, una pizza grande de muzza, por favor."] },
      { r: "p", es: ["Una grande de muzza. ¿Algo más?", "Muzza grande, anotado. ¿Algo más?", "Bien, una grande de muzzarella. ¿Querés algo más?", "Dale, una muzza grande. ¿Te agrego algo?"] },
      { you: "Add half a dozen beef empanadas.", ok: [["media docena", "carne"], ["seis", "carne"], ["6", "carne"]], best: "Sí, media docena de empanadas de carne.", prep: ["v03"], alts: ["Sí, agregame seis empanadas de carne.", "Y media docena de carne, por favor.", "Sí, ¿me sumás media docena de empanadas de carne?"] },
      { r: "p", es: ["Perfecto. ¿Me decís la dirección?", "Listo. ¿A qué dirección te lo mando?", "Bárbaro. ¿Adónde te lo llevamos?", "Anotado. Pasame la dirección."] },
      { you: "Give the address: Gorriti 4500, third floor, apartment B.", ok: [["gorriti", "piso"], ["gorriti", "tercer"], ["gorriti", "tres"], ["gorriti", "3"]], best: "Gorriti 4500, tercer piso, departamento B.", prep: ["v04"], alts: ["Es en Gorriti 4500, piso tres, depto B.", "Gorriti cuatro mil quinientos, tercero B.", "Mandalo a Gorriti 4500, tercer piso, B."] },
      { r: "p", es: ["Gorriti cuatro mil quinientos, tercero B. ¿Cómo vas a pagar?", "Perfecto, Gorriti cuatro mil quinientos, tercero B. ¿Cómo pagás?", "Anoto: Gorriti cuatro mil quinientos, tercer piso, B. ¿Con qué pagás?"] },
      { you: "Say you'll pay in cash.", ok: [["efectivo"]], best: "En efectivo.", prep: ["v05"], wrong: [{ said: ["tarjeta"], r: "p", es: ["Uy, el delivery solo cobra en efectivo. ¿Está bien?", "Mirá, con tarjeta no podemos: el repartidor cobra solo en efectivo. ¿Te sirve?"] }], alts: ["Pago en efectivo.", "En efectivo, por favor.", "Te pago en efectivo."] },
      { r: "p", es: ["Son {precio}. ¿Necesitás cambio?", "Todo junto son {precio}. ¿Necesitás cambio?", "En total te sale {precio}. ¿Te llevo cambio?", "Serían {precio}. ¿Necesitás que te lleven cambio?"] },
      { check: "precio", q: { es: "¿Cuánto sale todo?", en: "How much is it all?" } },
      { you: "Say yes, you'll pay with fifty thousand.", ok: ["cincuenta", ["50 mil"], ["50000"], ["50 000"]], best: "Sí, pago con cincuenta mil.", prep: ["v06"], alts: ["Sí, traeme cambio de cincuenta mil.", "Sí, te pago con cincuenta mil.", "Sí, tengo de cincuenta mil."] },
      { r: "p", es: ["Dale, te mando cambio de cincuenta. Tarda unos {minutos} minutos.", "Listo, el cambio va con el pedido. Llega en unos {minutos} minutos.", "Perfecto, va con cambio de cincuenta. En {minutos} minutos más o menos lo tenés.", "Bárbaro, llevamos cambio. Calculá unos {minutos} minutos y está ahí."] },
      { check: "minutos", q: { es: "¿Cuánto tarda?", en: "How long will it take?" } },
      { you: "Thank {p:her|him} and say bye.", ok: ["gracias", "chau"], best: "¡Perfecto, gracias! Chau.", prep: [], alts: ["Bueno, muchas gracias. Chau.", "Dale, gracias, chau.", "Genial, ¡gracias! Hasta luego."] }
    ]
  },
  {
    id: "medico", level: "A2",
    name: { es: "El turno en el médico", en: "The doctor's appointment" },
    sub: { es: "{s:La recepcionista|El recepcionista} y {d:la doctora|el doctor}", en: "The receptionist and the doctor" },
    desc: { es: "Hace unos días que te duele la garganta. Sacaste turno con {d:la médica clínica|el médico clínico} de tu prepaga. En la recepción te atiende {s:Silvia|Sergio}.", en: "Your throat has hurt for a few days. You booked an appointment with the general practitioner from your health plan. {s:Silvia|Sergio} is at the front desk." },
    roles: [
      { key: "s", voice: "elena", f: { name: { es: "La recepcionista", en: "The receptionist" }, sub: { es: "Silvia", en: "Silvia" } }, m: { name: { es: "El recepcionista", en: "The receptionist" }, sub: { es: "Sergio", en: "Sergio" } } },
      { key: "d", voice: "tomas", f: { name: { es: "La doctora", en: "The doctor" }, sub: { es: "la médica clínica", en: "the general practitioner" } }, m: { name: { es: "El doctor", en: "The doctor" }, sub: { es: "el clínico", en: "the general practitioner" } } }
    ],
    prep: [
      { id: "m01", es: "Tengo [turno] a las diez.", en: "I have an appointment at ten.", p: "el turno" },
      { id: "m02", es: "Sí, [acá tenés].", en: "Yes, here you go.", p: "acá tenés" },
      { id: "m03", es: "Me duele [la garganta].", en: "My throat hurts.", p: "doler, como gustar" },
      { id: "m04", es: "Y [tengo fiebre].", en: "And I have a fever.", p: "tener fiebre" },
      { id: "m05", es: "[Desde el] lunes.", en: "Since Monday.", p: "desde el + día" },
      { id: "m06", es: "Sí, [tomé] ibuprofeno.", en: "Yes, I took ibuprofen.", p: "pretérito: tomé" }
    ],
    vars: { horas: [[8, 6, 12], [6, 8, 4], [8, 18, 6]], hora: [["11:30", "10:30", "11:00"], ["9:15", "9:45", "8:15"], ["10:00", "12:00", "11:00"]] },
    steps: [
      { r: "s", es: ["Buen día, ¿tenés turno?", "Hola, buen día. ¿Tenés turno?", "Buenas, ¿venís con turno?", "Hola, ¿qué tal? ¿Tenés turno con {d:la doctora|el doctor}?"] },
      { you: "Say yes, you have an appointment at ten.", ok: [["diez"], ["10"]], best: "Sí, tengo turno a las diez.", prep: ["m01"], alts: ["Sí, a las diez.", "Sí, tengo turno a las diez con {d:la doctora|el doctor}.", "Hola, sí, tengo uno a las diez."] },
      { r: "s", es: ["¿Me das tu documento y la credencial de la prepaga?", "Bien. ¿Me pasás el DNI y la credencial de la prepaga?", "Perfecto. Necesito tu documento y la credencial, por favor.", "Dale. ¿Tenés a mano el DNI y la credencial de la prepaga?"] },
      { you: "Say yes, here you go.", ok: [["aca"], ["toma"], ["ahi va"], ["ahi tenes"]], best: "Sí, acá tenés.", prep: ["m02"], alts: ["Sí, tomá.", "Sí, claro, acá están.", "Ahí va, el DNI y la credencial."] },
      { r: "s", es: ["Gracias. Tomá asiento, que {d:la doctora|el doctor} te llama enseguida.", "Listo, gracias. Sentate, que enseguida te llama {d:la doctora|el doctor}.", "Bien, ya está. Esperá ahí, que {d:la doctora|el doctor} ya te atiende.", "Gracias. Podés sentarte, {d:la doctora|el doctor} te llama en un ratito."] },
      { r: "s", to: "d", es: ["{d:Doctora|Doctor}, ya llegó su turno de las diez.", "{d:Doctora|Doctor}, el turno de las diez ya está en la sala de espera.", "Permiso, {d:doctora|doctor}. Ya llegó la persona de las diez.", "{d:Doctora|Doctor}, cuando quiera: ya está acá su turno de las diez."] },
      { r: "d", to: "s", es: ["Perfecto, que pase.", "Gracias, {s:Silvia|Sergio}. Que pase, nomás.", "Muy bien, decile que pase.", "Ah, bueno. Que pase, por favor."] },
      { r: "d", es: ["Hola, ¿cómo estás? Contame, ¿qué te pasa?", "Buen día, sentate. ¿Qué te trae por acá?", "Hola, pasá. Decime, ¿qué te anda pasando?", "¿Qué tal? Tomá asiento y contame qué te pasa."] },
      { you: "Say your throat hurts and you have a fever.", ok: [["garganta", "fiebre"]], best: "Me duele la garganta y tengo fiebre.", prep: ["m03", "m04"], alts: ["Tengo fiebre y me duele mucho la garganta.", "Me duele la garganta y además tengo un poco de fiebre.", "Ando con dolor de garganta y fiebre."] },
      { r: "d", es: ["¿Desde cuándo?", "¿Hace cuánto?", "¿Y desde cuándo te pasa?", "¿Hace cuántos días que te sentís así?"] },
      { you: "Since Monday.", ok: [["lunes"]], best: "Desde el lunes.", prep: ["m05"], alts: ["Empezó el lunes.", "Desde el lunes, más o menos.", "Hace unos días, desde el lunes."] },
      { r: "d", es: ["A ver, abrí la boca… Sí, está un poco inflamada. ¿Tomaste algo?", "Abrí grande la boca… Ajá, la tenés bastante colorada. ¿Tomaste algún remedio?", "Dejame ver la garganta… Sí, está inflamada. ¿Tomaste algo para eso?", "A ver, decí «aaa»… Un poco inflamada, sí. ¿Te tomaste algo?"] },
      { you: "Say you took ibuprofen.", ok: [["ibuprofeno"]], best: "Sí, tomé ibuprofeno.", prep: ["m06"], alts: ["Sí, me tomé un ibuprofeno.", "Sí, estuve tomando ibuprofeno.", "Tomé un ibuprofeno anoche."] },
      { r: "d", es: ["Bien. Seguí con el ibuprofeno cada {horas} horas, y tomá mucho líquido.", "Muy bien. Tomá un ibuprofeno cada {horas} horas y mucho líquido.", "Seguí así: ibuprofeno cada {horas} horas, y tomá mucha agua.", "Está bien. El ibuprofeno, cada {horas} horas, y mucho líquido, ¿eh?"] },
      { check: "horas", q: { es: "¿Cada cuántas horas?", en: "How many hours apart?" } },
      { r: "d", to: "s", es: ["{s:Silvia|Sergio}, dale un turno para la semana que viene, por favor.", "{s:Silvia|Sergio}, ¿le das un turno para la semana que viene?", "{s:Silvia|Sergio}, por favor, anotale un control para la semana que viene.", "{s:Silvia|Sergio}, buscale un turno para la próxima semana, ¿sí?"] },
      { r: "s", es: ["¿Te queda bien el martes a {hora}?", "Tengo el martes a {hora}. ¿Te sirve?", "El martes a {hora} hay un lugar. ¿Te viene bien?", "¿Puede ser el martes a {hora}?"] },
      { check: "hora", q: { es: "¿A qué hora es el turno del martes?", en: "What time is Tuesday's appointment?" } },
      { you: "Say yes, perfect, and thank {s:Silvia|Sergio}.", ok: [["perfecto", "gracias"], ["dale", "gracias"], ["si", "gracias"], ["bien", "gracias"]], best: "Sí, perfecto. ¡Gracias!", prep: [], alts: ["Dale, perfecto, gracias.", "Sí, me viene bien. ¡Muchas gracias!", "Perfecto, el martes entonces. Gracias."] }
    ]
  },
  {
    id: "depto", level: "A2",
    name: { es: "Mirar un depto", en: "Seeing an apartment" },
    sub: { es: "{m:La dueña|El dueño} y {r:la encargada|el encargado}", en: "The owner and the building manager" },
    desc: { es: "Encontraste un departamento en alquiler en Villa Crespo. Vas a verlo: te reciben {m:Marta, la dueña|Mario, el dueño}, y {r:Raquel, la encargada|Raúl, el encargado}.", en: "You found an apartment for rent in Villa Crespo. You go to see it: {m:Marta|Mario}, the owner, and {r:Raquel|Raúl}, the building manager, show you around." },
    roles: [
      { key: "m", voice: "elena", f: { name: { es: "Marta", en: "Marta" }, sub: { es: "la dueña", en: "the owner" } }, m: { name: { es: "Mario", en: "Mario" }, sub: { es: "el dueño", en: "the owner" } } },
      { key: "r", voice: "tomas", f: { name: { es: "Raquel", en: "Raquel" }, sub: { es: "la encargada", en: "the building manager" } }, m: { name: { es: "Raúl", en: "Raúl" }, sub: { es: "el encargado", en: "the building manager" } } }
    ],
    prep: [
      { id: "d01", es: "Vengo [a ver] el departamento.", en: "I'm here to see the apartment.", p: "venir a + infinitivo" },
      { id: "d02", es: "¿[Cuántos ambientes] tiene?", en: "How many rooms does it have?", p: "ambientes: el living también cuenta" },
      { id: "d03", es: "¿Las expensas [están incluidas]?", en: "Is the building fee included?", p: "las expensas" },
      { id: "d04", es: "¿Se pueden tener [mascotas]?", en: "Are pets allowed?", p: "se pueden + infinitivo" },
      { id: "d05", es: "¿Cuándo [estaría] disponible?", en: "When would it be available?", p: "condicional de cortesía" },
      { id: "d06", es: "Me [interesa]. ¿Qué necesito?", en: "I'm interested. What do I need?", p: "interesar, como gustar" }
    ],
    vars: { precio: [[650000, 560000, 605000], [720000, 270000, 702000], [600000, 900000, 660000]], precioExp: [[85000, 58000, 85500], [120000, 112000, 102000], [95000, 59000, 90500]] },
    steps: [
      { r: "r", es: ["Hola, ¿qué necesitás?", "Buenas, ¿a quién buscás?", "Hola, buenas tardes. ¿En qué te puedo ayudar?", "Buenas, ¿venís por algo en particular?"] },
      { you: "Say you're here to see the apartment.", ok: [["departamento"], ["depto"]], best: "Hola, vengo a ver el departamento.", prep: ["d01"], alts: ["Hola, vengo por el depto en alquiler.", "Buenas, vine a ver el departamento que se alquila.", "Hola, tengo una visita para ver el depto."] },
      { r: "r", es: ["Ah, sí, {m:la señora Marta|el señor Mario} te está esperando. Vení, te acompaño al tercero B.", "Ah, por el alquiler. {m:Marta|Mario} ya está arriba. Vení, que te llevo al tercero B.", "Sí, sí, {m:la dueña|el dueño} te espera en el tercero B. Vení conmigo.", "Claro, {m:la señora Marta|el señor Mario} ya llegó. Pasá, que subimos al tercero B."] },
      { r: "m", es: ["¡Hola! Pasá, pasá. Este es el living.", "¡Hola, qué tal! Adelante. Acá tenés el living.", "Hola, ¿cómo andás? Pasá. Acá está el living.", "¡Buenas! Entrá, nomás. Mirá, este es el living."] },
      { you: "Ask how many rooms it has.", ok: [["cuantos", "ambientes"], ["cuantas", "habitaciones"], ["cuantos", "cuartos"], ["cuantos", "dormitorios"], ["cuantas", "piezas"]], best: "¿Cuántos ambientes tiene?", prep: ["d02"], alts: ["¿Cuántos ambientes son?", "¿Y cuántos dormitorios tiene?", "¿Cuántas habitaciones tiene el depto?"] },
      { r: "m", es: ["Son tres ambientes: el living y dos dormitorios. Y la cocina da al balcón.", "Tiene tres ambientes, o sea, el living y dos cuartos. La cocina da al balcón.", "Es un tres ambientes: living y dos dormitorios. Y la cocina tiene salida al balcón.", "Tres ambientes: este living más dos dormitorios. Ah, y la cocina da al balcón."] },
      { r: "m", es: ["El alquiler es de {precio} por mes.", "Lo alquilo a {precio} por mes.", "Pido {precio} mensuales de alquiler.", "El alquiler sale {precio} al mes."] },
      { check: "precio", q: { es: "¿Cuánto es el alquiler?", en: "How much is the rent?" } },
      { you: "Ask if the building fee (las expensas) is included.", ok: [["expensas"]], best: "¿Las expensas están incluidas?", prep: ["d03"], alts: ["¿Y las expensas? ¿Están incluidas?", "¿Eso incluye las expensas?", "¿El alquiler incluye las expensas?"] },
      { r: "m", es: ["No, las expensas van aparte. Son más o menos…", "No, las expensas se pagan aparte. Vienen más o menos…", "No, eso es sin expensas. Deben ser unos…", "Aparte. Las expensas son, a ver…"] },
      { r: "m", to: "r", es: ["{r:Raquel|Raúl}, ¿cuánto vinieron este mes?", "{r:Raquel|Raúl}, ¿de cuánto fueron las expensas este mes?", "¿Vos te acordás, {r:Raquel|Raúl}? ¿Cuánto vinieron este mes?", "{r:Raquel|Raúl}, ¿cuánto salieron las expensas este mes?"] },
      { r: "r", to: "m", es: ["Andan por {precioExp}, más o menos.", "Este mes vinieron {precioExp}.", "Fueron {precioExp}, {m:señora|señor}.", "Más o menos {precioExp}, {m:señora Marta|señor Mario}."] },
      { check: "precioExp", q: { es: "¿Cuánto son las expensas?", en: "How much is the building fee?" } },
      { you: "Ask if pets are allowed.", ok: [["mascota"], ["perro"], ["gato"], ["animal"]], best: "¿Se pueden tener mascotas?", prep: ["d04"], alts: ["¿Se puede tener perro?", "¿Aceptan mascotas?", "Tengo un gato, ¿hay algún problema?"] },
      { r: "r", to: "m", es: ["El reglamento permite perros chicos y gatos, ¿no, {m:señora|señor}?", "Por reglamento se aceptan gatos y perros chicos, ¿no es cierto, {m:señora|señor}?", "Gatos y perros chicos se pueden tener, ¿verdad, {m:señora|señor}?", "En el edificio se permiten perros chiquitos y gatos. ¿No, {m:señora Marta|señor Mario}?"] },
      { r: "m", to: "r", es: ["Sí, sí. Chicos, sí.", "Sí, claro. Mientras sean chicos, no hay problema.", "Exacto. Si son chiquitos, sí.", "Sí, sí: perros chicos y gatos, sin problema."] },
      { you: "Ask when it would be available.", ok: [["cuando"], ["disponible"]], best: "¿Cuándo estaría disponible?", prep: ["d05"], alts: ["¿Desde cuándo se puede entrar?", "¿Para cuándo estaría libre?", "¿Cuándo me podría mudar?"] },
      { r: "m", es: ["Desde el primero del mes que viene.", "Queda libre el primero del mes que viene.", "Lo podés tener desde el primero del mes próximo.", "A partir del primero del mes que viene ya está disponible."] },
      { you: "Say you're interested and ask what you need.", ok: [["interesa"], ["necesito"]], best: "Me interesa. ¿Qué necesito?", prep: ["d06"], wrong: [{ said: ["no me interesa"], r: "m", es: ["Ah, bueno, no pasa nada. Gracias por venir.", "Bueno, está bien. Gracias igual por venir a verlo."] }], alts: ["Me encanta. ¿Qué necesito para alquilarlo?", "Me interesa mucho. ¿Qué papeles hacen falta?", "Me gusta, me interesa. ¿Qué tengo que presentar?"] },
      { r: "m", es: ["Una garantía o un seguro de caución, y un mes de depósito. Te paso todo por WhatsApp.", "Necesitás garantía propietaria o seguro de caución, más un mes de depósito. Te mando los detalles por WhatsApp.", "Pido un seguro de caución o una garantía, y un mes de depósito. Después te escribo por WhatsApp con todo.", "Garantía o seguro de caución, y un mes de depósito. Pasame tu número y te mando todo por WhatsApp."] },
      { you: "Thank {m:Marta|Mario}.", ok: [["gracias"]], best: "¡Buenísimo, muchas gracias!", prep: [], alts: ["Genial, gracias. Espero tu mensaje.", "Perfecto, ¡mil gracias!", "Bárbaro, muchas gracias por mostrármelo."] }
    ]
  }
];
