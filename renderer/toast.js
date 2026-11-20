// Aviso flotante arriba a la derecha: te dice que estás fuera de foco, qué cree que te pasó
// y te deja responder ahí mismo (botones, escribiendo o hablando) sin abrir la app.
import { micButton } from './lib/recorder.mjs';

const api = window.foco;
const card = document.getElementById('card');
let p = await api.invoke('toast:context');
let draft = '';
let writing = false;
let recording = false;
let pending = null; // actualización que llegó mientras grababas o escribías
let lastAlertId = null;
let lastEscalated = false;
let lastPhase = null;
let stepOpen = false; // "Otro sprint": mostrar el campo del próximo paso
let stepDraft = null;

// ---------- Helpers ----------

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v != null && v !== false) el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
const btn = (label, onclick, cls = 'btn') => h('button', { class: cls, onclick }, label);
const isTyping = () => ['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName);

// Un "ding" suave hecho con dos tonos.
function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = 'sine';
      const t = ctx.currentTime + i * 0.14;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.55);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {}
}

const HEAD = {
  site: (p) => ['👀', p.escalated ? 'Seguís fuera de foco' : 'Fuera de foco', `Estás en ${p.label}`],
  app: (p) => ['👀', p.escalated ? 'Seguís fuera de foco' : 'Fuera de foco', `Abriste ${p.label}`],
  gaze: (p) => ['👀', p.escalated ? 'Seguís fuera de foco' : 'Fuera de foco', 'Hace un rato que no mirás la pantalla'],
  drowsy: () => ['😴', 'Se te cierran los ojos', 'Forzar el foco con sueño rinde poco'],
  stuck: () => ['🧱', '¿Te trabaste?', 'Hace unos minutos que mirás la pantalla sin tocar nada'],
  hopping: () => ['🔀', '¿Buscando por dónde seguir?', 'Saltaste entre muchas ventanas en poco tiempo'],
  manual: () => ['🎯', '¿Qué está pasando?', 'Contame y te ayudo'],
};

// Fin de sprint y fin de corte, según en qué parte de la charla estás.
const MOMENT_HEAD = {
  sprint_end: {
    ask: (m) => ['⏰', `¿Pudiste: ${m.goal}?`, `Terminó el sprint de ${m.minutes} min`],
    done: (m) => ['🎉', '¡Bien ahí!', m.reward ? `Te ganaste: ${m.reward}` : 'Date un respiro antes de lo próximo.'],
    partial: () => ['🙂', 'Avanzar es avanzar', '¿Seguimos un rato más con lo mismo, o ajustamos el paso?'],
    stuck: (m) => ['🧱', '¿Dónde te trabaste?', `Ibas a: ${m.goal}`],
  },
  break_end: {
    ask: (m) =>
      m.firstThing
        ? ['☕', `Volvamos: ${m.firstThing}`, 'Terminó el corte. Es lo que dejaste anotado para arrancar.']
        : ['☕', 'Volvamos al foco', 'Terminó el corte. ¿Con qué arrancás?'],
    stuck: (m) => ['😮‍💨', 'Cuesta volver, pasa', m.firstThing ? `Ibas a: ${m.firstThing}` : 'Contame qué te frena y lo vemos'],
  },
};

// ---------- Render ----------

function render() {
  if (!p) return;
  if (p.returned) {
    card.className = '';
    card.replaceChildren(
      h('div', { class: 'head' }, h('span', { class: 'icon' }, '💪'), h('div', {}, h('h3', {}, '¡Bien, volviste!')))
    );
    return;
  }
  const m = p.moment;
  if (p.id !== lastAlertId || (p.escalated && !lastEscalated)) {
    if (p.sound && !p.gentle) chime();
    if (p.id !== lastAlertId) {
      draft = '';
      writing = false;
    }
    lastAlertId = p.id;
  }
  lastEscalated = p.escalated;
  const phaseKey = `${p.id}:${m?.phase}`;
  if (phaseKey !== lastPhase) {
    stepOpen = false;
    stepDraft = null;
    lastPhase = phaseKey;
  }

  const [icon, title, sub] = m ? MOMENT_HEAD[m.kind][m.phase](m) : (HEAD[p.kind] || HEAD.manual)(p);
  card.className = p.escalated ? 'escalated' : '';
  const isScreen = p.kind === 'site' || p.kind === 'app';
  const talking = !m || m.phase === 'stuck'; // aviso de distracción o "me trabé": lectura de IA o contame

  const parts = [
    h(
      'div',
      { class: 'head' },
      h('span', { class: 'icon' }, icon),
      h('div', {}, h('h3', {}, title), h('p', {}, sub), talking && p.work && h('p', {}, `Venías en: ${p.work}`)),
      h('button', { class: 'x', title: 'Cerrar', onclick: () => api.invoke('toast:dismiss') }, '✕')
    ),
    talking ? body() : momentBody(m),
    writing && tellBox(),
    h('div', { class: 'note', id: 'note' }),
    (talking || m.phase === 'ask') &&
      h(
        'div',
        { class: 'links' },
        isScreen && h('a', { onclick: () => api.invoke('toast:allow') }, `Es por trabajo (${p.allowMinutes} min)`),
        h('a', { onclick: () => api.invoke('toast:coach', {}) }, 'Abrir el coach')
      ),
  ];
  card.replaceChildren(...parts.flat().filter(Boolean));
  bindMic();
}

