const test = require('node:test');
const assert = require('node:assert/strict');

const { classify } = require('../src/classifier');
const { isWorkTime, parseBlocks } = require('../src/schedule');
const { FocusEngine } = require('../src/engine');
const { DEFAULTS, deepMerge } = require('../src/config');

test('classify: sitios, subdominios y rutas', () => {
  const cfg = { sites: ['instagram.com', 'youtube.com/shorts'], apps: ['WhatsApp'] };
  assert.equal(classify({ app: 'Google Chrome', url: 'https://www.instagram.com/p/1' }, cfg)?.label, 'instagram.com');
  assert.equal(classify({ app: 'Safari', url: 'https://m.instagram.com/' }, cfg)?.kind, 'site');
  assert.equal(classify({ app: 'Arc', url: 'https://youtube.com/shorts/abc' }, cfg)?.key, 'site:youtube.com/shorts');
  assert.equal(classify({ app: 'Arc', url: 'https://youtube.com/watch?v=tutorial' }, cfg), null);
  assert.equal(classify({ app: 'Chrome', url: 'https://notinstagram.com/' }, cfg), null);
  assert.equal(classify({ app: 'WhatsApp' }, cfg)?.kind, 'app');
  assert.equal(classify({ app: 'Visual Studio Code' }, cfg), null);
});

test('classify: "es por trabajo" permite temporalmente', () => {
  const cfg = { sites: ['instagram.com'], apps: [] };
  const act = { app: 'Chrome', url: 'https://instagram.com' };
  const now = 1_000_000;
  assert.equal(classify(act, cfg, { 'site:instagram.com': now + 1000 }, now), null);
  assert.ok(classify(act, cfg, { 'site:instagram.com': now - 1 }, now));
});

test('horario laboral con bloques y días', () => {
  const schedule = { days: [1, 2, 3, 4, 5], blocks: parseBlocks('09:00-13:00, 14:00-18:00') };
  const wed = (h, m = 0) => new Date(2026, 9, 14, h, m); // miércoles
  assert.equal(isWorkTime(schedule, wed(10)), true);
  assert.equal(isWorkTime(schedule, wed(13, 30)), false); // almuerzo
  assert.equal(isWorkTime(schedule, wed(17, 59)), true);
  assert.equal(isWorkTime(schedule, wed(18)), false);
  assert.equal(isWorkTime(schedule, new Date(2026, 9, 18, 10)), false); // domingo
  assert.equal(isWorkTime({ days: [3], blocks: [{ start: '22:00', end: '02:00' }] }, wed(23)), true);
});

test('config: merge profundo respeta defaults', () => {
  const merged = deepMerge(DEFAULTS, { camera: { sensitivity: 'alta' }, sites: ['a.com'] });
  assert.equal(merged.camera.sensitivity, 'alta');
  assert.equal(merged.camera.gazeSeconds, DEFAULTS.camera.gazeSeconds);
  assert.deepEqual(merged.sites, ['a.com']);
});

function engineConfig(over = {}) {
  return deepMerge(DEFAULTS, { graceSeconds: 8, nudgeFirst: true, nudgeToCoachSeconds: 20, ...over });
}
const insta = { key: 'site:instagram.com', kind: 'site', label: 'instagram.com' };

test('engine: aviso suave y después coach', () => {
  const e = new FocusEngine();
  const config = engineConfig();
  const at = (s, extra = {}) => e.tick({ now: s * 1000, config, distraction: insta, attention: null, idleSeconds: 0, ...extra });
  assert.equal(at(0).action, 'none');
  assert.equal(at(4).state, 'distracted');
  assert.equal(at(8).action, 'nudge');
  assert.equal(at(10).action, 'none');
  const r = at(28);
  assert.equal(r.action, 'coach');
  assert.equal(r.trigger.label, 'instagram.com');
});

