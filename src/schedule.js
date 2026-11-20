// ¿Estamos en horario laboral?

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isWorkTime(schedule, date = new Date()) {
  if (!schedule || !schedule.days?.includes(date.getDay())) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  return (schedule.blocks || []).some(({ start, end }) => {
    const s = toMinutes(start);
    const e = toMinutes(end);
    if (s == null || e == null) return false;
    // Bloques que cruzan la medianoche (ej. 22:00-02:00).
    return s <= e ? now >= s && now < e : now >= s || now < e;
  });
}

// "09:00-13:00, 14:00-18:00" -> [{start, end}, ...]
function parseBlocks(text) {
  return String(text)
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [start, end] = part.split('-').map((s) => s.trim());
      return { start, end };
    })
    .filter(({ start, end }) => toMinutes(start) != null && toMinutes(end) != null);
}

function formatBlocks(blocks) {
  return (blocks || []).map((b) => `${b.start}-${b.end}`).join(', ');
}

module.exports = { isWorkTime, parseBlocks, formatBlocks, toMinutes };
