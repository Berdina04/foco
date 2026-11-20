// Prueba de humo: arranca la app con datos temporales (sin cámara ni monitoreo, así no pide permisos),
// recorre el panel, el coach y el aviso flotante (distracción, fin de sprint y fin de corte), el cambio de idioma,
// guarda capturas y el texto de cada pantalla, y sale.
//   npm run smoke  ->  capturas en ./smoke-output
// Opcional: FOCO_SMOKE_WAV=audio.wav (16 kHz mono) y FOCO_SMOKE_VOICE_CACHE=carpeta del modelo para probar la voz.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const out = path.join(__dirname, '..', 'smoke-output');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'foco-smoke-'));
fs.writeFileSync(
  path.join(userData, 'config.json'),
  JSON.stringify({
    camera: { enabled: false },
    schedule: { days: [], blocks: [] },
    currentTask: 'Informe mensual de ventas',
    context: { readTitles: false, readScreen: false },
  })
);
app.setPath('userData', userData);
// Sin loop de monitoreo (no lee ventanas ni pide permisos) y con una key inválida a propósito.
process.env.FOCO_NO_TICK = '1';
process.env.ANTHROPIC_API_KEY = 'sk-ant-smoke-invalida';

const errors = [];
app.on('web-contents-created', (_e, wc) => {
  wc.on('console-message', ({ level, message }) => {
    // Los logs internos de MediaPipe ("W1015 …", "INFO: …") no son errores de la app.
    if (/^(W\d{4}|INFO:)/.test(message)) return;
    if (level === 'error' || level === 'warning') errors.push(`[${wc.getURL()}] ${message}`);
  });
  wc.on('preload-error', (_ev, p, err) => errors.push(`preload ${p}: ${err.message}`));
});

