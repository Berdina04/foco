// Aviso flotante arriba a la derecha: te dice que estás fuera de foco, qué cree que te pasó
// y te deja responder ahí mismo (botones, escribiendo o hablando) sin abrir la app.
import { micButton } from './lib/recorder.mjs';
import { t, setLang } from './lib/i18n.mjs';

const api = window.foco;
const card = document.getElementById('card');
let p = await api.invoke('toast:context');
if (p?.lang) setLang(p.lang);
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
      const at = ctx.currentTime + i * 0.14;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.12, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(at);
      o.stop(at + 0.55);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {}
}

const out = (p) => t(p.escalated ? 'Seguís fuera de foco' : 'Fuera de foco');
const HEAD = {
  site: (p) => ['👀', out(p), t('Estás en {label}', { label: p.label })],
  app: (p) => ['👀', out(p), t('Abriste {label}', { label: p.label })],
  gaze: (p) => ['👀', out(p), t('Hace un rato que no mirás la pantalla')],
  drowsy: () => ['😴', t('Se te cierran los ojos'), t('Forzar el foco con sueño rinde poco')],
  stuck: () => ['🧱', t('¿Te trabaste?'), t('Hace unos minutos que mirás la pantalla sin tocar nada')],
  hopping: () => ['🔀', t('¿Buscando por dónde seguir?'), t('Saltaste entre muchas ventanas en poco tiempo')],
  manual: () => ['🎯', t('¿Qué está pasando?'), t('Contame y te ayudo')],
};

// Fin de sprint y fin de corte, según en qué parte de la charla estás.
const MOMENT_HEAD = {
  sprint_end: {
    ask: (m) => ['⏰', t('¿Pudiste: {goal}?', { goal: m.goal }), t('Terminó el sprint de {minutes} min', { minutes: m.minutes })],
    done: (m) => [
      '🎉',
      t('¡Bien ahí!'),
      m.reward ? t('Te ganaste: {reward}', { reward: m.reward }) : t('Date un respiro antes de lo próximo.'),
    ],
    partial: () => ['🙂', t('Avanzar es avanzar'), t('¿Seguimos un rato más con lo mismo, o ajustamos el paso?')],
    stuck: (m) => ['🧱', t('¿Dónde te trabaste?'), t('Ibas a: {goal}', { goal: m.goal })],
  },
  break_end: {
    ask: (m) =>
      m.firstThing
        ? ['☕', t('Volvamos: {first}', { first: m.firstThing }), t('Terminó el corte. Es lo que dejaste anotado para arrancar.')]
        : ['☕', t('Volvamos al foco'), t('Terminó el corte. ¿Con qué arrancás?')],
    stuck: (m) => [
      '😮‍💨',
      t('Cuesta volver, pasa'),
      m.firstThing ? t('Ibas a: {goal}', { goal: m.firstThing }) : t('Contame qué te frena y lo vemos'),
    ],
  },
};

// ---------- Render ----------

function render() {
  if (!p) return;
  if (p.returned) {
    card.className = '';
    card.replaceChildren(
      h('div', { class: 'head' }, h('span', { class: 'icon' }, '💪'), h('div', {}, h('h3', {}, t('¡Bien, volviste!'))))
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
      h('div', {}, h('h3', {}, title), h('p', {}, sub), talking && p.work && h('p', {}, t('Venías en: {work}', { work: p.work }))),
      h('button', { class: 'x', title: t('Cerrar'), onclick: () => api.invoke('toast:dismiss') }, '✕')
    ),
    talking ? body() : momentBody(m),
    writing && tellBox(),
    h('div', { class: 'note', id: 'note' }),
    (talking || m.phase === 'ask') &&
      h(
        'div',
        { class: 'links' },
        isScreen && h('a', { onclick: () => api.invoke('toast:allow') }, t('Es por trabajo ({n} min)', { n: p.allowMinutes })),
        h('a', { onclick: () => api.invoke('toast:coach', {}) }, t('Abrir el coach'))
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
      h('div', { class: 'row-center' }, h('div', { class: 'spinner' }), t(p.screen ? 'Mirando en qué estabas…' : 'Pensando cómo ayudarte…'))
    );
  }
  if (p.ai && p.insightStatus === 'ready' && ins) {
    return [
      h(
        'div',
        { class: 'insight' },
        ins.working_on && h('div', { class: 'muted' }, t('Estabas en: {x}', { x: ins.working_on })),
        ins.likely_block && h('div', {}, ins.likely_block),
        h('div', { class: 'q' }, ins.question),
        h('div', { class: 'step' }, t('Próximo paso: {x}', { x: ins.micro_step })),
        ins.strategies?.length &&
          h(
            'details',
            {},
            h('summary', {}, t('Más ideas para destrabarte')),
            h('ul', {}, ins.strategies.map((s) => h('li', {}, h('b', {}, s.title), ': ', s.how)))
          )
      ),
      h(
        'div',
        { class: 'actions' },
        ins.flow === 'tired'
          ? btn(t('☕ Hacer un corte'), () => api.invoke('toast:coach', { start: 'break' }), 'btn primary')
          : btn(t('▶ Arrancar {n} min', { n: ins.sprint_minutes }), () => api.invoke('toast:sprint'), 'btn primary'),
        btn(t('🎤 No es eso, te cuento'), null, 'btn mic'),
        btn(t('Vuelvo al foco'), () => api.invoke('toast:back'))
      ),
    ];
  }
  // Sin IA (o falló): opciones rápidas. Si ya dijiste que te trabaste, lo primero es contarlo.
  const m = p.moment;
  const back = btn(t('Vuelvo al foco'), () => api.invoke('toast:back'), m ? 'btn' : 'btn primary');
  const mic = btn(t('🎤 Contame qué pasa'), null, m ? 'btn primary mic' : 'btn mic');
  const coach = (label, start) => btn(t(label), () => api.invoke('toast:coach', { start }));
  return [
    p.ai && p.insightStatus === 'error' && h('div', { class: 'note' }, t('No pude analizarlo: {error}', { error: p.insightError })),
    h(
      'div',
      { class: 'actions' },
      m ? [mic, back] : [back, mic],
      p.ai && p.insightStatus === 'idle' && btn(t('🔎 ¿En qué me trabé?'), () => api.invoke('toast:analyze'))
    ),
    h(
      'div',
      { class: 'actions' },
      m?.kind === 'sprint_end'
        ? [coach('🧱 Armar un plan', 'stuck'), coach('🔋 Un corte', 'break')]
        : [coach('🧱 Me trabé', 'stuck'), coach('😮‍💨 Me da fiaca', 'fiaca'), coach(m ? '🔋 Otro corte' : '🔋 Un corte', 'break')]
    ),
    !p.ai && h('div', { class: 'note' }, t('Con la IA activada, Foco mira en qué estabas y te dice dónde te trabaste.')),
  ];
}

