const { app, BrowserWindow, Tray, Menu, ipcMain, screen, shell, nativeImage, powerMonitor } = require('electron');
const http = require('http');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const store = require('./store');
const { fetchIcs } = require('./ics');
const google = require('./google');
const { collectDue, upcoming, isRemindable, nextAlarm } = require('./schedule');
const { t } = require('../src/lib/copy');
const updates = require('./updater');
const { encodePNG, paintTray } = require('./png');
const fs = require('fs');

const PLATFORM = process.platform;

function trace(message) {
  try {
    fs.appendFileSync(path.join(os.tmpdir(), 'parcel-overlay.log'), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // logging must not break reminders
  }
}

if (PLATFORM === 'win32') app.setAppUserModelId('com.parcel.app');
if (PLATFORM === 'linux') app.commandLine.appendSwitch('enable-transparent-visuals');
app.commandLine.appendSwitch('disable-features', 'OverlayScrollbar');

const ROOT = path.join(__dirname, '..');
let settingsWin = null;
let overlayWin = null;
let tray = null;
let quitting = false;
let showing = false;
let pendingReminder = null;
let queue = [];
let overlayReady = false;
let tickTimer = null;
let alarmTimer = null;
let hideTimer = null;
let accessCache = { token: '', expiry: 0 };

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

function modelFileUrl() {
  // Frame sprites live under public/kratos; query kept for compatibility.
  const file = path.join(ROOT, 'public', 'kratos', '001.webp');
  return pathToFileURL(file).href;
}

function createSettings() {
  if (settingsWin) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 860,
    minHeight: 620,
    show: false,
    title: 'Parcel',
    icon: path.join(ROOT, 'assets', 'icon.png'),
    backgroundColor: '#f3efe7',
    ...(PLATFORM === 'darwin'
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 } }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  settingsWin.loadFile(path.join(ROOT, 'electron', 'ui', 'settings.html'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      settingsWin.hide();
    }
  });
}

function createOverlay() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  overlayWin = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: true,
    show: false,
    backgroundColor: '#00000000',
    roundedCorners: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.webContents.setBackgroundThrottling(false);
  overlayWin.webContents.on('console-message', (_event, _level, message) => {
    trace(`overlay ${message}`);
  });
  overlayWin.webContents.on('did-fail-load', (_event, code, description) => {
    trace(`fail-load ${code} ${description}`);
  });
  overlayWin.webContents.on('render-process-gone', (_event, details) => {
    trace(`gone ${details && details.reason}`);
  });
  overlayWin.loadFile(path.join(ROOT, 'electron', 'ui', 'overlay.html'), { query: { model: modelFileUrl() } });
  overlayWin.webContents.on('did-finish-load', () => {
    overlayReady = true;
    trace('overlay loaded');
  });
}

function placeOverlay() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  overlayWin.setBounds(display.bounds);
}

async function buildItems() {
  const secrets = store.secrets();
  let events = [];
  let source = '';
  try {
    if (secrets.googleRefreshToken && secrets.googleClientId) {
      const token = await ensureAccess();
      events = await google.fetchAllEvents(token);
      source = 'google';
    } else if (secrets.icsUrl) {
      events = await fetchIcs(secrets.icsUrl);
      source = 'ics';
    } else {
      store.setCachedEvents([], { ok: true, at: Date.now(), error: '', count: 0, source: '' });
      const tasks = (store.get().tasks || []).map((task) => ({ ...task, source: 'task' }));
      return tasks;
    }
    store.setCachedEvents(events, {
      ok: true,
      at: Date.now(),
      error: '',
      count: events.length,
      source,
    });
  } catch (error) {
    const cached = store.get().cachedEvents || [];
    store.setCachedEvents(cached, {
      ok: false,
      at: Date.now(),
      error: error.message || 'Calendar sync fail',
      count: cached.length,
      source: store.get().sync.source || source,
    });
    events = cached;
  }
  const tasks = (store.get().tasks || []).map((task) => ({ ...task, source: 'task' }));
  return [...events, ...tasks];
}

async function ensureAccess() {
  if (accessCache.token && accessCache.expiry > Date.now() + 30000) return accessCache.token;
  const secrets = store.secrets();
  const refreshed = await google.refreshAccess({
    clientId: secrets.googleClientId,
    clientSecret: secrets.googleClientSecret,
    refreshToken: secrets.googleRefreshToken,
  });
  accessCache = {
    token: refreshed.access_token,
    expiry: Date.now() + (refreshed.expires_in || 3600) * 1000,
  };
  return accessCache.token;
}