const foco = require('../src/main.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const byUrl = (part) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes(part));

async function shot(win, name) {
  const text = await win.webContents.executeJavaScript('document.body.innerText');
  fs.writeFileSync(path.join(out, `${name}.txt`), text);
  const img = await win.webContents.capturePage();
  if (!img.isEmpty()) fs.writeFileSync(path.join(out, `${name}.png`), img.toPNG());
  console.log(`✓ ${name} (${img.isEmpty() ? 'sin imagen' : 'png'}, ${text.length} caracteres)`);
}

async function click(win, selectorOrText) {
  await win.webContents.executeJavaScript(`(() => {
    const t = ${JSON.stringify(selectorOrText)};
    const el = [...document.querySelectorAll('button')].find(b => b.textContent.includes(t)) || document.querySelector(t);
    if (!el) throw new Error('No encontré: ' + t);
    el.click();
  })()`);
  await wait(400);
}

async function type(win, selector, value) {
  await win.webContents.executeJavaScript(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input')); })()`
  );
}

app.whenReady().then(async () => {
  try {
    await wait(2500);
    const panel = byUrl('panel.html');
    if (!panel) throw new Error('No se abrió el panel');
    await shot(panel, '01-panel-hoy');
    await click(panel, 'Ajustes');
    await shot(panel, '02-panel-ajustes');
    await click(panel, 'Hoy');

    // Coach: flujo "me trabé"
    await panel.webContents.executeJavaScript("window.foco.invoke('coach:open')");
    await wait(2000);
    const coach = byUrl('coach.html');
    if (!coach) throw new Error('No se abrió el coach');
    await shot(coach, '03-coach-intro');
    await click(coach, 'Me trabé con algo');
    await type(coach, 'textarea', 'la introducción, no sé cómo arrancarla porque no tengo claro el enfoque');
    await shot(coach, '04-coach-donde');
    await click(coach, 'Siguiente');
    await shot(coach, '05-coach-tipo');
    await click(coach, 'No sé por dónde empezar');
    await wait(300);
    await shot(coach, '06-coach-plan');

    // Volver al inicio y probar el corte
    await click(coach, '← Atrás');
    await click(coach, '← Atrás');
    await click(coach, '← Atrás');
    await click(coach, 'Necesito un corte');
    await click(coach, 'Caminar 5 minutos');
    await shot(coach, '07-coach-corte');

    // Arrancar un sprint desde el plan
    await click(coach, '← Atrás');
    await click(coach, 'Me da fiaca');
    await click(coach, 'Siguiente');
    await click(coach, 'Es aburrida');
    await click(coach, 'Arrancar sprint');
    await wait(2500);
    await shot(panel, '08-panel-sprint');

    // Detector de cara: carga wasm + modelo por app:// y analiza un frame vacío
    const vision = new BrowserWindow({
      show: false,
      webPreferences: { preload: path.join(__dirname, '..', 'src', 'preload.js'), sandbox: true, contextIsolation: true },
    });
    await vision.loadURL('app://foco/renderer/vision.html');
    const detector = await vision.webContents.executeJavaScript(`(async () => {
      const { FaceLandmarker, FilesetResolver } = await import('../node_modules/@mediapipe/tasks-vision/vision_bundle.mjs');
      const fileset = await FilesetResolver.forVisionTasks(new URL('../node_modules/@mediapipe/tasks-vision/wasm', location.href).href);
      const lm = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: new URL('../models/face_landmarker.task', location.href).href, delegate: 'CPU' },
        runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
      });
      const c = new OffscreenCanvas(320, 240);
      c.getContext('2d').fillRect(0, 0, 320, 240);
      const r = lm.detectForVideo(c, performance.now());
      await new Promise((ok) => setTimeout(ok, 2500));
      return { faces: r.faceLandmarks.length, status: document.getElementById('status').innerText };
    })()`);
    console.log('✓ detector de cara cargado:', JSON.stringify(detector));
    vision.destroy();

    // ---------- Aviso flotante ----------
    await panel.webContents.executeJavaScript("window.foco.invoke('config:update', { ai: { enabled: true } })");
    foco.work.update({ app: 'Visual Studio Code', title: 'engine.js — Foco' }, { now: Date.now(), dt: 600 });
    foco.showAlert({ type: 'site', key: 'site:instagram.com', label: 'instagram.com' }, { gentle: false });
    await wait(5000); // carga + intento de IA con key inválida
    const toast = byUrl('toast.html');
    if (!toast) throw new Error('No apareció el aviso flotante');
    await shot(toast, '09-aviso-ia-con-error');
    const b = toast.getBounds();
    console.log('✓ aviso en', JSON.stringify(b), 'visible:', toast.isVisible(), 'foco robado:', toast.isFocused());

    Object.assign(foco.state.alert, {
      insightStatus: 'ready',
      insight: {
        working_on: 'Escribir el test de ojos cerrados en engine.js',
        likely_block: 'El test de "drowsy" falla y no queda claro por qué el contador no arranca.',
        question: '¿Te trabaste con ese test?',
        flow: 'stuck',
        reflection: 'Un test que falla sin pista clara cansa.',
        strategies: [
          { title: 'Imprimí el estado', how: 'Agregá un console.log de eyesClosedSince en cada tick.' },
          { title: 'Achicá el caso', how: 'Probá con dos ticks nada más.' },
          { title: 'Leé el if', how: 'Fijate qué pasa cuando el valor es 0.' },
        ],
        micro_step: 'Agregar un console.log de eyesClosedSince y correr sólo ese test',
        sprint_minutes: 15,
        reward_idea: '5 minutos de Instagram con alarma',
      },
    });
    foco.pushToast();
    await wait(800);
    await shot(toast, '10-aviso-con-lectura');
    foco.state.alert.escalated = true;
    foco.pushToast();
    await wait(500);
    await shot(toast, '11-aviso-insiste');

    // Silencio por IPC: tiene que volver vacío sin cargar el modelo
    const silence = await toast.webContents.executeJavaScript("window.foco.invoke('voice:transcribe', new Float32Array(16000))");
    if (silence.text !== '') throw new Error('Transcripción de silencio: ' + JSON.stringify(silence));
    console.log('✓ voz por IPC (silencio):', JSON.stringify(silence));

    // Del aviso al coach, con lo que contaste ya escrito
    foco.state.alert.told = 'no me sale el test de ojos cerrados';
    await toast.webContents.executeJavaScript("window.foco.invoke('toast:coach', { start: 'stuck' })");
    await wait(2000);
    const coach2 = byUrl('coach.html');
    await shot(coach2, '12-coach-desde-aviso');
    coach2.webContents.executeJavaScript("window.foco.invoke('coach:close')").catch(() => {});
    await wait(800);

    // Voz real: Whisper corriendo dentro de Electron
    if (process.env.FOCO_SMOKE_WAV && process.env.FOCO_SMOKE_VOICE_CACHE) {
      const voice = require('../src/voice');
      const buf = fs.readFileSync(process.env.FOCO_SMOKE_WAV);
      const dataAt = buf.indexOf('data') + 8;
      const pcm = new Float32Array((buf.length - dataAt) / 2);
      for (let i = 0; i < pcm.length; i++) pcm[i] = buf.readInt16LE(dataAt + i * 2) / 32768;
      const t0 = Date.now();
      const text = await voice.transcribe(pcm, { cacheDir: process.env.FOCO_SMOKE_VOICE_CACHE, model: 'onnx-community/whisper-small' });
      console.log(`✓ voz en Electron (${Date.now() - t0} ms):`, JSON.stringify(text));
    }

    const state = await panel.webContents.executeJavaScript("window.foco.invoke('state:get')");
    if (!state.sprint) throw new Error('El sprint no arrancó');
    console.log('✓ sprint activo:', state.sprint.goal, `(${state.sprint.minutes} min)`);

    // ---------- Fin de sprint y fin de corte en el aviso flotante ----------
    const toastText = () => toast.webContents.executeJavaScript('document.body.innerText');
    const expectText = async (part, what) => {
      const text = await toastText();
      if (!text.includes(part)) throw new Error(`${what}: no dice "${part}". Dice: ${JSON.stringify(text)}`);
    };
    const expectSprint = (goal, minutes, what) => {
      const s = foco.state.sprint;
      if (!s || s.goal !== goal || s.minutes !== minutes) throw new Error(`${what}: sprint ${JSON.stringify(s)}`);
      console.log(`✓ ${what}: sprint de ${s.minutes} min "${s.goal}"`);
    };
    const finishSprint = async () => {
      foco.state.sprint.until = Date.now() - 1;
      await foco.tick();
      await wait(800);
    };
    const finishBreak = async () => {
      foco.state.breakInfo.until = Date.now() - 1;
      await foco.tick();
      await wait(800);
    };
    // Espera a que termine el intento de IA (con la key inválida, termina en error).
    const waitInsight = async () => {
      for (let i = 0; i < 60 && foco.state.alert?.insightStatus === 'loading'; i++) await wait(250);
      await wait(500);
    };

    // 1. ¡Lo hice! → premio de 5 min
    const sprintGoal = foco.state.sprint.goal;
    await finishSprint();
    if (foco.state.alert?.moment !== 'sprint_end') throw new Error('El fin de sprint no abrió el aviso');
    if (byUrl('coach.html')) throw new Error('El fin de sprint abrió el coach grande con estilo "aviso"');
    if (!toast.isVisible() || toast.isFocused()) throw new Error('El aviso de fin de sprint no está visible o robó el foco');
    await expectText(`¿Pudiste: ${sprintGoal}?`, 'Fin de sprint');
    await shot(toast, '13-aviso-fin-sprint');
    await click(toast, '¡Lo hice!');
    await expectText('Tomarme el premio', 'Lo hice');
    await shot(toast, '14-aviso-sprint-lo-hice');
    await click(toast, 'Tomarme el premio');
    if (!foco.state.breakInfo || foco.state.breakInfo.minutes !== 5) throw new Error('El premio no arrancó un corte de 5 min');
    if (foco.state.alert || toast.isVisible()) throw new Error('El aviso no se cerró al tomar el premio');
    console.log('✓ premio: corte de 5 min con', JSON.stringify(foco.state.breakInfo.activity));

    // 2. Fin del corte sin nada anotado → escribís el próximo paso y arrancás 25 min
    await finishBreak();
    if (foco.state.alert?.moment !== 'break_end') throw new Error('El fin del corte no abrió el aviso');
    await expectText('Volvamos al foco', 'Fin de corte sin nota');
    await type(toast, 'input', 'Revisar los números de marzo');
    await shot(toast, '15-aviso-fin-corte-sin-nota');
    await click(toast, 'Arrancar 25 min');
    expectSprint('Revisar los números de marzo', 25, 'fin de corte sin nota');

    // 3. Avancé → seguir 15 min con lo mismo
    await finishSprint();
    await click(toast, 'Avancé');
    await expectText('Avanzar es avanzar', 'Avancé');
    await shot(toast, '16-aviso-sprint-avance');
    await click(toast, 'Arrancar 15 min');
    expectSprint('Revisar los números de marzo', 15, 'avancé');

    // 4. ¡Lo hice! → otro sprint
    await finishSprint();
    await click(toast, '¡Lo hice!');
    await click(toast, 'Otro sprint');
    await type(toast, 'input', 'Armar el gráfico de ventas');
    await shot(toast, '17-aviso-otro-sprint');
    await click(toast, 'Arrancar 25 min');
    expectSprint('Armar el gráfico de ventas', 25, 'otro sprint');

    // 5. Me trabé → sigue el flujo del aviso (la IA falla con la key inválida y quedan las opciones y el 🎤)
    await finishSprint();
    await click(toast, 'Me trabé');
    await waitInsight();
    if (foco.state.alert?.phase !== 'stuck') throw new Error('Me trabé no pasó al flujo del aviso');
    await expectText('Contame qué pasa', 'Me trabé');
    await expectText('No pude analizarlo', 'Me trabé con IA');
    await shot(toast, '18-aviso-sprint-me-trabe');
    await toast.webContents.executeJavaScript("window.foco.invoke('toast:dismiss')");
    const results = (await panel.webContents.executeJavaScript("window.foco.invoke('state:get')")).today.events
      .filter((e) => e.type === 'sprint_end')
      .map((e) => e.result);
    if (results.join() !== 'done,partial,done,stuck') throw new Error('sprint_end registrados: ' + results.join());
    console.log('✓ sprint_end registrados:', results.join(', '));

    // 6. Fin del corte con lo primero anotado → arrancar 25 min
    foco.startBreak({ activity: '🚶 Caminar 5 minutos sin el celular', minutes: 5, firstThing: 'Escribir la conclusión del informe' });
    await finishBreak();
    await expectText('Volvamos: Escribir la conclusión del informe', 'Fin de corte');
    await shot(toast, '19-aviso-fin-corte');
    await click(toast, 'Arrancar 25 min');
    expectSprint('Escribir la conclusión del informe', 25, 'fin de corte');

    // 7. Me cuesta volver → flujo del aviso
    foco.startBreak({ activity: '💧 Tomar agua', minutes: 5, firstThing: 'Mandar el mail a Ana' });
    await finishBreak();
    await click(toast, 'Me cuesta volver');
    await waitInsight();
    await expectText('Cuesta volver', 'Me cuesta volver');
    await expectText('Me da fiaca', 'Me cuesta volver');
    await shot(toast, '20-aviso-cuesta-volver');
    await toast.webContents.executeJavaScript("window.foco.invoke('toast:dismiss')");

    // 8. Con el estilo "ventana", el fin de sprint sigue abriendo el coach grande
    foco.config().update({ alerts: { style: 'window' } });
    foco.startSprint({ goal: 'Probar el estilo ventana', minutes: 10 });
    await finishSprint();
    await wait(1500);
    const coach3 = byUrl('coach.html');
    if (!coach3 || foco.state.alert) throw new Error('Con estilo "ventana" el fin de sprint no abrió el coach');
    const coachText = await coach3.webContents.executeJavaScript('document.body.innerText');
    if (!coachText.includes('¿Cómo te fue?')) throw new Error('El coach no abrió el check-in: ' + JSON.stringify(coachText));
    await shot(coach3, '21-coach-fin-sprint-ventana');
    coach3.webContents.executeJavaScript("window.foco.invoke('coach:close')").catch(() => {});
    await wait(800);
    foco.config().update({ alerts: { style: 'toast' } });

    // 9. Botón ES/EN: el panel, el aviso y el coach en inglés, y vuelta al español con el coach abierto
    const textOf = (win) => win.webContents.executeJavaScript('document.body.innerText');
    const expectIn = async (win, part, what) => {
      const text = await textOf(win);
      if (!text.includes(part)) throw new Error(`${what}: no dice "${part}". Dice: ${JSON.stringify(text.slice(0, 400))}`);
    };
    await click(panel, '[data-lang="en"]');
    await wait(600);
    await expectIn(panel, 'Today', 'Panel en inglés');
    await expectIn(panel, 'What happened today', 'Panel en inglés');
    if (foco.config().get().language !== 'en') throw new Error('El botón EN no guardó el idioma');
    if (!foco.config().get().dopamineMenu[0].includes('Walk')) throw new Error('El menú de dopamina no pasó al inglés');
    await shot(panel, '22-panel-ingles');
    await click(panel, 'Settings');
    await expectIn(panel, 'Work hours', 'Ajustes en inglés');
    await shot(panel, '23-panel-ajustes-ingles');
    await click(panel, 'Today');

    foco.showAlert({ type: 'site', key: 'site:instagram.com', label: 'instagram.com' }, { gentle: false });
    await waitInsight();
    await expectIn(toast, 'Out of focus', 'Aviso en inglés');
    await expectIn(toast, "You're on instagram.com", 'Aviso en inglés');
    await shot(toast, '24-aviso-ingles');
    await toast.webContents.executeJavaScript("window.foco.invoke('toast:dismiss')");

    await panel.webContents.executeJavaScript("window.foco.invoke('coach:open')");
    await wait(1500);
    const coach4 = byUrl('coach.html');
    if (!coach4) throw new Error('No se abrió el coach en inglés');
    await expectIn(coach4, "What's going on?", 'Coach en inglés');
    await click(coach4, "I'm stuck on something");
    await expectIn(coach4, 'Where did you get stuck?', 'Coach en inglés');
    await shot(coach4, '25-coach-ingles');
    await click(panel, '[data-lang="es"]');
    await wait(600);
    await expectIn(coach4, '¿Dónde te trabaste?', 'Coach al volver al español');
    await expectIn(panel, 'Qué pasó hoy', 'Panel al volver al español');
    if (!foco.config().get().dopamineMenu[0].includes('Caminar')) throw new Error('El menú de dopamina no volvió al español');
    console.log('✓ idioma: ES → EN → ES en panel, aviso y coach');
    coach4.webContents.executeJavaScript("window.foco.invoke('coach:close')").catch(() => {});
    await wait(800);

    const final =await panel.webContents.executeJavaScript("window.foco.invoke('state:get')");
    console.log('✓ eventos registrados:', final.today.events.map((e) => e.type).join(', '));
  } catch (err) {
    errors.push('SMOKE: ' + err.message);
  }
  if (errors.length) {
    console.log('\nErrores/advertencias en consola:');
    for (const e of errors) console.log(' -', e);
  }
  fs.rmSync(userData, { recursive: true, force: true });
  app.exit(errors.some((e) => e.startsWith('SMOKE')) ? 1 : 0);
});
