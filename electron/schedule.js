function eventEnd(item, start) {
  const end = item.end ? new Date(item.end).getTime() : start + 30 * 60 * 1000;
  return Number.isNaN(end) ? start + 30 * 60 * 1000 : end;
}

function isRemindable(item) {
  if (!item || !item.start || !item.id || item.allDay) return false;
  const start = new Date(item.start).getTime();
  if (Number.isNaN(start)) return false;
  const end = eventEnd(item, start);
  if (end - start > 8 * 60 * 60 * 1000) return false;
  return true;
}

function collectDue({ now, items, leadMinutes, alsoAtStart = true, notified = {}, snooze = {} }) {
  const leadMs = Math.max(1, leadMinutes || 10) * 60 * 1000;
  const due = [];
  for (const item of items || []) {
    if (!isRemindable(item)) continue;
    if (snooze[item.id] && snooze[item.id] > now) continue;
    const start = new Date(item.start).getTime();
    const end = eventEnd(item, start);
    const missedLead = !notified[`${item.id}:lead`];
    let phase = null;
    if (now >= start - leadMs && now < start) phase = 'lead';
    else if (now >= start && now < start + 3 * 60 * 1000) phase = 'start';
    else if (missedLead && now >= start + 3 * 60 * 1000 && now < Math.min(end, start + 15 * 60 * 1000)) phase = 'start';
    if (!phase) continue;
    if (phase === 'start' && !alsoAtStart && now < start + 3 * 60 * 1000) continue;
    const key = `${item.id}:${phase}`;
    if (notified[key]) continue;
    due.push({ ...item, phase, key });
  }
  due.sort((a, b) => new Date(a.start) - new Date(b.start));
  return due;
}

function upcoming(items, now, limit = 8) {
  return (items || [])
    .filter((item) => {
      const end = item.end ? new Date(item.end).getTime() : new Date(item.start).getTime() + 30 * 60 * 1000;
      return end > now;
    })
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, limit);
}

function pruneMap(map, now, maxAgeMs) {
  const next = {};
  for (const [key, value] of Object.entries(map || {})) {
    if (typeof value === 'number' && now - value < maxAgeMs) next[key] = value;
  }
  return next;
}

function nextAlarm(items, now, leadMinutes) {
  const leadMs = Math.max(1, leadMinutes || 10) * 60 * 1000;
  let at = null;
  for (const item of items || []) {
    if (!isRemindable(item)) continue;
    const start = new Date(item.start).getTime();
    if (Number.isNaN(start)) continue;
    for (const mark of [start - leadMs, start]) {
      if (mark > now + 400 && (at === null || mark < at)) at = mark;
    }
  }
  return at;
}

module.exports = { collectDue, upcoming, pruneMap, isRemindable, nextAlarm };
