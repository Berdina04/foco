// Máquina de estados que decide cuándo avisar. Es pura (sin Electron) para poder testearla.
//
// Entradas por tick: distracción en pantalla, estado de la cámara, segundos sin teclado/mouse.
// Salidas: 'none' | 'nudge' (aviso suave) | 'coach' (escalar: más insistente) |
//          'signal' (señal de bloqueo sin distracción: mirada fija o saltar entre ventanas).

const ATTENTION_STALE_MS = 5000;
const SIGNAL_COOLDOWN_MS = 10 * 60 * 1000;

class FocusEngine {
  constructor() {
    this.reset();
    this.cooldownUntil = 0;
    this.signalCooldownUntil = 0;
    this.stareFired = false;
  }

  reset() {
    this.screen = null; // { key, kind, label, since, nudgedAt }
    this.gaze = null; // { since, nudgedAt }
    this.eyesClosedSince = null;
  }

  // Llamar cuando se cierra el coach: no volver a avisar enseguida.
  resolved(now, cooldownSeconds = 30) {
    this.reset();
    this.cooldownUntil = now + cooldownSeconds * 1000;
  }

  /**
   * @param {object} i
   * @param {number} i.now
   * @param {object} i.config
   * @param {{key:string, kind:string, label:string}|null} i.distraction
   * @param {{status:string, at:number}|null} i.attention
   * @param {number} i.idleSeconds
   * @param {boolean} [i.locked]
   * @param {boolean} [i.paused]  coach abierto, corte en curso, etc.
   * @param {boolean} [i.hopping] muchos cambios de ventana en poco tiempo
   */
  tick(i) {
    const { now, config } = i;
    const cam = config.camera || {};

    if (i.locked) {
      this.reset();
      return { action: 'none', state: 'away' };
    }

    const att =
      cam.enabled && i.attention && now - i.attention.at < ATTENTION_STALE_MS ? i.attention.status : 'unknown';

    // Pantalla
    if (i.distraction) {
      if (!this.screen || this.screen.key !== i.distraction.key) {
        this.screen = { ...i.distraction, since: now, nudgedAt: null };
      }
    } else {
      this.screen = null;
    }

    // Mirada: sólo cuenta si además no estás usando teclado/mouse
    // (mirar el teclado o un papel mientras escribís es trabajar).
    const idleOk = !cam.requireIdle || i.idleSeconds >= (cam.idleSeconds ?? 6);
    if (att === 'looking_away' && idleOk) {
      this.gaze ??= { since: now, nudgedAt: null };
    } else {
      this.gaze = null;
    }

    if (att === 'eyes_closed') this.eyesClosedSince ??= now;
    else this.eyesClosedSince = null;

    let state = 'focused';
    if (this.screen) state = 'distracted';
    else if (this.gaze) state = 'looking_away';
    else if (att === 'no_face' && i.idleSeconds >= 60) state = 'away';

    if (i.paused || now < this.cooldownUntil) return { action: 'none', state };

    const secs = (since) => (now - since) / 1000;

    if (this.screen && secs(this.screen.since) >= config.graceSeconds) {
      const trigger = { type: this.screen.kind, key: this.screen.key, label: this.screen.label };
      return this.#escalate(this.screen, now, config, trigger, state);
    }

    if (this.eyesClosedSince != null && secs(this.eyesClosedSince) >= (cam.drowsySeconds ?? 6)) {
      return { action: 'coach', state, trigger: { type: 'drowsy', key: 'drowsy', label: 'cansancio' } };
    }

    if (this.gaze && secs(this.gaze.since) >= (cam.gazeSeconds ?? 20)) {
      const trigger = { type: 'gaze', key: 'gaze', label: 'mirada fuera de la pantalla' };
      return this.#escalate(this.gaze, now, config, trigger, state);
    }

    // Señales de bloqueo: no te fuiste a nada, pero algo no avanza.
    const sig = config.signals || {};
    if (i.idleSeconds < 5) this.stareFired = false;
    if (!this.screen && now >= this.signalCooldownUntil) {
      const staring =
        sig.stareMinutes > 0 && att === 'focused' && !this.stareFired && i.idleSeconds >= sig.stareMinutes * 60;
      if (staring) {
        this.stareFired = true;
        this.signalCooldownUntil = now + SIGNAL_COOLDOWN_MS;
        return { action: 'signal', state, trigger: { type: 'stuck', key: 'stuck', label: 'mirada fija sin avanzar' } };
      }
      if (sig.hopping && i.hopping) {
        this.signalCooldownUntil = now + SIGNAL_COOLDOWN_MS;
        return { action: 'signal', state, trigger: { type: 'hopping', key: 'hopping', label: 'saltando entre ventanas' } };
      }
    }

    return { action: 'none', state };
  }

  #escalate(tracker, now, config, trigger, state) {
    if (!config.nudgeFirst) return { action: 'coach', state, trigger };
    if (tracker.nudgedAt == null) {
      tracker.nudgedAt = now;
      return { action: 'nudge', state, trigger };
    }
    if ((now - tracker.nudgedAt) / 1000 >= config.nudgeToCoachSeconds) {
      return { action: 'coach', state, trigger };
    }
    return { action: 'none', state };
  }
}

module.exports = { FocusEngine };
