// Coach con IA (opcional). Recibe lo que haga falta para entender en qué te trabaste:
// qué disparó el aviso, las ventanas en las que venías trabajando, capturas de esa pantalla
// (si activaste "leer pantalla") y lo que contaste escribiendo o hablando.
// Nunca se envían imágenes de la cámara.
const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM = `Sos el coach de foco de una app de escritorio. Se activa cuando la persona se distrae en horario laboral o muestra señales de estar bloqueada.

Vas a recibir parte de esto:
- Qué disparó el aviso.
- Dónde venía trabajando: ventanas recientes y, a veces, capturas de la pantalla en la que trabajaba justo antes.
- Lo que la persona te contó, escrito o dictado por voz (puede tener errores de transcripción).
- Respuestas a un cuestionario corto (tarea, parte, motivo).

Tu trabajo: entender en qué estaba y dónde se trabó, y ayudarla a volver sin retarla. Asumí que la distracción es una búsqueda de alivio o de dopamina rápida porque algo se trabó o le da fiaca, no falta de voluntad.

Sobre las capturas:
- Mirá qué hay en pantalla (código, un documento, una planilla, un error, un mail a medio escribir) y sé concreto: "el TypeError en engine.js", "el párrafo de conclusiones del informe".
- No inventes lo que no se ve. Si no está claro, decilo y usá la pregunta para averiguarlo.
- No menciones datos personales o sensibles que aparezcan (mensajes privados, datos bancarios, contraseñas). Enfocate en el trabajo.

Respondé en español rioplatense (vos), cálido, directo y breve. Nada de sermones ni frases motivacionales vacías.

Campos:
- working_on: qué estaba haciendo, en una frase concreta de hasta 15 palabras. Vacío si no hay forma de saberlo.
- likely_block: dónde parece estar trabada y por qué, en una frase. Si la persona lo contó, basate en eso.
- question: una pregunta corta para confirmar tu lectura o para destrabar el próximo paso.
- flow: stuck (se trabó), fiaca (no tiene ganas), tired (está cansada), auto (fue automático), unclear.
- reflection: 1 o 2 oraciones que validen lo que le pasa y lo reencuadren.
- strategies: exactamente 3, específicas para su caso. title de hasta 6 palabras; how de 1 o 2 oraciones accionables.
- micro_step: una sola acción concreta de 5 a 10 minutos, empezando con un verbo en infinitivo y nombrando lo que tiene en pantalla o la tarea.
- sprint_minutes: 10, 15 o 25 (más traba, sprint más corto).
- reward_idea: una recompensa chica y sana para después del sprint; si alguna opción de su menú de dopamina encaja, usala.

Si está cansada (flow tired), que las estrategias sean un corte real y el micro_step lo primero que hará al volver. Si expresa angustia fuerte, priorizá una pausa real y hablar con alguien de confianza.`;

// El mismo prompt para quien usa la app en inglés. Si cambiás uno, cambiá el otro.
const SYSTEM_EN = `You are the focus coach in a desktop app. You're activated when the person gets distracted during work hours or shows signs of being stuck.

You'll receive some of this:
- What triggered the alert.
- Where they were working: recent windows and, sometimes, screenshots of the screen they were working on just before.
- What the person told you, typed or dictated by voice (it may have transcription errors).
- Answers to a short questionnaire (task, part, reason).

Your job: understand what they were doing and where they got stuck, and help them get back without scolding them. Assume the distraction is a search for relief or quick dopamine because something got stuck or feels like a drag, not a lack of willpower.

About the screenshots:
- Look at what's on screen (code, a document, a spreadsheet, an error, a half-written email) and be specific: "the TypeError in engine.js", "the conclusions paragraph of the report".
- Don't make up what you can't see. If it isn't clear, say so and use the question to find out.
- Don't mention personal or sensitive data that appears (private messages, bank details, passwords). Focus on the work.

Respond in English: warm, direct and brief. No lectures and no empty motivational phrases.

Fields:
- working_on: what they were doing, in one concrete phrase of up to 15 words. Empty if there's no way to know.
- likely_block: where they seem to be stuck and why, in one sentence. If the person told you, base it on that.
- question: a short question to confirm your reading or to unblock the next step.
- flow: stuck (got stuck), fiaca (doesn't feel like doing it), tired (is tired), auto (it was automatic), unclear.
- reflection: 1 or 2 sentences that validate what's happening to them and reframe it.
- strategies: exactly 3, specific to their case. title up to 6 words; how in 1 or 2 actionable sentences.
- micro_step: a single concrete action of 5 to 10 minutes, starting with a verb and naming what's on screen or the task.
- sprint_minutes: 10, 15 or 25 (the more stuck, the shorter the sprint).
- reward_idea: a small, healthy reward for after the sprint; if an option from their dopamine menu fits, use it.

If they're tired (flow tired), make the strategies a real break and the micro_step the first thing they'll do when they're back. If they express strong distress, prioritize a real pause and talking to someone they trust.`;

