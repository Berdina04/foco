// Ventana oculta que mira la cámara y le manda al proceso principal tu estado de atención.
// Corre con backgroundThrottling desactivado para seguir funcionando aunque no se vea.
import { FaceLandmarker, FilesetResolver } from '../node_modules/@mediapipe/tasks-vision/vision_bundle.mjs';
import { headPose, gazeFromBlendshapes, classifyAttention, smooth, averagePose } from './lib/attention.mjs';

const PROCESS_EVERY_MS = 200; // ~5 análisis por segundo alcanzan y ahorran batería
const SEND_EVERY_MS = 500;
const MISSES_FOR_NO_FACE = 6;
const CALIBRATION_MS = 3000;

const $ = (id) => document.getElementById(id);
const video = $('video');
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

const LABELS = {
  focused: ['ok', 'Mirando la pantalla'],
  looking_away: ['warn', 'Mirando a otro lado'],
  eyes_closed: ['warn', 'Ojos cerrados'],
  no_face: ['', 'No te veo'],
  off: ['', 'Cámara apagada (fuera de horario)'],
};

let camera = await window.foco.invoke('camera:config');
let landmarker = null;
let stream = null;
let running = false;
let previewMode = null; // null | 'full' | 'mini'
let engine = null; // lo que está midiendo el proceso principal (cuentas regresivas)
let smoothed = null;
let status = 'no_face';
let misses = 0;
let lastProcessed = 0;
let lastSent = 0;
let calibration = null; // { mode: 'replace'|'add', until, samples: [] }

// ---------- Modelo ----------

async function loadModel() {
  const fileset = await FilesetResolver.forVisionTasks(
    new URL('../node_modules/@mediapipe/tasks-vision/wasm', import.meta.url).href
  );
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: new URL('../models/face_landmarker.task', import.meta.url).href, delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
  try {
    landmarker = await FaceLandmarker.createFromOptions(fileset, options('GPU'));
  } catch {
    landmarker = await FaceLandmarker.createFromOptions(fileset, options('CPU'));
  }
}

// ---------- Cámara ----------

async function startCamera() {
  if (running) return;
  running = true;
  stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, frameRate: { ideal: 15 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play().catch(() => {});
  const [track] = stream.getVideoTracks();

  // Leer frames directo del track no depende de que la ventana se esté dibujando.
  if ('MediaStreamTrackProcessor' in window) {
    readFrames(track.clone());
  } else {
    const timer = setInterval(() => {
      if (!running) return clearInterval(timer);
      if (video.readyState >= 2) analyze(video, performance.now());
    }, PROCESS_EVERY_MS);
  }
}

async function readFrames(track) {
  const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
  while (running) {
    const { value: frame, done } = await reader.read();
    if (done) break;
    const t = performance.now();
    if (t - lastProcessed >= PROCESS_EVERY_MS) {
      lastProcessed = t;
      try {
        analyze(frame, t);
      } catch (err) {
        console.error(err);
      }
    }
    frame.close();
  }
  track.stop();
}

function stopCamera() {
  running = false;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  smoothed = null;
  status = 'no_face';
  window.foco.sendAttention({ status: 'unknown' });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  setStatus('off');
}

// ---------- Análisis ----------

function analyze(source, t) {
  if (!landmarker) return;
  const res = landmarker.detectForVideo(source, t);
  let m = null;
  if (res.faceLandmarks?.length) {
    const pose = headPose(res.facialTransformationMatrixes?.[0]?.data);
    if (pose) m = { yaw: pose.yaw, pitch: pose.pitch, ...gazeFromBlendshapes(res.faceBlendshapes?.[0]?.categories) };
  }

  if (m) {
    misses = 0;
    smoothed = smooth(smoothed, m);
    status = classifyAttention(smoothed, camera.baselines, camera.sensitivity);
    if (calibration) calibration.samples.push(m);
  } else if (++misses >= MISSES_FOR_NO_FACE) {
    smoothed = null;
    status = 'no_face';
  }

  if (calibration && t >= calibration.until) finishCalibration();

  if (t - lastSent >= SEND_EVERY_MS) {
    lastSent = t;
    window.foco.sendAttention({ status, metrics: smoothed && round(smoothed) });
  }
  if (previewMode) draw(res);
}

const round = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v * 100) / 100]));

// ---------- Vista previa ----------

function setStatus(key) {
  const [cls, text] = LABELS[key] || LABELS.no_face;
  for (const el of [$('status'), $('hud-status')]) {
    el.className = `pill ${cls}`;
    el.lastElementChild.textContent = calibration ? 'Calibrando… mirá la pantalla' : text;
  }
  renderHud();
}

