import { REASONS } from './lib/strategies.mjs';

const api = window.foco;
const $ = (id) => document.getElementById(id);
let snap = await api.invoke('state:get');
let settingsLoaded = false;

// ---------- Formato ----------

function duration(seconds) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const hhmm = (ts) => new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const REASON_LABEL = Object.fromEntries(
  Object.entries(REASONS).flatMap(([flow, list]) => list.map((r) => [`${flow}:${r.id}`, r.label]))
);
const FLOW_LABEL = { stuck: 'Te trabaste', fiaca: 'Te dio fiaca', auto: 'Fue automático', false_alarm: 'Falsa alarma' };

const TIPS = {
  'stuck:start': 'Antes de cada bloque, escribí el primer paso concreto. Arrancar con eso ya definido baja mucho las escapadas.',
  'stuck:info': 'Juntá las preguntas pendientes y mandalas todas a primera hora, así no te frenan después.',
  'stuck:hard': 'Para lo difícil, usá sprints cortos de 15 min y pedí ayuda al segundo intento fallido.',
  'stuck:ambiguous': 'Antes de arrancar algo nuevo, escribí qué significa "terminado".',
  'stuck:big': 'Partí las tareas grandes en pasos de 25 min la noche anterior.',
  'stuck:fear': 'Date permiso explícito para hacer un borrador malo primero.',
  'fiaca:boring': 'Agrupá las tareas aburridas en un solo bloque contrarreloj, con premio al final.',
  'fiaca:long': 'Comprometete con tiempo (15 min), no con terminar.',
  'fiaca:meaning': 'Revisá si esa tarea se puede simplificar, delegar o hacer al 80%.',
  'fiaca:uncomfortable': 'Hacé lo incómodo primero en el día, antes de que crezca.',
  'fiaca:start': 'Antes de cada bloque, escribí el primer paso concreto.',
  'fiaca:energy': 'Programá cortes reales cada 50-90 minutos; el cansancio empuja a scrollear.',
  auto: 'Cuando es automático, ayuda poner fricción: cerrá esas pestañas al empezar y sacá las apps del Dock.',
};

// ---------- Hoy ----------

const STATUS = {
  monitoring: ['ok', 'Monitoreando'],
  paused: ['', 'En pausa'],
  break: ['warn', 'En un corte'],
  off: ['', 'Fuera de horario'],
};
const FOCUS = {
  focused: 'Estás en foco',
  distracted: 'Distraído',
  looking_away: 'Mirando a otro lado',
  away: 'Lejos de la compu',
};

function renderToday() {
  const s = snap;
  const [cls, label] = STATUS[s.status];
  $('status-pill').className = `pill ${s.status === 'monitoring' && s.focusState !== 'focused' ? 'warn' : cls}`;
  $('status-pill').lastElementChild.textContent = label;
  $('status-detail').textContent = s.status === 'monitoring' ? FOCUS[s.focusState] || '' : '';
  $('headline').textContent = s.config.currentTask ? s.config.currentTask : '¿En qué vas a trabajar?';

  const manual = s.manualUntil > s.now;
  $('btn-session').textContent = manual ? 'Terminar sesión de foco' : 'Empezar sesión (1 h)';
  $('btn-session').hidden = s.status === 'monitoring' && !manual && !s.sprint;
  $('btn-pause').textContent = s.status === 'paused' ? 'Reanudar' : 'Pausar 30 min';

  // No pisar la tarea mientras la estás escribiendo
  const editingTask = document.activeElement?.closest?.('#now-card') && !s.sprint && !s.breakInfo;
  if (!editingTask) renderNowCard();

  const t = s.today;
  const ev = t.events;
  $('t-focus').textContent = duration(t.focusSeconds);
  $('t-distracted').textContent = duration(t.distractedSeconds);
  $('t-coach').textContent = ev.filter((e) => e.type === 'nudge' || (e.type === 'coach' && e.mode === 'trigger')).length;
  $('t-sprints').textContent = ev.filter((e) => e.type === 'sprint_end' && e.result === 'done').length;

  renderInsights(ev);
  renderTimeline(ev);

  $('now-app').textContent = s.activity?.locked ? 'Pantalla bloqueada' : s.activity?.app || '–';
  $('now-url').textContent = s.activity?.url ? host(s.activity.url) : '–';
  const cam = s.config.camera.enabled ? s.attention?.status : 'off';
  $('now-cam').textContent =
    { focused: 'Mirando la pantalla', looking_away: 'Mirando a otro lado', eyes_closed: 'Ojos cerrados', no_face: 'No te ve', off: 'Desactivada', unknown: 'Apagada' }[
      cam
    ] || 'Esperando…';
}

