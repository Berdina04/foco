// El coach: en vez de retarte, te pregunta qué pasa y te ayuda a armar el próximo paso.
import { reasonsFor, rulePlan } from './lib/strategies.mjs';
import { micButton } from './lib/recorder.mjs';
import { t, getLang, setLang } from './lib/i18n.mjs';

const api = window.foco;
const app = document.getElementById('app');
let ctx = await api.invoke('coach:context');
setLang(ctx.lang);
let S = {}; // respuestas de esta conversación
let timers = [];
let screenId = 0;
let current = null; // la pantalla que se ve, para redibujarla si cambiás el idioma
let depth = 0;

// Marca una función como pantalla: se recuerda la última que abriste (no las que usa por dentro).
function screen(fn) {
  const wrapped = (...args) => {
    if (!depth) current = () => wrapped(...args);
    depth++;
    try {
      return fn(...args);
    } finally {
      depth--;
    }
  };
  return wrapped;
}

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
const backBtn = (fn) => h('button', { class: 'btn ghost', onclick: fn }, t('← Atrás'));
const steps = (n, total) =>
  h('div', { class: 'steps' }, Array.from({ length: total }, (_, i) => h('i', { class: i < n ? 'on' : '' })));

function field(label, input, hint) {
  return h('label', { class: 'field' }, label, withMic(input), hint && h('span', { class: 'hint' }, hint));
}

