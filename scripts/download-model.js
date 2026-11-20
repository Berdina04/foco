// Descarga el modelo de detección de cara de MediaPipe (≈3.7 MB) si no está.
const fs = require('fs');
const path = require('path');

const URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const dest = path.join(__dirname, '..', 'models', 'face_landmarker.task');

async function main() {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1_000_000) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  console.log('Descargando el modelo de detección de cara…');
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log('Listo:', dest);
}

main().catch((err) => {
  console.error('No se pudo descargar el modelo:', err.message);
  console.error('La app funciona igual, pero sin cámara. Probá de nuevo con: npm run model');
});