const SCHEMA = {
  type: 'object',
  properties: {
    working_on: { type: 'string' },
    likely_block: { type: 'string' },
    question: { type: 'string' },
    flow: { type: 'string', enum: ['stuck', 'fiaca', 'tired', 'auto', 'unclear'] },
    reflection: { type: 'string' },
    strategies: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, how: { type: 'string' } },
        required: ['title', 'how'],
        additionalProperties: false,
      },
    },
    micro_step: { type: 'string' },
    sprint_minutes: { type: 'integer' },
    reward_idea: { type: 'string' },
  },
  required: [
    'working_on',
    'likely_block',
    'question',
    'flow',
    'reflection',
    'strategies',
    'micro_step',
    'sprint_minutes',
    'reward_idea',
  ],
  additionalProperties: false,
};

// Modelos que aceptan fallbacks: "default" del lado del servidor.
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

// Textos del pedido y de los errores en cada idioma. Los errores se muestran dentro de
// "No pude analizarlo: …" y "No se pudo usar la IA: … Te muestro el plan básico.".
const COPY = {
  es: {
    system: SYSTEM,
    locale: 'es-AR',
    trigger: {
      site: (l) => `Se fue a un sitio que lo distrae: ${l}`,
      app: (l) => `Abrió una app que lo distrae: ${l}`,
      gaze: () => 'Hace un rato que no mira la pantalla ni toca el teclado',
      drowsy: () => 'Se le cierran los ojos',
      stuck: () => 'Hace varios minutos que mira la pantalla sin tocar teclado ni mouse',
      hopping: () => 'Está saltando entre muchas ventanas y pestañas sin quedarse en ninguna',
      manual: () => 'Pidió ayuda por su cuenta',
      sprint_end: (l) => `Terminó un sprint de foco y dijo que se trabó con el micro-paso: ${l}`,
      break_end: (l) =>
        l ? `Volvió de un corte y le cuesta arrancar con lo que había anotado: ${l}` : 'Volvió de un corte y le cuesta arrancar',
    },
    flow: {
      stuck: 'Me trabé con algo',
      fiaca: 'Me da fiaca lo que tengo que hacer',
      auto: 'Fue automático, ni me di cuenta',
    },
    lines: {
      trigger: 'Qué disparó el aviso',
      windows: 'Ventanas en las que venía trabajando (la primera es la última)',
      task: 'Tarea que declaró para hoy',
      flow: 'Qué le pasa (eligió)',
      part: 'Parte donde se traba o que más fiaca le da',
      reason: 'Por qué',
      previous: (p) => `Tu lectura anterior: estaba en "${p.working_on}" y se trabó en "${p.likely_block}".`,
      transcript: 'Lo que contó la persona',
      time: 'Hora local',
      dopamine: 'Su menú de dopamina sana',
    },
    shots: ['Captura de la pantalla donde venía trabajando:', 'Otra pantalla que tenía abierta:'],
    errors: {
      auth: 'La API key no es válida.',
      permission: 'Tu cuenta no tiene acceso a ese modelo.',
      rate: 'Demasiados pedidos seguidos. Probá en un rato.',
      connection: 'No hay conexión con la IA.',
      api: (status) => `La IA respondió con un error (${status}).`,
      unknown: 'Error desconocido.',
      noKey: 'Falta la API key de Claude (cargala en Ajustes).',
      refusal: 'La IA no pudo responder esta vez.',
      incomplete: 'La respuesta de la IA vino incompleta.',
    },
  },
  en: {
    system: SYSTEM_EN,
    locale: 'en-US',
    trigger: {
      site: (l) => `Went to a site that distracts them: ${l}`,
      app: (l) => `Opened an app that distracts them: ${l}`,
      gaze: () => "Hasn't looked at the screen or touched the keyboard in a while",
      drowsy: () => 'Their eyes are closing',
      stuck: () => 'Has been staring at the screen for several minutes without touching the keyboard or mouse',
      hopping: () => 'Is jumping between lots of windows and tabs without staying on any',
      manual: () => 'Asked for help on their own',
      sprint_end: (l) => `Finished a focus sprint and said they got stuck on the micro-step: ${l}`,
      break_end: (l) =>
        l ? `Came back from a break and is struggling to start what they had noted down: ${l}` : 'Came back from a break and is struggling to get started',
    },
    flow: {
      stuck: "I'm stuck on something",
      fiaca: "I can't be bothered with what I have to do",
      auto: "It was automatic, I didn't even notice",
    },
    lines: {
      trigger: 'What triggered the alert',
      windows: 'Windows they had been working in (the first is the most recent)',
      task: 'Task they declared for today',
      flow: "What's happening to them (they chose)",
      part: 'Part where they get stuck or that they dread most',
      reason: 'Why',
      previous: (p) => `Your previous reading: they were on "${p.working_on}" and got stuck on "${p.likely_block}".`,
      transcript: 'What the person said',
      time: 'Local time',
      dopamine: 'Their healthy dopamine menu',
    },
    shots: ['Screenshot of the screen they were working on:', 'Another screen they had open:'],
    errors: {
      auth: 'The API key is not valid.',
      permission: "Your account doesn't have access to that model.",
      rate: 'Too many requests in a row. Try again in a bit.',
      connection: 'No connection to the AI.',
      api: (status) => `The AI responded with an error (${status}).`,
      unknown: 'Unknown error.',
      noKey: 'The Claude API key is missing (add it in Settings).',
      refusal: "The AI couldn't respond this time.",
      incomplete: "The AI's response came back incomplete.",
    },
  },
};
const copyFor = (lang) => COPY[lang] || COPY.es;

