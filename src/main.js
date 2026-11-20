const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  Notification,
  ipcMain,
  nativeImage,
  powerMonitor,
  protocol,
  safeStorage,
  screen,
  session,
  shell,
  systemPreferences,
} = require('electron');
const fs = require('fs');
const path = require('path');

const { ConfigStore, languageChange } = require('./config');
const { translate } = require('./i18n');
const { Stats } = require('./stats');
const { FocusEngine } = require('./engine');
const { classify } = require('./classifier');
const { isWorkTime } = require('./schedule');
const { getActivity } = require('./active-window');
const { aiCoach } = require('./ai-coach');
const { WorkContext, isExcluded, contextKey } = require('./context');
const { captureScreens, hasPermission: hasScreenPermission } = require('./screenshot');
const voice = require('./voice');

const ROOT = path.join(__dirname, '..');
const PRELOAD = path.join(__dirname, 'preload.js');
const TICK_MS = 2000;
const url = (page) => `app://foco/renderer/${page}`;

app.setName('Foco');
if (!app.requestSingleInstanceLock()) app.quit();

// ---------- Protocolo app:// (sirve renderer, modelo y wasm de MediaPipe) ----------

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.task': 'application/octet-stream',
};
const SERVABLE = ['renderer', 'models', path.join('node_modules', '@mediapipe', 'tasks-vision')].map(
  (d) => path.join(ROOT, d) + path.sep
);

