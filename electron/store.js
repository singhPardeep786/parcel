const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');
const { pruneMap } = require('./schedule');

const BAKED_EMAIL = 'pardeep.singh@grapesworldwide.com';
const BAKED_FEED = String(require('./feed.json').url || '').trim();

const DEFAULTS = {
  email: '',
  calendarId: '',
  leadMinutes: 10,
  alsoAtStart: true,
  openAtLogin: true,
  language: 'hi',
  updateFeedUrl: '',
  icsUrl: '',
  googleClientId: '',
  googleClientSecret: '',
  googleRefreshToken: '',
  googleConnectedEmail: '',
  tasks: [],
  notified: {},
  snooze: {},
  cachedEvents: [],
  sync: { ok: false, at: 0, error: '', count: 0, source: '' },
  welcomed: false,
};

function filePath() {
  return path.join(app.getPath('userData'), 'parcel-data.json');
}

function seal(value) {
  if (!value) return '';
  if (safeStorage.isEncryptionAvailable()) {
    return `enc:${safeStorage.encryptString(value).toString('base64')}`;
  }
  return `plain:${value}`;
}

function open(value) {
  if (!value) return '';
  if (value.startsWith('enc:')) {
    try {
      return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
    } catch {
      return '';
    }
  }
  if (value.startsWith('plain:')) return value.slice(6);
  return value;
}

let cache = null;

function scrubBakedIdentity(data) {
  const connected = Boolean(data.googleRefreshToken) || Boolean(data.googleConnectedEmail) || Boolean(data.icsUrl);
  if (connected) return false;
  let changed = false;
  if (data.email === BAKED_EMAIL) {
    data.email = '';
    changed = true;
  }
  if (data.calendarId === BAKED_EMAIL) {
    data.calendarId = '';
    changed = true;
  }
  return changed;
}

function load() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
    cache = { ...DEFAULTS, ...raw };
  } catch {
    cache = { ...DEFAULTS };
  }
  let changed = scrubBakedIdentity(cache);
  if (cache.updateFeedUrl) {
    cache.updateFeedUrl = '';
    changed = true;
  }
  if (changed) save();
  return cache;
}

function save() {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, filePath());
}

function get() {
  return load();
}

function publicState() {
  const data = load();
  const now = Date.now();
  return {
    email: data.email,
    calendarId: data.calendarId,
    leadMinutes: data.leadMinutes,
    alsoAtStart: data.alsoAtStart,
    openAtLogin: data.openAtLogin,
    language: data.language === 'en' ? 'en' : 'hi',
    updateFeedUrl: BAKED_FEED,
    version: '',
    icsUrl: open(data.icsUrl),
    googleClientId: data.googleClientId,
    hasGoogleSecret: Boolean(open(data.googleClientSecret)),
    googleConnected: Boolean(open(data.googleRefreshToken)),
    googleConnectedEmail: data.googleConnectedEmail,
    tasks: data.tasks,
    cachedEvents: data.cachedEvents,
    sync: data.sync,
    welcomed: data.welcomed,
    now,
  };
}

function updateSettings(patch) {
  const data = load();
  if (typeof patch.email === 'string' && patch.email.includes('@')) {
    data.email = patch.email.trim();
  }
  if (typeof patch.calendarId === 'string' && patch.calendarId.trim()) {
    data.calendarId = patch.calendarId.trim();
  }
  if (patch.leadMinutes) data.leadMinutes = Number(patch.leadMinutes) || 10;
  if (typeof patch.alsoAtStart === 'boolean') data.alsoAtStart = patch.alsoAtStart;
  if (typeof patch.openAtLogin === 'boolean') data.openAtLogin = patch.openAtLogin;
  if (patch.language === 'en' || patch.language === 'hi') data.language = patch.language;
  if (typeof patch.icsUrl === 'string') data.icsUrl = seal(patch.icsUrl.trim());
  if (typeof patch.googleClientId === 'string') data.googleClientId = patch.googleClientId.trim();
  if (typeof patch.googleClientSecret === 'string' && patch.googleClientSecret.trim()) {
    data.googleClientSecret = seal(patch.googleClientSecret.trim());
  }
  if (typeof patch.welcomed === 'boolean') data.welcomed = patch.welcomed;
  save();
  return publicState();
}

function setGoogleSession({ refreshToken, email, clientId, clientSecret }) {
  const data = load();
  if (refreshToken) data.googleRefreshToken = seal(refreshToken);
  if (email) {
    data.googleConnectedEmail = email;
    data.email = email;
    data.calendarId = email;
  }
  if (clientId) data.googleClientId = clientId;
  if (clientSecret) data.googleClientSecret = seal(clientSecret);
  save();
}

function clearGoogle() {
  const data = load();
  data.googleRefreshToken = '';
  data.googleConnectedEmail = '';
  save();
}

function secrets() {
  const data = load();
  return {
    icsUrl: open(data.icsUrl),
    googleClientId: data.googleClientId,
    googleClientSecret: open(data.googleClientSecret),
    googleRefreshToken: open(data.googleRefreshToken),
    calendarId: data.calendarId || data.email,
    email: data.email,
    leadMinutes: data.leadMinutes,
    alsoAtStart: data.alsoAtStart,
    openAtLogin: data.openAtLogin,
  };
}

function setCachedEvents(events, sync) {
  const data = load();
  data.cachedEvents = events;
  data.sync = sync;
  save();
}

function addTask(task) {
  const data = load();
  data.tasks.push(task);
  save();
  return task;
}

function deleteTask(id) {
  const data = load();
  data.tasks = data.tasks.filter((task) => task.id !== id);
  save();
}

function markNotified(key) {
  const data = load();
  data.notified[key] = Date.now();
  data.notified = pruneMap(data.notified, Date.now(), 14 * 86400000);
  save();
}

function snooze(id, until) {
  const data = load();
  data.snooze[id] = until;
  data.snooze = pruneMap(data.snooze, Date.now(), 7 * 86400000);
  save();
}

module.exports = {
  get,
  publicState,
  updateSettings,
  setGoogleSession,
  clearGoogle,
  secrets,
  setCachedEvents,
  addTask,
  deleteTask,
  markNotified,
  snooze,
};
