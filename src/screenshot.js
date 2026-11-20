// Captura de las pantallas en las que estás trabajando. Queda sólo en memoria (nunca en disco)
// y se le manda a la IA únicamente cuando te distraés o aparece una señal de bloqueo.
const { desktopCapturer, screen, systemPreferences } = require('electron');

const MAX_WIDTH = 1280;
const MAX_SCREENS = 3;

function hasPermission() {
  return systemPreferences.getMediaAccessStatus('screen') === 'granted';
}

/** @returns {Promise<Buffer[]>} JPEGs, primero la pantalla donde está el mouse */
async function captureScreens() {
  const displays = screen.getAllDisplays();
  const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const biggest = displays.reduce(
    (m, d) => ({ width: Math.max(m.width, d.size.width), height: Math.max(m.height, d.size.height) }),
    { width: 0, height: 0 }
  );
  const scale = Math.min(1, MAX_WIDTH / biggest.width);
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(biggest.width * scale), height: Math.round(biggest.height * scale) },
  });
  sources.sort((a, b) => (b.display_id === String(cursorDisplay.id)) - (a.display_id === String(cursorDisplay.id)));
  return sources
    .filter((s) => !s.thumbnail.isEmpty())
    .slice(0, MAX_SCREENS)
    .map((s) => s.thumbnail.toJPEG(72));
}

module.exports = { captureScreens, hasPermission };
