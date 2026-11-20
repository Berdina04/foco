// Idioma de las ventanas. El texto en español es la clave y EN tiene su versión en inglés:
//   t('Estás en {label}', { label })  ->  "Estás en instagram.com" o "You're on instagram.com"
// Si un texto no está en EN, se muestra en español (así nunca queda una ventana vacía).

let lang = 'es';

export const getLang = () => lang;

export function setLang(next) {
  lang = next === 'en' ? 'en' : 'es';
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export function t(es, vars) {
  let s = lang === 'en' && EN[es] != null ? EN[es] : es;
  if (vars && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  return s;
}

/** Formato de hora según el idioma. */
export const locale = () => (lang === 'en' ? 'en-US' : 'es-AR');

// ---------- Textos fijos del HTML ----------
// La primera vez se guardan los textos originales (en español) para poder ir y volver entre idiomas.

const ATTRS = ['placeholder', 'title', 'aria-label'];
let staticTexts = null;

const normalize = (text) => text.replace(/\s+/g, ' ').trim();

function collectStatic() {
  staticTexts = [];
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.currentNode; n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      if (['SCRIPT', 'STYLE'].includes(n.parentNode?.nodeName)) continue;
      const [, lead, , trail] = n.data.match(/^(\s*)([\s\S]*?)(\s*)$/);
      const es = normalize(n.data);
      if (EN[es]) staticTexts.push({ node: n, es, lead, trail });
    } else {
      for (const attr of ATTRS) {
        const value = n.getAttribute(attr);
        if (value && EN[value]) staticTexts.push({ node: n, attr, es: value });
      }
    }
  }
}

/** Traduce los textos fijos del HTML al idioma actual. Llamar antes de dibujar lo dinámico. */
export function translatePage() {
  if (!staticTexts) collectStatic();
  for (const s of staticTexts) {
    if (s.attr) s.node.setAttribute(s.attr, t(s.es));
    else s.node.data = s.lead + t(s.es) + s.trail;
  }
}

// ---------- Inglés ----------