function body() {
  const ins = p.insight;
  if (p.ai && p.insightStatus === 'loading') {
    return h(
      'div',
      { class: 'insight' },
      h('div', { class: 'row-center' }, h('div', { class: 'spinner' }), p.screen ? 'Mirando en qué estabas…' : 'Pensando cómo ayudarte…')
    );
  }
  if (p.ai && p.insightStatus === 'ready' && ins) {
    return [
      h(
        'div',
        { class: 'insight' },
        ins.working_on && h('div', { class: 'muted' }, `Estabas en: ${ins.working_on}`),
        ins.likely_block && h('div', {}, ins.likely_block),
        h('div', { class: 'q' }, ins.question),
        h('div', { class: 'step' }, `Próximo paso: ${ins.micro_step}`),
        ins.strategies?.length &&
          h(
            'details',
            {},
            h('summary', {}, 'Más ideas para destrabarte'),
            h('ul', {}, ins.strategies.map((s) => h('li', {}, h('b', {}, s.title), ': ', s.how)))
          )
      ),
      h(
        'div',
        { class: 'actions' },
        ins.flow === 'tired'
          ? btn('☕ Hacer un corte', () => api.invoke('toast:coach', { start: 'break' }), 'btn primary')
          : btn(`▶ Arrancar ${ins.sprint_minutes} min`, () => api.invoke('toast:sprint'), 'btn primary'),
        btn('🎤 No es eso, te cuento', null, 'btn mic'),
        btn('Vuelvo al foco', () => api.invoke('toast:back'))
      ),
    ];
  }
  // Sin IA (o falló): opciones rápidas. Si ya dijiste que te trabaste, lo primero es contarlo.
  const m = p.moment;
  const back = btn('Vuelvo al foco', () => api.invoke('toast:back'), m ? 'btn' : 'btn primary');
  const mic = btn('🎤 Contame qué pasa', null, m ? 'btn primary mic' : 'btn mic');
  const coach = (label, start) => btn(label, () => api.invoke('toast:coach', { start }));
  return [
    p.ai && p.insightStatus === 'error' && h('div', { class: 'note' }, `No pude analizarlo: ${p.insightError}`),
    h(
      'div',
      { class: 'actions' },
      m ? [mic, back] : [back, mic],
      p.ai && p.insightStatus === 'idle' && btn('🔎 ¿En qué me trabé?', () => api.invoke('toast:analyze'))
    ),
    h(
      'div',
      { class: 'actions' },
      m?.kind === 'sprint_end'
        ? [coach('🧱 Armar un plan', 'stuck'), coach('🔋 Un corte', 'break')]
        : [coach('🧱 Me trabé', 'stuck'), coach('😮‍💨 Me da fiaca', 'fiaca'), coach(m ? '🔋 Otro corte' : '🔋 Un corte', 'break')]
    ),
    !p.ai && h('div', { class: 'note' }, 'Con la IA activada, Foco mira en qué estabas y te dice dónde te trabaste.'),
  ];
}

// Fin de sprint (¿pudiste?, premio u otro sprint) y fin de corte (volvamos).
function momentBody(m) {
  if (m.kind === 'sprint_end' && m.phase === 'ask') {
    return h(
      'div',
      { class: 'actions' },
      btn('🎉 ¡Lo hice!', () => api.invoke('toast:checkin', 'done'), 'btn primary'),
      btn('🙂 Avancé', () => api.invoke('toast:checkin', 'partial')),
      btn('🧱 Me trabé', () => api.invoke('toast:checkin', 'stuck'))
    );
  }
  if (m.phase === 'done') {
    if (stepOpen) return stepBox({ goal: '', minutes: 25, placeholder: '¿Qué sigue? Un paso concreto', focus: true });
    return h(
      'div',
      { class: 'actions' },
      btn('🎁 Tomarme el premio (5 min)', () => api.invoke('toast:reward'), 'btn primary'),
      btn('➡️ Otro sprint', () => {
        stepOpen = true;
        render();
      })
    );
  }
  if (m.phase === 'partial') return stepBox({ goal: m.goal, minutes: 15 });
  // Fin del corte
  const hard = btn('😮‍💨 Me cuesta volver', () => api.invoke('toast:checkin', 'stuck'));
  if (!m.firstThing) return stepBox({ goal: '', minutes: 25, placeholder: 'Ej: responder el mail de Ana', extra: hard });
  return h(
    'div',
    { class: 'actions' },
    btn('▶ Arrancar 25 min', () => api.invoke('toast:step', { goal: m.firstThing, minutes: 25 }), 'btn primary'),
    hard
  );
}