function renderNowCard() {
  const s = snap;
  const card = $('now-card');
  card.className = 'card now-card';
  card.replaceChildren();
  const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', textContent: text || '' });
  const btn = (text, fn) => {
    const b = el('button', 'btn', text);
    b.onclick = fn;
    return b;
  };

  if (s.sprint) {
    card.classList.add('sprint');
    const info = el('div', 'stack');
    info.style.gap = '2px';
    info.append(el('span', 'muted small', 'Sprint en curso'), el('h2', '', s.sprint.goal));
    if (s.sprint.reward) info.append(el('span', 'muted small', `Premio al terminar: ${s.sprint.reward}`));
    card.append(el('div', 'clock', clock(s.sprint.until - s.now)), info, el('div', 'spacer'), btn('Cancelar', () => api.invoke('sprint:cancel').then(update)));
    return;
  }
  if (s.breakInfo) {
    const info = el('div', 'stack');
    info.style.gap = '2px';
    info.append(el('span', 'muted small', 'Corte en curso'), el('h2', '', s.breakInfo.activity || 'Corte'));
    if (s.breakInfo.firstThing) info.append(el('span', 'muted small', `Al volver: ${s.breakInfo.firstThing}`));
    card.append(el('div', 'clock', clock(s.breakInfo.until - s.now)), info, el('div', 'spacer'), btn('Terminar corte', () => api.invoke('break:end').then(update)));
    return;
  }

  // Sin sprint: pedir la tarea del día
  const label = el('label', 'field');
  label.style.flex = '1';
  label.append('¿En qué estás trabajando ahora?');
  const input = Object.assign(document.createElement('input'), {
    type: 'text',
    placeholder: 'Ej: informe mensual de ventas',
    value: s.config.currentTask || '',
  });
  const save = () => api.invoke('config:update', { currentTask: input.value.trim() }).then(update);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
  input.addEventListener('change', save);
  label.append(input);
  const hint = el('span', 'hint', 'El coach lo usa para ayudarte cuando te distraigas.');
  label.append(hint);
  card.append(label);
}