/**
 * Arma el texto del pedido con lo que se sabe de la persona.
 * @param {object} input
 * @param {string} [lang]  'es' | 'en'
 */
function buildPrompt(input, lang = 'es') {
  const c = copyFor(lang);
  const L = c.lines;
  const tr = input.trigger;
  const lines = [`${L.trigger}: ${tr ? (c.trigger[tr.type] || c.trigger.manual)(tr.label) : c.trigger.manual()}`];
  if (input.workSummary?.length) lines.push(`${L.windows}:\n- ${input.workSummary.join('\n- ')}`);
  if (input.task) lines.push(`${L.task}: ${input.task}`);
  if (input.flow) lines.push(`${L.flow}: ${c.flow[input.flow] || input.flow}`);
  if (input.part) lines.push(`${L.part}: ${input.part}`);
  if (input.reasonLabel) lines.push(`${L.reason}: ${input.reasonLabel}`);
  if (input.previous) lines.push(L.previous(input.previous));
  if (input.transcript) lines.push(`${L.transcript}: "${input.transcript}"`);
  lines.push(`${L.time}: ${new Date().toLocaleTimeString(c.locale, { hour: '2-digit', minute: '2-digit', hour12: false })}`);
  if (input.dopamineMenu?.length) lines.push(`${L.dopamine}: ${input.dopamineMenu.join(' | ')}`);
  return lines.join('\n');
}

function friendlyError(err, lang) {
  const e = copyFor(lang).errors;
  if (err instanceof Anthropic.AuthenticationError) return e.auth;
  if (err instanceof Anthropic.PermissionDeniedError) return e.permission;
  if (err instanceof Anthropic.RateLimitError) return e.rate;
  if (err instanceof Anthropic.APIConnectionError) return e.connection;
  if (err instanceof Anthropic.APIError) return e.api(err.status ?? '?');
  return err?.message || e.unknown;
}

/**
 * @param {{apiKey?: string, model?: string, lang?: string, input: object, images?: Buffer[]}} o
 *   images: JPEGs de la pantalla. lang: idioma del plan y de los errores ('es' | 'en').
 * @returns {Promise<{plan?: object, error?: string}>}
 */
async function aiCoach({ apiKey, model = 'claude-opus-5-5', lang = 'es', input, images = [] }) {
  const c = copyFor(lang);
  let client;
  try {
    // Sin key propia, el SDK usa ANTHROPIC_API_KEY o el perfil de `ant auth login`.
    client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  } catch {
    return { error: c.errors.noKey };
  }

  const content = [];
  images.forEach((jpeg, i) => {
    content.push({ type: 'text', text: c.shots[i === 0 ? 0 : 1] });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } });
  });
  content.push({ type: 'text', text: buildPrompt(input, lang) });

  const params = {
    model,
    max_tokens: 16000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: c.system,
    messages: [{ role: 'user', content }],
  };
  if (FALLBACK_MODELS.has(model)) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }

  try {
    const response = await client.beta.messages.create(params, { timeout: 90_000, maxRetries: 1 });
    if (response.stop_reason === 'refusal') return { error: c.errors.refusal };
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const plan = JSON.parse(text);
    plan.strategies = (plan.strategies || []).slice(0, 3);
    plan.sprint_minutes = [10, 15, 25].includes(plan.sprint_minutes) ? plan.sprint_minutes : 15;
    return { plan };
  } catch (err) {
    if (err instanceof SyntaxError) return { error: c.errors.incomplete };
    return { error: friendlyError(err, lang) };
  }
}

module.exports = { aiCoach, buildPrompt, SCHEMA };