function serveAppProtocol() {
  protocol.handle('app', async (req) => {
    const file = path.normalize(path.join(ROOT, decodeURIComponent(new URL(req.url).pathname)));
    if (!SERVABLE.some((dir) => file.startsWith(dir))) return new Response('forbidden', { status: 403 });
    try {
      const data = await fs.promises.readFile(file);
      return new Response(data, { headers: { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
}

// ---------- Estado ----------

let config;
let stats;
const engine = new FocusEngine();
let tray;
let panelWin = null;
let coachWin = null;
let visionWin = null;
let toastWin = null;
const work = new WorkContext();
let lastShots = null; // { images: Buffer[], at, key } última captura de la pantalla de trabajo (sólo en memoria)
let capturing = false;
let alertSeq = 0;
let insightCache = null; // { key, at, insight }
let apiKeyCache;
let cameraMode = null; // null | 'full' | 'mini' (cámara flotante)
let miniBounds = null; // dónde dejaste la cámara flotante
let quitting = false;
let ticking = false;
let lastMenuKey = '';

const state = {
  manualUntil: 0, // sesión de foco fuera de horario
  pausedUntil: 0,
  breakInfo: null, // { until, minutes, activity, firstThing }
  sprint: null, // { goal, task, minutes, reward, until }
  allows: {}, // clave -> vencimiento ("es por trabajo")
  activity: null,
  attention: null, // { status, metrics, at }
  focusState: 'off',
  coach: null, // { mode, trigger, sprint, breakInfo }
  alert: null, // aviso flotante activo: { id, trigger, escalated, gentle, insight, insightStatus, busy, ... }
  lastTick: Date.now(),
};

function computeStatus(now = Date.now()) {
  if (state.breakInfo) return 'break';
  if (state.pausedUntil > now) return 'paused';
  if (state.sprint || state.manualUntil > now || isWorkTime(config.get().schedule)) return 'monitoring';
  return 'off';
}

// ---------- Secretos (API key cifrada con el llavero de macOS) ----------

const secretsFile = () => path.join(app.getPath('userData'), 'secrets.json');

function apiKey() {
  if (apiKeyCache === undefined) apiKeyCache = readApiKey();
  return apiKeyCache;
}

const aiReady = () => config.get().ai.enabled && (!!apiKey() || !!process.env.ANTHROPIC_API_KEY);

// ---------- Idioma ----------

const lang = () => config.get().language;
const t = (es, vars) => translate(lang(), es, vars);

// Cambia el idioma de todo: ventanas abiertas, menú de la barra, IA y voz.
function setLanguage(next) {
  const change = languageChange(config.get(), next);
  if (!change) return;
  config.update(change);
  lastMenuKey = '';
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('lang', change.language);
  }
  updateTray();
  broadcast();
}

function readApiKey() {
  try {
    const { anthropicKey } = JSON.parse(fs.readFileSync(secretsFile(), 'utf8'));
    return anthropicKey ? safeStorage.decryptString(Buffer.from(anthropicKey, 'base64')) : null;
  } catch {
    return null;
  }
}

function writeApiKey(key) {
  const data = key ? { anthropicKey: safeStorage.encryptString(key).toString('base64') } : {};
  fs.writeFileSync(secretsFile(), JSON.stringify(data));
}

// ---------- Snapshot para las ventanas ----------

function snapshot() {
  const now = Date.now();
  return {
    now,
    status: computeStatus(now),
    focusState: state.focusState,
    activity: state.activity && {
      app: state.activity.app,
      url: state.activity.url,
      title: state.activity.title,
      locked: !!state.activity.locked,
    },
    attention: state.attention,
    sprint: state.sprint,
    breakInfo: state.breakInfo,
    pausedUntil: state.pausedUntil,
    manualUntil: state.manualUntil,
    coachOpen: !!state.coach,
    config: config.get(),
    today: stats.today(),
    ai: { keySaved: !!apiKey(), envKey: !!process.env.ANTHROPIC_API_KEY, ready: aiReady() },
  };
}

function broadcast() {
  if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send('state', snapshot());
}

// ---------- Loop principal ----------

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const now = Date.now();
    const dt = Math.min((now - state.lastTick) / 1000, 10);
    state.lastTick = now;

    if (state.sprint && now >= state.sprint.until) endSprint();
    if (state.breakInfo && now >= state.breakInfo.until) endBreak();

    const status = computeStatus(now);
    if (status === 'monitoring') {
      const cfg = config.get();
      // Si estás en una ventana de Foco, no es distracción.
      const ownFocused = BrowserWindow.getFocusedWindow() != null;
      state.activity = await getActivity({ readTitles: cfg.context.readTitles, skipDetails: ownFocused });
      const distraction = ownFocused ? null : classify(state.activity, cfg, state.allows, now);
      work.update(state.activity, { now, dt, isDistraction: !!distraction, isOwn: ownFocused });
      maybeCaptureWork(now, cfg, distraction, ownFocused);
      const result = engine.tick({
        now,
        config: cfg,
        distraction,
        attention: state.attention,
        idleSeconds: powerMonitor.getSystemIdleTime(),
        locked: !!state.activity?.locked,
        paused: !!state.coach || !!state.alert?.escalated || !!state.alert?.moment,
        hopping: work.isHopping(now, cfg.signals.hopSwitches),
      });
      state.focusState = result.state;
      stats.addTime(result.state, dt);
      if (result.action === 'nudge') onNudge(result.trigger);
      if (result.action === 'coach') onEscalate(result.trigger);
      if (result.action === 'signal') onSignal(result.trigger);
      checkAlertReturn(now, result.state, ownFocused, dt);
    } else {
      state.focusState = status;
      engine.reset();
      // El aviso de fin de sprint o de corte espera tu respuesta aunque ya no estés en horario.
      if (state.alert && !state.alert.moment) resolveAlert('off');
    }
    syncVisionActive();
    sendEngineInfo(now);
    updateTray();
    broadcast();
  } finally {
    ticking = false;
  }
}

// La cámara sólo se prende mientras se monitorea (no fuera de horario, en pausa ni en un corte).
let lastVisionActive = null;
const wantCamera = () => config.get().camera.enabled && computeStatus() === 'monitoring';

// Para la vista previa: cuánto falta para cada aviso y por qué algo no cuenta.
function sendEngineInfo(now = Date.now()) {
  if (!cameraMode || !visionWin || visionWin.isDestroyed()) return;
  const cfg = config.get();
  const secs = (t) => (t == null ? 0 : (now - t) / 1000);
  visionWin.webContents.send('vision:engine', {
    status: computeStatus(now),
    focusState: state.focusState,
    screenLabel: engine.screen?.label || null,
    screenSeconds: secs(engine.screen?.since),
    graceSeconds: cfg.graceSeconds,
    gazeSeconds: secs(engine.gaze?.since),
    gazeLimit: cfg.camera.gazeSeconds,
    eyesClosedSeconds: secs(engine.eyesClosedSince),
    drowsyLimit: cfg.camera.drowsySeconds,
    typing: cfg.camera.requireIdle && powerMonitor.getSystemIdleTime() < cfg.camera.idleSeconds,
  });
}

function syncVisionActive() {
  const active = wantCamera();
  if (active === lastVisionActive || !visionWin || visionWin.isDestroyed()) return;
  lastVisionActive = active;
  visionWin.webContents.send('vision:active', active);
}

// Estilo "ventana": notificación del sistema y después el coach grande.
function nudge(trigger) {
  stats.log({ type: 'nudge', trigger });
  const task = config.get().currentTask;
  const body =
    trigger.type === 'gaze'
      ? t('Hace un rato que no mirás la pantalla. ¿Volvemos?')
      : task
        ? t('Estás en {label}. ¿Volvemos a "{task}"?', { label: t(trigger.label), task })
        : t('Estás en {label}. ¿Volvemos?', { label: t(trigger.label) });
  const n = new Notification({ title: '🎯 Foco', body });
  n.on('click', () => openCoach({ mode: 'trigger', trigger }));
  n.show();
}

// ---------- Avisos flotantes (arriba a la derecha) ----------

function onNudge(trigger) {
  if (config.get().alerts.style === 'window') return nudge(trigger);
  showAlert(trigger, { gentle: false });
}

function onEscalate(trigger) {
  const cfg = config.get();
  if (cfg.alerts.style === 'window') return openCoach({ mode: 'trigger', trigger });
  if (!state.alert || state.alert.trigger.key !== trigger.key) showAlert(trigger, { gentle: false });
  state.alert.escalated = true;
  stats.log({ type: 'escalate', trigger });
  if (cfg.alerts.systemNotification) {
    new Notification({
      title: t('🎯 Seguís fuera de foco'),
      body: trigger.type === 'site' || trigger.type === 'app' ? t('Estás en {label}', { label: trigger.label }) : t('Volvamos'),
    }).show();
  }
  pushToast();
}

// Señal de bloqueo (mirada fija, saltar entre ventanas): aviso suave, sin sonido.
function onSignal(trigger) {
  if (state.alert || state.coach) return;
  showAlert(trigger, { gentle: true });
}

function openAlert(trigger, extra) {
  const now = Date.now();
  state.alert = {
    id: ++alertSeq,
    trigger,
    gentle: false,
    openedAt: now,
    escalated: false,
    insight: null,
    insightStatus: 'idle',
    insightError: null,
    busy: false,
    returnTicks: 0,
    work: work.lastWork(now),
    told: null,
    ...extra,
  };
  return state.alert;
}

function showAlert(trigger, { gentle }) {
  openAlert(trigger, { gentle });
  stats.log({ type: gentle ? 'signal' : 'nudge', trigger });
  if (config.get().alerts.systemNotification && !gentle) {
    new Notification({
      title: t('🎯 Fuera de foco'),
      body: trigger.label ? t('Estás en {label}', { label: t(trigger.label) }) : t('Volvamos'),
    }).show();
  }
  showToast();
  // Irte a una distracción es una señal de que algo pasa: si hay IA, mira en qué estabas.
  if (aiReady()) requestInsight();
}

// Fin de un sprint o de un corte: en vez del coach grande, el aviso flotante pregunta cómo te fue.
// moment: 'sprint_end' (info = el sprint) | 'break_end' (info = el corte).
function showMoment(moment, info) {
  if (state.alert) stats.log({ type: 'coach_end', outcome: 'replaced', mode: 'toast', trigger: state.alert.trigger });
  const label = moment === 'sprint_end' ? info.goal : info.firstThing || '';
  openAlert({ type: moment, key: moment, label }, { moment, phase: 'ask', info, activeSeconds: 0 });
  showToast();
}

const MOMENT_TIMEOUT_S = 5 * 60;

// Si volviste a trabajar por tu cuenta, el aviso se va solo.
function checkAlertReturn(now, focusState, ownFocused, dt) {
  const a = state.alert;
  if (!a) return;
  if (a.moment) {
    // Espera tu respuesta, pero si seguís usando la compu un rato sin tocarlo, se va.
    if (!a.busy && powerMonitor.getSystemIdleTime() < 30) a.activeSeconds += dt;
    if (a.activeSeconds >= MOMENT_TIMEOUT_S) resolveAlert('ignored');
    return;
  }
  if (a.gentle) {
    if (!a.busy && now - a.openedAt > 3 * 60_000) resolveAlert('ignored');
    return;
  }
  a.returnTicks = focusState === 'focused' && !ownFocused ? a.returnTicks + 1 : 0;
  if (a.returnTicks >= 2 && !a.busy) {
    const id = a.id;
    resolveAlert('returned_auto', { keepToast: true });
    sendToast({ id, returned: true });
    setTimeout(() => {
      if (!state.alert) hideToast();
    }, 1800);
  }
}

function resolveAlert(outcome, { keepToast = false } = {}) {
  if (!state.alert) return;
  stats.log({ type: 'coach_end', outcome, mode: 'toast', trigger: state.alert.trigger });
  state.alert = null;
  engine.resolved(Date.now(), 30);
  if (!keepToast) hideToast();
  updateTray();
  broadcast();
}

// Pide a la IA que lea en qué estabas (ventanas + captura) y lo que contaste.
async function requestInsight({ transcript } = {}) {
  const a = state.alert;
  if (!a || !aiReady()) return;
  const cfg = config.get();
  const now = Date.now();
  const key = `${lang()}|${a.work?.key || 'sin-contexto'}`; // la lectura cacheada está en un idioma
  if (!transcript && insightCache && insightCache.key === key && now - insightCache.at < 10 * 60_000) {
    a.insight = insightCache.insight;
    a.insightStatus = 'ready';
    return pushToast();
  }
  a.insightStatus = 'loading';
  pushToast();

  let images = [];
  if (cfg.context.readScreen && hasScreenPermission()) {
    // Con una señal de bloqueo seguís en la pantalla de trabajo: se captura en el momento.
    const onWorkNow = (a.trigger.type === 'stuck' || a.trigger.type === 'hopping') && !isExcluded(state.activity, cfg.context);
    if (onWorkNow) images = await captureScreens().catch(() => []);
    else if (lastShots && now - lastShots.at < 5 * 60_000) images = lastShots.images;
  }
  const previous = transcript && a.insight ? { working_on: a.insight.working_on, likely_block: a.insight.likely_block } : null;
  const res = await aiCoach({
    apiKey: apiKey(),
    model: cfg.ai.model,
    lang: cfg.language,
    images,
    input: {
      trigger: a.trigger,
      workSummary: work.summary(now, cfg.language),
      task: cfg.currentTask,
      transcript,
      previous,
      dopamineMenu: cfg.dopamineMenu,
    },
  });
  if (state.alert !== a) return;
  if (res.plan) {
    a.insight = res.plan;
    a.insightStatus = 'ready';
    if (!transcript) insightCache = { key, at: now, insight: res.plan };
    stats.log({ type: 'insight', flow: res.plan.flow, working_on: res.plan.working_on, likely_block: res.plan.likely_block });
  } else {
    a.insightStatus = 'error';
    a.insightError = res.error;
  }
  pushToast();
}

// Captura cada ~30 s la pantalla en la que trabajás, para tenerla cuando te vayas a una distracción.
function maybeCaptureWork(now, cfg, distraction, ownFocused) {
  if (!cfg.context.readScreen || !aiReady() || capturing) return;
  const a = state.activity;
  if (!a || a.locked || distraction || ownFocused || isExcluded(a, cfg.context)) return;
  const perm = systemPreferences.getMediaAccessStatus('screen');
  if (perm === 'denied' || perm === 'restricted') return;
  const key = contextKey(a);
  if (lastShots && now - lastShots.at < (lastShots.key === key ? 30_000 : 8_000)) return;
  capturing = true;
  captureScreens()
    .then((images) => {
      if (hasScreenPermission() && images.length) lastShots = { images, at: Date.now(), key };
    })
    .catch(() => {})
    .finally(() => (capturing = false));
}

function toastPayload() {
  const a = state.alert;
  if (!a) return null;
  const cfg = config.get();
  return {
    id: a.id,
    kind: a.trigger.type,
    label: a.trigger.label,
    escalated: a.escalated,
    gentle: a.gentle,
    work: a.work?.label || null,
    insight: a.insight,
    insightStatus: a.insightStatus,
    insightError: a.insightError,
    ai: aiReady(),
    screen: cfg.context.readScreen && hasScreenPermission(),
    allowMinutes: cfg.allowMinutes,
    sound: cfg.alerts.sound,
    lang: cfg.language,
    moment: a.moment
      ? {
          kind: a.moment,
          phase: a.phase,
          minutes: a.info.minutes,
          goal: a.info.goal,
          reward: a.info.reward,
          firstThing: a.info.firstThing,
        }
      : null,
  };
}

const TOAST_WIDTH = 400;

function showToast() {
  if (!toastWin || toastWin.isDestroyed()) {
    toastWin = new BrowserWindow({
      width: TOAST_WIDTH,
      height: 220,
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      webPreferences: baseWebPrefs,
    });
    toastWin.setAlwaysOnTop(true, 'pop-up-menu');
    toastWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    toastWin.loadURL(url('toast.html'));
    toastWin.once('ready-to-show', () => {
      placeToast();
      toastWin.showInactive();
    });
    toastWin.on('closed', () => (toastWin = null));
    return;
  }
  pushToast();
  if (!toastWin.isVisible()) {
    placeToast();
    toastWin.showInactive();
  }
}

// Arriba a la derecha de la pantalla donde está el mouse.
function placeToast() {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { height } = toastWin.getBounds();
  toastWin.setBounds({ x: workArea.x + workArea.width - TOAST_WIDTH - 4, y: workArea.y + 4, width: TOAST_WIDTH, height });
}

function sendToast(payload) {
  if (toastWin && !toastWin.isDestroyed() && !toastWin.webContents.isLoading()) {
    toastWin.webContents.send('toast:update', payload);
  }
}

const pushToast = () => state.alert && sendToast(toastPayload());

function hideToast() {
  if (toastWin && !toastWin.isDestroyed()) toastWin.hide();
}

// ---------- Sprints y cortes ----------

function startSprint({ goal, task, minutes, reward }) {
  const m = Math.max(1, Math.min(120, Number(minutes) || 15));
  state.sprint = { goal, task, minutes: m, reward, startedAt: Date.now(), until: Date.now() + m * 60_000 };
  if (task) config.update({ currentTask: task });
  state.breakInfo = null;
  stats.log({ type: 'sprint_start', goal, task, minutes: m, reward });
}

const windowStyle = () => config.get().alerts.style === 'window';
const wantsNotification = () => windowStyle() || config.get().alerts.systemNotification;

function endSprint() {
  const sprint = state.sprint;
  state.sprint = null;
  if (wantsNotification()) {
    new Notification({ title: t('⏰ Terminó el sprint'), body: t('¿Pudiste: {goal}?', { goal: sprint.goal }) }).show();
  }
  if (windowStyle()) openCoach({ mode: 'checkin', sprint });
  else showMoment('sprint_end', sprint);
}

function startBreak({ activity, minutes, firstThing }) {
  const m = Math.max(1, Math.min(60, Number(minutes) || 5));
  state.breakInfo = { activity, firstThing, minutes: m, until: Date.now() + m * 60_000 };
  state.sprint = null;
  stats.log({ type: 'break_start', activity, minutes: m, firstThing });
}

function endBreak() {
  const breakInfo = state.breakInfo;
  state.breakInfo = null;
  stats.log({ type: 'break_end' });
  if (wantsNotification()) {
    new Notification({
      title: t('☕ Fin del corte'),
      body: breakInfo.firstThing ? t('Volvamos: {first}', { first: breakInfo.firstThing }) : t('Volvamos al foco.'),
    }).show();
  }
  if (windowStyle()) openCoach({ mode: 'break_end', breakInfo });
  else showMoment('break_end', breakInfo);
}

// ---------- Ventanas ----------

const baseWebPrefs = { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true };

function openPanel(tab) {
  if (panelWin && !panelWin.isDestroyed()) {
    if (tab) panelWin.webContents.send('panel:tab', tab);
    panelWin.show();
    panelWin.focus();
    return;
  }
  app.dock?.show();
  panelWin = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    title: 'Foco',
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: baseWebPrefs,
  });
  panelWin.loadURL(url('panel.html') + (tab ? `#${tab}` : ''));
  panelWin.once('ready-to-show', () => panelWin.show());
  panelWin.on('closed', () => {
    panelWin = null;
    app.dock?.hide();
  });
}

function coachContext() {
  const cfg = config.get();
  const last = work.lastWork(Date.now());
  return {
    ...state.coach,
    task: cfg.currentTask,
    work: last?.label || null,
    dopamineMenu: cfg.dopamineMenu,
    allowMinutes: cfg.allowMinutes,
    aiEnabled: aiReady(),
    voice: cfg.voice.enabled,
    lang: cfg.language,
  };
}

function openCoach(ctx) {
  state.coach = { ...ctx, openedAt: Date.now() };
  if (ctx.mode === 'trigger' || ctx.mode === 'manual') stats.log({ type: 'coach', mode: ctx.mode, trigger: ctx.trigger });

  if (coachWin && !coachWin.isDestroyed()) {
    coachWin.webContents.send('coach:context', coachContext());
    coachWin.show();
    app.focus({ steal: true });
    coachWin.focus();
    return;
  }
  coachWin = new BrowserWindow({
    width: 600,
    height: 720,
    resizable: false,
    minimizable: false,
    fullscreenable: false,
    titleBarStyle: 'hiddenInset',
    alwaysOnTop: true,
    show: false,
    webPreferences: baseWebPrefs,
  });
  coachWin.setAlwaysOnTop(true, 'floating');
  coachWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  coachWin.loadURL(url('coach.html'));
  coachWin.once('ready-to-show', () => {
    coachWin.show();
    app.focus({ steal: true });
    coachWin.focus();
  });
  coachWin.on('closed', () => {
    coachWin = null;
    if (state.coach) resolveCoach('dismissed');
  });
}

// Cierra el episodio del coach. keepWindow: la ventana sigue abierta (ej. respiración guiada).
function resolveCoach(outcome, { keepWindow = false } = {}) {
  if (state.coach) {
    stats.log({ type: 'coach_end', outcome, mode: state.coach.mode });
    state.coach = null;
    engine.resolved(Date.now(), 30);
  }
  if (!keepWindow && coachWin && !coachWin.isDestroyed()) coachWin.close();
  updateTray();
  broadcast();
}

// Del aviso flotante al coach grande, con lo que ya contaste.
function coachFromAlert(a, start) {
  if (a?.moment && a.phase === 'ask' && !start) {
    return openCoach(a.moment === 'sprint_end' ? { mode: 'checkin', sprint: a.info } : { mode: 'break_end', breakInfo: a.info });
  }
  const part = a?.told || (a?.moment === 'sprint_end' ? a.info.goal : a?.info?.firstThing);
  openCoach({ mode: a && !a.moment ? 'trigger' : 'manual', trigger: a?.trigger, start, prefill: part ? { part } : null });
}

async function ensureVision() {
  const cam = config.get().camera;
  if (!cam.enabled) {
    if (visionWin && !visionWin.isDestroyed()) visionWin.destroy();
    visionWin = null;
    cameraMode = null;
    state.attention = null;
    return;
  }
  if (visionWin && !visionWin.isDestroyed()) return;
  if (systemPreferences.getMediaAccessStatus('camera') !== 'granted') {
    const ok = await systemPreferences.askForMediaAccess('camera');
    if (!ok) {
      new Notification({
        title: t('Foco no tiene acceso a la cámara'),
        body: t('Activalo en Ajustes del Sistema → Privacidad y seguridad → Cámara.'),
      }).show();
      return;
    }
  }
  visionWin = new BrowserWindow({
    width: 760,
    height: 640,
    title: t('Cámara y calibración'),
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: { ...baseWebPrefs, backgroundThrottling: false },
  });
  lastVisionActive = null;
  visionWin.loadURL(url('vision.html'));
  visionWin.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    hideCamera();
  });
  const rememberMini = () => {
    if (cameraMode === 'mini') miniBounds = visionWin.getBounds();
  };
  visionWin.on('moved', rememberMini);
  visionWin.on('resized', rememberMini);
}

