const test = require('node:test');
const assert = require('node:assert/strict');
const { collectDue, upcoming } = require('./schedule');
const { mapGoogleEvents } = require('./google');

const start = new Date('2026-10-20T10:00:00Z').getTime();

test('fires a lead reminder once and ignores it the second time', () => {
  const items = [{ id: 'm1', title: 'Sync', start: new Date(start).toISOString(), source: 'calendar' }];
  const now = start - 9 * 60 * 1000;
  const first = collectDue({ now, items, leadMinutes: 10, notified: {} });
  assert.equal(first.length, 1);
  assert.equal(first[0].phase, 'lead');
  const second = collectDue({ now, items, leadMinutes: 10, notified: { [first[0].key]: now } });
  assert.equal(second.length, 0);
});

test('fires when the meeting starts and skips snoozed items', () => {
  const items = [{ id: 'm1', title: 'Sync', start: new Date(start).toISOString(), source: 'task' }];
  const atStart = collectDue({ now: start + 1000, items, leadMinutes: 10, notified: {} });
  assert.equal(atStart[0].phase, 'start');
  const snoozed = collectDue({
    now: start + 1000,
    items,
    leadMinutes: 10,
    snooze: { m1: start + 5 * 60 * 1000 },
  });
  assert.equal(snoozed.length, 0);
});

test('catches a short meeting if the lead reminder was missed', () => {
  const items = [{ id: 'm1', title: 'Sync', start: new Date(start).toISOString(), end: new Date(start + 30 * 60 * 1000).toISOString(), source: 'calendar' }];
  const due = collectDue({ now: start + 10 * 60 * 1000, items, leadMinutes: 10 });
  assert.equal(due.length, 1);
  assert.equal(due[0].phase, 'start');
});

test('does not remind long after a meeting started', () => {
  const items = [{ id: 'old', title: 'Old', start: new Date(start).toISOString(), end: new Date(start + 30 * 60 * 1000).toISOString(), source: 'calendar' }];
  const due = collectDue({ now: start + 20 * 60 * 1000, items, leadMinutes: 10 });
  assert.equal(due.length, 0);
});

test('skips all-day and multi-hour blocks', () => {
  const items = [
    { id: 'day', title: 'OOO', allDay: true, start: new Date(start).toISOString(), end: new Date(start + 8 * 60 * 60 * 1000).toISOString() },
    { id: 'long', title: 'Away', start: new Date(start).toISOString(), end: new Date(start + 24 * 60 * 60 * 1000).toISOString() },
  ];
  const due = collectDue({ now: start - 5 * 60 * 1000, items, leadMinutes: 10 });
  assert.equal(due.length, 0);
});

test('can turn off the second reminder at start time', () => {
  const items = [{ id: 'm1', title: 'Sync', start: new Date(start).toISOString() }];
  const due = collectDue({ now: start + 1000, items, leadMinutes: 10, alsoAtStart: false });
  assert.equal(due.length, 0);
});

test('lists what is still ahead', () => {
  const now = start;
  const items = [
    { id: 'past', title: 'Past', start: new Date(start - 3600000).toISOString(), end: new Date(start - 1000).toISOString() },
    { id: 'next', title: 'Next', start: new Date(start + 60000).toISOString(), end: new Date(start + 600000).toISOString() },
  ];
  const list = upcoming(items, now, 8);
  assert.deepEqual(list.map((item) => item.id), ['next']);
});

test('maps google events and drops declined ones', () => {
  const mapped = mapGoogleEvents([
    {
      id: 'a',
      summary: 'Keep',
      status: 'confirmed',
      start: { dateTime: '2026-10-20T10:00:00+05:30' },
      end: { dateTime: '2026-10-20T10:30:00+05:30' },
    },
    {
      id: 'b',
      summary: 'No',
      start: { dateTime: '2026-10-20T11:00:00Z' },
      end: { dateTime: '2026-10-20T11:30:00Z' },
      attendees: [{ self: true, responseStatus: 'declined' }],
    },
    { id: 'c', summary: 'Gone', status: 'cancelled', start: { dateTime: '2026-10-20T12:00:00Z' } },
  ]);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].title, 'Keep');
  assert.equal(mapped[0].id, 'g:a');
});
