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
  transferred: 0,
  total: 0,
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
  return String(baked.url || '').trim().replace(/\/+$/, '');
}

function fileSize(info) {
  const files = info && info.files || [];
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const ext = process.platform === 'darwin' ? '.zip' : process.platform === 'win32' ? '.exe' : '.AppImage';
  const nameOf = (file) => String((file && (file.url || file.path)) || '');
  const match = files.find((file) => nameOf(file).includes(arch) && nameOf(file).endsWith(ext))
    || files.find((file) => nameOf(file).endsWith(ext))
    || files[0];
  return Number(match && match.size) || 0;
}

function publish(patch) {
  Object.assign(snapshot, patch);
  hooks.send({ ...snapshot, feed: feedUrl() });
}

function wire() {
  if (wired) return;
  wired = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('checking-for-update', () => publish({ status: 'checking', error: '', percent: 0, transferred: 0 }));
  autoUpdater.on('update-available', (info) => {
    const version = info && info.version || '';
    publish({ status: 'available', available: version, error: '', percent: 0, transferred: 0, total: fileSize(info) });
    if (version && promptedFor !== `available:${version}`) {
      promptedFor = `available:${version}`;
      hooks.openSettings();
    }
  });
  autoUpdater.on('update-not-available', () => publish({ status: 'none', error: '', available: '', percent: 0, transferred: 0 }));
  autoUpdater.on('download-progress', (progress) => {
    const transferred = Number(progress && progress.transferred) || 0;
    const total = Number(progress && progress.total) || snapshot.total || 0;
    const percent = total ? (transferred / total) * 100 : Number(progress && progress.percent) || 0;
    publish({ status: 'downloading', percent, transferred, total, error: '' });
  });
  autoUpdater.on('update-downloaded', (info) => {
    const version = info && info.version || snapshot.available;
    const total = snapshot.total || fileSize(info);
    publish({ status: 'downloaded', available: version, percent: 100, transferred: total, total, error: '' });
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
  if (snapshot.status === 'available' || snapshot.status === 'downloading' || snapshot.status === 'downloaded') {
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
  if (snapshot.status === 'downloading') return snapshot;
  if (snapshot.status !== 'available') return snapshot;
  publish({ status: 'downloading', percent: 0, transferred: 0, error: '' });
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
