// El coach: en vez de retarte, te pregunta qué pasa y te ayuda a armar el próximo paso.
import { REASONS, rulePlan } from './lib/strategies.mjs';
import { micButton } from './lib/recorder.mjs';

const api = window.foco;
const app = document.getElementById('app');
let ctx = await api.invoke('coach:context');
let S = {}; // respuestas de esta conversación
let timers = [];
let screenId = 0;

// ---------- Helpers de UI ----------

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v != null && v !== false) el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

function render(...nodes) {
  timers.forEach(clearTimeout);
  timers = [];
  screenId++;
  app.replaceChildren(...nodes.flat().filter(Boolean));
  window.scrollTo(0, 0);
  app.querySelector('[autofocus]')?.focus();
}

const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const spacer = () => h('div', { class: 'spacer' });
const footer = (...items) => h('div', { class: 'footer' }, ...items);
const backBtn = (fn) => h('button', { class: 'btn ghost', onclick: fn }, '← Atrás');
const steps = (n, total) =>
  h('div', { class: 'steps' }, Array.from({ length: total }, (_, i) => h('i', { class: i < n ? 'on' : '' })));

function field(label, input, hint) {
  return h('label', { class: 'field' }, label, withMic(input), hint && h('span', { class: 'hint' }, hint));
}

