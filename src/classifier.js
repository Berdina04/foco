// Decide si la app o pestaña activa es una distracción.

function parseUrl(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname.replace(/^www\./, '').toLowerCase(), path: u.pathname.toLowerCase() };
  } catch {
    return null;
  }
}

// Una entrada puede ser un dominio ("youtube.com") o dominio + ruta ("youtube.com/shorts").
function matchSite(entry, parsed) {
  const clean = entry.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (!clean) return false;
  const slash = clean.indexOf('/');
  const domain = slash === -1 ? clean : clean.slice(0, slash);
  const pathPrefix = slash === -1 ? '' : clean.slice(slash);
  const hostOk = parsed.host === domain || parsed.host.endsWith('.' + domain);
  return hostOk && (!pathPrefix || parsed.path.startsWith(pathPrefix));
}

/**
 * @param {{app: string, bundleId?: string, url?: string, title?: string}} activity
 * @param {{sites: string[], apps: string[]}} config
 * @param {Record<string, number>} allows  clave -> timestamp de vencimiento
 * @returns {{key: string, kind: 'site'|'app', label: string} | null}
 */
function classify(activity, config, allows = {}, now = Date.now()) {
  if (!activity || !activity.app) return null;
  let hit = null;

  if (activity.url) {
    const parsed = parseUrl(activity.url);
    if (parsed) {
      const entry = (config.sites || []).find((s) => matchSite(s, parsed));
      if (entry) hit = { key: 'site:' + entry.toLowerCase(), kind: 'site', label: parsed.host };
    }
  }

  if (!hit) {
    const app = activity.app.toLowerCase();
    const entry = (config.apps || []).find((a) => a.trim() && app === a.trim().toLowerCase());
    if (entry) hit = { key: 'app:' + entry.toLowerCase(), kind: 'app', label: activity.app };
  }

  if (hit && allows[hit.key] && allows[hit.key] > now) return null;
  return hit;
}

module.exports = { classify, matchSite, parseUrl };