// mode 'full': ventana grande para calibrar. mode 'mini': flotante, siempre visible, sin robarte el foco.
async function showCamera(mode = 'full') {
  if (!config.get().camera.enabled) config.update({ camera: { enabled: true } });
  await ensureVision();
  if (!visionWin) return;
  const mini = mode === 'mini';
  cameraMode = mode;
  visionWin.setWindowButtonVisibility(!mini);
  visionWin.setAlwaysOnTop(mini, 'floating');
  visionWin.setVisibleOnAllWorkspaces(mini, { visibleOnFullScreen: true, skipTransformProcessType: true });
  if (mini) {
    const size = { width: 300, height: 240 };
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    visionWin.setMinimumSize(200, 160);
    visionWin.setBounds(
      miniBounds || {
        x: workArea.x + workArea.width - size.width - 16,
        y: workArea.y + workArea.height - size.height - 16,
        ...size,
      }
    );
    visionWin.showInactive();
  } else {
    visionWin.setMinimumSize(560, 480);
    visionWin.setSize(760, 640);
    visionWin.center();
    visionWin.show();
    visionWin.focus();
  }
  visionWin.webContents.send('vision:preview', mode);
  sendEngineInfo();
  updateTray();
}

function hideCamera() {
  if (!visionWin || visionWin.isDestroyed()) return;
  cameraMode = null;
  visionWin.setAlwaysOnTop(false);
  visionWin.setVisibleOnAllWorkspaces(false, { skipTransformProcessType: true });
  visionWin.hide();
  visionWin.webContents.send('vision:preview', null);
  updateTray();
}