test('engine: volver a trabajar reinicia el contador', () => {
  const e = new FocusEngine();
  const config = engineConfig({ nudgeFirst: false });
  e.tick({ now: 0, config, distraction: insta, attention: null, idleSeconds: 0 });
  e.tick({ now: 5000, config, distraction: null, attention: null, idleSeconds: 0 });
  assert.equal(e.tick({ now: 6000, config, distraction: insta, attention: null, idleSeconds: 0 }).action, 'none');
  assert.equal(e.tick({ now: 14_000, config, distraction: insta, attention: null, idleSeconds: 0 }).action, 'coach');
});

test('engine: no avisa con el coach abierto ni durante el cooldown', () => {
  const e = new FocusEngine();
  const config = engineConfig({ nudgeFirst: false });
  const tick = (s, paused = false) =>
    e.tick({ now: s * 1000, config, distraction: insta, attention: null, idleSeconds: 0, paused });
  tick(0);
  assert.equal(tick(10, true).action, 'none');
  e.resolved(10_000, 30);
  assert.equal(tick(20).action, 'none');
  assert.equal(tick(39).action, 'none');
  assert.equal(tick(50).action, 'coach');
});

test('engine: mirada fuera sólo cuenta sin teclado/mouse', () => {
  const e = new FocusEngine();
  const config = engineConfig({ nudgeFirst: false, camera: { enabled: true, gazeSeconds: 20, requireIdle: true, idleSeconds: 6 } });
  const tick = (s, idle) =>
    e.tick({ now: s * 1000, config, distraction: null, attention: { status: 'looking_away', at: s * 1000 }, idleSeconds: idle });
  tick(0, 1);
  assert.equal(tick(30, 1).action, 'none'); // escribiendo mirando el teclado
  tick(31, 10);
  assert.equal(tick(45, 24).action, 'none');
  const r = tick(52, 31);
  assert.equal(r.action, 'coach');
  assert.equal(r.trigger.type, 'gaze');
});

test('engine: ojos cerrados sugiere corte; datos viejos de cámara se ignoran', () => {
  const e = new FocusEngine();
  const config = engineConfig({ camera: { enabled: true, drowsySeconds: 6 } });
  const tick = (s, at = s * 1000) =>
    e.tick({ now: s * 1000, config, distraction: null, attention: { status: 'eyes_closed', at }, idleSeconds: 30 });
  tick(0);
  assert.equal(tick(7).trigger?.type, 'drowsy');
  const e2 = new FocusEngine();
  e2.tick({ now: 0, config, distraction: null, attention: { status: 'eyes_closed', at: 0 }, idleSeconds: 30 });
  assert.equal(e2.tick({ now: 7000, config, distraction: null, attention: { status: 'eyes_closed', at: 0 }, idleSeconds: 30 }).action, 'none');
});

test('engine: pantalla bloqueada = ausente', () => {
  const e = new FocusEngine();
  const r = e.tick({ now: 0, config: engineConfig(), distraction: insta, attention: null, idleSeconds: 0, locked: true });
  assert.deepEqual(r, { action: 'none', state: 'away' });
});

test('engine: mirada fija sin tocar nada es señal de bloqueo (una vez por pausa)', () => {
  const e = new FocusEngine();
  const config = engineConfig({ camera: { enabled: true }, signals: { stareMinutes: 4, hopping: false } });
  const tick = (s, idle) =>
    e.tick({ now: s * 1000, config, distraction: null, attention: { status: 'focused', at: s * 1000 }, idleSeconds: idle });
  assert.equal(tick(0, 100).action, 'none');
  const r = tick(10, 240);
  assert.equal(r.action, 'signal');
  assert.equal(r.trigger.type, 'stuck');
  assert.equal(tick(12, 242).action, 'none');
  // Volvés a tocar algo y después de 10 min puede volver a avisar
  tick(700, 1);
  assert.equal(tick(1000, 300).action, 'signal');
});