function armHide(ms) {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(finishOverlay, ms);
}

function revealOverlay() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  placeOverlay();
  try {
    if (PLATFORM === 'darwin' && app.isHidden()) app.show();
    if (PLATFORM === 'darwin') app.focus({ steal: true });
    else app.focus();
    overlayWin.show();
    const level = PLATFORM === 'darwin' ? 'pop-up-menu' : 'screen-saver';
    overlayWin.setAlwaysOnTop(true, level);
    overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWin.setAlwaysOnTop(true, level);
    overlayWin.moveTop();
    overlayWin.setIgnoreMouseEvents(true, { forward: true });
    trace(`shown visible=${overlayWin.isVisible()} ready=${overlayReady}`);
  } catch (error) {
    trace(`reveal ${error && error.message}`);
  }
}

function present(item, { preview = false } = {}) {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  showing = true;
  pendingReminder = { ...item, preview, language: (store.get().language === 'en' ? 'en' : 'hi') };
  const send = () => {
    if (!overlayWin || overlayWin.isDestroyed() || !pendingReminder) return;
    const parked = overlayWin.webContents.executeJavaScript('window.parcelPrepare && window.parcelPrepare()');
    Promise.resolve(parked).catch(() => {}).then(() => {
      if (!overlayWin || overlayWin.isDestroyed() || !pendingReminder) return;
      revealOverlay();
      overlayWin.webContents.send('reminder', pendingReminder);
    });
    trace(`sent ${pendingReminder && pendingReminder.title}`);
    setTimeout(() => {
      if (!overlayWin || overlayWin.isDestroyed()) return;
      overlayWin.webContents.executeJavaScript(`({parcel:typeof window.parcel,err:(document.getElementById('error')||{}).textContent||'',card:(document.getElementById('card')||{}).className||'',w:innerWidth,h:innerHeight,canvas:!!document.getElementById('view')})`).then((info) => {
        trace(`dom ${JSON.stringify(info)}`);
      }).catch((error) => trace(`js ${error.message}`));
    }, 700);
  };
  if (overlayReady) setTimeout(send, 80);
  else overlayWin.webContents.once('did-finish-load', () => setTimeout(send, 80));
  armHide(90000);
}

function armAlarm(items, leadMinutes) {
  clearTimeout(alarmTimer);
  const at = nextAlarm(items, Date.now(), leadMinutes);
  if (!at) return;
  const delay = Math.min(at - Date.now(), 30 * 60 * 1000);
  alarmTimer = setTimeout(() => {
    tick().catch((error) => console.error(error));
  }, Math.max(500, delay));
}

function pump() {
  if (showing || queue.length === 0) return;
  present(queue.shift());
}

function finishOverlay() {
  if (!showing && !pendingReminder) return;
  showing = false;
  pendingReminder = null;
  clearTimeout(hideTimer);
  if (overlayWin) {
    overlayWin.hide();
    overlayWin.setIgnoreMouseEvents(true, { forward: true });
  }
  setTimeout(pump, 400);
}

async function tick() {
  const items = await buildItems();
  const data = store.get();
  const due = collectDue({
    now: Date.now(),
    items,
    leadMinutes: data.leadMinutes,
    alsoAtStart: data.alsoAtStart,
    notified: data.notified,
    snooze: data.snooze,
  });
  const remindable = items.filter((item) => isRemindable(item) && new Date(item.end || item.start) > Date.now());
  const nextAt = nextAlarm(items, Date.now(), data.leadMinutes);
  const nextMin = nextAt ? Math.round((nextAt - Date.now()) / 60000) : null;
  trace(`tick due=${due.map((item) => `${item.title}:${item.phase}`).join('|')} tasks=${items.filter((item) => item.source === 'task').length} events=${items.filter((item) => item.source !== 'task').length} remindable=${remindable.length} nextMin=${nextMin}`);
  armAlarm(items, data.leadMinutes);
  const pendingKey = pendingReminder && pendingReminder.key;
  for (const item of due) {
    if (item.key === pendingKey) continue;
    if (queue.some((queued) => queued.key === item.key)) continue;
    queue.push(item);
  }
  const next = upcoming(items, Date.now(), 12);
  if (app.dock) {
    const soon = next.filter((item) => new Date(item.start) - Date.now() < 60 * 60 * 1000).length;
    app.dock.setBadge(soon ? String(soon) : '');
  }
  if (tray) tray.setToolTip(next.length ? `Parcel — ${next.length} aane wale` : 'Parcel');
  pump();
}

