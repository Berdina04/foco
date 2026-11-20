// Recuerda dónde estabas trabajando (app, ventana, sitio) para que el coach entienda
// en qué te trabaste sin que tengas que escribirlo. Es pura para poder testearla.

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// "Visual Studio Code — engine.js — Foco", "Google Chrome — docs.google.com — Informe Q3"
function describe(a) {
  if (!a) return '';
  const parts = [a.app];
  const h = host(a.url);
  if (h) parts.push(h);
  if (a.title && a.title !== a.app) parts.push(a.title);
  return parts.join(' — ').slice(0, 200);
}

function contextKey(a) {
  if (!a) return '';
  return [a.app, host(a.url) || a.title || ''].join('|');
}

// Apps y sitios que nunca se capturan ni se mandan (bancos, gestores de contraseñas…).
function isExcluded(a, ctx = {}) {
  if (!a) return false;
  const app = (a.app || '').toLowerCase();
  if ((ctx.excludeApps || []).some((x) => x && app === x.trim().toLowerCase())) return true;
  const h = host(a.url).toLowerCase();
  return !!h && (ctx.excludeSites || []).some((x) => x && h.includes(x.trim().toLowerCase()));
}

class WorkContext {
  constructor() {
    this.recent = []; // [{ key, label, app, url, title, seconds, at }]
    this.switches = []; // timestamps de cambios de ventana
    this.currentKey = null;
  }

  /**
   * @param {object|null} activity  app/ventana al frente
   * @param {{now:number, dt:number, isDistraction:boolean, isOwn:boolean}} o
   */
  update(activity, { now, dt = 0, isDistraction = false, isOwn = false }) {
    if (!activity || activity.locked || isOwn) return;
    const key = contextKey(activity);
    if (key !== this.currentKey) {
      if (this.currentKey) this.switches.push(now);
      this.currentKey = key;
    }
    this.switches = this.switches.filter((t) => now - t < 5 * 60_000);
    if (isDistraction) return;

    const top = this.recent[0];
    if (top && top.key === key) {
      top.seconds += dt;
      top.at = now;
      top.title = activity.title || top.title;
      top.label = describe(activity) || top.label;
    } else {
      this.recent = this.recent.filter((r) => r.key !== key);
      this.recent.unshift({
        key,
        label: describe(activity),
        app: activity.app,
        url: activity.url,
        title: activity.title,
        seconds: dt,
        at: now,
      });
      this.recent = this.recent.slice(0, 6);
    }
  }

  /** ¿Saltaste entre muchas ventanas en los últimos 2 minutos? */
  isHopping(now, threshold = 10, windowMs = 120_000) {
    return this.switches.filter((t) => now - t < windowMs).length >= threshold;
  }

  /** Lo último en lo que trabajaste (de los últimos 15 minutos). */
  lastWork(now, maxAgeMs = 15 * 60_000) {
    const top = this.recent[0];
    return top && now - top.at < maxAgeMs ? top : null;
  }

  /** Resumen para la IA: "VS Code — engine.js (12 min, hace 1 min)". */
  summary(now) {
    return this.recent.map((r) => {
      const mins = Math.max(1, Math.round(r.seconds / 60));
      const ago = Math.round((now - r.at) / 60_000);
      return `${r.label} (${mins} min${ago > 0 ? `, hace ${ago} min` : ', recién'})`;
    });
  }
}

module.exports = { WorkContext, describe, contextKey, isExcluded, host };