// Botón 🎤 al lado de un campo: hablás y se escribe solo (Whisper, en tu Mac).
function withMic(input) {
  if (!ctx.voice || !(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return input;
  const status = h('span', { class: 'hint mic-status' });
  const button = h('button', { class: 'btn mic', type: 'button', title: 'Hablar en vez de escribir' }, '🎤');
  micButton(button, {
    onText: (text) => {
      input.value = input.value.trim() ? `${input.value.trim()} ${text}` : text;
      input.dispatchEvent(new Event('input'));
      input.focus();
    },
    onState: (s, extra) => {
      if (s === 'listening') status.textContent = 'Te escucho… tocá ■ al terminar';
      if (s === 'level') status.textContent = `Te escucho ${'▮'.repeat(1 + Math.round(extra * 6))}`;
      if (s === 'transcribing') status.textContent = 'Pasando a texto…';
      if (s === 'done') status.textContent = '';
      if (s === 'error') status.textContent = extra;
    },
  });
  const wrap = h('div', { class: 'mic-row' }, input, button);
  return h('div', { class: 'stack', style: 'gap:4px' }, wrap, status);
}

api.on('voice:progress', (pct) => {
  for (const el of document.querySelectorAll('.mic-status')) el.textContent = `Preparando la voz (sólo la primera vez): ${pct}%`;
});

function option({ emoji, title, sub, onclick }) {
  return h(
    'button',
    { class: 'option', onclick },
    emoji && h('span', { class: 'emoji' }, emoji),
    h('div', {}, h('b', {}, title), sub && h('span', { class: 'sub' }, sub))
  );
}

// Chips de selección única. onChange recibe el valor elegido.
function chips(values, selected, onChange, format = (v) => v) {
  const wrap = h('div', { class: 'chips' });
  for (const v of values) {
    const chip = h('button', { class: 'chip' + (v === selected ? ' on' : '') }, format(v));
    chip.onclick = () => {
      wrap.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
      chip.classList.add('on');
      onChange(v);
    };
    wrap.append(chip);
  }
  return wrap;
}

const triggerLabel = () =>
  ctx.trigger && (ctx.trigger.type === 'site' || ctx.trigger.type === 'app') ? ctx.trigger.label : null;

// ---------- Respiración guiada ----------

const BOX = [
  { label: 'Inhalá', secs: 4, scale: 1 },
  { label: 'Sostené', secs: 4, scale: 1 },
  { label: 'Exhalá', secs: 4, scale: 0.55 },
  { label: 'Sostené', secs: 4, scale: 0.55 },
];
const CALM = [
  { label: 'Inhalá', secs: 4, scale: 1 },
  { label: 'Exhalá lento', secs: 6, scale: 0.55 },
];

function breathing({ pattern, cycles, onDone }) {
  const circle = h('div', { class: 'circle' });
  const label = h('div', { class: 'label' }, 'Preparate…');
  const count = h('div', { class: 'muted small' });
  let i = 0;
  let cycle = 0;
  const step = () => {
    if (cycle >= cycles) return onDone();
    const p = pattern[i];
    label.textContent = p.label;
    count.textContent = `${cycle + 1} de ${cycles}`;
    circle.style.transitionDuration = `${p.secs}s`;
    circle.style.transform = `scale(${p.scale})`;
    later(() => {
      if (++i >= pattern.length) {
        i = 0;
        cycle++;
      }
      step();
    }, p.secs * 1000);
  };
  later(step, 800);
  return h('div', { class: 'breath' }, circle, label, count);
}

// ---------- Pantallas ----------

const TRIGGER_COPY = {
  site: (t) => [
    `Te fuiste a ${t.label}`,
    'Está todo bien: cuando algo se traba, el cerebro sale a buscar dopamina rápida. Antes de seguir, ¿qué está pasando?',
  ],
  app: (t) => [
    `Abriste ${t.label}`,
    'Está todo bien: cuando algo se traba, el cerebro sale a buscar dopamina rápida. Antes de seguir, ¿qué está pasando?',
  ],
  gaze: () => [
    'Hace un rato que no mirás la pantalla',
    '¿Te distrajiste o estás pensando? Contame qué pasa y vemos cómo seguir.',
  ],
  drowsy: () => ['Parece que se te cierran los ojos', 'Forzar el foco con sueño rinde poco. ¿Qué necesitás ahora?'],
  stuck: () => ['¿Te trabaste?', 'Hace unos minutos que mirás la pantalla sin avanzar. Contame qué pasa.'],
  hopping: () => ['¿Buscando por dónde seguir?', 'Saltaste entre muchas ventanas. Elijamos una cosa.'],
  manual: () => ['¿Qué está pasando?', 'Contame y armamos juntos un plan para destrabarte.'],
};

function start() {
  S = { task: ctx.task || '', part: ctx.prefill?.part || '', flow: null, reason: null, reasonLabel: '' };
  if (ctx.mode === 'checkin' && ctx.sprint) return checkin(ctx.sprint);
  if (ctx.mode === 'break_end') return breakEnd(ctx.breakInfo || {});
  // Desde el aviso flotante se puede entrar directo a un paso.
  if (ctx.start === 'stuck' || ctx.start === 'fiaca') return askTask(ctx.start);
  if (ctx.start === 'break') return breakMenu();
  intro();
}

function intro() {
  const t = ctx.trigger;
  const [title, lead] = (t && TRIGGER_COPY[t.type] ? TRIGGER_COPY[t.type] : TRIGGER_COPY.manual)(t || {});
  const options = [
    { emoji: '🧱', title: 'Me trabé con algo', sub: 'No sé cómo seguir, me falta algo o es difícil', onclick: () => askTask('stuck') },
    { emoji: '😮‍💨', title: 'Me da fiaca', sub: 'Sé lo que tengo que hacer, pero no tengo ganas', onclick: () => askTask('fiaca') },
    { emoji: '🔋', title: 'Necesito un corte', sub: 'Estoy cansado, saturado o con la cabeza quemada', onclick: () => breakMenu() },
    { emoji: '🤷', title: 'Fue automático', sub: 'Ni me di cuenta, fue por costumbre', onclick: () => autoReset() },
  ];
  if (t?.type === 'drowsy') options.unshift(options.splice(2, 1)[0]);
  if (t?.type === 'gaze') {
    options.push({ emoji: '🤔', title: 'Estaba pensando o leyendo en papel', sub: 'Falsa alarma, sigo con lo mío', onclick: falseAlarm });
  }
  const isScreen = t?.type === 'site' || t?.type === 'app';

  render(
    h('div', { class: 'eyebrow' }, 'Foco'),
    h('h1', {}, title),
    h('p', { class: 'lead' }, lead),
    S.task && h('div', { class: 'task-chip' }, `Estabas en: ${S.task}`),
    ctx.work && h('div', { class: 'task-chip' }, `Última ventana: ${ctx.work}`),
    h('div', { class: 'options' }, options.map(option)),
    footer(
      isScreen &&
        h('button', { class: 'btn ghost', onclick: () => api.invoke('coach:allow') }, `Es por trabajo (permitir ${ctx.allowMinutes} min)`),
      spacer(),
      h('button', { class: 'btn', onclick: () => api.invoke('coach:back') }, 'Ya vuelvo, cerrar')
    )
  );
}

function askTask(flow) {
  S.flow = flow;
  const copy =
    flow === 'stuck'
      ? {
          title: '¿Dónde te trabaste?',
          part: '¿En qué parte exacta?',
          hint: 'Lo más concreto posible: "la intro del informe", "el bug del login", "el mail a Juan".',
        }
      : {
          title: '¿Qué te da fiaca?',
          part: '¿Qué parte es la que MÁS fiaca te da?',
          hint: 'Muchas veces no es toda la tarea sino un pedazo puntual. Encontrarlo ya ayuda.',
        };
  const task = h('input', { type: 'text', placeholder: 'Ej: el informe mensual', autofocus: !S.task });
  task.value = S.task;
  const part = h('textarea', { placeholder: 'Escribilo como te salga', autofocus: !!S.task });
  part.value = S.part;
  const next = () => {
    S.task = task.value.trim();
    S.part = part.value.trim();
    askReason(flow);
  };
  task.addEventListener('keydown', (e) => e.key === 'Enter' && part.focus());

  render(
    steps(1, 3),
    h('h1', {}, copy.title),
    field('¿En qué estás trabajando?', task),
    field(copy.part, part, copy.hint),
    footer(backBtn(intro), spacer(), h('button', { class: 'btn primary', onclick: next }, 'Siguiente'))
  );
}

function askReason(flow) {
  render(
    steps(2, 3),
    h('h1', {}, flow === 'stuck' ? '¿Qué tipo de traba es?' : '¿Por qué creés que te da fiaca?'),
    h('p', { class: 'lead' }, 'Elegí la que más se parezca. No hay respuesta incorrecta.'),
    h(
      'div',
      { class: 'options' },
      REASONS[flow].map((r) =>
        option({
          title: r.label,
          onclick: () => {
            S.reason = r.id;
            S.reasonLabel = r.label;
            api.invoke('coach:answer', { flow, reason: r.id, task: S.task, part: S.part, trigger: ctx.trigger?.key });
            plan();
          },
        })
      )
    ),
    footer(backBtn(() => askTask(flow)))
  );
}

async function plan() {
  const base = rulePlan(S.flow, S.reason, { task: S.task, part: S.part, triggerLabel: triggerLabel() });
  if (base.suggestBreak) return breakMenu(base.reflection);
  if (!ctx.aiEnabled) return renderPlan(base, {});

  const id = screenId + 1;
  render(
    steps(3, 3),
    h('div', { class: 'row' }, h('div', { class: 'spinner' }), h('span', { class: 'muted' }, 'Armando un plan para tu caso…')),
    h('p', { class: 'lead' }, base.reflection),
    footer(spacer(), h('button', { class: 'btn ghost', onclick: () => renderPlan(base, {}) }, 'Usar el plan rápido'))
  );
  const res = await api.invoke('coach:ai', {
    flow: S.flow,
    task: S.task,
    part: S.part,
    reasonLabel: S.reasonLabel,
    triggerLabel: triggerLabel(),
  });
  if (screenId !== id) return; // ya se fue de esta pantalla
  if (res?.plan) renderPlan(res.plan, { ai: true });
  else renderPlan(base, { aiError: res?.error });
}

function renderPlan(p, meta) {
  let minutes = p.sprint_minutes || 15;
  const micro = h('textarea', {});
  micro.value = p.micro_step;
  const reward = h('input', { type: 'text' });
  reward.value = p.reward_idea || '';
  const go = h('button', { class: 'btn primary' }, `Arrancar sprint de ${minutes} min`);
  go.onclick = () =>
    api.invoke('coach:sprint', {
      goal: micro.value.trim() || p.micro_step,
      task: S.task,
      minutes,
      reward: reward.value.trim(),
    });

  render(
    steps(3, 3),
    h('div', { class: 'eyebrow' }, meta.ai ? 'Plan armado con IA' : 'Tu plan'),
    h('h1', {}, 'Vamos de a poco'),
    meta.ai && p.working_on && h('div', { class: 'task-chip' }, `Estabas en: ${p.working_on}`),
    h('p', { class: 'reflection' }, p.reflection),
    p.strategies?.length &&
      h(
        'div',
        { class: 'stack' },
        h('h3', {}, 'Ideas para destrabarte'),
        p.strategies.map((s) => h('div', { class: 'strategy' }, h('b', {}, s.title), h('span', {}, s.how)))
      ),
    field('Tu próximo micro-paso', micro, 'Una sola cosa concreta. Cambiala si querés.'),
    h(
      'div',
      { class: 'stack' },
      h('h3', {}, '¿Cuánto tiempo le das?'),
      chips([10, 15, 25], minutes, (v) => {
        minutes = v;
        go.textContent = `Arrancar sprint de ${v} min`;
      }, (v) => `${v} min`)
    ),
    field('Cuando termine, me doy…', reward, 'La dopamina llega igual, pero como premio y no como escape.'),
    meta.aiError && h('p', { class: 'ai-note' }, `No se pudo usar la IA: ${meta.aiError} Te muestro el plan básico.`),
    footer(backBtn(() => askReason(S.flow)), spacer(), go)
  );
}

function breakMenu(reflection) {
  let choice = null;
  let minutes = 5;
  const first = h('input', {
    type: 'text',
    placeholder: S.task ? `Ej: seguir con ${S.task}` : 'Ej: responder el mail de Ana',
  });
  const go = h('button', { class: 'btn primary', disabled: true }, 'Empezar el corte');
  const list = h(
    'div',
    { class: 'options' },
    (ctx.dopamineMenu || []).map((item) => {
      const btn = option({ title: item });
      btn.onclick = () => {
        list.querySelectorAll('.option').forEach((o) => o.classList.remove('on'));
        btn.classList.add('on');
        choice = item;
        go.disabled = false;
      };
      return btn;
    })
  );
  go.onclick = async () => {
    const isBreathing = /respir/i.test(choice);
    await api.invoke('coach:break', { activity: choice, minutes, firstThing: first.value.trim(), keepWindowOpen: isBreathing });
    if (isBreathing) breathingBreak(minutes);
  };

  render(
    h('div', { class: 'eyebrow' }, 'Un corte que recarga'),
    h('h1', {}, 'Hagamos un corte de verdad'),
    h(
      'p',
      { class: 'lead' },
      reflection ||
        'Scrollear no descansa: le suma estímulo a una cabeza que ya está saturada. Elegí algo que recargue de verdad.'
    ),
    list,
    h('div', { class: 'stack' }, h('h3', {}, '¿Cuánto?'), chips([5, 10, 15], minutes, (v) => (minutes = v), (v) => `${v} min`)),
    field('Cuando vuelva, lo primero que voy a hacer es…', first, 'Dejarlo escrito hace que volver cueste mucho menos.'),
    footer(backBtn(intro), spacer(), go)
  );
}

function breathingBreak(minutes) {
  render(
    h('div', { class: 'eyebrow' }, 'Respiración cuadrada'),
    h('h1', {}, 'Seguí el círculo'),
    h('p', { class: 'lead' }, '4 segundos para cada parte. Si te mareás, respirá normal.'),
    breathing({
      pattern: BOX,
      cycles: 7,
      onDone: () =>
        render(
          h('div', { class: 'big-emoji' }, '🌿'),
          h('h1', {}, 'Listo'),
          h('p', { class: 'lead' }, `El corte sigue corriendo (${minutes} min en total). Te aviso cuando termine.`),
          footer(spacer(), h('button', { class: 'btn primary', onclick: () => window.close() }, 'Cerrar'))
        ),
    }),
    footer(spacer(), h('button', { class: 'btn ghost', onclick: () => window.close() }, 'Saltear'))
  );
}

function autoReset() {
  api.invoke('coach:answer', { flow: 'auto', trigger: ctx.trigger?.key });
  S.flow = 'auto';
  render(
    h('div', { class: 'eyebrow' }, 'Reset de 30 segundos'),
    h('h1', {}, 'Pasa un montón, es un hábito'),
    h(
      'p',
      { class: 'lead' },
      'No es falta de voluntad: la mano va sola. Tres respiraciones y volvemos con un paso concreto.'
    ),
    breathing({ pattern: CALM, cycles: 3, onDone: autoNext }),
    footer(spacer(), h('button', { class: 'btn ghost', onclick: autoNext }, 'Saltear'))
  );
}

function autoNext() {
  nextStep({
    eyebrow: 'Volvemos',
    title: '¿Cuál es el próximo paso concreto?',
    lead: S.task ? `En "${S.task}". Algo que puedas hacer ya, en pocos minutos.` : 'Algo que puedas hacer ya, en pocos minutos.',
    goal: '',
    minutes: 15,
  });
}

function falseAlarm() {
  api.invoke('coach:answer', { flow: 'false_alarm', trigger: ctx.trigger?.key });
  render(
    h('div', { class: 'big-emoji' }, '👌'),
    h('h1', {}, 'Perfecto, seguí'),
    h(
      'p',
      { class: 'lead' },
      'Si te pasa seguido, calibrá la cámara (sobre todo si usás más de un monitor) o bajá la sensibilidad.'
    ),
    footer(
      h('button', { class: 'btn', onclick: () => (api.invoke('camera:show'), api.invoke('coach:back')) }, 'Calibrar cámara'),
      spacer(),
      h('button', { class: 'btn primary', onclick: () => api.invoke('coach:back') }, 'Listo')
    )
  );
}

function checkin(sprint) {
  const done = (result) => api.invoke('coach:checkin', { result, goal: sprint.goal });
  S.task = sprint.task || S.task;
  render(
    h('div', { class: 'eyebrow' }, 'Fin del sprint'),
    h('h1', {}, '¿Cómo te fue?'),
    h('p', { class: 'lead' }, `Tu micro-paso era: ${sprint.goal}`),
    h(
      'div',
      { class: 'options' },
      option({ emoji: '🎉', title: '¡Lo hice!', onclick: () => (done('done'), celebrate(sprint)) }),
      option({
        emoji: '🙂',
        title: 'Avancé, pero no terminé',
        onclick: () => {
          done('partial');
          nextStep({
            eyebrow: 'Sigue contando',
            title: 'Avanzar es avanzar',
            lead: '¿Seguimos un rato más con lo mismo, o ajustamos el paso?',
            goal: sprint.goal,
            minutes: 15,
          });
        },
      }),
      option({ emoji: '🧱', title: 'No, me trabé', onclick: () => (done('stuck'), askTask('stuck')) })
    ),
    footer(spacer(), h('button', { class: 'btn ghost', onclick: () => api.invoke('coach:back') }, 'Cerrar'))
  );
}

function celebrate(sprint) {
  render(
    h('div', { class: 'big-emoji' }, '🎉'),
    h('h1', {}, '¡Bien ahí!'),
    h('p', { class: 'lead' }, sprint.reward ? `Te ganaste: ${sprint.reward}` : 'Date un respiro antes de lo próximo.'),
    h(
      'div',
      { class: 'options' },
      option({
        emoji: '🎁',
        title: 'Tomarme el premio (5 min)',
        sub: 'Con alarma: te aviso cuando termine',
        onclick: () => api.invoke('coach:break', { activity: sprint.reward || 'Premio', minutes: 5, firstThing: '' }),
      }),
      option({
        emoji: '➡️',
        title: 'Seguir con otro sprint',
        onclick: () =>
          nextStep({ eyebrow: 'Siguiente', title: '¿Qué sigue?', lead: 'Un paso concreto más.', goal: '', minutes: 25 }),
      })
    ),
    footer(spacer(), h('button', { class: 'btn ghost', onclick: () => api.invoke('coach:back') }, 'Cerrar'))
  );
}

function breakEnd(info) {
  nextStep({
    eyebrow: 'Fin del corte',
    title: '¡Volviste!',
    lead: info.firstThing ? 'Esto es lo que dejaste anotado para arrancar:' : '¿Con qué arrancás?',
    goal: info.firstThing || '',
    minutes: 25,
    extra: option({ emoji: '😮‍💨', title: 'Me cuesta volver', onclick: intro }),
  });
}

function nextStep({ eyebrow, title, lead, goal, minutes, extra }) {
  const step = h('input', { type: 'text', placeholder: 'Ej: escribir el primer párrafo', autofocus: true });
  step.value = goal;
  const go = h('button', { class: 'btn primary' }, `Arrancar sprint de ${minutes} min`);
  const startSprint = () => {
    if (!step.value.trim()) return step.focus();
    api.invoke('coach:sprint', { goal: step.value.trim(), task: S.task, minutes, reward: '' });
  };
  go.onclick = startSprint;
  step.addEventListener('keydown', (e) => e.key === 'Enter' && startSprint());

  render(
    h('div', { class: 'eyebrow' }, eyebrow),
    h('h1', {}, title),
    h('p', { class: 'lead' }, lead),
    field('Próximo paso', step),
    chips([10, 15, 25], minutes, (v) => {
      minutes = v;
      go.textContent = `Arrancar sprint de ${v} min`;
    }, (v) => `${v} min`),
    extra && h('div', { class: 'options' }, extra),
    footer(spacer(), h('button', { class: 'btn ghost', onclick: () => api.invoke('coach:back') }, 'Cerrar'), go)
  );
}

// ---------- Eventos ----------

api.on('coach:context', (next) => {
  ctx = next;
  start();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') api.invoke('coach:close');
});

start();
