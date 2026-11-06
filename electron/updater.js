const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const store = require('./store');
const { t } = require('../src/lib/copy');
const baked = require('./feed.json');

const snapshot = {
  status: 'idle',
  version: '',
  available: '',
  percent: 0,
  error: '',
};

let hooks = {
  allowQuit: () => {},
  settingsWindow: () => null,
  openSettings: () => {},
  send: () => {},
};
let wired = false;
let promptedFor = '';

function lang() {
  return store.get().language === 'en' ? 'en' : 'hi';
}

function briefUpdateError(error) {
  const status = Number(error && (error.statusCode || error.status)) || 0;
  const raw = String((error && error.message) || error || '');
  if (status === 404 || /\b404\b/.test(raw) || /Cannot find channel/i.test(raw)) return 'missing';
  const line = raw.split('\n').map((part) => part.trim()).find(Boolean) || '';
  return line.replace(/\s*Headers:[\s\S]*$/i, '').replace(/^HttpError:\s*/i, '').slice(0, 160);
}

function feedUrl() {
  const saved = String(store.get().updateFeedUrl || '').trim();
  if (saved) return saved.replace(/\/+$/, '');
  return String(baked.url || '').trim().replace(/\/+$/, '');
}

function publish(patch) {
  Object.assign(snapshot, patch);
  hooks.send({ ...snapshot, feed: feedUrl() });
}

function wire() {
  if (wired) return;
  wired = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => publish({ status: 'checking', error: '', percent: 0 }));
  autoUpdater.on('update-available', (info) => {
    publish({ status: 'available', available: info && info.version || '', error: '' });
  });
  autoUpdater.on('update-not-available', () => publish({ status: 'none', error: '', available: '' }));
  autoUpdater.on('download-progress', (progress) => {
    publish({ status: 'downloading', percent: Math.round(progress && progress.percent || 0) });
  });
  autoUpdater.on('update-downloaded', (info) => {
    const version = info && info.version || snapshot.available;
    publish({ status: 'downloaded', available: version, percent: 100, error: '' });
    promptInstall(version);
  });
  autoUpdater.on('error', (error) => {
    publish({ status: 'error', error: briefUpdateError(error) });
  });
}

function promptInstall(version) {
  if (!version || promptedFor === version) return;
  promptedFor = version;
  const win = hooks.settingsWindow();
  const options = {
    type: 'info',
    buttons: [t(lang(), 'installUpdate'), t(lang(), 'later')],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    message: t(lang(), 'updateReady'),
    detail: t(lang(), 'updateReadyDetail', { version }),
  };
  const prompt = win && !win.isDestroyed() ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
  prompt.then(({ response }) => {
    if (response === 0) install();
    else hooks.openSettings();
  }).catch(() => {});
}

function check() {
  wire();
  snapshot.version = app.getVersion();
  if (!app.isPackaged) {
    publish({ status: 'dev', error: '', version: snapshot.version });
    return snapshot;
  }
  const url = feedUrl();
  if (!url) {
    publish({ status: 'no-feed', error: '' });
    return snapshot;
  }
  try {
    autoUpdater.setFeedURL({ provider: 'generic', url });
    publish({ status: 'checking', error: '' });
    autoUpdater.checkForUpdates().catch((error) => {
      publish({ status: 'error', error: briefUpdateError(error) });
    });
  } catch (error) {
    publish({ status: 'error', error: briefUpdateError(error) });
  }
  return snapshot;
}

function download() {
  wire();
  if (snapshot.status !== 'available' && snapshot.status !== 'downloading') return snapshot;
  autoUpdater.downloadUpdate().catch((error) => {
    publish({ status: 'error', error: briefUpdateError(error) });
  });
  return snapshot;
}

function install() {
  if (snapshot.status !== 'downloaded') return snapshot;
  hooks.allowQuit();
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return snapshot;
}

function start(nextHooks) {
  hooks = { ...hooks, ...nextHooks };
  snapshot.version = app.getVersion();
  wire();
}

function status() {
  snapshot.version = app.getVersion();
  return { ...snapshot, feed: feedUrl() };
}

module.exports = { start, check, download, install, status, feedUrl };