function renderInsights(events) {
  const box = $('insights');
  box.replaceChildren();
  const add = (text, muted = false) => box.append(Object.assign(document.createElement('p'), { textContent: text, className: muted ? 'muted' : '' }));

  const answers = events.filter((e) => e.type === 'answer' && e.flow !== 'false_alarm');
  const count = (list, keyFn) => {
    const m = new Map();
    for (const x of list) {
      const k = keyFn(x);
      if (k) m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  if (!answers.length && !events.some((e) => e.type === 'nudge')) {
    add('Todavía no hubo distracciones hoy. Cuando aparezcan, acá vas a ver qué te frena y qué te tienta.', true);
    return;
  }
  const reasons = count(answers, (a) => (a.flow === 'auto' ? 'auto' : a.reason ? `${a.flow}:${a.reason}` : null));
  if (reasons.length) {
    const [key, n] = reasons[0];
    const label = key === 'auto' ? 'que fue automático' : `"${REASON_LABEL[key]}"`;
    add(`Lo que más te frenó: ${label} (${n} ${n === 1 ? 'vez' : 'veces'}).`);
    if (TIPS[key]) add(`💡 ${TIPS[key]}`);
  }
  const lures = count(
    events.filter((e) => e.type === 'nudge' || e.type === 'coach'),
    (e) => (e.trigger && (e.trigger.type === 'site' || e.trigger.type === 'app') ? e.trigger.label : null)
  );
  if (lures.length) add(`Lo que más te tentó: ${lures[0][0]} (${lures[0][1]}).`);
}

function describe(e) {
  switch (e.type) {
    case 'nudge':
      return `👀 Aviso: ${e.trigger?.label}`;
    case 'coach':
      return e.mode === 'manual' ? '🧭 Pediste ayuda al coach' : `🧭 Coach por ${e.trigger?.label}`;
    case 'answer':
      return `💬 ${FLOW_LABEL[e.flow] || e.flow}${e.reason ? `: ${REASON_LABEL[`${e.flow}:${e.reason}`] || e.reason}` : ''}`;
    case 'sprint_start':
      return `🎯 Sprint de ${e.minutes} min: ${e.goal}`;
    case 'sprint_end':
      return { done: '✅ Sprint cumplido', partial: '🙂 Avanzaste en el sprint', stuck: '🧱 Te trabaste en el sprint' }[e.result];
    case 'sprint_cancel':
      return '✖️ Sprint cancelado';
    case 'break_start':
      return `☕ Corte de ${e.minutes} min: ${e.activity}`;
    case 'break_end':
      return '↩️ Volviste del corte';
    case 'allow':
      return '💼 Permitido por trabajo';
    case 'coach_end':
      return e.outcome === 'returned' ? '↩️ Volviste al foco' : null;
    default:
      return null;
  }
}

function renderTimeline(events) {
  const list = $('timeline');
  const items = events
    .map((e) => [e, describe(e)])
    .filter(([, d]) => d)
    .slice(-30)
    .reverse();
  if (!items.length) {
    list.replaceChildren(Object.assign(document.createElement('li'), { className: 'empty', textContent: 'Nada todavía.' }));
    return;
  }
  list.replaceChildren(
    ...items.map(([e, d]) => {
      const li = document.createElement('li');
      li.append(Object.assign(document.createElement('time'), { textContent: hhmm(e.ts) }), document.createTextNode(d));
      return li;
    })
  );
}

async function renderWeek() {
  const week = await api.invoke('stats:week');
  const max = Math.max(30, ...week.map((d) => d.focusSeconds / 60));
  const days = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  $('week').replaceChildren(
    ...week.map((d, i) => {
      const mins = Math.round(d.focusSeconds / 60);
      const bar = document.createElement('div');
      bar.className = 'bar' + (i === week.length - 1 ? ' today' : '');
      bar.title = `${d.date}: ${mins} min en foco`;
      const fill = document.createElement('div');
      fill.className = 'fill';
      fill.style.height = `${(mins / max) * 80}%`;
      const label = document.createElement('span');
      label.textContent = days[new Date(d.date + 'T12:00').getDay()];
      bar.append(Object.assign(document.createElement('span'), { textContent: mins || '' }), fill, label);
      return bar;
    })
  );
}

// ---------- Ajustes ----------

const DAY_NAMES = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
let selectedDays = new Set();

const lines = (text) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
const parseBlocks = (text) =>
  text
    .split(/[,;\n]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [start, end] = p.split('-').map((x) => x.trim());
      return { start, end };
    })
    .filter((b) => /^\d{1,2}:\d{2}$/.test(b.start) && /^\d{1,2}:\d{2}$/.test(b.end));

function loadSettings() {
  const c = snap.config;
  selectedDays = new Set(c.schedule.days);
  $('days').replaceChildren(
    ...DAY_ORDER.map((d) => {
      const b = document.createElement('button');
      b.className = 'chip' + (selectedDays.has(d) ? ' on' : '');
      b.textContent = DAY_NAMES[d];
      b.onclick = () => {
        selectedDays.has(d) ? selectedDays.delete(d) : selectedDays.add(d);
        b.classList.toggle('on');
      };
      return b;
    })
  );
  $('blocks').value = c.schedule.blocks.map((b) => `${b.start}-${b.end}`).join(', ');
  $('graceSeconds').value = c.graceSeconds;
  $('nudgeFirst').checked = c.nudgeFirst;
  $('nudgeToCoachSeconds').value = c.nudgeToCoachSeconds;
  $('allowMinutes').value = c.allowMinutes;
  $('sites').value = c.sites.join('\n');
  $('apps').value = c.apps.join('\n');
  $('camEnabled').checked = c.camera.enabled;
  $('gazeSeconds').value = c.camera.gazeSeconds;
  $('requireIdle').checked = c.camera.requireIdle;
  $('drowsySeconds').value = c.camera.drowsySeconds;
  $('sensitivity').value = c.camera.sensitivity;
  $('dopamine').value = c.dopamineMenu.join('\n');
  $('aiEnabled').checked = c.ai.enabled;
  $('aiModel').value = c.ai.model;
  $('alertStyle').value = c.alerts.style;
  $('alertSound').checked = c.alerts.sound;
  $('systemNotification').checked = c.alerts.systemNotification;
  $('readTitles').checked = c.context.readTitles;
  $('readScreen').checked = c.context.readScreen;
  $('excludeApps').value = c.context.excludeApps.join('\n');
  $('excludeSites').value = c.context.excludeSites.join('\n');
  $('stareMinutes').value = c.signals.stareMinutes;
  $('hopping').checked = c.signals.hopping;
  $('voiceEnabled').checked = c.voice.enabled;
  renderKeyStatus();
  renderPermissions();
  settingsLoaded = true;
}

async function renderPermissions(status) {
  const st = status || (await api.invoke('perm:status'));
  const label = (v) => (v === 'granted' || v === true ? '✓ dado' : v === 'denied' ? '✗ negado' : 'falta');
  $('perm-accessibility').textContent = label(st.accessibility);
  $('perm-screen').textContent = label(st.screen);
  const v = st.voice;
  $('voice-status').textContent = v.ready
    ? 'Modelo de voz listo ✓'
    : v.loading
      ? `Descargando… ${v.progress ?? 0}%`
      : v.downloaded
        ? 'Modelo descargado ✓'
        : 'El modelo se descarga la primera vez que hablás.';
  $('btn-voice').hidden = v.downloaded || v.ready;
  $('btn-mic').hidden = st.microphone === 'granted';
}

function renderKeyStatus() {
  const { keySaved, envKey } = snap.ai;
  $('key-status').textContent = keySaved
    ? '🔒 Key guardada (cifrada en el llavero de tu Mac).'
    : envKey
      ? 'Usando ANTHROPIC_API_KEY del entorno.'
      : 'Sin key: el coach usa el plan básico.';
}

async function saveSettings() {
  const num = (id, fallback) => {
    const v = Number($(id).value);
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  };
  const c = snap.config;
  const blocks = parseBlocks($('blocks').value);
  snap = await api.invoke('config:update', {
    schedule: { days: [...selectedDays].sort(), blocks: blocks.length ? blocks : c.schedule.blocks },
    graceSeconds: num('graceSeconds', c.graceSeconds),
    nudgeFirst: $('nudgeFirst').checked,
    nudgeToCoachSeconds: num('nudgeToCoachSeconds', c.nudgeToCoachSeconds),
    allowMinutes: num('allowMinutes', c.allowMinutes) || 30,
    sites: lines($('sites').value),
    apps: lines($('apps').value),
    camera: {
      enabled: $('camEnabled').checked,
      gazeSeconds: num('gazeSeconds', c.camera.gazeSeconds),
      requireIdle: $('requireIdle').checked,
      drowsySeconds: num('drowsySeconds', c.camera.drowsySeconds),
      sensitivity: $('sensitivity').value,
    },
    dopamineMenu: lines($('dopamine').value),
    ai: { enabled: $('aiEnabled').checked, model: $('aiModel').value },
    alerts: {
      style: $('alertStyle').value,
      sound: $('alertSound').checked,
      systemNotification: $('systemNotification').checked,
    },
    context: {
      readTitles: $('readTitles').checked,
      readScreen: $('readScreen').checked,
      excludeApps: lines($('excludeApps').value),
      excludeSites: lines($('excludeSites').value),
    },
    signals: { stareMinutes: num('stareMinutes', c.signals.stareMinutes), hopping: $('hopping').checked },
    voice: { enabled: $('voiceEnabled').checked },
  });
  loadSettings();
  $('toast').textContent = 'Guardado ✓';
  setTimeout(() => ($('toast').textContent = ''), 2000);
  renderToday();
}

// ---------- Tabs y eventos ----------

function showTab(tab) {
  for (const b of document.querySelectorAll('nav button')) b.classList.toggle('on', b.dataset.tab === tab);
  $('tab-hoy').hidden = tab !== 'hoy';
  $('tab-ajustes').hidden = tab !== 'ajustes';
  if (tab === 'ajustes') loadSettings();
  if (tab === 'hoy') renderWeek();
}

function update(next) {
  if (next) snap = next;
  renderToday();
  if (!settingsLoaded) loadSettings();
}

for (const b of document.querySelectorAll('nav button')) b.onclick = () => showTab(b.dataset.tab);
$('btn-help').onclick = () => api.invoke('coach:open');
$('btn-session').onclick = () => api.invoke(snap.manualUntil > Date.now() ? 'session:stop' : 'session:start', 60).then(update);
$('btn-pause').onclick = () => api.invoke(snap.status === 'paused' ? 'resume' : 'pause', 30).then(update);
$('btn-camera').onclick = $('btn-camera-2').onclick = () => api.invoke('camera:show', 'full');
$('btn-camera-mini').onclick = () => api.invoke('camera:show', 'mini');
$('btn-save').onclick = saveSettings;
for (const b of document.querySelectorAll('[data-perm]')) {
  b.onclick = async () => renderPermissions(await api.invoke('perm:request', b.dataset.perm));
}
$('btn-mic').onclick = async () => renderPermissions(await api.invoke('perm:request', 'microphone'));
$('btn-voice').onclick = async () => {
  $('btn-voice').disabled = true;
  $('voice-status').textContent = 'Descargando…';
  const res = await api.invoke('voice:prepare');
  $('btn-voice').disabled = false;
  if (res.error) $('voice-status').textContent = res.error;
  renderPermissions();
};
api.on('voice:progress', (pct) => ($('voice-status').textContent = `Descargando el modelo de voz… ${pct}%`));
$('btn-key').onclick = async () => {
  snap = await api.invoke('ai:setKey', $('apiKey').value);
  $('apiKey').value = '';
  $('aiEnabled').checked = snap.config.ai.enabled;
  renderKeyStatus();
};

api.on('state', update);
// Al volver de Ajustes del Sistema, refrescar el estado de los permisos.
window.addEventListener('focus', () => !$('tab-ajustes').hidden && renderPermissions());
api.on('panel:tab', showTab);

update(snap);
showTab(location.hash.slice(1) || 'hoy');
setInterval(renderWeek, 60_000);