test('engine: saltar entre ventanas es señal, con cooldown', () => {
  const e = new FocusEngine();
  const config = engineConfig({ signals: { stareMinutes: 0, hopping: true } });
  const tick = (s, hopping) => e.tick({ now: s * 1000, config, distraction: null, attention: null, idleSeconds: 0, hopping });
  assert.equal(tick(0, false).action, 'none');
  assert.equal(tick(2, true).trigger?.type, 'hopping');
  assert.equal(tick(4, true).action, 'none');
  assert.equal(tick(700, true).action, 'signal');
});

test('engine: una distracción en pantalla tiene prioridad sobre las señales', () => {
  const e = new FocusEngine();
  const config = engineConfig({ nudgeFirst: false, signals: { stareMinutes: 0, hopping: true } });
  const r = e.tick({ now: 0, config, distraction: insta, attention: null, idleSeconds: 0, hopping: true });
  assert.equal(r.action, 'none');
  assert.equal(r.state, 'distracted');
});

const { WorkContext, describe: describeCtx, isExcluded } = require('../src/context');
const { buildPrompt } = require('../src/ai-coach');

test('contexto: recuerda dónde trabajabas y no cuenta las distracciones', () => {
  const w = new WorkContext();
  const vscode = { app: 'Visual Studio Code', title: 'engine.js — Foco' };
  const docs = { app: 'Google Chrome', url: 'https://docs.google.com/d/1', title: 'Informe Q3' };
  w.update(vscode, { now: 0, dt: 2 });
  w.update(vscode, { now: 60_000, dt: 60 });
  w.update(docs, { now: 62_000, dt: 2 });
  w.update({ app: 'Google Chrome', url: 'https://instagram.com' }, { now: 64_000, dt: 2, isDistraction: true });
  assert.equal(w.lastWork(64_000).label, 'Google Chrome — docs.google.com — Informe Q3');
  assert.equal(w.recent.length, 2);
  assert.equal(w.recent[1].seconds, 62);
  assert.match(w.summary(64_000)[1], /^Visual Studio Code — engine\.js — Foco \(1 min/);
  assert.equal(w.lastWork(64_000 + 20 * 60_000), null);
});

test('contexto: detecta saltos entre ventanas', () => {
  const w = new WorkContext();
  for (let i = 0; i < 12; i++) w.update({ app: i % 2 ? 'Slack' : 'Mail' }, { now: i * 5000, dt: 5 });
  assert.equal(w.isHopping(60_000, 10), true);
  assert.equal(w.isHopping(60_000 + 3 * 60_000, 10), false);
});

test('contexto: nunca captura apps o sitios excluidos', () => {
  const ctx = { excludeApps: ['1Password'], excludeSites: ['banco'] };
  assert.equal(isExcluded({ app: '1Password' }, ctx), true);
  assert.equal(isExcluded({ app: 'Chrome', url: 'https://www.bancogalicia.com.ar/x' }, ctx), true);
  assert.equal(isExcluded({ app: 'Chrome', url: 'https://github.com' }, ctx), false);
  assert.equal(describeCtx({ app: 'Notas', title: 'Notas' }), 'Notas');
});

test('ia: el pedido incluye el disparador, las ventanas y lo que contaste', () => {
  const text = buildPrompt({
    trigger: { type: 'site', label: 'instagram.com' },
    workSummary: ['VS Code — engine.js (12 min, recién)'],
    transcript: 'no me sale el test',
    previous: { working_on: 'los tests', likely_block: 'un assert' },
  });
  assert.match(text, /instagram\.com/);
  assert.match(text, /VS Code — engine\.js/);
  assert.match(text, /no me sale el test/);
  assert.match(text, /lectura anterior/);
});

test('ia: fin de sprint o de corte le dice a la IA en qué se trabó', () => {
  assert.match(buildPrompt({ trigger: { type: 'sprint_end', label: 'escribir la intro' } }), /sprint.*escribir la intro/);
  assert.match(buildPrompt({ trigger: { type: 'break_end', label: 'responder a Ana' } }), /corte.*responder a Ana/);
  assert.match(buildPrompt({ trigger: { type: 'break_end', label: '' } }), /le cuesta arrancar$/m);
});

// ---------- Idioma ----------

const fs = require('node:fs');
const path = require('node:path');
const { DOPAMINE_MENU, languageChange } = require('../src/config');
const { translate, EN: EN_MAIN } = require('../src/i18n');

test('idioma: cambiar de idioma traduce el menú de dopamina sólo si no lo editaste', () => {
  const base = deepMerge(DEFAULTS, {});
  assert.deepEqual(languageChange(base, 'en'), { language: 'en', dopamineMenu: DOPAMINE_MENU.en });
  const edited = deepMerge(DEFAULTS, { dopamineMenu: ['🧘 Meditar'] });
  assert.deepEqual(languageChange(edited, 'en'), { language: 'en' });
  const english = deepMerge(DEFAULTS, { language: 'en', dopamineMenu: DOPAMINE_MENU.en });
  assert.deepEqual(languageChange(english, 'es'), { language: 'es', dopamineMenu: DOPAMINE_MENU.es });
  assert.equal(languageChange(base, 'es'), null); // ya está en español
  assert.equal(languageChange(base, 'fr'), null); // idioma que no existe
  assert.equal(DOPAMINE_MENU.en.length, DOPAMINE_MENU.es.length);
});

test('idioma: el contexto y el pedido a la IA en inglés', () => {
  const w = new WorkContext();
  w.update({ app: 'Visual Studio Code', title: 'engine.js — Foco' }, { now: 0, dt: 120 });
  assert.match(w.summary(0, 'en')[0], /\(2 min, just now\)$/);
  assert.match(w.summary(3 * 60_000, 'en')[0], /3 min ago\)$/);
  assert.match(w.summary(0)[0], /recién\)$/);

  const text = buildPrompt(
    { trigger: { type: 'site', label: 'instagram.com' }, transcript: "I can't get the test to pass", flow: 'stuck' },
    'en'
  );
  assert.match(text, /^What triggered the alert: Went to a site that distracts them: instagram\.com/);
  assert.match(text, /What the person said: "I can't get the test to pass"/);
  assert.match(text, /I'm stuck on something/);
  assert.doesNotMatch(text, /Qué disparó/);
  assert.match(buildPrompt({ trigger: { type: 'break_end', label: '' } }, 'en'), /struggling to get started$/m);
});

