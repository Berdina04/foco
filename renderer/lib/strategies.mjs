// Biblioteca de estrategias del coach (funciona sin IA).
// Cada motivo tiene: un reencuadre, 3 estrategias concretas, un micro-paso sugerido y la duración del sprint.

// Usa la parte concreta si es corta; si escribiste una explicación larga, se queda con lo primero
// ("la intro, no sé cómo arrancarla" -> "la intro"; "the intro, because…" -> "the intro").
function target({ part, task }, lang = 'es') {
  const short = (text) => {
    const head = String(text || '').split(/[,.;:(]|\s(?:porque|pero|que no|y no|because|but|and I)\s/i)[0].trim();
    return head && head.length <= 60 ? head : '';
  };
  return short(part) || short(task) || (lang === 'en' ? 'the task' : 'la tarea');
}

export const STUCK_REASONS = [
  {
    id: 'start',
    label: 'No sé por dónde empezar',
    reflection:
      'Cuando el primer paso no está claro, el cerebro lo vive como una amenaza y se escapa a algo fácil. La salida es achicar el primer paso hasta que sea ridículo.',
    strategies: [
      { title: 'Paso ridículamente chico', how: '¿Qué es lo mínimo que podés hacer en 2 minutos? Abrir el archivo, poner un título, anotar 3 ideas sueltas.' },
      { title: 'Borrador feo a propósito', how: 'Hacé la peor versión posible. Mejorar algo es mucho más fácil que arrancar de cero.' },
      { title: 'Empezá por el medio', how: 'No hace falta arrancar por el principio: elegí la parte que tenés más clara.' },
    ],
    micro: (a) => `Abrir ${target(a)} y anotar 3 ideas sueltas de cómo podría empezar`,
    minutes: 10,
  },
  {
    id: 'info',
    label: 'Me falta información o una respuesta',
    reflection:
      'No es falta de ganas: te falta un insumo. Mientras llega, se puede avanzar alrededor de ese hueco.',
    strategies: [
      { title: 'Pedilo ahora, en 2 minutos', how: 'Mandá la pregunta concreta a quien sepa. Que sea específica y fácil de responder.' },
      { title: 'Marcá el hueco y seguí', how: 'Dejá un [FALTA: …] y avanzá con todo lo que no depende de eso.' },
      { title: 'Supuesto provisorio', how: 'Asumí la respuesta más probable, anotala, y seguí. Si cambia, ajustás.' },
    ],
    micro: (a) => `Escribir la pregunta exacta que necesito resolver sobre ${target(a)} y mandarla`,
    minutes: 15,
  },
  {
    id: 'hard',
    label: 'Es difícil, no sé cómo resolverlo',
    reflection:
      'Trabarse en algo difícil es parte del trabajo, no una señal de que no podés. Cambiar el ángulo suele destrabar más que insistir.',
    strategies: [
      { title: 'Explicalo por escrito', how: 'Contá el problema como si se lo explicaras a alguien: qué querés lograr, qué probaste y qué pasa. A mitad de camino suele aparecer la respuesta.' },
      { title: 'Resolvé una versión más chica', how: 'Simplificá: un solo caso, un solo dato, una sola parte. Después generalizás.' },
      { title: 'Ponele tiempo y pedí ayuda', how: 'Dale 20 minutos más. Si no sale, preguntale a alguien o buscá un ejemplo resuelto.' },
    ],
    micro: (a) => `Escribir en 5 líneas qué quiero lograr con ${target(a)}, qué probé y qué pasa`,
    minutes: 15,
  },
  {
    id: 'ambiguous',
    label: 'Es confuso, no tengo claro qué hay que hacer',
    reflection:
      'La ambigüedad cansa más que la dificultad. Definir qué significa "terminado" le baja el ruido a la cabeza.',
    strategies: [
      { title: 'Definí "terminado"', how: 'Escribí en una línea cómo te vas a dar cuenta de que esto está listo.' },
      { title: 'Listá las preguntas abiertas', how: 'Anotá todo lo que no está claro y separá lo que podés decidir vos de lo que tenés que preguntar.' },
      { title: 'Decidí y avanzá', how: 'Para lo que depende de vos, elegí la opción razonable y seguí. Casi todo es reversible.' },
    ],
    micro: (a) => `Escribir en una línea qué significa que ${target(a)} esté terminado`,
    minutes: 10,
  },
  {
    id: 'big',
    label: 'Es demasiado grande',
    reflection:
      'Cuando algo es enorme, la cabeza no sabe dónde apoyarse. No tenés que terminarlo hoy: tenés que hacer el próximo pedazo.',
    strategies: [
      { title: 'Partilo en 3 a 5 pasos', how: 'Listá los pasos grandes y agarrá sólo el primero. El resto no existe por ahora.' },
      { title: 'Un pedazo por sprint', how: 'Elegí algo que entre en 25 minutos y olvidate del resto.' },
      { title: 'Hacé visible el avance', how: 'Tachá cada paso al terminarlo. Ese avance es la dopamina que estabas buscando afuera.' },
    ],
    micro: (a) => `Partir ${target(a)} en 3 a 5 pasos y arrancar el primero`,
    minutes: 25,
  },
  {
    id: 'fear',
    label: 'Tengo miedo de que salga mal',
    reflection:
      'El miedo a que salga mal muchas veces se disfraza de distracción. Separar "hacer" de "juzgar" baja la presión.',
    strategies: [
      { title: 'Versión 0.1 que nadie ve', how: 'Hacé una versión sólo para vos, con permiso explícito para que salga mal.' },
      { title: '¿Qué es lo peor realista?', how: 'Escribilo. Casi siempre es corregible y menos grave de lo que parece.' },
      { title: 'Mostralo temprano', how: 'Pedí feedback sobre algo incompleto. Corregir temprano es mucho más barato.' },
    ],
    micro: (a) => `Hacer un borrador de ${target(a)} que nadie va a ver`,
    minutes: 15,
  },
];

export const FIACA_REASONS = [
  {
    id: 'boring',
    label: 'Es aburrida o repetitiva',
    reflection:
      'Las tareas aburridas no dan dopamina por sí solas, por eso el cerebro la sale a buscar afuera. La idea es agregársela a la tarea.',
    strategies: [
      { title: 'Contrarreloj', how: '¿Cuánto podés sacar en 15 minutos? Anotá el número y tratá de superarlo.' },
      { title: 'Combinala con algo lindo', how: 'Tu música preferida o un café rico, pero sólo mientras hacés esto.' },
      { title: 'Premio con fecha', how: 'Definí ahora qué te das al terminar el sprint. La recompensa llega, pero después.' },
    ],
    micro: (a) => `Hacer todo lo que pueda de ${target(a)} en modo contrarreloj`,
    minutes: 15,
  },
  {
    id: 'long',
    label: 'Es larga, no le veo el final',
    reflection:
      'Mirar todo lo que falta paraliza. Comprometerte con un rato corto, no con terminar, saca ese peso.',
    strategies: [
      { title: 'Sólo 15 minutos', how: 'El compromiso es el tiempo, no el resultado. Si después querés seguir, mejor.' },
      { title: 'Marcá hitos', how: 'Partila en pedazos y tachá cada uno. Ver el avance motiva.' },
      { title: 'La parte más fea primero', how: 'Sacala de encima al principio; lo que sigue se hace cuesta abajo.' },
    ],
    micro: (a) => `Trabajar 15 minutos en ${target(a)} sin pensar en terminarlo`,
    minutes: 15,
  },
  {
    id: 'meaning',
    label: 'No le veo el sentido',
    reflection:
      'Cuesta mucho poner energía en algo que parece no importar. Encontrarle el para qué, o achicarlo, ayuda.',
    strategies: [
      { title: 'Conectala con algo tuyo', how: '¿A quién ayuda esto o qué te destraba a vos? Escribilo en una línea.' },
      { title: 'Cuestioná el alcance', how: 'Capaz se puede simplificar, delegar o hacer al 80%.' },
      { title: 'Versión mínima aceptable', how: 'Si no importa tanto, no merece perfeccionismo: hacela suficientemente bien y listo.' },
    ],
    micro: (a) => `Escribir para qué sirve ${target(a)} y hacer la versión mínima aceptable`,
    minutes: 15,
  },
  {
    id: 'uncomfortable',
    label: 'Es incómoda (llamar, escribir algo difícil, pedir algo)',
    reflection:
      'La incomodidad dura unos minutos; postergarla la estira todo el día. Bajar la fricción del primer movimiento es la clave.',
    strategies: [
      { title: 'Guion de 3 líneas', how: 'Antes de llamar o escribir, anotá en 3 líneas lo que querés decir.' },
      { title: 'Cuenta regresiva', how: 'Contá 5-4-3-2-1 y hacé el primer movimiento: marcar, abrir el mail, escribir el saludo.' },
      { title: 'Primero esto', how: 'Hacela antes que cualquier otra cosa y sacátela de encima.' },
    ],
    micro: (a) => `Escribir un guion de 3 líneas para ${target(a)} y hacer el primer movimiento`,
    minutes: 10,
  },
  {
    ...STUCK_REASONS[0],
    label: 'No sé cómo arrancar',
  },
  {
    id: 'energy',
    label: 'Estoy sin energía',
    reflection:
      'Sin energía, scrollear no recarga: cansa más. Un corte real de 5 a 10 minutos rinde mucho más.',
    strategies: [],
    micro: (a) => `Volver a ${target(a)} después de un corte corto`,
    minutes: 15,
    suggestBreak: true,
  },
];

export const REASONS = { stuck: STUCK_REASONS, fiaca: FIACA_REASONS };

// Versión en inglés de cada motivo, por `${flujo}:${id}`. Los minutos y el id son los mismos.
const en = (a) => target(a, 'en');
const EN_STUCK_START = {
  label: "I don't know where to start",
  reflection:
    "When the first step isn't clear, the brain treats it as a threat and escapes to something easy. The way out is to shrink the first step until it's ridiculous.",
  strategies: [
    { title: 'Ridiculously small step', how: "What's the least you can do in 2 minutes? Open the file, write a title, jot down 3 loose ideas." },
    { title: 'Ugly draft on purpose', how: 'Make the worst possible version. Improving something is much easier than starting from scratch.' },
    { title: 'Start in the middle', how: "You don't have to start at the beginning: pick the part you're clearest on." },
  ],
  micro: (a) => `Open ${en(a)} and jot down 3 loose ideas for how it could start`,
};

const EN_REASONS = {
  'stuck:start': EN_STUCK_START,
  'stuck:info': {
    label: "I'm missing information or an answer",
    reflection: "It's not a lack of motivation: you're missing an input. While it arrives, you can make progress around that gap.",
    strategies: [
      { title: 'Ask for it now, in 2 minutes', how: 'Send the exact question to someone who knows. Make it specific and easy to answer.' },
      { title: 'Mark the gap and move on', how: "Leave a [MISSING: …] and move forward with everything that doesn't depend on it." },
      { title: 'Provisional assumption', how: 'Assume the most likely answer, write it down and keep going. If it changes, you adjust.' },
    ],
    micro: (a) => `Write the exact question I need answered about ${en(a)} and send it`,
  },
  'stuck:hard': {
    label: "It's hard, I don't know how to solve it",
    reflection:
      "Getting stuck on something hard is part of the work, not a sign that you can't do it. Changing the angle usually unblocks more than pushing harder.",
    strategies: [
      { title: 'Explain it in writing', how: 'Describe the problem as if you were explaining it to someone: what you want to achieve, what you tried and what happens. Halfway through, the answer often shows up.' },
      { title: 'Solve a smaller version', how: 'Simplify: a single case, a single data point, a single part. Generalize afterwards.' },
      { title: 'Set a time limit, ask for help', how: "Give it 20 more minutes. If it doesn't work out, ask someone or look for a solved example." },
    ],
    micro: (a) => `Write in 5 lines what I want to achieve with ${en(a)}, what I tried and what happens`,
  },
  'stuck:ambiguous': {
    label: "It's confusing, I'm not clear on what needs to be done",
    reflection: 'Ambiguity is more tiring than difficulty. Defining what "done" means turns down the noise in your head.',
    strategies: [
      { title: 'Define "done"', how: "Write in one line how you'll know this is finished." },
      { title: 'List the open questions', how: "Write down everything that isn't clear and separate what you can decide yourself from what you need to ask." },
      { title: 'Decide and move on', how: "For what's up to you, pick the reasonable option and keep going. Almost everything is reversible." },
    ],
    micro: (a) => `Write in one line what it means for ${en(a)} to be done`,
  },
  'stuck:big': {
    label: "It's too big",
    reflection:
      "When something is huge, your head doesn't know where to land. You don't have to finish it today: you have to do the next piece.",
    strategies: [
      { title: 'Split it into 3 to 5 steps', how: "List the big steps and take only the first one. The rest doesn't exist for now." },
      { title: 'One piece per sprint', how: 'Pick something that fits in 25 minutes and forget about the rest.' },
      { title: 'Make progress visible', how: 'Cross off each step when you finish it. That progress is the dopamine you were looking for elsewhere.' },
    ],
    micro: (a) => `Split ${en(a)} into 3 to 5 steps and start the first one`,
  },
  'stuck:fear': {
    label: "I'm afraid it'll turn out badly",
    reflection: 'Fear of it going badly often disguises itself as distraction. Separating "doing" from "judging" lowers the pressure.',
    strategies: [
      { title: 'Version 0.1 nobody sees', how: 'Make a version just for you, with explicit permission for it to turn out badly.' },
      { title: "What's the realistic worst case?", how: "Write it down. It's almost always fixable and less serious than it seems." },
      { title: 'Show it early', how: 'Ask for feedback on something unfinished. Correcting early is much cheaper.' },
    ],
    micro: (a) => `Make a draft of ${en(a)} that nobody will see`,
  },
  'fiaca:boring': {
    label: "It's boring or repetitive",
    reflection:
      "Boring tasks don't give any dopamine on their own, so the brain goes looking for it elsewhere. The idea is to add some to the task.",
    strategies: [
      { title: 'Beat the clock', how: 'How much can you get done in 15 minutes? Write down the number and try to beat it.' },
      { title: 'Pair it with something nice', how: 'Your favorite music or a good coffee, but only while you do this.' },
      { title: 'A reward with a date', how: "Decide now what you'll give yourself when the sprint ends. The reward comes, but afterwards." },
    ],
    micro: (a) => `Get as much of ${en(a)} done as I can, racing the clock`,
  },
  'fiaca:long': {
    label: "It's long, I can't see the end",
    reflection: "Looking at everything that's left is paralyzing. Committing to a short stretch, not to finishing, takes that weight off.",
    strategies: [
      { title: 'Just 15 minutes', how: 'The commitment is the time, not the result. If you want to keep going afterwards, even better.' },
      { title: 'Set milestones', how: 'Split it into pieces and cross each one off. Seeing progress is motivating.' },
      { title: 'Ugliest part first', how: 'Get it out of the way at the start; what follows is downhill.' },
    ],
    micro: (a) => `Work on ${en(a)} for 15 minutes without thinking about finishing it`,
  },
  'fiaca:meaning': {
    label: "I don't see the point",
    reflection: "It's really hard to put energy into something that doesn't seem to matter. Finding what it's for, or shrinking it, helps.",
    strategies: [
      { title: 'Connect it to something yours', how: 'Who does this help, or what does it unblock for you? Write it in one line.' },
      { title: 'Question the scope', how: 'Maybe it can be simplified, delegated or done to 80%.' },
      { title: 'Minimum acceptable version', how: "If it doesn't matter that much, it doesn't deserve perfectionism: do it well enough and move on." },
    ],
    micro: (a) => `Write what ${en(a)} is for and do the minimum acceptable version`,
  },
  'fiaca:uncomfortable': {
    label: "It's uncomfortable (calling, writing something hard, asking for something)",
    reflection:
      'The discomfort lasts a few minutes; putting it off stretches it across the whole day. Lowering the friction of the first move is the key.',
    strategies: [
      { title: '3-line script', how: 'Before calling or writing, jot down in 3 lines what you want to say.' },
      { title: 'Countdown', how: 'Count 5-4-3-2-1 and make the first move: dial, open the email, write the greeting.' },
      { title: 'This first', how: 'Do it before anything else and get it off your plate.' },
    ],
    micro: (a) => `Write a 3-line script for ${en(a)} and make the first move`,
  },
  'fiaca:start': { ...EN_STUCK_START, label: "I don't know how to get going" },
  'fiaca:energy': {
    label: 'I have no energy',
    reflection: "With no energy, scrolling doesn't recharge you: it drains you more. A real 5 to 10 minute break pays off much more.",
    strategies: [],
    micro: (a) => `Get back to ${en(a)} after a short break`,
  },
};

/** Motivos de un flujo ('stuck' | 'fiaca') en el idioma pedido. */
export function reasonsFor(flow, lang = 'es') {
  const list = REASONS[flow] || [];
  return lang === 'en' ? list.map((r) => ({ ...r, ...EN_REASONS[`${flow}:${r.id}`] })) : list;
}

export function findReason(flow, id, lang = 'es') {
  return reasonsFor(flow, lang).find((r) => r.id === id) || null;
}

/** Plan sin IA a partir de las respuestas. */
export function rulePlan(flow, reasonId, answers = {}, lang = 'es') {
  const r = findReason(flow, reasonId, lang) || reasonsFor('stuck', lang)[0];
  const label = answers.triggerLabel;
  const reward =
    lang === 'en'
      ? label
        ? `5 minutes of ${label} with an alarm, as a reward and not an escape`
        : '5 minutes of something you enjoy, with an alarm'
      : label
        ? `5 minutos de ${label} con alarma, como premio y no como escape`
        : '5 minutos de algo que te guste, con alarma';
  return {
    reflection: r.reflection,
    strategies: r.strategies,
    micro_step: r.micro(answers),
    sprint_minutes: r.minutes,
    reward_idea: reward,
    suggestBreak: !!r.suggestBreak,
  };
}
