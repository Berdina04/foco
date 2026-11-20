// Registro diario: tiempo en foco, distracciones y respuestas al coach. Un JSON por día.
const fs = require('fs');
const path = require('path');

function dayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function emptyDay(date) {
  return { date, focusSeconds: 0, distractedSeconds: 0, awaySeconds: 0, events: [] };
}

class Stats {
  constructor(dir) {
    this.dir = path.join(dir, 'stats');
    fs.mkdirSync(this.dir, { recursive: true });
    this.day = this.#load(dayKey());
    this.dirty = false;
    setInterval(() => this.flush(), 15_000).unref?.();
  }

  #file(key) {
    return path.join(this.dir, `${key}.json`);
  }

  #load(key) {
    try {
      return { ...emptyDay(key), ...JSON.parse(fs.readFileSync(this.#file(key), 'utf8')) };
    } catch {
      return emptyDay(key);
    }
  }

  #rollover() {
    const key = dayKey();
    if (this.day.date !== key) {
      this.flush();
      this.day = this.#load(key);
    }
  }

  today() {
    this.#rollover();
    return this.day;
  }

  addTime(state, seconds) {
    this.#rollover();
    if (state === 'focused') this.day.focusSeconds += seconds;
    else if (state === 'distracted' || state === 'looking_away') this.day.distractedSeconds += seconds;
    else if (state === 'away') this.day.awaySeconds += seconds;
    this.dirty = true;
  }

  log(event) {
    this.#rollover();
    this.day.events.push({ ts: Date.now(), ...event });
    this.dirty = true;
    this.flush();
  }

  flush() {
    if (!this.dirty) return;
    fs.writeFileSync(this.#file(this.day.date), JSON.stringify(this.day, null, 2));
    this.dirty = false;
  }

  week() {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dayKey(d);
      const day = key === this.day.date ? this.day : this.#load(key);
      out.push({
        date: key,
        focusSeconds: day.focusSeconds,
        distractedSeconds: day.distractedSeconds,
        coaches: day.events.filter((e) => e.type === 'coach').length,
      });
    }
    return out;
  }
}

module.exports = { Stats, dayKey };
