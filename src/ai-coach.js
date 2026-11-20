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

const TRIGGER_TEXT = {
  site: (l) => `Se fue a un sitio que lo distrae: ${l}`,
  app: (l) => `Abrió una app que lo distrae: ${l}`,
  gaze: () => 'Hace un rato que no mira la pantalla ni toca el teclado',
  drowsy: () => 'Se le cierran los ojos',
  stuck: () => 'Hace varios minutos que mira la pantalla sin tocar teclado ni mouse',
  hopping: () => 'Está saltando entre muchas ventanas y pestañas sin quedarse en ninguna',
  manual: () => 'Pidió ayuda por su cuenta',
  sprint_end: (l) => `Terminó un sprint de foco y dijo que se trabó con el micro-paso: ${l}`,
  break_end: (l) => (l ? `Volvió de un corte y le cuesta arrancar con lo que había anotado: ${l}` : 'Volvió de un corte y le cuesta arrancar'),
};

const FLOW_LABEL = {
  stuck: 'Me trabé con algo',
  fiaca: 'Me da fiaca lo que tengo que hacer',
  auto: 'Fue automático, ni me di cuenta',
};

function buildPrompt(input) {
  const t = input.trigger;
  const lines = [`Qué disparó el aviso: ${t ? (TRIGGER_TEXT[t.type] || TRIGGER_TEXT.manual)(t.label) : TRIGGER_TEXT.manual()}`];
  if (input.workSummary?.length) lines.push(`Ventanas en las que venía trabajando (la primera es la última):\n- ${input.workSummary.join('\n- ')}`);
  if (input.task) lines.push(`Tarea que declaró para hoy: ${input.task}`);
  if (input.flow) lines.push(`Qué le pasa (eligió): ${FLOW_LABEL[input.flow] || input.flow}`);
  if (input.part) lines.push(`Parte donde se traba o que más fiaca le da: ${input.part}`);
  if (input.reasonLabel) lines.push(`Por qué: ${input.reasonLabel}`);
  if (input.previous) {
    lines.push(
      `Tu lectura anterior: estaba en "${input.previous.working_on}" y se trabó en "${input.previous.likely_block}".`
    );
  }
  if (input.transcript) lines.push(`Lo que contó la persona: "${input.transcript}"`);
  lines.push(`Hora local: ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}`);
  if (input.dopamineMenu?.length) lines.push(`Su menú de dopamina sana: ${input.dopamineMenu.join(' | ')}`);
  return lines.join('\n');
}

function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'La API key no es válida.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'Tu cuenta no tiene acceso a ese modelo.';
  if (err instanceof Anthropic.RateLimitError) return 'Demasiados pedidos seguidos. Probá en un rato.';
  if (err instanceof Anthropic.APIConnectionError) return 'No hay conexión con la IA.';
  if (err instanceof Anthropic.APIError) return `La IA respondió con un error (${err.status ?? '?'}).`;
  return err?.message || 'Error desconocido.';
}

/**
 * @param {{apiKey?: string, model?: string, input: object, images?: Buffer[]}} o  images: JPEGs de la pantalla
 * @returns {Promise<{plan?: object, error?: string}>}
 */
async function aiCoach({ apiKey, model = 'claude-opus-5-5', input, images = [] }) {
  let client;
  try {
    // Sin key propia, el SDK usa ANTHROPIC_API_KEY o el perfil de `ant auth login`.
    client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  } catch {
    return { error: 'Falta la API key de Claude (cargala en Ajustes).' };
  }

  const content = [];
  images.forEach((jpeg, i) => {
    content.push({
      type: 'text',
      text: i === 0 ? 'Captura de la pantalla donde venía trabajando:' : 'Otra pantalla que tenía abierta:',
    });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } });
  });
  content.push({ type: 'text', text: buildPrompt(input) });

  const params = {
    model,
    max_tokens: 16000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  };
  if (FALLBACK_MODELS.has(model)) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }

  try {
    const response = await client.beta.messages.create(params, { timeout: 90_000, maxRetries: 1 });
    if (response.stop_reason === 'refusal') return { error: 'La IA no pudo responder esta vez.' };
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const plan = JSON.parse(text);
    plan.strategies = (plan.strategies || []).slice(0, 3);
    plan.sprint_minutes = [10, 15, 25].includes(plan.sprint_minutes) ? plan.sprint_minutes : 15;
    return { plan };
  } catch (err) {
    if (err instanceof SyntaxError) return { error: 'La respuesta de la IA vino incompleta.' };
    return { error: friendlyError(err) };
  }
}

module.exports = { aiCoach, buildPrompt, SCHEMA };
