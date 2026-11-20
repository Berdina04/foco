// Configuración por defecto + persistencia en un JSON dentro de userData.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  // Horario laboral: días (0 = domingo) y bloques HH:MM-HH:MM.
  schedule: {
    days: [1, 2, 3, 4, 5],
    blocks: [
      { start: '09:00', end: '13:00' },
      { start: '14:00', end: '18:00' },
    ],
  },
  // Segundos seguidos en una distracción antes de avisar.
  graceSeconds: 8,
  // Modo suave: primero una notificación, y si seguís, se abre el coach.
  nudgeFirst: true,
  nudgeToCoachSeconds: 20,
  // Minutos que dura el permiso de "es por trabajo".
  allowMinutes: 30,
  sites: [
    'facebook.com',
    'instagram.com',
    'x.com',
    'twitter.com',
    'tiktok.com',
    'youtube.com',
    'reddit.com',
    'netflix.com',
    'twitch.tv',
    '9gag.com',
    'web.whatsapp.com',
    'linkedin.com/feed',
  ],
  apps: ['WhatsApp', 'Telegram', 'Discord', 'Steam', 'Netflix', 'TikTok', 'Instagram'],
  camera: {
    enabled: true,
    // Segundos sin mirar la pantalla (y sin tocar teclado/mouse) antes de avisar.
    gazeSeconds: 20,
    // Ojos cerrados seguidos antes de sugerir un corte.
    drowsySeconds: 6,
    // baja | media | alta
    sensitivity: 'media',
    // Sólo cuenta "mirando a otro lado" si no estás usando teclado/mouse.
    requireIdle: true,
    idleSeconds: 6,
    // Posturas calibradas { yaw, pitch, gazeX, gazeY }, una por pantalla.
    baselines: [],
  },
  // Menú de dopamina sana: cortes cortos que recargan sin secuestrar la atención.
  dopamineMenu: [
    '🚶 Caminar 5 minutos sin el celular',
    '💧 Tomar agua o prepararme un café',
    '🫁 Respiración guiada de 2 minutos',
    '🤸 Estirar cuello, hombros y espalda',
    '👀 Mirar por la ventana (regla 20-20-20)',
    '✍️ Volcar la cabeza en un papel 3 minutos',
    '🎵 Escuchar una canción con los ojos cerrados',
  ],
  ai: {
    enabled: false,
    model: 'claude-opus-5-5',
  },
  // Cómo te avisa: 'toast' = aviso flotante arriba a la derecha; 'window' = ventana del coach.
  alerts: {
    style: 'toast',
    sound: true,
    systemNotification: false,
  },
  // Leer en qué estás trabajando para entender en qué te trabaste.
  context: {
    // Título de la ventana activa (local; pide permiso de Accesibilidad).
    readTitles: true,
    // Captura de la pantalla en la que trabajabas, que se le manda a la IA (requiere IA).
    readScreen: true,
    // Nunca se capturan ni se mandan estas apps o sitios.
    excludeApps: ['1Password', 'Bitwarden', 'Keychain Access', 'Acceso a Llaveros', 'Passwords', 'Contraseñas'],
    excludeSites: ['bank', 'banco', 'homebanking', 'mercadopago', 'paypal.com', 'afip.gob.ar'],
  },
  // Señales de que estás bloqueado aunque no te hayas ido a una distracción.
  signals: {
    // Minutos mirando la pantalla sin tocar teclado ni mouse (0 = no avisar). Necesita la cámara.
    stareMinutes: 4,
    // Saltar entre muchas ventanas o pestañas en poco tiempo.
    hopping: true,
    hopSwitches: 10,
  },
  // Hablar en vez de escribir: se transcribe en tu Mac con Whisper.
  voice: {
    enabled: true,
    model: 'onnx-community/whisper-small',
  },
  currentTask: '',
};

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

// Merge profundo: los arrays del usuario reemplazan a los default.
function deepMerge(base, override) {
  if (!isPlainObject(override)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

class ConfigStore {
  constructor(dir) {
    this.file = path.join(dir, 'config.json');
    this.data = deepMerge(DEFAULTS, this.#read());
  }

  #read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return {};
    }
  }

  get() {
    return this.data;
  }

  update(partial) {
    this.data = deepMerge(this.data, partial);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    return this.data;
  }
}

module.exports = { DEFAULTS, ConfigStore, deepMerge };
