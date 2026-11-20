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
