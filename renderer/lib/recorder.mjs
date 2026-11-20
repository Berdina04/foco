// Graba del micrófono y devuelve audio mono a 16 kHz, que es lo que necesita Whisper.
import { t } from './i18n.mjs';

export class Recorder {
  constructor({ onLevel } = {}) {
    this.onLevel = onLevel;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    source.connect(this.analyser);

    this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(250);

    const buf = new Float32Array(this.analyser.fftSize);
    this.timer = setInterval(() => {
      this.analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      this.onLevel?.(Math.min(1, Math.sqrt(sum / buf.length) * 8));
    }, 80);
  }

  /** @returns {Promise<Float32Array>} */
  async stop() {
    clearInterval(this.timer);
    const stopped = new Promise((resolve) => (this.rec.onstop = resolve));
    this.rec.stop();
    await stopped;
    this.stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(this.chunks, { type: this.rec.mimeType });
    const decoded = await this.ctx.decodeAudioData(await blob.arrayBuffer());
    await this.ctx.close();

    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
    const node = offline.createBufferSource();
    node.buffer = decoded;
    node.connect(offline.destination);
    node.start();
    return (await offline.startRendering()).getChannelData(0);
  }

  cancel() {
    clearInterval(this.timer);
    try {
      this.rec?.stop();
    } catch {}
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
  }
}

/**
 * Graba y transcribe con un botón: primer clic empieza, segundo clic termina.
 * @param {HTMLButtonElement} button
 * @param {{onText:(text:string)=>void, onState?:(s:string, extra?:any)=>void}} handlers
 */
export function micButton(button, { onText, onState = () => {} }) {
  let rec = null;
  let timeout = null;
  const idleLabel = button.innerHTML;

  const finish = async () => {
    clearTimeout(timeout);
    const current = rec;
    rec = null;
    button.classList.remove('recording');
    button.disabled = true;
    button.textContent = '…';
    onState('transcribing');
    try {
      const pcm = await current.stop();
      const res = await window.foco.invoke('voice:transcribe', pcm);
      if (res.error) onState('error', res.error);
      else if (!res.text) onState('error', t('No escuché nada. Probá de nuevo, un poco más cerca.'));
      else {
        onState('done');
        onText(res.text);
      }
    } catch (err) {
      onState('error', err.message);
    } finally {
      button.disabled = false;
      button.innerHTML = idleLabel;
    }
  };

  button.addEventListener('click', async () => {
    if (rec) return finish();
    const ok = await window.foco.invoke('mic:ensure');
    if (!ok) return onState('error', t('Foco no tiene permiso para usar el micrófono (Ajustes del Sistema → Privacidad → Micrófono).'));
    rec = new Recorder({ onLevel: (l) => onState('level', l) });
    try {
      await rec.start();
    } catch (err) {
      rec = null;
      return onState('error', t('No pude abrir el micrófono.'));
    }
    button.classList.add('recording');
    button.textContent = t('■ Listo');
    onState('listening');
    timeout = setTimeout(finish, 45_000);
  });
}