// Botón 🎤 al lado de un campo: hablás y se escribe solo (Whisper, en tu Mac).
function withMic(input) {
  if (!ctx.voice || !(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return input;
  const status = h('span', { class: 'hint mic-status' });
  const button = h('button', { class: 'btn mic', type: 'button', title: t('Hablar en vez de escribir') }, '🎤');
  micButton(button, {
    onText: (text) => {
      input.value = input.value.trim() ? `${input.value.trim()} ${text}` : text;
      input.dispatchEvent(new Event('input'));
      input.focus();
    },
    onState: (s, extra) => {
      if (s === 'listening') status.textContent = t('Te escucho… tocá ■ al terminar');
      if (s === 'level') status.textContent = t('Te escucho {bars}', { bars: '▮'.repeat(1 + Math.round(extra * 6)) });
      if (s === 'transcribing') status.textContent = t('Pasando a texto…');
      if (s === 'done') status.textContent = '';
      if (s === 'error') status.textContent = extra;
    },
  });
  const wrap = h('div', { class: 'mic-row' }, input, button);
  return h('div', { class: 'stack', style: 'gap:4px' }, wrap, status);
}

api.on('voice:progress', (pct) => {
  for (const el of document.querySelectorAll('.mic-status')) el.textContent = t('Preparando la voz (sólo la primera vez): {pct}%', { pct });
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
  const label = h('div', { class: 'label' }, t('Preparate…'));
  const count = h('div', { class: 'muted small' });
  let i = 0;
  let cycle = 0;
  const step = () => {
    if (cycle >= cycles) return onDone();
    const p = pattern[i];
    label.textContent = t(p.label);
    count.textContent = t('{n} de {total}', { n: cycle + 1, total: cycles });
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

const DOPAMINE_LEAD =
  'Está todo bien: cuando algo se traba, el cerebro sale a buscar dopamina rápida. Antes de seguir, ¿qué está pasando?';
const TRIGGER_COPY = {
  site: (tr) => [t('Te fuiste a {label}', { label: tr.label }), t(DOPAMINE_LEAD)],
  app: (tr) => [t('Abriste {label}', { label: tr.label }), t(DOPAMINE_LEAD)],
  gaze: () => [
    t('Hace un rato que no mirás la pantalla'),
    t('¿Te distrajiste o estás pensando? Contame qué pasa y vemos cómo seguir.'),
  ],
  drowsy: () => [t('Parece que se te cierran los ojos'), t('Forzar el foco con sueño rinde poco. ¿Qué necesitás ahora?')],
  stuck: () => [t('¿Te trabaste?'), t('Hace unos minutos que mirás la pantalla sin avanzar. Contame qué pasa.')],
  hopping: () => [t('¿Buscando por dónde seguir?'), t('Saltaste entre muchas ventanas. Elijamos una cosa.')],
  manual: () => [t('¿Qué está pasando?'), t('Contame y armamos juntos un plan para destrabarte.')],
};

const logAnswer = (flow) => api.invoke('coach:answer', { flow, trigger: ctx.trigger?.key });

function start() {
  S = { task: ctx.task || '', part: ctx.prefill?.part || '', flow: null, reason: null, reasonLabel: '' };
  if (ctx.mode === 'checkin' && ctx.sprint) return checkin(ctx.sprint);
  if (ctx.mode === 'break_end') return breakEnd(ctx.breakInfo || {});
  // Desde el aviso flotante se puede entrar directo a un paso.
  if (ctx.start === 'stuck' || ctx.start === 'fiaca') return askTask(ctx.start);
  if (ctx.start === 'break') return breakMenu();
  intro();
}

const intro = screen(() => {
  const tr = ctx.trigger;
  const [title, lead] = (tr && TRIGGER_COPY[tr.type] ? TRIGGER_COPY[tr.type] : TRIGGER_COPY.manual)(tr || {});
  const options = [
    { emoji: '🧱', title: t('Me trabé con algo'), sub: t('No sé cómo seguir, me falta algo o es difícil'), onclick: () => askTask('stuck') },
    { emoji: '😮‍💨', title: t('Me da fiaca'), sub: t('Sé lo que tengo que hacer, pero no tengo ganas'), onclick: () => askTask('fiaca') },
    { emoji: '🔋', title: t('Necesito un corte'), sub: t('Estoy cansado, saturado o con la cabeza quemada'), onclick: () => breakMenu() },
    {
      emoji: '🤷',
      title: t('Fue automático'),
      sub: t('Ni me di cuenta, fue por costumbre'),
      onclick: () => (logAnswer('auto'), autoReset()),
    },
  ];
  if (tr?.type === 'drowsy') options.unshift(options.splice(2, 1)[0]);
  if (tr?.type === 'gaze') {
    options.push({
      emoji: '🤔',
      title: t('Estaba pensando o leyendo en papel'),
      sub: t('Falsa alarma, sigo con lo mío'),
      onclick: () => (logAnswer('false_alarm'), falseAlarm()),
    });
  }
  const isScreen = tr?.type === 'site' || tr?.type === 'app';

  render(
    h('div', { class: 'eyebrow' }, 'Foco'),
    h('h1', {}, title),
    h('p', { class: 'lead' }, lead),
    S.task && h('div', { class: 'task-chip' }, t('Estabas en: {x}', { x: S.task })),
    ctx.work && h('div', { class: 'task-chip' }, t('Última ventana: {work}', { work: ctx.work })),
    h('div', { class: 'options' }, options.map(option)),
    footer(
      isScreen &&
        h(
          'button',
          { class: 'btn ghost', onclick: () => api.invoke('coach:allow') },
          t('Es por trabajo (permitir {n} min)', { n: ctx.allowMinutes })
        ),
      spacer(),
      h('button', { class: 'btn', onclick: () => api.invoke('coach:back') }, t('Ya vuelvo, cerrar'))
    )
  );
});

const askTask = screen((flow) => {
  S.flow = flow;
  const copy =
    flow === 'stuck'
      ? {
          title: t('¿Dónde te trabaste?'),
          part: t('¿En qué parte exacta?'),
          hint: t('Lo más concreto posible: "la intro del informe", "el bug del login", "el mail a Juan".'),
        }
      : {
          title: t('¿Qué te da fiaca?'),
          part: t('¿Qué parte es la que MÁS fiaca te da?'),
          hint: t('Muchas veces no es toda la tarea sino un pedazo puntual. Encontrarlo ya ayuda.'),
        };
  const task = h('input', { type: 'text', placeholder: t('Ej: el informe mensual'), autofocus: !S.task });
  task.value = S.task;
  const part = h('textarea', { placeholder: t('Escribilo como te salga'), autofocus: !!S.task });
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
    field(t('¿En qué estás trabajando?'), task),
    field(copy.part, part, copy.hint),
    footer(backBtn(intro), spacer(), h('button', { class: 'btn primary', onclick: next }, t('Siguiente')))
  );
});

const askReason = screen((flow) => {
  render(
    steps(2, 3),
    h('h1', {}, t(flow === 'stuck' ? '¿Qué tipo de traba es?' : '¿Por qué creés que te da fiaca?')),
    h('p', { class: 'lead' }, t('Elegí la que más se parezca. No hay respuesta incorrecta.')),
    h(
      'div',
      { class: 'options' },
      reasonsFor(flow, getLang()).map((r) =>
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
});

// Plan de reglas (sin IA) con las respuestas de esta charla, en el idioma actual.
const basePlan = () => rulePlan(S.flow, S.reason, { task: S.task, part: S.part, triggerLabel: triggerLabel() }, getLang());

const plan = screen(async () => {
  const base = basePlan();
  if (base.suggestBreak) return breakMenu(true);
  if (!ctx.aiEnabled) return renderPlan(base, {});

  const id = screenId + 1;
  render(
    steps(3, 3),
    h('div', { class: 'row' }, h('div', { class: 'spinner' }), h('span', { class: 'muted' }, t('Armando un plan para tu caso…'))),
    h('p', { class: 'lead' }, base.reflection),
    footer(spacer(), h('button', { class: 'btn ghost', onclick: () => renderPlan(base, {}) }, t('Usar el plan rápido')))
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
});

const renderPlan = screen((p, meta) => {
  if (!meta.ai) p = basePlan(); // así el plan de reglas también cambia de idioma
  let minutes = p.sprint_minutes || 15;
  const micro = h('textarea', {});
  micro.value = p.micro_step;
  const reward = h('input', { type: 'text' });
  reward.value = p.reward_idea || '';
  const go = h('button', { class: 'btn primary' }, t('Arrancar sprint de {n} min', { n: minutes }));
  go.onclick = () =>
    api.invoke('coach:sprint', {
      goal: micro.value.trim() || p.micro_step,
      task: S.task,
      minutes,
      reward: reward.value.trim(),
    });

  render(
    steps(3, 3),
    h('div', { class: 'eyebrow' }, t(meta.ai ? 'Plan armado con IA' : 'Tu plan')),
    h('h1', {}, t('Vamos de a poco')),
    meta.ai && p.working_on && h('div', { class: 'task-chip' }, t('Estabas en: {x}', { x: p.working_on })),
    h('p', { class: 'reflection' }, p.reflection),
    p.strategies?.length &&
      h(
        'div',
        { class: 'stack' },
        h('h3', {}, t('Ideas para destrabarte')),
        p.strategies.map((s) => h('div', { class: 'strategy' }, h('b', {}, s.title), h('span', {}, s.how)))
      ),
    field(t('Tu próximo micro-paso'), micro, t('Una sola cosa concreta. Cambiala si querés.')),
    h(
      'div',
      { class: 'stack' },
      h('h3', {}, t('¿Cuánto tiempo le das?')),
      chips([10, 15, 25], minutes, (v) => {
        minutes = v;
        go.textContent = t('Arrancar sprint de {n} min', { n: v });
      }, (v) => `${v} min`)
    ),
    field(t('Cuando termine, me doy…'), reward, t('La dopamina llega igual, pero como premio y no como escape.')),
    meta.aiError && h('p', { class: 'ai-note' }, t('No se pudo usar la IA: {error} Te muestro el plan básico.', { error: meta.aiError })),
    footer(backBtn(() => askReason(S.flow)), spacer(), go)
  );
});

// fromPlan: llegaste porque dijiste que estás sin energía; se muestra el reencuadre de ese motivo.
const breakMenu = screen((fromPlan = false) => {
  let choice = null;
  let minutes = 5;
  const first = h('input', {
    type: 'text',
    placeholder: S.task ? t('Ej: seguir con {task}', { task: S.task }) : t('Ej: responder el mail de Ana'),
  });
  const go = h('button', { class: 'btn primary', disabled: true }, t('Empezar el corte'));
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
    const isBreathing = /respir|breath/i.test(choice);
    await api.invoke('coach:break', { activity: choice, minutes, firstThing: first.value.trim(), keepWindowOpen: isBreathing });
    if (isBreathing) breathingBreak(minutes);
  };

  render(
    h('div', { class: 'eyebrow' }, t('Un corte que recarga')),
    h('h1', {}, t('Hagamos un corte de verdad')),
    h(
      'p',
      { class: 'lead' },
      fromPlan
        ? basePlan().reflection
        : t('Scrollear no descansa: le suma estímulo a una cabeza que ya está saturada. Elegí algo que recargue de verdad.')
    ),
    list,
    h('div', { class: 'stack' }, h('h3', {}, t('¿Cuánto?')), chips([5, 10, 15], minutes, (v) => (minutes = v), (v) => `${v} min`)),
    field(t('Cuando vuelva, lo primero que voy a hacer es…'), first, t('Dejarlo escrito hace que volver cueste mucho menos.')),
    footer(backBtn(intro), spacer(), go)
  );
});

const breathingBreak = screen((minutes) => {
  render(
    h('div', { class: 'eyebrow' }, t('Respiración cuadrada')),
    h('h1', {}, t('Seguí el círculo')),
    h('p', { class: 'lead' }, t('4 segundos para cada parte. Si te mareás, respirá normal.')),
    breathing({ pattern: BOX, cycles: 7, onDone: () => breathingDone(minutes) }),
    footer(spacer(), h('button', { class: 'btn ghost', onclick: () => window.close() }, t('Saltear')))
  );
});

const breathingDone = screen((minutes) => {
  render(
    h('div', { class: 'big-emoji' }, '🌿'),
    h('h1', {}, t('Listo')),
    h('p', { class: 'lead' }, t('El corte sigue corriendo ({n} min en total). Te aviso cuando termine.', { n: minutes })),
    footer(spacer(), h('button', { class: 'btn primary', onclick: () => window.close() }, t('Cerrar')))
  );
});

// La respuesta "fue automático" se registra al elegirla (en intro), no acá: así redibujar no la duplica.
const autoReset = screen(() => {
  S.flow = 'auto';
  render(
    h('div', { class: 'eyebrow' }, t('Reset de 30 segundos')),
    h('h1', {}, t('Pasa un montón, es un hábito')),
    h(
      'p',
      { class: 'lead' },
      t('No es falta de voluntad: la mano va sola. Tres respiraciones y volvemos con un paso concreto.')
    ),
    breathing({ pattern: CALM, cycles: 3, onDone: autoNext }),
    footer(spacer(), h('button', { class: 'btn ghost', onclick: autoNext }, t('Saltear')))
  );
});

const autoNext = screen(() => {
  nextStep({
    eyebrow: t('Volvemos'),
    title: t('¿Cuál es el próximo paso concreto?'),
    lead: S.task
      ? t('En "{task}". Algo que puedas hacer ya, en pocos minutos.', { task: S.task })
      : t('Algo que puedas hacer ya, en pocos minutos.'),
    goal: '',
    minutes: 15,
  });
});

const falseAlarm = screen(() => {
  render(
    h('div', { class: 'big-emoji' }, '👌'),
    h('h1', {}, t('Perfecto, seguí')),
    h(
      'p',
      { class: 'lead' },
      t('Si te pasa seguido, calibrá la cámara (sobre todo si usás más de un monitor) o bajá la sensibilidad.')
    ),
    footer(
      h('button', { class: 'btn', onclick: () => (api.invoke('camera:show'), api.invoke('coach:back')) }, t('Calibrar cámara')),
      spacer(),
      h('button', { class: 'btn primary', onclick: () => api.invoke('coach:back') }, t('Listo'))
    )
  );
});

const checkin = screen((sprint) => {
  const done = (result) => api.invoke('coach:checkin', { result, goal: sprint.goal });
  S.task = sprint.task || S.task;
  render(
    h('div', { class: 'eyebrow' }, t('Fin del sprint')),
    h('h1', {}, t('¿Cómo te fue?')),
    h('p', { class: 'lead' }, t('Tu micro-paso era: {goal}', { goal: sprint.goal })),
    h(
      'div',
      { class: 'options' },
      option({ emoji: '🎉', title: t('¡Lo hice!'), onclick: () => (done('done'), celebrate(sprint)) }),
      option({ emoji: '🙂', title: t('Avancé, pero no terminé'), onclick: () => (done('partial'), keepGoing(sprint)) }),
      option({ emoji: '🧱', title: t('No, me trabé'), onclick: () => (done('stuck'), askTask('stuck')) })
    ),
    footer(spacer(), h('button', { class: 'btn ghost', onclick: () => api.invoke('coach:back') }, t('Cerrar')))
  );
});

const keepGoing = screen((sprint) => {
  nextStep({
    eyebrow: t('Sigue contando'),
    title: t('Avanzar es avanzar'),
    lead: t('¿Seguimos un rato más con lo mismo, o ajustamos el paso?'),
    goal: sprint.goal,
    minutes: 15,
  });
});

const celebrate = screen((sprint) => {
  render(
    h('div', { class: 'big-emoji' }, '🎉'),
    h('h1', {}, t('¡Bien ahí!')),
    h(
      'p',
      { class: 'lead' },
      sprint.reward ? t('Te ganaste: {reward}', { reward: sprint.reward }) : t('Date un respiro antes de lo próximo.')
    ),
    h(
      'div',
      { class: 'options' },
      option({
        emoji: '🎁',
        title: t('Tomarme el premio (5 min)'),
        sub: t('Con alarma: te aviso cuando termine'),
        onclick: () => api.invoke('coach:break', { activity: sprint.reward || t('Premio'), minutes: 5, firstThing: '' }),
      }),
      option({ emoji: '➡️', title: t('Seguir con otro sprint'), onclick: () => anotherSprint() })
    ),
    footer(spacer(), h('button', { class: 'btn ghost', onclick: () => api.invoke('coach:back') }, t('Cerrar')))
  );
});

const anotherSprint = screen(() => {
  nextStep({ eyebrow: t('Siguiente'), title: t('¿Qué sigue?'), lead: t('Un paso concreto más.'), goal: '', minutes: 25 });
});

const breakEnd = screen((info) => {
  nextStep({
    eyebrow: t('Fin del corte'),
    title: t('¡Volviste!'),
    lead: t(info.firstThing ? 'Esto es lo que dejaste anotado para arrancar:' : '¿Con qué arrancás?'),
    goal: info.firstThing || '',
    minutes: 25,
    extra: option({ emoji: '😮‍💨', title: t('Me cuesta volver'), onclick: intro }),
  });
});

// La usan otras pantallas (no se recuerda sola): los textos ya llegan traducidos.
function nextStep({ eyebrow, title, lead, goal, minutes, extra }) {
  const step = h('input', { type: 'text', placeholder: t('Ej: escribir el primer párrafo'), autofocus: true });
  step.value = goal;
  const go = h('button', { class: 'btn primary' }, t('Arrancar sprint de {n} min', { n: minutes }));
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
    field(t('Próximo paso'), step),
    chips([10, 15, 25], minutes, (v) => {
      minutes = v;
      go.textContent = t('Arrancar sprint de {n} min', { n: v });
    }, (v) => `${v} min`),
    extra && h('div', { class: 'options' }, extra),
    footer(spacer(), h('button', { class: 'btn ghost', onclick: () => api.invoke('coach:back') }, t('Cerrar')), go)
  );
}

// ---------- Eventos ----------

api.on('coach:context', (next) => {
  ctx = next;
  setLang(ctx.lang);
  start();
});
// Cambio de idioma con el coach abierto: se redibuja la pantalla en la que estás.
api.on('lang', (lang) => {
  setLang(lang);
  ctx.lang = lang;
  current?.();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') api.invoke('coach:close');
});

start();
