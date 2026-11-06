function unfold(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}

function unescapeText(value) {
  return String(value)
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseParams(left) {
  const [key, ...parts] = left.split(';');
  const params = {};
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { key: key.toUpperCase(), params };
}

function zonedTimeToUtc(y, monthIndex, d, h, mi, s, timeZone) {
  const utcGuess = Date.UTC(y, monthIndex, d, h, mi, s);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(utcGuess))
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(utcGuess - (asUtc - utcGuess));
}

function parseDateToken(value, params = {}) {
  const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly || params.VALUE === 'DATE') {
    const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    return { allDay: true, date: new Date(+m[1], +m[2] - 1, +m[3], 9, 0, 0, 0) };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2] - 1;
  const d = +m[3];
  const h = +m[4];
  const mi = +m[5];
  const s = +m[6];
  if (m[7]) return { allDay: false, date: new Date(Date.UTC(y, mo, d, h, mi, s)) };
  if (params.TZID) return { allDay: false, date: zonedTimeToUtc(y, mo, d, h, mi, s, params.TZID) };
  return { allDay: false, date: new Date(y, mo, d, h, mi, s) };
}

function parseRrule(value) {
  if (!value) return null;
  const out = {};
  for (const part of value.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return out.FREQ ? out : null;
}

const DAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function startOfWeek(date) {
  const x = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x.getTime();
}

function expandEvent(master, windowStart, windowEnd) {
  const duration = master.end
    ? master.end.getTime() - master.rawStart.getTime()
    : master.allDay
      ? 12 * 60 * 60 * 1000
      : 30 * 60 * 1000;
  const rrule = master.rrule;
  const results = [];
  const ex = master.exdates || new Set();
  const limit = windowEnd.getTime();

  function push(occStart) {
    const stamp = occStart.getTime();
    if (ex.has(stamp)) return;
    const occEnd = new Date(stamp + Math.max(duration, 60 * 1000));
    if (stamp < windowEnd.getTime() && occEnd.getTime() > windowStart.getTime()) {
      results.push({
        id: `${master.uid}@${occStart.toISOString()}`,
        title: master.title,
        start: occStart.toISOString(),
        end: occEnd.toISOString(),
        allDay: master.allDay,
        source: 'calendar',
      });
    }
  }

  if (!rrule) {
    push(master.rawStart);
    return results;
  }

  const interval = Math.max(1, parseInt(rrule.INTERVAL || '1', 10) || 1);
  const count = rrule.COUNT ? parseInt(rrule.COUNT, 10) : Infinity;
  const untilField = rrule.UNTIL ? parseDateToken(rrule.UNTIL, rrule.UNTIL.endsWith('Z') ? {} : {}) : null;
  const until = untilField ? untilField.date.getTime() : Infinity;
  let emitted = 0;

  if (rrule.FREQ === 'DAILY') {
    for (let n = 0; n < 500 && emitted < count; n += interval) {
      const occ = new Date(master.rawStart.getTime() + n * 86400000);
      if (occ.getTime() > until || occ.getTime() > limit) break;
      emitted += 1;
      push(occ);
    }
    return results;
  }

  if (rrule.FREQ === 'MONTHLY' || rrule.FREQ === 'YEARLY') {
    const months = rrule.FREQ === 'YEARLY' ? 12 : 1;
    for (let n = 0; n < 240 && emitted < count; n += interval) {
      const occ = new Date(master.rawStart);
      occ.setMonth(master.rawStart.getMonth() + n * months);
      if (occ.getDate() !== master.rawStart.getDate()) continue;
      if (occ.getTime() > until || occ.getTime() > limit) break;
      emitted += 1;
      push(occ);
    }
    return results;
  }

  if (rrule.FREQ === 'WEEKLY') {
    const byday = rrule.BYDAY
      ? rrule.BYDAY.split(',').map((d) => DAY[d.replace(/[^A-Z]/g, '').slice(-2)]).filter((n) => n != null)
      : [master.rawStart.getDay()];
    const week0 = startOfWeek(master.rawStart);
    const cursor = new Date(master.rawStart);
    cursor.setHours(master.rawStart.getHours(), master.rawStart.getMinutes(), master.rawStart.getSeconds(), 0);
    let guard = 0;
    while (guard < 800 && emitted < count && cursor.getTime() <= Math.min(until, limit)) {
      const weekIndex = Math.floor((startOfWeek(cursor) - week0) / (7 * 86400000));
      if (weekIndex >= 0 && weekIndex % interval === 0 && byday.includes(cursor.getDay())) {
        if (cursor.getTime() + 1000 >= master.rawStart.getTime()) {
          emitted += 1;
          push(new Date(cursor));
        }
      }
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
    return results;
  }

  push(master.rawStart);
  return results;
}

function parseIcs(text, windowStart, windowEnd) {
  const src = unfold(text);
  if (!/BEGIN:VCALENDAR/i.test(src)) {
    throw new Error('Ye calendar file nahi lag rahi. Secret iCal link paste karo.');
  }
  const start = windowStart || new Date(Date.now() - 60 * 60 * 1000);
  const end = windowEnd || new Date(Date.now() + 36 * 60 * 60 * 1000);
  const blocks = src.split(/BEGIN:VEVENT/i).slice(1);
  const events = [];
  for (const block of blocks) {
    const body = block.split(/END:VEVENT/i)[0];
    const fields = {};
    const extras = [];
    for (const line of body.split('\n')) {
      if (!line.trim()) continue;
      const idx = line.indexOf(':');
      if (idx < 1) continue;
      const { key, params } = parseParams(line.slice(0, idx));
      const value = line.slice(idx + 1).trim();
      if (fields[key]) extras.push({ key, params, value });
      else fields[key] = { params, value };
    }
    if (!fields.DTSTART || !fields.SUMMARY) continue;
    if (fields.STATUS && fields.STATUS.value.toUpperCase() === 'CANCELLED') continue;
    const startParsed = parseDateToken(fields.DTSTART.value, fields.DTSTART.params);
    if (!startParsed) continue;
    let endDate = null;
    if (fields.DTEND) {
      const endParsed = parseDateToken(fields.DTEND.value, fields.DTEND.params);
      endDate = endParsed ? endParsed.date : null;
      if (startParsed.allDay && endDate) endDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 18, 0, 0, 0);
    } else if (fields.DURATION) {
      const dur = fields.DURATION.value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (dur) {
        const ms = ((+dur[1] || 0) * 3600 + (+dur[2] || 0) * 60 + (+dur[3] || 0)) * 1000;
        endDate = new Date(startParsed.date.getTime() + ms);
      }
    }
    const exdates = new Set();
    const exLines = [fields.EXDATE, ...extras.filter((e) => e.key === 'EXDATE')].filter(Boolean);
    for (const ex of exLines) {
      for (const piece of ex.value.split(',')) {
        const parsed = parseDateToken(piece, ex.params);
        if (parsed) exdates.add(parsed.date.getTime());
      }
    }
    const uid = (fields.UID && fields.UID.value) || `ics-${startParsed.date.toISOString()}-${fields.SUMMARY.value}`;
    events.push(
      ...expandEvent(
        {
          uid,
          title: unescapeText(fields.SUMMARY.value) || 'Meeting',
          rawStart: startParsed.date,
          end: endDate,
          allDay: startParsed.allDay,
          rrule: parseRrule(fields.RRULE && fields.RRULE.value),
          exdates,
        },
        start,
        end
      )
    );
  }
  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  return events;
}

async function fetchIcs(url) {
  const clean = String(url || '').trim().replace(/^webcal:\/\//i, 'https://').replace(/&amp;/g, '&');
  if (!/^https:\/\//i.test(clean)) throw new Error('Calendar link https se shuru honi chahiye.');
  const response = await fetch(clean, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Parcel/1.0' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Calendar link nahi khuli (${response.status}).`);
  const text = await response.text();
  return parseIcs(text);
}

module.exports = { parseIcs, fetchIcs, zonedTimeToUtc, unescapeText };
