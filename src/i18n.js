// Textos del proceso principal (menú de la barra, notificaciones, errores) en inglés.
// Igual que en renderer/lib/i18n.mjs: el texto en español es la clave y {nombre} se reemplaza.

const EN = {
  // Menú de la barra
  'Sprint: {goal}': 'Sprint: {goal}',
  'En sprint de foco': 'In a focus sprint',
  'Monitoreando el foco': 'Monitoring focus',
  'En pausa': 'Paused',
  'En un corte': 'On a break',
  'Fuera de horario': 'Off hours',
  'Abrir panel': 'Open panel',
  'Me trabé, ayudame': "I'm stuck, help me",
  'Terminar sesión de foco': 'End focus session',
  'Empezar sesión de foco (1 h)': 'Start focus session (1 h)',
  'Terminar el corte ahora': 'End the break now',
  Reanudar: 'Resume',
  'Pausar 30 min': 'Pause 30 min',
  'Ocultar cámara flotante': 'Hide floating camera',
  'Cámara flotante': 'Floating camera',
  'Cámara y calibración': 'Camera and calibration',
  'Salir de Foco': 'Quit Foco',

  // Notificaciones
  'Hace un rato que no mirás la pantalla. ¿Volvemos?': "You haven't looked at the screen in a while. Shall we get back to it?",
  'Estás en {label}. ¿Volvemos?': "You're on {label}. Shall we get back to it?",
  'Estás en {label}. ¿Volvemos a "{task}"?': 'You\'re on {label}. Shall we get back to "{task}"?',
  '🎯 Seguís fuera de foco': '🎯 Still out of focus',
  '🎯 Fuera de foco': '🎯 Out of focus',
  'Estás en {label}': "You're on {label}",
  Volvamos: "Let's get back to it",
  '⏰ Terminó el sprint': '⏰ Sprint over',
  '¿Pudiste: {goal}?': 'Did you manage: {goal}?',
  '☕ Fin del corte': '☕ Break over',
  'Volvamos: {first}': "Let's get back to: {first}",
  'Volvamos al foco.': "Let's get back to focus.",
  'Foco no tiene acceso a la cámara': "Foco doesn't have camera access",
  'Activalo en Ajustes del Sistema → Privacidad y seguridad → Cámara.': 'Turn it on in System Settings → Privacy & Security → Camera.',
  // Disparadores que no son un sitio o una app (vienen del motor)
  cansancio: 'tiredness',
  'mirada fuera de la pantalla': 'gaze off the screen',
  'mirada fija sin avanzar': 'staring without progress',
  'saltando entre ventanas': 'jumping between windows',

  // Otros
  Premio: 'Reward',
  'No pude pasar el audio a texto. ¿Hay conexión para descargar el modelo la primera vez?':
    "Couldn't transcribe the audio. Is there a connection to download the model the first time?",
  'No se pudo descargar el modelo de voz.': "Couldn't download the voice model.",
};

/**
 * @param {string} lang  'es' | 'en'
 * @param {string} es    texto en español (la clave)
 * @param {Record<string, any>} [vars]  valores para los {nombre} del texto
 */
function translate(lang, es, vars) {
  let s = lang === 'en' && EN[es] != null ? EN[es] : es;
  if (vars && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  return s;
}

module.exports = { translate, EN };