// Fin de sprint (¿pudiste?, premio u otro sprint) y fin de corte (volvamos).
function momentBody(m) {
  if (m.kind === 'sprint_end' && m.phase === 'ask') {
    return h(
      'div',
      { class: 'actions' },
      btn(t('🎉 ¡Lo hice!'), () => api.invoke('toast:checkin', 'done'), 'btn primary'),
      btn(t('🙂 Avancé'), () => api.invoke('toast:checkin', 'partial')),
      btn(t('🧱 Me trabé'), () => api.invoke('toast:checkin', 'stuck'))
    );
  }
  if (m.phase === 'done') {
    if (stepOpen) return stepBox({ goal: '', minutes: 25, placeholder: t('¿Qué sigue? Un paso concreto'), focus: true });
    return h(
      'div',
      { class: 'actions' },
      btn(t('🎁 Tomarme el premio (5 min)'), () => api.invoke('toast:reward'), 'btn primary'),
      btn(t('➡️ Otro sprint'), () => {
        stepOpen = true;
        render();
      })
    );
  }
  if (m.phase === 'partial') return stepBox({ goal: m.goal, minutes: 15 });
  // Fin del corte
  const hard = btn(t('😮‍💨 Me cuesta volver'), () => api.invoke('toast:checkin', 'stuck'));
  if (!m.firstThing) return stepBox({ goal: '', minutes: 25, placeholder: t('Ej: responder el mail de Ana'), extra: hard });
  return h(
    'div',
    { class: 'actions' },
    btn(t('▶ Arrancar {n} min', { n: 25 }), () => api.invoke('toast:step', { goal: m.firstThing, minutes: 25 }), 'btn primary'),
    hard
  );
}

// Campo para el próximo paso y botón para arrancar el sprint.
function stepBox({ goal, minutes, placeholder = t('Ej: escribir el primer párrafo'), focus = false, extra }) {
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
    h('div', { class: 'actions' }, btn(t('▶ Arrancar {n} min', { n: minutes }), go, 'btn primary'), extra)
  );
}

function tellBox() {
  const ta = h('textarea', { placeholder: t('Contame qué te pasa…') });
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
      btn(t('Enviar'), send, 'btn primary'),
      btn(t('🎤 Seguir hablando'), null, 'btn mic'),
      btn(t('Cancelar'), () => {
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
  el.replaceChildren(h('div', { class: 'row-center' }, h('div', { class: 'level' }, bars), t('Te escucho… tocá "Listo" al terminar')));
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
        if (s === 'transcribing') note(t('Pasando a texto lo que dijiste…'));
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
  if (next.lang) setLang(next.lang);
  if ((recording || isTyping()) && next.id === p?.id && !next.returned) pending = next;
  else {
    p = next;
    render();
  }
});
api.on('voice:progress', (pct) => note(t('Preparando la voz (sólo la primera vez): {pct}%', { pct })));
// Cambio de idioma desde el panel o el menú: se redibuja (lo que estabas escribiendo se conserva).
api.on('lang', (lang) => {
  setLang(lang);
  if (!recording) render();
});

render();
