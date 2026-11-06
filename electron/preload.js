const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('parcel', {
  platform: process.platform,
  getState: () => ipcRenderer.invoke('get-state'),
  saveSettings: (patch) => ipcRenderer.invoke('save-settings', patch),
  addTask: (task) => ipcRenderer.invoke('add-task', task),
  deleteTask: (id) => ipcRenderer.invoke('delete-task', id),
  preview: () => ipcRenderer.invoke('preview'),
  updateStatus: () => ipcRenderer.invoke('update-status'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
  syncNow: () => ipcRenderer.invoke('sync-now'),
  connectGoogle: (payload) => ipcRenderer.invoke('connect-google', payload),
  disconnectGoogle: () => ipcRenderer.invoke('disconnect-google'),
  listCalendars: () => ipcRenderer.invoke('list-calendars'),
  takePending: () => ipcRenderer.invoke('take-pending'),
  onReminder: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('reminder', listener);
    return () => ipcRenderer.removeListener('reminder', listener);
  },
  reminderShown: (key) => ipcRenderer.send('reminder-shown', key),
  dismiss: () => ipcRenderer.send('overlay-done'),
  snooze: (id) => ipcRenderer.send('snooze', id),
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  holdOpen: () => ipcRenderer.send('hold-open'),
  releaseOpen: () => ipcRenderer.send('release-open'),
});
