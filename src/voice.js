// Hablar en vez de escribir: transcripción con Whisper corriendo en tu Mac (no se manda audio a ningún lado).
// El modelo (~250 MB) se descarga una sola vez, la primera vez que usás el micrófono.
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 16000;
// Frases que Whisper inventa cuando escucha silencio o ruido.
const HALLUCINATIONS = [
  /amara\.org/i,
  /subt[ií]tulos/i,
  /gracias por ver/i,
  /suscr[ií]bete/i,
  /thanks? (you )?for watching/i,
  /^\W*$/,
];

let asr = null;
let loading = null;
let progress = null; // 0..100 mientras descarga

function modelFile(cacheDir, model) {
  return path.join(cacheDir, model, 'onnx', 'decoder_model_merged_quantized.onnx');
}

function status({ cacheDir, model }) {
  return {
    ready: !!asr,
    loading: !!loading,
    progress,
    downloaded: fs.existsSync(modelFile(cacheDir, model)),
  };
}

function load({ cacheDir, model, onProgress = () => {} }) {
  if (asr) return Promise.resolve(asr);
  if (loading) return loading;
  loading = (async () => {
    const { pipeline, env } = require('@huggingface/transformers');
    env.cacheDir = cacheDir;
    const files = new Map();
    asr = await pipeline('automatic-speech-recognition', model, {
      dtype: 'q8',
      device: 'cpu',
      progress_callback: (p) => {
        if (p.status !== 'progress' || !p.total) return;
        files.set(p.file, p);
        let loaded = 0;
        let total = 0;
        for (const f of files.values()) {
          loaded += f.loaded;
          total += f.total;
        }
        const pct = Math.floor((loaded / total) * 100);
        if (pct !== progress) {
          progress = pct;
          onProgress(pct);
        }
      },
    });
    return asr;
  })();
  return loading.finally(() => {
    loading = null;
    progress = null;
  });
}

function rms(pcm) {
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / Math.max(1, pcm.length));
}

/**
 * @param {Float32Array} pcm  audio mono a 16 kHz
 * @param {{cacheDir:string, model:string, language?:'spanish'|'english', onProgress?:(pct:number)=>void}} opts
 */
async function transcribe(pcm, opts) {
  if (!pcm || pcm.length < SAMPLE_RATE * 0.4) return '';
  if (rms(pcm) < 0.004) return ''; // silencio
  const model = await load(opts);
  const out = await model(pcm, { language: opts.language || 'spanish', task: 'transcribe' });
  const text = String(out?.text || '').trim();
  return HALLUCINATIONS.some((re) => re.test(text)) ? '' : text;
}

module.exports = { transcribe, load, status, SAMPLE_RATE };