// ---------- Barra de menú ----------

const fmt = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function updateTray() {
  if (!tray) return;
  const now = Date.now();
  const status = computeStatus(now);
  let title = '🎯';
  if (state.breakInfo) title = `☕ ${fmt(state.breakInfo.until - now)}`;
  else if (status === 'paused') title = '⏸';
  else if (status === 'off') title = '🌙';
  else if (state.sprint) title = `🎯 ${fmt(state.sprint.until - now)}`;
  else if ((state.alert && !state.alert.moment) || state.focusState === 'distracted' || state.focusState === 'looking_away') title = '👀';
  tray.setTitle(title);
  tray.setToolTip(state.sprint ? t('Sprint: {goal}', { goal: state.sprint.goal }) : 'Foco');

  const menuKey = [status, !!state.sprint, state.manualUntil > now, !!state.breakInfo, cameraMode, lang()].join('|');
  if (menuKey === lastMenuKey) return;
  lastMenuKey = menuKey;

  const label = t(
    {
      monitoring: state.sprint ? 'En sprint de foco' : 'Monitoreando el foco',
      paused: 'En pausa',
      break: 'En un corte',
      off: 'Fuera de horario',
    }[status]
  );
  const items = [
    { label, enabled: false },
    { type: 'separator' },
    { label: t('Abrir panel'), click: () => openPanel() },
    { label: t('Me trabé, ayudame'), click: () => openCoach({ mode: 'manual' }) },
    { type: 'separator' },
  ];
  if (state.manualUntil > now) {
    items.push({ label: t('Terminar sesión de foco'), click: () => ((state.manualUntil = 0), tick()) });
  } else if (status === 'off') {
    items.push({ label: t('Empezar sesión de foco (1 h)'), click: () => ((state.manualUntil = now + 3_600_000), tick()) });
  }
  if (state.breakInfo) items.push({ label: t('Terminar el corte ahora'), click: () => endBreak() });
  if (status === 'paused') items.push({ label: t('Reanudar'), click: () => ((state.pausedUntil = 0), tick()) });
  else items.push({ label: t('Pausar 30 min'), click: () => ((state.pausedUntil = now + 1_800_000), tick()) });
  items.push(
    { type: 'separator' },
    cameraMode === 'mini'
      ? { label: t('Ocultar cámara flotante'), click: () => hideCamera() }
      : { label: t('Cámara flotante'), click: () => showCamera('mini') },
    { label: t('Cámara y calibración'), click: () => showCamera('full') },
    // Cada idioma se nombra en su propio idioma, para que lo encuentre quien no entiende el otro.
    lang() === 'en'
      ? { label: '🌐 Español', click: () => setLanguage('es') }
      : { label: '🌐 English', click: () => setLanguage('en') },
    { label: t('Salir de Foco'), click: () => app.quit() }
  );
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

// ---------- IPC ----------

function registerIpc() {
  ipcMain.handle('state:get', () => snapshot());
  ipcMain.handle('stats:week', () => stats.week());

  ipcMain.handle('config:update', async (_e, partial) => {
    const { language, ...rest } = partial || {};
    config.update(rest);
    if (language) setLanguage(language);
    if (partial?.camera) {
      await ensureVision();
      visionWin?.webContents.send('vision:config', config.get().camera);
    }
    tick();
    return snapshot();
  });

  ipcMain.handle('session:start', (_e, minutes = 60) => {
    state.manualUntil = Date.now() + minutes * 60_000;
    state.pausedUntil = 0;
    tick();
    return snapshot();
  });
  ipcMain.handle('session:stop', () => {
    state.manualUntil = 0;
    tick();
    return snapshot();
  });
  ipcMain.handle('pause', (_e, minutes = 30) => {
    state.pausedUntil = Date.now() + minutes * 60_000;
    tick();
    return snapshot();
  });
  ipcMain.handle('resume', () => {
    state.pausedUntil = 0;
    tick();
    return snapshot();
  });
  ipcMain.handle('sprint:cancel', () => {
    if (state.sprint) stats.log({ type: 'sprint_cancel', goal: state.sprint.goal });
    state.sprint = null;
    tick();
    return snapshot();
  });
  ipcMain.handle('break:end', () => {
    if (state.breakInfo) endBreak();
    return snapshot();
  });

  // Coach
  ipcMain.handle('coach:open', () => openCoach({ mode: 'manual' }));
  ipcMain.handle('coach:context', () => coachContext());
  ipcMain.handle('coach:answer', (_e, answer) => stats.log({ type: 'answer', ...answer }));
  ipcMain.handle('coach:allow', () => {
    const key = state.coach?.trigger?.key;
    if (key) {
      state.allows[key] = Date.now() + config.get().allowMinutes * 60_000;
      stats.log({ type: 'allow', key });
    }
    resolveCoach('allowed');
  });
  ipcMain.handle('coach:back', () => resolveCoach('returned'));
  ipcMain.handle('coach:close', () => resolveCoach('dismissed'));
  ipcMain.handle('coach:sprint', (_e, p) => {
    startSprint(p);
    resolveCoach('sprint');
  });
  ipcMain.handle('coach:break', (_e, p) => {
    startBreak(p);
    resolveCoach('break', { keepWindow: !!p.keepWindowOpen });
  });
  ipcMain.handle('coach:checkin', (_e, { result, goal }) => stats.log({ type: 'sprint_end', result, goal }));
  ipcMain.handle('coach:ai', async (_e, input) => {
    const cfg = config.get();
    const now = Date.now();
    const images = cfg.context.readScreen && lastShots && now - lastShots.at < 5 * 60_000 ? lastShots.images : [];
    return aiCoach({
      apiKey: apiKey(),
      model: cfg.ai.model,
      lang: cfg.language,
      images,
      input: {
        ...input,
        trigger: state.coach?.trigger,
        workSummary: work.summary(now, cfg.language),
        task: input.task || cfg.currentTask,
        dopamineMenu: cfg.dopamineMenu,
      },
    });
  });

  // Aviso flotante
  ipcMain.handle('toast:context', () => toastPayload());
  ipcMain.handle('toast:back', () => resolveAlert('returned'));
  ipcMain.handle('toast:dismiss', () => resolveAlert('dismissed'));
  ipcMain.handle('toast:allow', () => {
    const key = state.alert?.trigger?.key;
    if (key) {
      state.allows[key] = Date.now() + config.get().allowMinutes * 60_000;
      stats.log({ type: 'allow', key });
    }
    resolveAlert('allowed');
  });
  ipcMain.handle('toast:sprint', () => {
    const ins = state.alert?.insight;
    if (!ins) return;
    startSprint({
      goal: ins.micro_step,
      task: config.get().currentTask || ins.working_on,
      minutes: ins.sprint_minutes,
      reward: ins.reward_idea,
    });
    resolveAlert('sprint');
  });
  ipcMain.handle('toast:coach', (_e, { start } = {}) => {
    const a = state.alert;
    resolveAlert('coach');
    coachFromAlert(a, start);
  });
  ipcMain.handle('toast:tell', (_e, text) => {
    const a = state.alert;
    if (!a) return;
    a.told = String(text || '').slice(0, 2000);
    stats.log({ type: 'answer', flow: 'told', text: a.told });
    if (aiReady()) return requestInsight({ transcript: a.told });
    resolveAlert('coach');
    coachFromAlert(a, 'stuck');
  });
  // Fin de sprint: done | partial | stuck. Fin de corte: stuck ("Me cuesta volver").
  ipcMain.handle('toast:checkin', (_e, result) => {
    const a = state.alert;
    if (!a?.moment || a.phase !== 'ask') return;
    const valid = a.moment === 'sprint_end' ? ['done', 'partial', 'stuck'] : ['stuck'];
    if (!valid.includes(result)) return;
    if (a.moment === 'sprint_end') stats.log({ type: 'sprint_end', result, goal: a.info.goal });
    a.phase = result;
    if (result === 'stuck' && aiReady()) return requestInsight();
    pushToast();
  });
  ipcMain.handle('toast:reward', () => {
    const a = state.alert;
    if (a?.moment !== 'sprint_end') return;
    startBreak({ activity: a.info.reward || t('Premio'), minutes: 5, firstThing: '' });
    resolveAlert('break');
  });
  ipcMain.handle('toast:step', (_e, { goal, minutes } = {}) => {
    const a = state.alert;
    const g = String(goal || '').trim().slice(0, 300);
    if (!a?.moment || !g) return;
    startSprint({ goal: g, task: a.info.task || config.get().currentTask, minutes, reward: '' });
    resolveAlert('sprint');
  });
  ipcMain.handle('toast:analyze', () => requestInsight());
  ipcMain.handle('toast:busy', (_e, busy) => {
    if (state.alert) state.alert.busy = !!busy;
  });
  ipcMain.handle('toast:resize', (_e, height) => {
    if (!toastWin || toastWin.isDestroyed()) return;
    const b = toastWin.getBounds();
    toastWin.setBounds({ ...b, height: Math.max(80, Math.min(700, Math.round(height))) });
  });

  // Voz (Whisper local)
  ipcMain.handle('voice:transcribe', async (_e, pcm) => {
    try {
      const text = await voice.transcribe(pcm instanceof Float32Array ? pcm : new Float32Array(pcm), voiceOptions());
      return { text };
    } catch (err) {
      console.error('voz:', err);
      return { error: t('No pude pasar el audio a texto. ¿Hay conexión para descargar el modelo la primera vez?') };
    }
  });
  ipcMain.handle('voice:status', () => voice.status(voiceOptions()));
  ipcMain.handle('voice:prepare', async () => {
    try {
      await voice.load(voiceOptions());
    } catch (err) {
      console.error('voz:', err);
      return { ...voice.status(voiceOptions()), error: t('No se pudo descargar el modelo de voz.') };
    }
    return voice.status(voiceOptions());
  });
  ipcMain.handle('mic:ensure', async () => {
    if (systemPreferences.getMediaAccessStatus('microphone') === 'granted') return true;
    return systemPreferences.askForMediaAccess('microphone');
  });

  // Permisos de macOS
  ipcMain.handle('perm:status', () => permissionStatus());
  ipcMain.handle('perm:request', async (_e, kind) => {
    const pane = (name) => shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${name}`);
    if (kind === 'screen') {
      await captureScreens().catch(() => {}); // así Foco aparece en la lista de macOS
      if (!hasScreenPermission()) pane('Privacy_ScreenCapture');
    }
    if (kind === 'accessibility' && !systemPreferences.isTrustedAccessibilityClient(true)) pane('Privacy_Accessibility');
    if (kind === 'microphone') await systemPreferences.askForMediaAccess('microphone');
    return permissionStatus();
  });

  // IA
  ipcMain.handle('ai:setKey', (_e, key) => {
    const clean = String(key || '').trim();
    writeApiKey(clean);
    apiKeyCache = clean || null;
    if (clean) config.update({ ai: { enabled: true } });
    return snapshot();
  });

  // Cámara
  ipcMain.handle('camera:show', (_e, mode) => showCamera(mode === 'mini' ? 'mini' : 'full'));
  ipcMain.handle('camera:hide', () => hideCamera());
  ipcMain.handle('camera:config', () => ({ ...config.get().camera, active: wantCamera(), preview: cameraMode, lang: lang() }));
  ipcMain.handle('camera:baselines', (_e, baselines) => {
    config.update({ camera: { baselines } });
    visionWin?.webContents.send('vision:config', config.get().camera);
    return snapshot();
  });
  ipcMain.on('attention', (_e, data) => {
    state.attention = { ...data, at: Date.now() };
  });
}

function voiceOptions() {
  return {
    cacheDir: path.join(app.getPath('userData'), 'voice-models'),
    model: config.get().voice.model,
    language: lang() === 'en' ? 'english' : 'spanish',
    onProgress: (pct) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send('voice:progress', pct);
    },
  };
}

function permissionStatus() {
  return {
    screen: systemPreferences.getMediaAccessStatus('screen'),
    accessibility: systemPreferences.isTrustedAccessibilityClient(false),
    microphone: systemPreferences.getMediaAccessStatus('microphone'),
    camera: systemPreferences.getMediaAccessStatus('camera'),
    voice: voice.status(voiceOptions()),
  };
}

// ---------- Arranque ----------

app.on('second-instance', () => openPanel());
app.on('before-quit', () => {
  quitting = true;
  stats?.flush();
});
app.on('window-all-closed', () => {
  // Es una app de barra de menú: sigue corriendo sin ventanas.
});

app.whenReady().then(async () => {
  serveAppProtocol();
  const allowMedia = (wc, permission) => permission === 'media' && wc?.getURL().startsWith('app://foco/');
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(allowMedia(wc, permission)));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => allowMedia(wc, permission));

  const dir = app.getPath('userData');
  config = new ConfigStore(dir);
  stats = new Stats(dir);

  tray = new Tray(nativeImage.createEmpty());

  registerIpc();
  openPanel();
  await ensureVision();
  tick();
  if (!process.env.FOCO_NO_TICK) setInterval(tick, TICK_MS);
});

// Para scripts/smoke.js
module.exports = { showAlert, pushToast, state, work, tick, startSprint, startBreak, config: () => config };
