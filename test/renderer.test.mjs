import test from 'node:test';
import assert from 'node:assert/strict';
import { headPose, gazeFromBlendshapes, classifyAttention, averagePose } from '../renderer/lib/attention.mjs';
import { REASONS, rulePlan } from '../renderer/lib/strategies.mjs';

// Matriz de rotación en Y (yaw) en formato column-major como la de MediaPipe.
function yawMatrix(deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

test('headPose: recupera el giro de la cabeza', () => {
  assert.ok(Math.abs(Math.abs(headPose(yawMatrix(30)).yaw) - 30) < 0.01);
  assert.ok(Math.abs(headPose(yawMatrix(0)).pitch) < 0.01);
});

test('gaze: mirada a la derecha y abajo', () => {
  const g = gazeFromBlendshapes([
    { categoryName: 'eyeLookInLeft', score: 0.7 },
    { categoryName: 'eyeLookOutRight', score: 0.7 },
    { categoryName: 'eyeLookDownLeft', score: 0.4 },
    { categoryName: 'eyeLookDownRight', score: 0.4 },
    { categoryName: 'eyeBlinkLeft', score: 0.1 },
    { categoryName: 'eyeBlinkRight', score: 0.1 },
  ]);
  assert.ok(g.gazeX > 0.6);
  assert.ok(Math.abs(g.gazeY - 0.4) < 1e-9);
  assert.ok(Math.abs(g.blink - 0.1) < 1e-9);
});

test('classifyAttention: relativo a la calibración y con varias pantallas', () => {
  const base = [{ yaw: 0, pitch: -10, gazeX: 0, gazeY: 0.1 }];
  const m = (o) => ({ yaw: 0, pitch: -10, gazeX: 0, gazeY: 0.1, blink: 0.1, ...o });
  assert.equal(classifyAttention(null, base), 'no_face');
  assert.equal(classifyAttention(m({}), base), 'focused');
  assert.equal(classifyAttention(m({ yaw: 40 }), base), 'looking_away');
  assert.equal(classifyAttention(m({ pitch: -40, blink: 0.8 }), base), 'looking_away'); // celular, no sueño
  assert.equal(classifyAttention(m({ blink: 0.8 }), base), 'eyes_closed');
  // Con un segundo monitor calibrado a la derecha, mirarlo es foco
  const two = [...base, { yaw: 38, pitch: -10, gazeX: 0.2, gazeY: 0.1 }];
  assert.equal(classifyAttention(m({ yaw: 38, gazeX: 0.2 }), two), 'focused');
  assert.equal(averagePose([m({ yaw: 10 }), m({ yaw: 20 })]).yaw, 15);
});

test('strategies: cada motivo tiene plan completo', () => {
  for (const [flow, list] of Object.entries(REASONS)) {
    for (const r of list) {
      const p = rulePlan(flow, r.id, { task: 'el informe', part: 'la intro' });
      assert.ok(p.reflection.length > 20, `${flow}:${r.id} reflection`);
      assert.ok(p.micro_step.includes('la intro'), `${flow}:${r.id} micro usa la parte`);
      assert.ok([10, 15, 25].includes(p.sprint_minutes));
      if (!p.suggestBreak) assert.equal(p.strategies.length, 3, `${flow}:${r.id} strategies`);
    }
  }
  assert.equal(rulePlan('fiaca', 'energy', {}).suggestBreak, true);
  assert.match(rulePlan('stuck', 'start', { triggerLabel: 'instagram.com' }).reward_idea, /instagram\.com/);
  // ids únicos por flujo
  for (const list of Object.values(REASONS)) assert.equal(new Set(list.map((r) => r.id)).size, list.length);
});

test('strategies: en inglés cada motivo tiene plan completo', async () => {
  const { reasonsFor } = await import('../renderer/lib/strategies.mjs');
  for (const flow of Object.keys(REASONS)) {
    const en = reasonsFor(flow, 'en');
    assert.equal(en.length, REASONS[flow].length);
    for (const r of en) {
      const es = REASONS[flow].find((x) => x.id === r.id);
      assert.notEqual(r.label, es.label, `${flow}:${r.id} label traducido`);
      const p = rulePlan(flow, r.id, { task: 'the report', part: 'the intro' }, 'en');
      assert.notEqual(p.reflection, rulePlan(flow, r.id, {}).reflection, `${flow}:${r.id} reflection traducida`);
      assert.ok(p.micro_step.includes('the intro'), `${flow}:${r.id} micro usa la parte`);
      assert.equal(p.sprint_minutes, es.minutes);
      if (!p.suggestBreak) assert.equal(p.strategies.length, 3, `${flow}:${r.id} strategies`);
    }
  }
  assert.match(rulePlan('stuck', 'start', {}, 'en').micro_step, /the task/);
  assert.match(rulePlan('stuck', 'start', { triggerLabel: 'instagram.com' }, 'en').reward_idea, /^5 minutes of instagram\.com/);
  assert.match(rulePlan('stuck', 'start', { part: 'the intro, because I have no idea' }, 'en').micro_step, /Open the intro and/);
});

// ---------- Idioma ----------

import { readFileSync } from 'node:fs';
import { t, setLang, EN } from '../renderer/lib/i18n.mjs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const unquote = (s) => s.replace(/\\(.)/g, '$1');
const stripComments = (code) => code.replace(/(^|\s)\/\/.*$/gm, '$1');

// Textos que se ven igual en los dos idiomas.
const SAME = new Set(['Foco', '🎯 Foco', 'App', 'ES', 'EN', 'Español', 'English', '0 min', '09:00-13:00, 14:00-18:00', 'sk-ant-…', '…']);

test('idioma: t() traduce, reemplaza valores y vuelve al español', () => {
  setLang('en');
  assert.equal(t('Estás en {label}', { label: 'instagram.com' }), "You're on instagram.com");
  assert.equal(t('instagram.com'), 'instagram.com'); // lo que no está en el diccionario queda igual
  setLang('es');
  assert.equal(t('Estás en {label}', { label: 'instagram.com' }), 'Estás en instagram.com');
  for (const [es, en] of Object.entries(EN)) assert.equal(vars(es), vars(en), `mismos {valores} en "${es}"`);
});

test('idioma: todos los textos fijos de las ventanas tienen traducción', () => {
  const missing = [];
  for (const file of ['panel', 'toast', 'coach', 'vision']) {
    const html = read(`renderer/${file}.html`).replace(/<(style|script)[\s\S]*?<\/\1>/g, '').replace(/<!--[\s\S]*?-->/g, '');
    const texts = [
      ...[...html.matchAll(/>([^<]+)</g)].map((m) => m[1]),
      ...[...html.matchAll(/\s(?:placeholder|title|aria-label)="([^"]+)"/g)].map((m) => m[1]),
    ];
    for (const raw of texts) {
      const text = raw.replace(/\s+/g, ' ').trim();
      if (/\p{L}/u.test(text) && !SAME.has(text) && !EN[text]) missing.push(`${file}.html: ${text}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('idioma: todos los textos de los scripts de las ventanas tienen traducción', () => {
  const missing = [];
  for (const file of ['renderer/panel.js', 'renderer/toast.js', 'renderer/coach.js', 'renderer/vision.js', 'renderer/lib/recorder.mjs']) {
    const code = stripComments(read(file));
    // Lo que pasa por t('…') y cualquier texto con tildes o signos del español.
    const inT = [...code.matchAll(/\bt\(\s*'((?:\\.|[^'\\\n])*)'/g)].map((m) => unquote(m[1]));
    const spanish = [...code.matchAll(/'((?:\\.|[^'\\\n])*)'|`([^`]*)`/g)]
      .map((m) => unquote(m[1] ?? m[2]))
      .filter((s) => /[áéíóúñ¿¡…]/i.test(s));
    for (const s of new Set([...inT, ...spanish])) if (!EN[s] && !SAME.has(s)) missing.push(`${file}: ${s}`);
  }
  assert.deepEqual(missing, []);
});
