const test = require('node:test');
const assert = require('node:assert/strict');
const { parseIcs, zonedTimeToUtc } = require('./ics');

test('converts Asia/Kolkata wall time to UTC', () => {
  const date = zonedTimeToUtc(2026, 9, 20, 15, 30, 0, 'Asia/Kolkata');
  assert.equal(date.toISOString(), '2026-10-20T10:00:00.000Z');
});

test('parses a single timed event with TZID', () => {
  const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:meet-1
SUMMARY:Design review
DTSTART;TZID=Asia/Kolkata:20261020T160000
DTEND;TZID=Asia/Kolkata:20261020T164500
END:VEVENT
END:VCALENDAR`;
  const events = parseIcs(ics, new Date('2026-10-20T00:00:00+05:30'), new Date('2026-10-21T00:00:00+05:30'));
  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'Design review');
  assert.equal(events[0].start, '2026-10-20T10:30:00.000Z');
  assert.equal(events[0].source, 'calendar');
});

test('expands a weekly meeting inside the window', () => {
  const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:weekly-1
SUMMARY:Standup
DTSTART;TZID=Asia/Kolkata:20261020T100000
DTEND;TZID=Asia/Kolkata:20261020T103000
RRULE:FREQ=WEEKLY;BYDAY=TU
END:VEVENT
END:VCALENDAR`;
  const events = parseIcs(ics, new Date('2026-10-20T00:00:00+05:30'), new Date('2026-11-04T00:00:00+05:30'));
  assert.ok(events.length >= 2);
  assert.equal(events[0].title, 'Standup');
  assert.notEqual(events[0].id, events[1].id);
});

test('skips cancelled events and unescapes commas', () => {
  const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:gone
SUMMARY:Cancelled
DTSTART:20261020T120000Z
STATUS:CANCELLED
END:VEVENT
BEGIN:VEVENT
UID:keep
SUMMARY:A\\, B
DTSTART:20261020T130000Z
END:VEVENT
END:VCALENDAR`;
  const events = parseIcs(ics, new Date('2026-10-20T00:00:00Z'), new Date('2026-10-21T00:00:00Z'));
  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'A, B');
});