export const EN = {
  // Panel: encabezado y Hoy
  Idioma: 'Language',
  Hoy: 'Today',
  Ajustes: 'Settings',
  '🧱 Me trabé, ayudame': "🧱 I'm stuck, help me",
  'en foco hoy': 'focused today',
  distraído: 'distracted',
  'veces que te desviaste': 'times you drifted',
  'sprints cumplidos': 'sprints completed',
  'Lo que aprendiste de vos hoy': 'What you learned about yourself today',
  'Qué pasó hoy': 'What happened today',
  'Ahora mismo': 'Right now',
  Pestaña: 'Tab',
  Cámara: 'Camera',
  'Cámara flotante': 'Floating camera',
  Calibrar: 'Calibrate',
  'Últimos 7 días (min en foco)': 'Last 7 days (focused min)',
  Monitoreando: 'Monitoring',
  'En pausa': 'Paused',
  'En un corte': 'On a break',
  'Fuera de horario': 'Off hours',
  'Estás en foco': "You're focused",
  Distraído: 'Distracted',
  'Mirando a otro lado': 'Looking away',
  'Lejos de la compu': 'Away from the computer',
  '¿En qué vas a trabajar?': 'What are you going to work on?',
  'Terminar sesión de foco': 'End focus session',
  'Empezar sesión (1 h)': 'Start session (1 h)',
  Reanudar: 'Resume',
  'Pausar 30 min': 'Pause 30 min',
  'Pantalla bloqueada': 'Screen locked',
  'Mirando la pantalla': 'Looking at the screen',
  'Ojos cerrados': 'Eyes closed',
  'No te ve': "Can't see you",
  Desactivada: 'Disabled',
  Apagada: 'Off',
  'Esperando…': 'Waiting…',
  'Sprint en curso': 'Sprint in progress',
  'Premio al terminar: {reward}': 'Reward when done: {reward}',
  Cancelar: 'Cancel',
  'Corte en curso': 'Break in progress',
  Corte: 'Break',
  'Al volver: {first}': "When you're back: {first}",
  'Terminar corte': 'End break',
  '¿En qué estás trabajando ahora?': 'What are you working on right now?',
  'Ej: informe mensual de ventas': 'E.g. monthly sales report',
  'El coach lo usa para ayudarte cuando te distraigas.': 'The coach uses it to help you when you get distracted.',
  'Todavía no hubo distracciones hoy. Cuando aparezcan, acá vas a ver qué te frena y qué te tienta.':
    "No distractions yet today. When they show up, you'll see here what holds you back and what tempts you.",
  'que fue automático': 'that it was automatic',
  'Lo que más te frenó: {label} ({n} vez).': 'What held you back most: {label} ({n} time).',
  'Lo que más te frenó: {label} ({n} veces).': 'What held you back most: {label} ({n} times).',
  'Lo que más te tentó: {label} ({n}).': 'What tempted you most: {label} ({n}).',
  'Te trabaste': 'You got stuck',
  'Te dio fiaca': "You couldn't be bothered",
  'Fue automático': 'It was automatic',
  'Falsa alarma': 'False alarm',
  'Lo contaste': 'You talked it through',
  '👀 Aviso: {label}': '👀 Alert: {label}',
  '🧭 Pediste ayuda al coach': '🧭 You asked the coach for help',
  '🧭 Coach por {label}': '🧭 Coach for {label}',
  '🎯 Sprint de {minutes} min: {goal}': '🎯 {minutes}-min sprint: {goal}',
  '✅ Sprint cumplido': '✅ Sprint completed',
  '🙂 Avanzaste en el sprint': '🙂 You made progress in the sprint',
  '🧱 Te trabaste en el sprint': '🧱 You got stuck in the sprint',
  '✖️ Sprint cancelado': '✖️ Sprint canceled',
  '☕ Corte de {minutes} min: {activity}': '☕ {minutes}-min break: {activity}',
  '↩️ Volviste del corte': '↩️ You came back from the break',
  '💼 Permitido por trabajo': '💼 Allowed for work',
  '↩️ Volviste al foco': '↩️ You got back to focus',
  'Nada todavía.': 'Nothing yet.',
  '{date}: {mins} min en foco': '{date}: {mins} focused min',
  // Disparadores que no son un sitio o una app (vienen del motor)
  cansancio: 'tiredness',
  'mirada fuera de la pantalla': 'gaze off the screen',
  'mirada fija sin avanzar': 'staring without progress',
  'saltando entre ventanas': 'jumping between windows',
  Premio: 'Reward',
  // Consejos del día
  'Antes de cada bloque, escribí el primer paso concreto. Arrancar con eso ya definido baja mucho las escapadas.':
    'Before each block, write down the first concrete step. Starting with that already defined cuts down a lot on escapes.',
  'Juntá las preguntas pendientes y mandalas todas a primera hora, así no te frenan después.':
    "Gather your pending questions and send them all first thing, so they don't hold you up later.",
  'Para lo difícil, usá sprints cortos de 15 min y pedí ayuda al segundo intento fallido.':
    'For the hard stuff, use short 15-min sprints and ask for help after the second failed attempt.',
  'Antes de arrancar algo nuevo, escribí qué significa "terminado".': 'Before starting something new, write down what "done" means.',
  'Partí las tareas grandes en pasos de 25 min la noche anterior.': 'Split big tasks into 25-min steps the night before.',
  'Date permiso explícito para hacer un borrador malo primero.': 'Give yourself explicit permission to make a bad draft first.',
  'Agrupá las tareas aburridas en un solo bloque contrarreloj, con premio al final.':
    'Batch the boring tasks into a single race-the-clock block, with a reward at the end.',
  'Comprometete con tiempo (15 min), no con terminar.': 'Commit to time (15 min), not to finishing.',
  'Revisá si esa tarea se puede simplificar, delegar o hacer al 80%.': 'Check whether that task can be simplified, delegated or done to 80%.',
  'Hacé lo incómodo primero en el día, antes de que crezca.': 'Do the uncomfortable thing first in the day, before it grows.',
  'Antes de cada bloque, escribí el primer paso concreto.': 'Before each block, write down the first concrete step.',
  'Programá cortes reales cada 50-90 minutos; el cansancio empuja a scrollear.':
    'Schedule real breaks every 50-90 minutes; tiredness pushes you to scroll.',
  'Cuando es automático, ayuda poner fricción: cerrá esas pestañas al empezar y sacá las apps del Dock.':
    'When it\'s automatic, adding friction helps: close those tabs when you start and take the apps out of the Dock.',

  // Panel: Ajustes
  'Horario laboral': 'Work hours',
  'Fuera de este horario Foco no te molesta y la cámara se apaga.': "Outside these hours Foco won't bother you and the camera turns off.",
  Bloques: 'Blocks',
  'Separados por coma. Ej: 09:00-13:00, 14:00-18:00': 'Comma-separated. E.g. 09:00-13:00, 14:00-18:00',
  Avisos: 'Alerts',
  'Avisar después de': 'Alert after',
  'segundos en una distracción': 'seconds on a distraction',
  'Primero un aviso suave y, si seguís, uno más insistente': 'A gentle alert first and, if you keep at it, a more insistent one',
  'Insistir si seguís': 'Insist if you keep at it',
  'segundos después del primer aviso': 'seconds after the first alert',
  '"Es por trabajo" permite': '"It\'s for work" allows',
  minutos: 'minutes',
  'Cómo te aviso': 'How I alert you',
  'Aviso flotante arriba a la derecha (recomendado)': 'Floating alert at the top right (recommended)',
  'Ventana grande del coach': 'Large coach window',
  'Con un sonido suave': 'With a soft sound',
  'Además, notificación del sistema': 'Also a system notification',
  'Sitios que distraen': 'Distracting sites',
  'Uno por línea. Podés poner una ruta: "youtube.com/shorts" bloquea Shorts pero no los tutoriales.':
    'One per line. You can include a path: "youtube.com/shorts" blocks Shorts but not tutorials.',
  'Apps que distraen': 'Distracting apps',
  'Nombre exacto de la app, uno por línea (como aparece en el Dock).': 'Exact app name, one per line (as it appears in the Dock).',
  'Usar la cámara para detectar si mirás la pantalla': "Use the camera to detect whether you're looking at the screen",
  'Avisar si no mirás la pantalla durante': "Alert if you don't look at the screen for",
  segundos: 'seconds',
  'Sólo si además no estás usando teclado ni mouse': "Only if you're also not using the keyboard or mouse",
  'Sugerir un corte si tenés los ojos cerrados': 'Suggest a break if your eyes are closed for',
  Sensibilidad: 'Sensitivity',
  Baja: 'Low',
  Media: 'Medium',
  Alta: 'High',
  'Abrir cámara y calibrar': 'Open camera and calibrate',
  'Menú de dopamina sana': 'Healthy dopamine menu',
  'Lo que el coach te ofrece cuando necesitás un corte. Cosas cortas que recargan sin engancharte.':
    'What the coach offers you when you need a break. Short things that recharge you without hooking you.',
  'Señales de bloqueo': "Signs you're stuck",
  'Aunque no te vayas a ninguna distracción, Foco te pregunta si te trabaste cuando…':
    "Even if you don't go to any distraction, Foco asks whether you're stuck when you…",
  '…mirás la pantalla sin tocar nada durante': '…stare at the screen without touching anything for',
  '0 = nunca. Necesita la cámara.': '0 = never. Needs the camera.',
  '…saltás entre muchas ventanas o pestañas en poco tiempo': '…jump between lots of windows or tabs in a short time',
  'Hablar en vez de escribir': 'Talk instead of typing',
  'Mostrar el botón 🎤 en el aviso y en el coach': 'Show the 🎤 button in the alert and in the coach',
  'Se pasa a texto en tu Mac con Whisper: el audio no sale de tu compu. La primera vez se descarga el modelo (unos 250 MB).':
    "It's transcribed on your Mac with Whisper: the audio never leaves your computer. The model is downloaded the first time (about 250 MB).",
  'Descargar ahora': 'Download now',
  'Permiso de micrófono': 'Microphone permission',
  'Entender en qué te trabaste': 'Understand where you got stuck',
  'Cuando te vas a una distracción, Foco lo toma como una señal de que algo pasa: mira en qué estabas trabajando y te dice dónde parece que te trabaste, sin que tengas que escribirlo.':
    "When you go to a distraction, Foco takes it as a sign that something's up: it looks at what you were working on and tells you where you seem to be stuck, without you having to type it.",
  'Leer el título de la ventana en la que trabajás (queda en tu Mac)': "Read the title of the window you're working in (stays on your Mac)",
  'Mandarle a la IA una captura de la pantalla en la que trabajabas (necesita la IA)':
    'Send the AI a screenshot of the screen you were working on (needs the AI)',
  'La captura queda sólo en memoria, nunca se guarda en disco, y se manda únicamente cuando te distraés o aparece una señal de bloqueo. Las apps y sitios de abajo nunca se capturan.':
    'The screenshot stays in memory only, is never saved to disk, and is sent only when you get distracted or a stuck signal appears. The apps and sites below are never captured.',
  'Accesibilidad (títulos):': 'Accessibility (titles):',
  'Dar permiso': 'Grant permission',
  'Grabación de pantalla (capturas):': 'Screen Recording (screenshots):',
  'Nunca leer estas apps': 'Never read these apps',
  'Ni estos sitios': 'Or these sites',
  'Alcanza con una parte del dominio: "banco" cubre todos los homebanking.': 'Part of the domain is enough: "bank" covers every online banking site.',
  'Coach con IA': 'AI coach',
  '(opcional)': '(optional)',
  'Con IA, Foco entiende en qué te trabaste y arma el plan a medida. Se envía a Claude el texto de lo que contás, los títulos de tus ventanas recientes y, si lo activaste arriba, la captura de la pantalla en la que trabajabas. Nunca se envían imágenes de la cámara ni audio. Sin IA, el coach usa su biblioteca de estrategias.':
    'With AI, Foco understands where you got stuck and builds a plan tailored to you. Claude receives the text of what you tell it, the titles of your recent windows and, if you turned it on above, the screenshot of the screen you were working on. Camera images and audio are never sent. Without AI, the coach uses its library of strategies.',
  'Usar IA para armar los planes': 'Use AI to build the plans',
  'API key de Claude': 'Claude API key',
  'Guardar key': 'Save key',
  Modelo: 'Model',
  'Claude Opus 5.5 (mejor calidad)': 'Claude Opus 5.5 (best quality)',
  'Claude Sonnet 5.5 (más rápido)': 'Claude Sonnet 5.5 (faster)',
  'Claude Haiku 5.5 (más barato)': 'Claude Haiku 5.5 (cheapest)',
  'Guardar cambios': 'Save changes',
  '✓ dado': '✓ granted',
  '✗ negado': '✗ denied',
  falta: 'missing',
  'Modelo de voz listo ✓': 'Voice model ready ✓',
  'Descargando… {pct}%': 'Downloading… {pct}%',
  'Modelo descargado ✓': 'Model downloaded ✓',
  'El modelo se descarga la primera vez que hablás.': 'The model is downloaded the first time you speak.',
  '🔒 Key guardada (cifrada en el llavero de tu Mac).': "🔒 Key saved (encrypted in your Mac's keychain).",
  'Usando ANTHROPIC_API_KEY del entorno.': 'Using ANTHROPIC_API_KEY from the environment.',
  'Sin key: el coach usa el plan básico.': 'No key: the coach uses the basic plan.',
  'Guardado ✓': 'Saved ✓',
  'Descargando…': 'Downloading…',
  'Descargando el modelo de voz… {pct}%': 'Downloading the voice model… {pct}%',

  // Aviso flotante
  'Seguís fuera de foco': 'Still out of focus',
  'Fuera de foco': 'Out of focus',
  'Estás en {label}': "You're on {label}",
  'Abriste {label}': 'You opened {label}',
  'Hace un rato que no mirás la pantalla': "You haven't looked at the screen in a while",
  'Se te cierran los ojos': 'Your eyes are closing',
  'Forzar el foco con sueño rinde poco': "Forcing focus when you're sleepy doesn't pay off",
  '¿Te trabaste?': 'Stuck?',
  'Hace unos minutos que mirás la pantalla sin tocar nada': "You've been staring at the screen for a few minutes without touching anything",
  '¿Buscando por dónde seguir?': 'Looking for where to go next?',
  'Saltaste entre muchas ventanas en poco tiempo': 'You jumped between lots of windows in a short time',
  '¿Qué está pasando?': "What's going on?",
  'Contame y te ayudo': "Tell me and I'll help",
  '¿Pudiste: {goal}?': 'Did you manage: {goal}?',
  'Terminó el sprint de {minutes} min': 'Your {minutes}-min sprint is over',
  '¡Bien ahí!': 'Nice one!',
  'Te ganaste: {reward}': 'You earned: {reward}',
  'Date un respiro antes de lo próximo.': 'Take a breather before the next thing.',
  'Avanzar es avanzar': 'Progress is progress',
  '¿Seguimos un rato más con lo mismo, o ajustamos el paso?': 'Keep going a bit longer on the same thing, or adjust the step?',
  '¿Dónde te trabaste?': 'Where did you get stuck?',
  'Ibas a: {goal}': 'You were going to: {goal}',
  'Volvamos: {first}': "Let's get back to: {first}",
  'Terminó el corte. Es lo que dejaste anotado para arrancar.': 'The break is over. This is what you noted down to start with.',
  'Volvamos al foco': "Let's get back to focus",
  'Terminó el corte. ¿Con qué arrancás?': 'The break is over. What will you start with?',
  'Cuesta volver, pasa': 'Getting back is hard, it happens',
  'Contame qué te frena y lo vemos': "Tell me what's holding you back and we'll look at it",
  '¡Bien, volviste!': "Nice, you're back!",
  'Venías en: {work}': 'You were on: {work}',
  Cerrar: 'Close',
  'Es por trabajo ({n} min)': "It's for work ({n} min)",
  'Abrir el coach': 'Open the coach',
  'Mirando en qué estabas…': 'Looking at what you were doing…',
  'Pensando cómo ayudarte…': 'Thinking about how to help…',
  'Estabas en: {x}': 'You were on: {x}',
  'Próximo paso: {x}': 'Next step: {x}',
  'Más ideas para destrabarte': 'More ideas to get unstuck',
  '☕ Hacer un corte': '☕ Take a break',
  '▶ Arrancar {n} min': '▶ Start {n} min',
  '🎤 No es eso, te cuento': "🎤 That's not it, let me explain",
  'Vuelvo al foco': 'Back to it',
  '🎤 Contame qué pasa': "🎤 Tell me what's up",
  'No pude analizarlo: {error}': "Couldn't analyze it: {error}",
  '🔎 ¿En qué me trabé?': '🔎 Where am I stuck?',
  '🧱 Armar un plan': '🧱 Make a plan',
  '🔋 Un corte': '🔋 A break',
  '🧱 Me trabé': "🧱 I'm stuck",
  '😮‍💨 Me da fiaca': "😮‍💨 Can't be bothered",
  '🔋 Otro corte': '🔋 Another break',
  'Con la IA activada, Foco mira en qué estabas y te dice dónde te trabaste.':
    'With AI turned on, Foco looks at what you were doing and tells you where you got stuck.',
  '🎉 ¡Lo hice!': '🎉 I did it!',
  '🙂 Avancé': '🙂 Made progress',
  '¿Qué sigue? Un paso concreto': "What's next? One concrete step",
  '🎁 Tomarme el premio (5 min)': '🎁 Take my reward (5 min)',
  '➡️ Otro sprint': '➡️ Another sprint',
  '😮‍💨 Me cuesta volver': "😮‍💨 It's hard to get back",
  'Ej: responder el mail de Ana': "E.g. reply to Ana's email",
  'Ej: escribir el primer párrafo': 'E.g. write the first paragraph',
  'Contame qué te pasa…': "Tell me what's going on…",
  Enviar: 'Send',
  '🎤 Seguir hablando': '🎤 Keep talking',
  'Te escucho… tocá "Listo" al terminar': 'I\'m listening… tap "Done" when you finish',
  'Pasando a texto lo que dijiste…': 'Transcribing what you said…',
  'Preparando la voz (sólo la primera vez): {pct}%': 'Preparing voice (first time only): {pct}%',

  // Micrófono
  '■ Listo': '■ Done',
  'No escuché nada. Probá de nuevo, un poco más cerca.': "I didn't hear anything. Try again, a little closer.",
  'Foco no tiene permiso para usar el micrófono (Ajustes del Sistema → Privacidad → Micrófono).':
    "Foco doesn't have permission to use the microphone (System Settings → Privacy → Microphone).",
  'No pude abrir el micrófono.': "Couldn't open the microphone.",

  // Coach
  '← Atrás': '← Back',
  'Te escucho… tocá ■ al terminar': "I'm listening… tap ■ when you're done",
  'Te escucho {bars}': "I'm listening {bars}",
  'Pasando a texto…': 'Transcribing…',
  Inhalá: 'Breathe in',
  Sostené: 'Hold',
  Exhalá: 'Breathe out',
  'Exhalá lento': 'Breathe out slowly',
  'Preparate…': 'Get ready…',
  '{n} de {total}': '{n} of {total}',
  'Te fuiste a {label}': 'You went to {label}',
  'Está todo bien: cuando algo se traba, el cerebro sale a buscar dopamina rápida. Antes de seguir, ¿qué está pasando?':
    "It's all good: when something gets stuck, the brain goes looking for quick dopamine. Before moving on, what's going on?",
  '¿Te distrajiste o estás pensando? Contame qué pasa y vemos cómo seguir.':
    "Did you get distracted or are you thinking? Tell me what's up and we'll see how to continue.",
  'Parece que se te cierran los ojos': 'Looks like your eyes are closing',
  'Forzar el foco con sueño rinde poco. ¿Qué necesitás ahora?': "Forcing focus when you're sleepy doesn't pay off. What do you need right now?",
  'Hace unos minutos que mirás la pantalla sin avanzar. Contame qué pasa.':
    "You've been staring at the screen for a few minutes without making progress. Tell me what's up.",
  'Saltaste entre muchas ventanas. Elijamos una cosa.': "You jumped between lots of windows. Let's pick one thing.",
  'Contame y armamos juntos un plan para destrabarte.': "Tell me and we'll make a plan together to get you unstuck.",
  'Me trabé con algo': "I'm stuck on something",
  'No sé cómo seguir, me falta algo o es difícil': "I don't know how to continue, I'm missing something or it's hard",
  'Me da fiaca': "I can't be bothered",
  'Sé lo que tengo que hacer, pero no tengo ganas': "I know what I have to do, but I don't feel like it",
  'Necesito un corte': 'I need a break',
  'Estoy cansado, saturado o con la cabeza quemada': "I'm tired, overloaded or fried",
  'Ni me di cuenta, fue por costumbre': "I didn't even notice, it was habit",
  'Estaba pensando o leyendo en papel': 'I was thinking or reading on paper',
  'Falsa alarma, sigo con lo mío': "False alarm, I'll carry on",
  'Última ventana: {work}': 'Last window: {work}',
  'Es por trabajo (permitir {n} min)': "It's for work (allow {n} min)",
  'Ya vuelvo, cerrar': "I'm going back, close",
  '¿En qué parte exacta?': 'Which exact part?',
  'Lo más concreto posible: "la intro del informe", "el bug del login", "el mail a Juan".':
    'As concrete as possible: "the report intro", "the login bug", "the email to Juan".',
  '¿Qué te da fiaca?': 'What are you putting off?',
  '¿Qué parte es la que MÁS fiaca te da?': 'Which part do you dread the MOST?',
  'Muchas veces no es toda la tarea sino un pedazo puntual. Encontrarlo ya ayuda.':
    "Often it's not the whole task but one specific piece. Finding it already helps.",
  'Ej: el informe mensual': 'E.g. the monthly report',
  'Escribilo como te salga': 'Write it however it comes out',
  '¿En qué estás trabajando?': 'What are you working on?',
  Siguiente: 'Next',
  '¿Qué tipo de traba es?': 'What kind of block is it?',
  '¿Por qué creés que te da fiaca?': "Why do you think you can't be bothered?",
  'Elegí la que más se parezca. No hay respuesta incorrecta.': "Pick the closest one. There's no wrong answer.",
  'Armando un plan para tu caso…': 'Putting together a plan for your case…',
  'Usar el plan rápido': 'Use the quick plan',
  'Arrancar sprint de {n} min': 'Start {n}-min sprint',
  'Plan armado con IA': 'Plan built with AI',
  'Tu plan': 'Your plan',
  'Vamos de a poco': "Let's take it step by step",
  'Ideas para destrabarte': 'Ideas to get unstuck',
  'Tu próximo micro-paso': 'Your next micro-step',
  'Una sola cosa concreta. Cambiala si querés.': 'Just one concrete thing. Change it if you like.',
  '¿Cuánto tiempo le das?': 'How much time will you give it?',
  'Cuando termine, me doy…': "When I'm done, I'll treat myself to…",
  'La dopamina llega igual, pero como premio y no como escape.': 'The dopamine still comes, but as a reward instead of an escape.',
  'No se pudo usar la IA: {error} Te muestro el plan básico.': "Couldn't use the AI: {error} Here's the basic plan.",
  'Ej: seguir con {task}': 'E.g. keep going with {task}',
  'Empezar el corte': 'Start the break',
  'Un corte que recarga': 'A break that recharges',
  'Hagamos un corte de verdad': "Let's take a real break",
  'Scrollear no descansa: le suma estímulo a una cabeza que ya está saturada. Elegí algo que recargue de verdad.':
    "Scrolling isn't rest: it adds stimulation to a head that's already overloaded. Pick something that truly recharges you.",
  '¿Cuánto?': 'How long?',
  'Cuando vuelva, lo primero que voy a hacer es…': "When I'm back, the first thing I'll do is…",
  'Dejarlo escrito hace que volver cueste mucho menos.': 'Writing it down makes getting back much easier.',
  'Respiración cuadrada': 'Box breathing',
  'Seguí el círculo': 'Follow the circle',
  '4 segundos para cada parte. Si te mareás, respirá normal.': '4 seconds for each part. If you feel dizzy, breathe normally.',
  Listo: 'Done',
  'El corte sigue corriendo ({n} min en total). Te aviso cuando termine.': "The break is still running ({n} min total). I'll let you know when it's over.",
  Saltear: 'Skip',
  'Reset de 30 segundos': '30-second reset',
  'Pasa un montón, es un hábito': "It happens a lot, it's a habit",
  'No es falta de voluntad: la mano va sola. Tres respiraciones y volvemos con un paso concreto.':
    "It's not a lack of willpower: your hand moves on its own. Three breaths and we'll come back with a concrete step.",
  Volvemos: "Let's get back",
  '¿Cuál es el próximo paso concreto?': "What's the next concrete step?",
  'En "{task}". Algo que puedas hacer ya, en pocos minutos.': 'In "{task}". Something you can do now, in a few minutes.',
  'Algo que puedas hacer ya, en pocos minutos.': 'Something you can do now, in a few minutes.',
  'Perfecto, seguí': 'Great, carry on',
  'Si te pasa seguido, calibrá la cámara (sobre todo si usás más de un monitor) o bajá la sensibilidad.':
    'If this happens often, calibrate the camera (especially if you use more than one monitor) or lower the sensitivity.',
  'Calibrar cámara': 'Calibrate camera',
  'Fin del sprint': 'Sprint over',
  '¿Cómo te fue?': 'How did it go?',
  'Tu micro-paso era: {goal}': 'Your micro-step was: {goal}',
  '¡Lo hice!': 'I did it!',
  'Avancé, pero no terminé': "I made progress, but didn't finish",
  'Sigue contando': 'It still counts',
  'No, me trabé': 'No, I got stuck',
  'Tomarme el premio (5 min)': 'Take my reward (5 min)',
  'Con alarma: te aviso cuando termine': "With an alarm: I'll let you know when it's over",
  'Seguir con otro sprint': 'Go for another sprint',
  '¿Qué sigue?': "What's next?",
  'Un paso concreto más.': 'One more concrete step.',
  'Fin del corte': 'Break over',
  '¡Volviste!': "You're back!",
  'Esto es lo que dejaste anotado para arrancar:': 'This is what you noted down to start with:',
  '¿Con qué arrancás?': 'What will you start with?',
  'Me cuesta volver': "It's hard to get back",
  'Próximo paso': 'Next step',

  // Cámara y calibración
  'Cámara y calibración': 'Camera and calibration',
  'Todo se procesa en tu Mac. No se graban ni se envían imágenes.': 'Everything is processed on your Mac. No images are recorded or sent.',
  'Iniciando…': 'Starting…',
  'Abrir grande y calibrar': 'Open large and calibrate',
  'Cerrar la cámara flotante': 'Close the floating camera',
  'Cabeza ↔': 'Head ↔',
  'Cabeza ↕': 'Head ↕',
  Mirada: 'Gaze',
  Párpados: 'Eyelids',
  'Sentate como trabajás normalmente, mirá al centro de tu pantalla y apretá':
    'Sit the way you normally work, look at the center of your screen and press',
  '(tarda 3 segundos). Si usás más de un monitor, mirá el otro y apretá':
    '(it takes 3 seconds). If you use more than one monitor, look at the other one and press',
  'Agregar otra pantalla': 'Add another screen',
  'Borrar calibración': 'Clear calibration',
  'Baja: sólo avisa si te das vuelta del todo': 'Low: only alerts if you turn away completely',
  'Alta: avisa ante desvíos chicos': 'High: alerts on small deviations',
  'No te veo': "I can't see you",
  'Cámara apagada (fuera de horario)': 'Camera off (off hours)',
  'Calibrando… mirá la pantalla': 'Calibrating… look at the screen',
  'Cámara apagada': 'Camera off',
  'En pausa: no avisa': 'Paused: no alerts',
  'En un corte: no avisa': 'On a break: no alerts',
  'Fuera de horario: no avisa': 'Off hours: no alerts',
  'Distracción en pantalla: {label}': 'Distraction on screen: {label}',
  'Mirando a otro lado · aviso en {s} s': 'Looking away · alert in {s} s',
  'Estás usando teclado o mouse: no cuenta': "You're using the keyboard or mouse: doesn't count",
  'Mirando a otro lado…': 'Looking away…',
  'No te veo: no cuenta como distracción': "I can't see you: doesn't count as a distraction",
  'No te vi bien. Acercate a la cámara y probá de nuevo.': "I couldn't see you well. Move closer to the camera and try again.",
  '{n} pantalla calibrada': '{n} screen calibrated',
  '{n} pantallas calibradas': '{n} screens calibrated',
  'Sin calibrar (usa valores por defecto)': 'Not calibrated (using default values)',
};
