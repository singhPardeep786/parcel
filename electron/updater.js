const { app, dialog } = require('electron');
const { autoUpdater, CancellationToken } = require('electron-updater');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
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
  bytesPerSecond: 0,
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
let downloadToken = null;
let downloadedFile = '';

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

function isCancel(error) {
  const name = String((error && (error.name || error.code)) || '');
  return name === 'CancellationError' || /cancelled/i.test(String((error && error.message) || error || ''));
}

function feedUrl() {
  return String(baked.url || '').trim().replace(/\/+$/, '');
}

function ensureAppUpdateConfig() {
  if (!app.isPackaged) return;
  const target = path.join(process.resourcesPath, 'app-update.yml');
  if (fs.existsSync(target)) return;
  const body = [
    'provider: generic',
    `url: ${feedUrl()}/`,
    'updaterCacheDirName: parcel-updater',
    '',
  ].join('\n');
  try {
    fs.writeFileSync(target, body);
  } catch {
    // Resources may be locked; setFeedURL still carries the feed.
  }
}

function fileName(file) {
  const raw = String((file && (file.url || file.path || file.name)) || '');
  try {
    return decodeURIComponent(raw.split('/').pop().split('?')[0] || '');
  } catch {
    return raw;
  }
}

function isNewer(remote, local) {
  const left = String(remote || '').split('.').map((n) => Number(n) || 0);
  const right = String(local || '').split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i += 1) {
    if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) > (right[i] || 0);
  }
  return false;
}

function fileSize(info) {
  const files = Array.isArray(info && info.files) ? info.files : [];
  if (!files.length) return Number(info && info.size) || 0;
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const ranked = files.map((file) => {
    const name = fileName(file).toLowerCase();
    const size = Number(file && file.size) || 0;
    let score = -1;
    if (process.platform === 'darwin') {
      if (name.includes(`-${arch}.zip`)) score = 4;
      else if (name.endsWith('.zip') && !/-x64\.zip$/.test(name) && !/-arm64\.zip$/.test(name)) score = 1;
    } else if (process.platform === 'win32') {
      if (name.includes(`-${arch}.exe`)) score = 4;
      // Skip fat/universal installers that bundle every arch.
      else if (name.endsWith('.exe') && !/-x64\.exe$/.test(name) && !/-arm64\.exe$/.test(name) && !/-ia32\.exe$/.test(name)) score = 0;
    } else if (arch === 'arm64') {
      if (name.includes('arm64') && name.endsWith('.appimage')) score = 4;
    } else if ((name.includes('x86_64') || name.includes('-x64')) && name.endsWith('.appimage')) {
      score = 4;
    }
    return { size, score };
  }).filter((row) => row.score > 0).sort((a, b) => b.score - a.score);
  return ranked.length ? ranked[0].size : 0;
}

function publish(patch) {
  Object.assign(snapshot, patch);
  hooks.send({ ...snapshot, feed: feedUrl() });
}

function wire() {
  if (wired) return;
  wired = true;
  ensureAppUpdateConfig();
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('checking-for-update', () => publish({ status: 'checking', error: '', percent: 0, transferred: 0, bytesPerSecond: 0 }));
  autoUpdater.on('update-available', (info) => {
    const version = info && info.version || '';
    const current = app.getVersion();
    if (!isNewer(version, current)) {
      promptedFor = '';
      publish({ status: 'none', available: '', version: current, error: '', percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 });
      return;
    }
    publish({
      status: 'available',
      available: version,
      version: current,
      error: '',
      percent: 0,
      transferred: 0,
      total: fileSize(info),
      bytesPerSecond: 0,
    });
    if (version && promptedFor !== `available:${version}`) {
      promptedFor = `available:${version}`;
      hooks.openSettings();
    }
  });
  autoUpdater.on('update-not-available', () => publish({ status: 'none', error: '', available: '', percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 }));
  autoUpdater.on('download-progress', (progress) => {
    if (snapshot.status === 'paused') return;
    const transferred = Number(progress && progress.transferred) || 0;
    // Prefer the live download Content-Length so the bar matches the file actually being fetched.
    const liveTotal = Number(progress && progress.total) || 0;
    const total = liveTotal > 0 ? liveTotal : snapshot.total || 0;
    const percent = total ? (transferred / total) * 100 : Number(progress && progress.percent) || 0;
    const bytesPerSecond = Number(progress && progress.bytesPerSecond) || 0;
    publish({ status: 'downloading', percent, transferred, total, bytesPerSecond, error: '' });
  });
  autoUpdater.on('update-downloaded', (info) => {
    downloadToken = null;
    downloadedFile = String((info && info.downloadedFile) || '') || findDownloadedZip();
    const version = info && info.version || snapshot.available;
    const total = snapshot.total || fileSize(info);
    publish({ status: 'downloaded', available: version, percent: 100, transferred: total, total, bytesPerSecond: 0, error: '' });
    promptInstall(version);
  });
  autoUpdater.on('error', (error) => {
    if (isCancel(error) || snapshot.status === 'paused') return;
    downloadToken = null;
    publish({ status: 'error', error: briefUpdateError(error), bytesPerSecond: 0 });
  });
}