// Campo para el próximo paso y botón para arrancar el sprint.
function stepBox({ goal, minutes, placeholder = 'Ej: escribir el primer párrafo', focus = false, extra }) {
  const input = h('input', { type: 'text', placeholder });
  input.value = stepDraft ?? goal;
  const go = () => {
    const text = input.value.trim();
    if (!text) return input.focus();
    api.invoke('toast:step', { goal: text, minutes });
  };
  input.addEventListener('input', () => (stepDraft = input.value));
  input.addEventListener('focus', () => setBusy(true));
  input.addEventListener('blur', () => {
    setBusy(false);
    setTimeout(applyPending, 0);
  });
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  if (focus) setTimeout(() => input.focus(), 0);
  return h(
    'div',
    { class: 'stack', style: 'gap:6px' },
    input,
    h('div', { class: 'actions' }, btn(`▶ Arrancar ${minutes} min`, go, 'btn primary'), extra)
  );
}

function tellBox() {
  const ta = h('textarea', { placeholder: 'Contame qué te pasa…' });
  ta.value = draft;
  ta.addEventListener('input', () => (draft = ta.value));
  ta.addEventListener('focus', () => setBusy(true));
  ta.addEventListener('blur', () => {
    setBusy(false);
    setTimeout(applyPending, 0);
  });
  ta.addEventListener('keydown', (e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && send());
  setTimeout(() => ta.focus(), 0);
  return h(
    'div',
    { class: 'stack', style: 'gap:6px' },
    ta,
    h(
      'div',
      { class: 'actions' },
      btn('Enviar', send, 'btn primary'),
      btn('🎤 Seguir hablando', null, 'btn mic'),
      btn('Cancelar', () => {
        writing = false;
        draft = '';
        render();
      }, 'btn ghost')
    )
  );
}

function send() {
  const text = draft.trim();
  if (!text) return;
  draft = '';
  writing = false;
  document.activeElement?.blur();
  setBusy(false);
  applyPending(true);
  api.invoke('toast:tell', text);
}

// Aplica una actualización que quedó en espera mientras grababas o escribías.
function applyPending(force = false) {
  if (recording || (!force && isTyping())) return;
  if (pending) {
    p = pending;
    pending = null;
  }
  render();
}

function note(text) {
  const el = document.getElementById('note');
  if (el) el.replaceChildren(text || '');
}

function levelBars(level) {
  const el = document.getElementById('note');
  if (!el) return;
  const bars = Array.from({ length: 12 }, (_, i) => {
    const hgt = 4 + Math.max(0, level * 18 - Math.abs(i - 6) * 1.5);
    return h('i', { style: `height:${hgt}px` });
  });
  el.replaceChildren(h('div', { class: 'row-center' }, h('div', { class: 'level' }, bars), 'Te escucho… tocá "Listo" al terminar'));
}

function bindMic() {
  for (const b of card.querySelectorAll('button.mic')) {
    micButton(b, {
      onText: (text) => {
        draft = (draft ? draft + ' ' : '') + text;
        writing = true;
        render();
      },
      onState: (s, extra) => {
        if (s === 'listening') {
          recording = true;
          setBusy(true);
        }
        if (s === 'level') levelBars(extra);
        if (s === 'transcribing') note('Pasando a texto lo que dijiste…');
        if (s === 'error') note(extra);
        if (s === 'done' || s === 'error') {
          recording = false;
          setBusy(false);
          if (pending && s === 'error') {
            applyPending();
            note(extra);
          }
        }
      },
    });
  }
}

let busy = false;
function setBusy(v) {
  const next = v || recording || card.matches(':hover');
  if (next === busy) return;
  busy = next;
  api.invoke('toast:busy', busy);
}
card.addEventListener('mouseenter', () => setBusy(true));
card.addEventListener('mouseleave', () => setBusy(false));

// Ajustar el alto de la ventana al contenido
new ResizeObserver(() => api.invoke('toast:resize', Math.ceil(card.offsetHeight + 20))).observe(card);

api.on('toast:update', (next) => {
  if ((recording || isTyping()) && next.id === p?.id && !next.returned) pending = next;
  else {
    p = next;
    render();
  }
});
api.on('voice:progress', (pct) => note(`Preparando la voz (sólo la primera vez): ${pct}%`));

render();