async function preview() {
  const items = [...(store.get().cachedEvents || []), ...(store.get().tasks || []).map((task) => ({ ...task, source: 'task' }))];
  const next = upcoming(items, Date.now(), 1)[0];
  const item = next || {
    id: 'preview',
    title: 'Design review',
    start: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
    end: new Date(Date.now() + 38 * 60 * 1000).toISOString(),
    source: 'calendar',
    phase: 'lead',
  };
  if (showing) queue.unshift({ ...item, phase: item.phase || 'lead', preview: true });
  else present({ ...item, phase: item.phase || 'lead' }, { preview: true });
}

function waitForOAuthCode(port, redirectPath) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (url.pathname !== redirectPath) {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;background:#241c16;color:#f6f1e8;font-family:-apple-system,sans-serif"><div style="text-align:center"><h1 style="font-weight:560;letter-spacing:-0.03em">${t(lang(), 'oauthTitle')}</h1><p>${t(lang(), 'oauthBody')}</p></div></body>`);
      server.close();
      const error = url.searchParams.get('error');
      if (error) reject(new Error(error));
      else resolve(url.searchParams.get('code'));
    });
    server.listen(port, '127.0.0.1', () => {});
    server.on('error', reject);
    setTimeout(() => {
      server.close();
      reject(new Error(t(lang(), 'errOAuthTimeout')));
    }, 180000);
  });
}

function lang() {
  return store.get().language === 'en' ? 'en' : 'hi';
}

