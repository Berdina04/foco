// Lee la app que está al frente en macOS y, si es un navegador, la URL de la pestaña activa.
// - lsappinfo no necesita permisos.
// - La URL se pide por AppleScript: la primera vez macOS pregunta si Foco puede controlar ese navegador.
const { execFile } = require('child_process');

const CHROMIUM = new Set([
  'Google Chrome',
  'Google Chrome Canary',
  'Brave Browser',
  'Microsoft Edge',
  'Arc',
  'Vivaldi',
  'Chromium',
  'Opera',
  'Comet',
]);
const SAFARI = new Set(['Safari', 'Safari Technology Preview', 'Orion']);
// Sin soporte AppleScript para URL: usamos el título de la ventana (requiere Accesibilidad).
const TITLE_ONLY = new Set(['Firefox', 'Firefox Developer Edition', 'Zen', 'Zen Browser']);
const LOCKED = new Set(['loginwindow', 'ScreenSaverEngine']);

function run(cmd, args, timeout = 1500) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout }, (err, stdout) => (err ? reject(err) : resolve(String(stdout))));
  });
}

// Evita reintentar cada 2 s un navegador que no dio permiso.
const failedUntil = new Map();

async function osa(key, script) {
  if ((failedUntil.get(key) || 0) > Date.now()) return null;
  try {
    return (await run('osascript', ['-e', script])).trim();
  } catch {
    failedUntil.set(key, Date.now() + 60_000);
    return null;
  }
}

async function frontApp() {
  const asn = (await run('lsappinfo', ['front'])).trim();
  if (!asn) return null;
  const info = await run('lsappinfo', ['info', '-only', 'name', '-only', 'bundleid', asn]);
  const name = /"LSDisplayName"="([^"]*)"/.exec(info)?.[1];
  const bundleId = /"CFBundleIdentifier"="([^"]*)"/.exec(info)?.[1];
  return name ? { app: name, bundleId } : null;
}

function windowTitle() {
  return osa(
    'system-events',
    'tell application "System Events" to tell (first process whose frontmost is true) to return name of front window'
  );
}

async function browserTab(app, readTitles) {
  const esc = app.replace(/"/g, '\\"');
  let out = null;
  if (CHROMIUM.has(app)) {
    out = await osa(
      app,
      `tell application "${esc}"
        if (count of windows) is 0 then return ""
        set t to active tab of front window
        return (URL of t) & linefeed & (title of t)
      end tell`
    );
  } else if (SAFARI.has(app)) {
    out = await osa(
      app,
      `tell application "${esc}"
        if (count of documents) is 0 then return ""
        return (URL of front document) & linefeed & (name of front document)
      end tell`
    );
  } else if (TITLE_ONLY.has(app) || readTitles) {
    // Título de la ventana (ej. "engine.js — Foco"): necesita permiso de Accesibilidad.
    const title = await windowTitle();
    return title ? { title } : {};
  } else {
    return {};
  }
  if (!out) return {};
  const [url, ...rest] = out.split('\n');
  return { url: url || undefined, title: rest.join(' ') || undefined };
}

/**
 * @param {{readTitles?: boolean, skipDetails?: boolean}} [opts]
 * @returns {Promise<{app: string, bundleId?: string, url?: string, title?: string, locked?: boolean} | null>}
 */
async function getActivity({ readTitles = false, skipDetails = false } = {}) {
  try {
    const front = await frontApp();
    if (!front) return null;
    if (LOCKED.has(front.app)) return { ...front, locked: true };
    if (skipDetails) return front;
    return { ...front, ...(await browserTab(front.app, readTitles)) };
  } catch {
    return null;
  }
}

module.exports = { getActivity };