test('idioma: los textos del proceso principal tienen traducción', () => {
  assert.equal(translate('en', 'Estás en {label}', { label: 'x.com' }), "You're on x.com");
  assert.equal(translate('es', 'Estás en {label}', { label: 'x.com' }), 'Estás en x.com');
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8').replace(/(^|\s)\/\/.*$/gm, '$1');
  const used = [...code.matchAll(/\bt\(\s*'((?:\\.|[^'\\\n])*)'/g)].map((m) => m[1].replace(/\\(.)/g, '$1'));
  assert.ok(used.length > 20);
  assert.deepEqual(used.filter((s) => !EN_MAIN[s]), []);
  // Ningún texto con tildes o signos del español quedó sin pasar por t()
  const spanish = [...code.matchAll(/'((?:\\.|[^'\\\n])*)'|`([^`]*)`/g)]
    .map((m) => (m[1] ?? m[2]).replace(/\\(.)/g, '$1'))
    .filter((s) => /[áéíóúñ¿¡…]/i.test(s) && !EN_MAIN[s] && s !== '🌐 Español'); // el idioma se nombra en su idioma
  assert.deepEqual(spanish, []);
  for (const [es, en] of Object.entries(EN_MAIN)) {
    const v = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    assert.equal(v(es), v(en), `mismos {valores} en "${es}"`);
  }
});
