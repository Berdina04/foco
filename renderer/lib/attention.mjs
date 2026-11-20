// Convierte la salida de MediaPipe (pose de la cabeza + blendshapes de los ojos) en un estado de atención.
// Todo es relativo a tu postura calibrada, así que no importa dónde esté la cámara.

const DEG = 180 / Math.PI;

// Umbrales por sensibilidad: grados de cabeza y desvío de la mirada (0..1).
export const SENSITIVITY = {
  baja: { yaw: 35, pitch: 28, gaze: 0.6, blink: 0.65 },
  media: { yaw: 27, pitch: 21, gaze: 0.5, blink: 0.6 },
  alta: { yaw: 20, pitch: 15, gaze: 0.4, blink: 0.55 },
};

// Ángulos de la cabeza a partir de la matriz de transformación 4x4.
// Usamos desvíos absolutos respecto de la calibración, así que el signo no importa.
export function headPose(data) {
  if (!data || data.length < 11) return null;
  const r00 = data[0], r10 = data[1], r20 = data[2];
  const r21 = data[6], r22 = data[10];
  return {
    yaw: Math.atan2(-r20, Math.hypot(r21, r22)) * DEG,
    pitch: Math.atan2(r21, r22) * DEG,
    roll: Math.atan2(r10, r00) * DEG,
  };
}

// gazeX: + derecha / - izquierda. gazeY: + abajo / - arriba. blink: 0 abiertos .. 1 cerrados.
export function gazeFromBlendshapes(categories) {
  const s = {};
  for (const c of categories || []) s[c.categoryName] = c.score;
  const v = (k) => s[k] ?? 0;
  const toLeft = (v('eyeLookOutLeft') + v('eyeLookInRight')) / 2;
  const toRight = (v('eyeLookInLeft') + v('eyeLookOutRight')) / 2;
  const down = (v('eyeLookDownLeft') + v('eyeLookDownRight')) / 2;
  const up = (v('eyeLookUpLeft') + v('eyeLookUpRight')) / 2;
  return {
    gazeX: toRight - toLeft,
    gazeY: down - up,
    blink: (v('eyeBlinkLeft') + v('eyeBlinkRight')) / 2,
  };
}

const DEFAULT_BASELINE = { yaw: 0, pitch: 0, gazeX: 0, gazeY: 0 };

// Distancia a la postura calibrada más cercana (podés calibrar varias pantallas).
function nearest(m, baselines) {
  const list = baselines?.length ? baselines : [DEFAULT_BASELINE];
  let best = null;
  for (const b of list) {
    const d = {
      yaw: Math.abs(m.yaw - b.yaw),
      pitch: Math.abs(m.pitch - b.pitch),
      gazeX: Math.abs(m.gazeX - b.gazeX),
      gazeY: Math.abs(m.gazeY - b.gazeY),
    };
    const score = d.yaw / 30 + d.pitch / 25 + d.gazeX + d.gazeY;
    if (!best || score < best.score) best = { ...d, score };
  }
  return best;
}

/**
 * @param {{yaw:number,pitch:number,gazeX:number,gazeY:number,blink:number}|null} m
 * @returns {'no_face'|'looking_away'|'eyes_closed'|'focused'}
 */
export function classifyAttention(m, baselines, sensitivity = 'media') {
  if (!m) return 'no_face';
  const t = SENSITIVITY[sensitivity] || SENSITIVITY.media;
  const d = nearest(m, baselines);
  // Cabeza girada o agachada (ej. mirando el celular): eso primero, porque al mirar
  // hacia abajo los párpados bajan y se confunde con ojos cerrados.
  if (d.yaw > t.yaw || d.pitch > t.pitch) return 'looking_away';
  if (m.blink > t.blink) return 'eyes_closed';
  if (d.gazeX > t.gaze || d.gazeY > t.gaze) return 'looking_away';
  return 'focused';
}

// Suavizado exponencial para que un parpadeo o un movimiento brusco no cambien el estado.
export function smooth(prev, next, alpha = 0.35) {
  if (!prev || !next) return next;
  const out = {};
  for (const k of Object.keys(next)) out[k] = prev[k] == null ? next[k] : prev[k] + alpha * (next[k] - prev[k]);
  return out;
}

export function averagePose(samples) {
  if (!samples.length) return null;
  const sum = { yaw: 0, pitch: 0, gazeX: 0, gazeY: 0 };
  for (const s of samples) for (const k of Object.keys(sum)) sum[k] += s[k];
  for (const k of Object.keys(sum)) sum[k] = Math.round((sum[k] / samples.length) * 1000) / 1000;
  return sum;
}