function appMenuItems() {
  return [
    { label: t(lang(), 'openParcel'), click: () => createSettings() },
    { label: t(lang(), 'preview'), click: () => preview() },
    { label: t(lang(), 'checkUpdate'), click: () => updates.check() },
    { type: 'separator' },
    {
      label: t(lang(), 'quit'),
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ];
}

function installMenu() {
  const template = [
    {
      label: 'Parcel',
      submenu: [
        { label: t(lang(), 'openParcel'), click: () => createSettings() },
        { label: t(lang(), 'preview'), click: () => preview() },
        { label: t(lang(), 'checkUpdate'), click: () => updates.check() },
        { type: 'separator' },
        { role: 'quit', label: t(lang(), 'quit') },
      ],
    },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function trayImage() {
  if (PLATFORM === 'darwin') {
    const image = nativeImage.createFromBuffer(encodePNG(44, paintTray));
    image.setTemplateImage(true);
    return image;
  }
  const icon = nativeImage.createFromPath(path.join(ROOT, 'assets', 'icon.png'));
  const size = PLATFORM === 'win32' ? 16 : 22;
  return icon.isEmpty() ? nativeImage.createFromBuffer(encodePNG(size, paintTray)) : icon.resize({ width: size, height: size });
}

function applyLoginItem() {
  if (!app.isPackaged) return;
  try {
    const settings = { openAtLogin: Boolean(store.get().openAtLogin) };
    if (PLATFORM === 'win32') settings.path = process.execPath;
    app.setLoginItemSettings(settings);
  } catch (error) {
    trace(`login-item ${error && error.message}`);
  }
}

function installTray() {
  tray = new Tray(trayImage());
  tray.setToolTip('Parcel');
  tray.setContextMenu(Menu.buildFromTemplate(appMenuItems()));
  tray.on('click', () => createSettings());
}

app.on('second-instance', () => createSettings());

app.whenReady().then(() => {
  const icon = nativeImage.createFromPath(path.join(ROOT, 'assets', 'icon.png'));
  if (!icon.isEmpty() && app.dock) app.dock.setIcon(icon);
  installMenu();
  installTray();
  createOverlay();
  if (!app.isPackaged || !store.get().welcomed) createSettings();
  store.updateSettings({ welcomed: true });
  applyLoginItem();
  tickTimer = setInterval(() => {
    tick().catch((error) => console.error(error));
  }, 30000);
  setTimeout(() => {
    tick().catch((error) => console.error(error));
  }, 1500);
  powerMonitor.on('resume', () => {
    tick().catch((error) => console.error(error));
  });
  updates.start({
    allowQuit: () => {
      quitting = true;
    },
    settingsWindow: () => settingsWin,
    openSettings: () => createSettings(),
    send: (payload) => {
      if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('update-status', payload);
    },
  });
  setTimeout(() => updates.check(), 4000);
  setInterval(() => updates.check(), 30 * 60 * 1000);
});

app.on('activate', () => createSettings());
app.on('before-quit', () => {
  quitting = true;
});
app.on('window-all-closed', () => {});

ipcMain.handle('get-state', () => {
  const state = store.publicState();
  const items = [...state.cachedEvents, ...state.tasks.map((task) => ({ ...task, source: 'task' }))];
  return { ...state, version: app.getVersion(), upcoming: upcoming(items, Date.now(), 12) };
});

ipcMain.handle('save-settings', (_event, patch) => {
  const state = store.updateSettings(patch || {});
  installMenu();
  if (tray) tray.setContextMenu(Menu.buildFromTemplate(appMenuItems()));
  applyLoginItem();
  accessCache = { token: '', expiry: 0 };
  tick().catch((error) => console.error(error));
  return state;
});

ipcMain.handle('add-task', (_event, task) => {
  const title = String(task && task.title || '').trim();
  const start = new Date(task && task.start);
  if (!title) throw new Error(t(lang(), 'errTitle'));
  if (Number.isNaN(start.getTime())) throw new Error(t(lang(), 'errTime'));
  if (start.getTime() < Date.now() - 60 * 1000) throw new Error(t(lang(), 'errFuture'));
  const saved = store.addTask({
    id: `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: title.slice(0, 140),
    start: start.toISOString(),
    end: new Date(start.getTime() + 30 * 60 * 1000).toISOString(),
    source: 'task',
  });
  tick().catch((error) => console.error(error));
  return saved;
});

ipcMain.handle('delete-task', (_event, id) => {
  store.deleteTask(id);
  return true;
});

ipcMain.handle('preview', () => preview());
ipcMain.handle('update-status', () => updates.status());
ipcMain.handle('check-for-updates', () => updates.check());
ipcMain.handle('download-update', () => updates.download());
ipcMain.handle('pause-update', () => updates.pause());
ipcMain.handle('resume-update', () => updates.resume());
ipcMain.handle('install-update', () => updates.install());
ipcMain.handle('sync-now', () => tick());
ipcMain.handle('take-pending', () => pendingReminder);

ipcMain.handle('disconnect-google', () => {
  store.clearGoogle();
  accessCache = { token: '', expiry: 0 };
  return store.publicState();
});

ipcMain.handle('list-calendars', async () => {
  const secrets = store.secrets();
  if (!secrets.googleRefreshToken) return [];
  const token = await ensureAccess();
  return google.calendarList(token);
});

ipcMain.handle('connect-google', async (_event, payload) => {
  const clientId = String(payload && payload.clientId || store.secrets().googleClientId || '').trim();
  const clientSecret = String(payload && payload.clientSecret || '').trim() || store.secrets().googleClientSecret;
  if (!clientId) throw new Error(t(lang(), 'errClient'));
  const port = 47821;
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const codePromise = waitForOAuthCode(port, '/callback');
  await shell.openExternal(google.authUrl({ clientId, redirectUri }));
  const code = await codePromise;
  const tokens = await google.exchangeCode({ clientId, clientSecret, code, redirectUri });
  if (!tokens.refresh_token) throw new Error(t(lang(), 'errRefresh'));
  const email = await google.accountEmail(tokens.access_token);
  store.setGoogleSession({ refreshToken: tokens.refresh_token, email, clientId, clientSecret });
  accessCache = { token: tokens.access_token, expiry: Date.now() + (tokens.expires_in || 3600) * 1000 };
  const calendars = await google.calendarList(tokens.access_token);
  await tick();
  return { email, calendars, state: store.publicState() };
});

ipcMain.on('reminder-shown', (_event, key) => {
  if (key) store.markNotified(key);
});

ipcMain.on('overlay-done', () => finishOverlay());
ipcMain.on('hold-open', () => clearTimeout(hideTimer));
ipcMain.on('release-open', () => {
  if (showing) armHide(25000);
});
ipcMain.on('snooze', (_event, id) => {
  const previewing = pendingReminder && pendingReminder.preview;
  if (!previewing && id && id !== 'preview') store.snooze(id, Date.now() + 5 * 60 * 1000);
  finishOverlay();
});
ipcMain.on('set-ignore-mouse', (event, ignore) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
});