// Qué está por pasar: cuánto falta para el aviso, o por qué no cuenta.
function renderHud() {
  const bottom = $('hud-bottom');
  const meterWrap = $('hud-meter-wrap');
  let text = '';
  let progress = null;
  const e = engine;

  if (!running) text = 'Cámara apagada';
  else if (!e || e.status !== 'monitoring') {
    text = { paused: 'En pausa: no avisa', break: 'En un corte: no avisa', off: 'Fuera de horario: no avisa' }[e?.status] || '';
  } else if (e.screenLabel) {
    text = `Distracción en pantalla: ${e.screenLabel}`;
    progress = e.screenSeconds / e.graceSeconds;
  } else if (status === 'looking_away') {
    if (e.gazeSeconds > 0) {
      text = `Mirando a otro lado · aviso en ${Math.max(0, Math.ceil(e.gazeLimit - e.gazeSeconds))} s`;
      progress = e.gazeSeconds / e.gazeLimit;
    } else if (e.typing) text = 'Estás usando teclado o mouse: no cuenta';
    else text = 'Mirando a otro lado…';
  } else if (status === 'eyes_closed') {
    text = 'Ojos cerrados';
    if (e.eyesClosedSeconds > 0) progress = e.eyesClosedSeconds / e.drowsyLimit;
  } else if (status === 'no_face') {
    text = 'No te veo: no cuenta como distracción';
  }

  $('hud-text').textContent = text;
  bottom.hidden = !text;
  meterWrap.hidden = progress == null;
  if (progress != null) $('hud-meter').style.width = `${Math.min(100, Math.round(progress * 100))}%`;
}

function dot(p, w, h, r) {
  ctx.beginPath();
  ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2);
  ctx.fill();
}

function draw(res) {
  const w = (canvas.width = video.videoWidth || 640);
  const h = (canvas.height = video.videoHeight || 480);
  ctx.clearRect(0, 0, w, h);
  const color = status === 'focused' ? '#6fbfa6' : status === 'no_face' ? '#999' : '#e0a15e';
  for (const face of res.faceLandmarks || []) {
    // Malla de la cara
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < Math.min(face.length, 468); i += 3) dot(face[i], w, h, 1.3);
    ctx.globalAlpha = 1;
    // Iris (los últimos 10 puntos del modelo): centro + aro
    if (face.length >= 478) {
      for (const c of [468, 473]) {
        const r = Math.hypot((face[c + 1].x - face[c].x) * w, (face[c + 1].y - face[c].y) * h);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(face[c].x * w, face[c].y * h, Math.max(r, 3), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        dot(face[c], w, h, 2);
      }
    }
  }
  setStatus(status);
  const s = smoothed;
  $('m-yaw').textContent = s ? `${s.yaw.toFixed(0)}°` : '–';
  $('m-pitch').textContent = s ? `${s.pitch.toFixed(0)}°` : '–';
  $('m-gaze').textContent = s ? `${s.gazeX.toFixed(2)} / ${s.gazeY.toFixed(2)}` : '–';
  $('m-blink').textContent = s ? `${Math.round(s.blink * 100)}%` : '–';
}

// ---------- Calibración ----------

function startCalibration(mode) {
  calibration = { mode, until: performance.now() + CALIBRATION_MS, samples: [] };
  $('calibrate').disabled = $('add-screen').disabled = true;
  setStatus(status);
}

async function finishCalibration() {
  const { mode, samples } = calibration;
  calibration = null;
  $('calibrate').disabled = $('add-screen').disabled = false;
  if (samples.length < 5) {
    $('calib-info').textContent = 'No te vi bien. Acercate a la cámara y probá de nuevo.';
    return;
  }
  const pose = averagePose(samples);
  const baselines = mode === 'add' ? [...(camera.baselines || []), pose] : [pose];
  await window.foco.invoke('camera:baselines', baselines);
}

function renderCalibInfo() {
  const n = camera.baselines?.length || 0;
  $('calib-info').textContent = n
    ? `${n} ${n === 1 ? 'pantalla calibrada' : 'pantallas calibradas'}`
    : 'Sin calibrar (usa valores por defecto)';
  $('sensitivity').value = camera.sensitivity || 'media';
}

$('calibrate').onclick = () => startCalibration('replace');
$('add-screen').onclick = () => startCalibration('add');
$('clear').onclick = () => window.foco.invoke('camera:baselines', []);
$('sensitivity').onchange = (e) => window.foco.invoke('config:update', { camera: { sensitivity: e.target.value } });
$('to-mini').onclick = () => window.foco.invoke('camera:show', 'mini');
$('hud-expand').onclick = () => window.foco.invoke('camera:show', 'full');
$('hud-close').onclick = () => window.foco.invoke('camera:hide');

// ---------- Eventos del proceso principal ----------

window.foco.on('vision:config', (c) => {
  camera = { ...camera, ...c };
  renderCalibInfo();
});
window.foco.on('vision:preview', (mode) => {
  previewMode = mode || null;
  document.body.classList.toggle('mini', mode === 'mini');
  if (mode && !running) startCamera();
  if (!mode && !camera.active && running) stopCamera();
  renderHud();
});
window.foco.on('vision:active', (active) => {
  camera.active = active;
  if (active && !running) startCamera();
  if (!active && !previewMode && running) stopCamera();
});
window.foco.on('vision:engine', (info) => {
  engine = info;
  if (previewMode) renderHud();
});

renderCalibInfo();
if (camera.preview) {
  previewMode = camera.preview;
  document.body.classList.toggle('mini', previewMode === 'mini');
}
setStatus('no_face');
await loadModel();
if (camera.active || previewMode) await startCamera();
else setStatus('off');
