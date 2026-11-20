// Biblioteca de estrategias del coach (funciona sin IA).
// Cada motivo tiene: un reencuadre, 3 estrategias concretas, un micro-paso sugerido y la duración del sprint.

// Usa la parte concreta si es corta; si escribiste una explicación larga, se queda con lo primero
// ("la intro, no sé cómo arrancarla" -> "la intro").
function target({ part, task }) {
  const short = (text) => {
    const head = String(text || '').split(/[,.;:(]|\s(?:porque|pero|que no|y no)\s/i)[0].trim();
    return head && head.length <= 60 ? head : '';
  };
  return short(part) || short(task) || 'la tarea';
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

export function findReason(flow, id) {
  return (REASONS[flow] || []).find((r) => r.id === id) || null;
}

/** Plan sin IA a partir de las respuestas. */
export function rulePlan(flow, reasonId, answers = {}) {
  const r = findReason(flow, reasonId) || STUCK_REASONS[0];
  const label = answers.triggerLabel;
  return {
    reflection: r.reflection,
    strategies: r.strategies,
    micro_step: r.micro(answers),
    sprint_minutes: r.minutes,
    reward_idea: label
      ? `5 minutos de ${label} con alarma, como premio y no como escape`
      : '5 minutos de algo que te guste, con alarma',
    suggestBreak: !!r.suggestBreak,
  };
}