function findDownloadedZip() {
  if (downloadedFile && fs.existsSync(downloadedFile)) return downloadedFile;
  const pending = path.join(app.getPath('cache'), 'parcel-reminder-updater', 'pending');
  if (!fs.existsSync(pending)) return '';
  const zip = fs.readdirSync(pending)
    .filter((name) => name.toLowerCase().endsWith('.zip'))
    .map((name) => path.join(pending, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  return zip || '';
}

function installMacUnsigned() {
  const zip = findDownloadedZip();
  if (!zip) {
    publish({ status: 'error', error: 'Update file missing', bytesPerSecond: 0 });
    return;
  }
  const appPath = app.getPath('exe').includes('.app/')
    ? app.getPath('exe').replace(/\/Contents\/MacOS\/[^/]+$/, '')
    : '/Applications/Parcel.app';
  const script = path.join(os.tmpdir(), `parcel-install-${Date.now()}.sh`);
  const body = `#!/bin/bash
set -euo pipefail
ZIP=${JSON.stringify(zip)}
APP=${JSON.stringify(appPath)}
TMP="$(mktemp -d /tmp/parcel-update.XXXXXX)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT
while pgrep -f "/Contents/MacOS/Parcel" >/dev/null 2>&1; do sleep 0.4; done
sleep 1
ditto -x -k "$ZIP" "$TMP"
NEW="$(find "$TMP" -maxdepth 3 -type d -name "Parcel.app" | head -n 1)"
if [ -z "$NEW" ]; then exit 1; fi
rm -rf "$APP"
ditto "$NEW" "$APP"
xattr -cr "$APP" || true
open "$APP"
`;
  fs.writeFileSync(script, body, { mode: 0o755 });
  const child = spawn('/bin/bash', [script], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  app.quit();
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
  if (snapshot.status === 'downloading' || snapshot.status === 'paused' || snapshot.status === 'downloaded') {
    return snapshot;
  }
  const url = feedUrl();
  if (!url) {
    publish({ status: 'no-feed', error: '' });
    return snapshot;
  }
  try {
    ensureAppUpdateConfig();
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
  if (snapshot.status !== 'available' && snapshot.status !== 'paused') return snapshot;
  downloadToken = new CancellationToken();
  publish({ status: 'downloading', error: '', bytesPerSecond: 0 });
  autoUpdater.downloadUpdate(downloadToken).catch((error) => {
    if (isCancel(error) || snapshot.status === 'paused') {
      publish({ status: 'paused', bytesPerSecond: 0, error: '' });
      return;
    }
    publish({ status: 'error', error: briefUpdateError(error), bytesPerSecond: 0 });
  });
  return snapshot;
}

function pause() {
  if (snapshot.status !== 'downloading') return snapshot;
  publish({ status: 'paused', bytesPerSecond: 0, error: '' });
  if (downloadToken) downloadToken.cancel();
  downloadToken = null;
  return snapshot;
}

function resume() {
  if (snapshot.status !== 'paused') return snapshot;
  return download();
}

function install() {
  if (snapshot.status !== 'downloaded') return snapshot;
  hooks.allowQuit();
  setImmediate(() => {
    // Unsigned mac builds cannot use Squirrel.Mac / ShipIt — it fails code signature checks.
    if (process.platform === 'darwin') installMacUnsigned();
    else autoUpdater.quitAndInstall(false, true);
  });
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

module.exports = { start, check, download, pause, resume, install, status, feedUrl };
