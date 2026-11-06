function createMock() {
  const state = {
    email: '',
    calendarId: '',
    leadMinutes: 10,
    alsoAtStart: true,
    openAtLogin: true,
    language: 'hi',
    updateFeedUrl: 'https://parcel-bj9e.vercel.app/',
    version: '1.0.0',
    icsUrl: '',
    googleClientId: '',
    hasGoogleSecret: false,
    googleConnected: false,
    googleConnectedEmail: '',
    tasks: [],
    cachedEvents: [],
    upcoming: [],
    sync: { ok: true, at: 0, error: '', count: 0, source: '' },
  };
  function refresh() {
    state.upcoming = [...state.cachedEvents, ...state.tasks].sort((a, b) => new Date(a.start) - new Date(b.start));
  }
  return {
    getState: async () => state,
    saveSettings: async (patch) => {
      Object.assign(state, patch);
      return state;
    },
    addTask: async (task) => {
      state.tasks.push({
        id: `task_${Date.now()}`,
        title: task.title,
        start: new Date(task.start).toISOString(),
        end: new Date(new Date(task.start).getTime() + 1800000).toISOString(),
        source: 'task',
      });
      refresh();
      return state.tasks.at(-1);
    },
    deleteTask: async (id) => {
      state.tasks = state.tasks.filter((task) => task.id !== id);
      refresh();
    },
    preview: async () => {},
    updateStatus: async () => ({ status: 'dev', version: '1.0.0', available: '', percent: 0, error: '' }),
    checkForUpdates: async () => ({ status: 'dev', version: '1.0.0' }),
    downloadUpdate: async () => ({ status: 'dev' }),
    installUpdate: async () => {},
    onUpdateStatus: () => () => {},
    syncNow: async () => state,
    connectGoogle: async () => { throw new Error('Google sign-in app ke andar hi chalta hai.'); },
    disconnectGoogle: async () => {
      state.googleConnected = false;
      return state;
    },
    listCalendars: async () => [],
  };
}

const api = window.parcel || createMock();
if (api.platform && api.platform !== 'darwin') document.body.classList.add('native-frame');
let state = null;
let calendars = [];

function tr(key, vars) {
  const lang = state && state.language === 'en' ? 'en' : 'hi';
  return window.PARCEL_COPY ? window.PARCEL_COPY.t(lang, key, vars) : key;
}

function applyChrome() {
  const lang = state && state.language === 'en' ? 'en' : 'hi';
  document.documentElement.lang = lang === 'en' ? 'en' : 'hi';
  const tag = document.querySelector('.brand span');
  if (tag) tag.textContent = tr('tagline');
  const tabs = { upcoming: 'upcoming', tasks: 'tasks', calendar: 'calendar', guide: 'guide' };
  Object.entries(tabs).forEach(([name, key]) => {
    const button = document.querySelector(`nav button[data-tab="${name}"]`);
    if (button) button.textContent = tr(key);
  });
  const preview = document.getElementById('preview');
  if (preview) preview.textContent = tr('preview');
  paintUpdate();
  document.querySelectorAll('#lang-switch button').forEach((button) => {
    button.classList.toggle('on', button.dataset.lang === lang);
  });
}

const panels = {
  upcoming: document.getElementById('upcoming'),
  tasks: document.getElementById('tasks'),
  calendar: document.getElementById('calendar'),
  guide: document.getElementById('guide'),
};

function formatWhen(iso) {
  const date = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const time = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const lang = state && state.language === 'en' ? 'en' : 'hi';
  const day = date.toDateString() === now.toDateString()
    ? tr('today')
    : date.toDateString() === tomorrow.toDateString()
      ? tr('tomorrow')
      : date.toLocaleDateString(lang === 'en' ? 'en-IN' : 'hi-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day}, ${time}`;
}

function relative(iso) {
  const ms = new Date(iso) - Date.now();
  if (ms < 0) return tr('now');
  const min = Math.round(ms / 60000);
  if (min < 1) return tr('inOneMin');
  if (min < 60) return tr('inMin', { n: min });
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? tr('inHours', { h, m: rest }) : tr('inHoursOnly', { h });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function syncLine() {
  if (!state) return '';
  if (state.sync && state.sync.error) return `<p class="status bad">${escapeHtml(state.sync.error)}</p>`;
  if (state.sync && state.sync.source) {
    const when = state.sync.at ? new Date(state.sync.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '';
    const via = state.sync.source === 'google' ? tr('viaGoogle') : tr('viaIcs');
    return `<p class="status">${escapeHtml(tr('syncLine', { via, count: state.sync.count, when }))}</p>`;
  }
  return `<p class="status">${escapeHtml(tr('notLinked'))}</p>`;
}

function renderUpcoming() {
  const items = state.upcoming || [];
  panels.upcoming.innerHTML = `
    <h1>${escapeHtml(tr('upcoming'))}</h1>
    <p class="lede">${escapeHtml(tr('upcomingLede'))}</p>
    ${syncLine()}
    ${items.length ? `<div class="list">${items.map((item) => `
      <article class="row">
        <div>
          <b>${escapeHtml(item.title)}</b><br>
          <small><span class="badge">${item.source === 'task' ? escapeHtml(tr('task')) : escapeHtml(tr('meeting'))}</span>${escapeHtml(relative(item.start))}</small>
        </div>
        <div class="when">${escapeHtml(formatWhen(item.start))}${item.source === 'task' ? `<br><button class="link" data-delete="${escapeHtml(item.id)}">${escapeHtml(tr('remove'))}</button>` : ''}</div>
      </article>`).join('')}</div>` : `<div class="empty">${escapeHtml(tr('emptyUpcoming'))}</div>`}
  `;
}

function renderTasks() {
  panels.tasks.innerHTML = `
    <h1>${escapeHtml(tr('tasks'))}</h1>
    <p class="lede">${escapeHtml(tr('tasksLede'))}</p>
    <form id="task-form">
      <label for="title">${escapeHtml(tr('what'))}</label>
      <input id="title" name="title" maxlength="140" placeholder="${escapeHtml(tr('whatPlaceholder'))}" required />
      <label for="when">${escapeHtml(tr('when'))}</label>
      <input id="when" name="when" type="datetime-local" required />
      <p class="status" id="task-error"></p>
      <div class="form-actions"><button class="primary" type="submit">${escapeHtml(tr('add'))}</button></div>
    </form>
    <div class="list">${(state.tasks || []).map((task) => `
      <article class="row">
        <div><b>${escapeHtml(task.title)}</b><br><small>${escapeHtml(formatWhen(task.start))}</small></div>
        <button class="ghost" data-delete="${escapeHtml(task.id)}">${escapeHtml(tr('remove'))}</button>
      </article>`).join('') || ''}</div>
  `;
  const form = document.getElementById('task-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    try {
      await api.addTask({ title: data.get('title'), start: data.get('when') });
      await reload();
    } catch (error) {
      document.getElementById('task-error').textContent = error.message || String(error);
    }
  });
}

function renderCalendar() {
  const options = calendars.map((cal) => `<option value="${escapeHtml(cal.id)}" ${cal.id === state.calendarId ? 'selected' : ''}>${escapeHtml(cal.summary)}</option>`).join('');
  panels.calendar.innerHTML = `
    <h1>${escapeHtml(tr('calendar'))}</h1>
    <p class="lede">${escapeHtml(tr('calendarLede'))}</p>
    <form id="cal-form">
      <label for="email">${escapeHtml(tr('email'))}</label>
      <input id="email" name="email" type="email" value="${escapeHtml(state.email || '')}" required />
      <label for="lead">${escapeHtml(tr('lead'))}</label>
      <select id="lead" name="lead">
        ${[1, 5, 10, 15, 30].map((n) => `<option value="${n}" ${Number(state.leadMinutes) === n ? 'selected' : ''}>${escapeHtml(tr('minutesBefore', { n }))}</option>`).join('')}
      </select>
      <div class="checks">
        <label class="check">
          <input id="at-start" name="atStart" type="checkbox" ${state.alsoAtStart ? 'checked' : ''} />
          <span class="box" aria-hidden="true"></span>
          <span>${escapeHtml(tr('alsoAtStart'))}</span>
        </label>
        <label class="check">
          <input id="login" name="login" type="checkbox" ${state.openAtLogin ? 'checked' : ''} />
          <span class="box" aria-hidden="true"></span>
          <span>${escapeHtml(tr('openAtLogin'))}</span>
        </label>
      </div>
      <label for="feed">${escapeHtml(tr('updateFeed'))}</label>
      <input id="feed" name="feed" type="url" value="${escapeHtml(state.updateFeedUrl || 'https://parcel-bj9e.vercel.app/')}" readonly tabindex="-1" aria-readonly="true" />
      <p class="hint">${escapeHtml(tr('updateFeedHint'))}</p>
      <label for="ics">${escapeHtml(tr('ics'))}</label>
      <textarea id="ics" name="ics" placeholder="https://calendar.google.com/calendar/ical/.../basic.ics">${escapeHtml(state.icsUrl || '')}</textarea>
      <p class="hint">${escapeHtml(tr('icsHint', { email: state.email || '' }))}</p>
      ${syncLine()}
      <div class="form-actions">
        <button class="ghost" type="button" id="sync">${escapeHtml(tr('sync'))}</button>
        <button class="primary" type="submit">${escapeHtml(tr('save'))}</button>
      </div>
    </form>
    <details>
      <summary>${escapeHtml(tr('googleJoin'))}</summary>
      <div class="card">
        <p class="hint">${escapeHtml(tr('googleHint'))}</p>
        <label for="client">${escapeHtml(tr('clientId'))}</label>
        <input id="client" value="${escapeHtml(state.googleClientId || '')}" placeholder="....apps.googleusercontent.com" />
        <label for="secret">${escapeHtml(tr('clientSecret'))}</label>
        <input id="secret" type="password" placeholder="${escapeHtml(state.hasGoogleSecret ? tr('secretSaved') : tr('clientSecret'))}" />
        ${state.googleConnected ? `<p class="status">${escapeHtml(tr('connected', { email: state.googleConnectedEmail || state.email }))}</p>` : ''}
        ${options ? `<label for="which">${escapeHtml(tr('whichCalendar'))}</label><select id="which" class="cal-list">${options}</select>` : ''}
        <div class="form-actions">
          ${state.googleConnected ? `<button class="ghost" type="button" id="disconnect">${escapeHtml(tr('disconnect'))}</button>` : ''}
          <button class="primary" type="button" id="connect">${escapeHtml(tr('connect'))}</button>
        </div>
        <p class="status" id="google-error"></p>
      </div>
    </details>
  `;

  document.getElementById('cal-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    const email = String(data.get('email') || '').trim();
    const picked = document.getElementById('which');
    await api.saveSettings({
      email,
      calendarId: picked ? picked.value : email,
      leadMinutes: Number(data.get('lead')),
      alsoAtStart: Boolean(data.get('atStart')),
      openAtLogin: Boolean(data.get('login')),
      icsUrl: String(data.get('ics') || ''),
    });
    await reload();
  });
  document.getElementById('sync').addEventListener('click', async () => {
    await api.syncNow();
    await reload();
  });
  const connect = document.getElementById('connect');
  if (connect) {
    connect.addEventListener('click', async () => {
      const err = document.getElementById('google-error');
      err.textContent = tr('browserOpening');
      try {
        await api.connectGoogle({
          clientId: document.getElementById('client').value,
          clientSecret: document.getElementById('secret').value,
        });
        await reload();
      } catch (error) {
        err.textContent = error.message || String(error);
      }
    });
  }
  const disconnect = document.getElementById('disconnect');
  if (disconnect) {
    disconnect.addEventListener('click', async () => {
      await api.disconnectGoogle();
      await reload();
    });
  }
}

function guideSteps(key) {
  const lang = state && state.language === 'en' ? 'en' : 'hi';
  const copy = window.PARCEL_COPY && window.PARCEL_COPY.COPY;
  const table = (copy && (copy[lang] || copy.hi)) || {};
  const steps = table[key];
  return Array.isArray(steps) ? steps : [];
}

function guideList(steps) {
  return `<ol class="guide">${steps.map((step, index) => `
    <li class="guide-step">
      <span class="guide-num">${index + 1}</span>
      <div>
        <b>${escapeHtml(step.title)}</b>
        <p>${escapeHtml(step.body)}</p>
        ${step.image ? `<img src="${escapeHtml(step.image)}" alt="" />` : ''}
      </div>
    </li>`).join('')}</ol>`;
}

function renderGuide() {
  panels.guide.innerHTML = `
    <h1>${escapeHtml(tr('guide'))}</h1>
    <p class="lede">${escapeHtml(tr('guideLede'))}</p>
    <section class="guide-block">
      <h2>${escapeHtml(tr('guideCloud'))}</h2>
      ${guideList(guideSteps('guideOAuth'))}
    </section>
    <section class="guide-block">
      <h2>${escapeHtml(tr('guideEasy'))}</h2>
      ${guideList(guideSteps('guideIcal'))}
    </section>
  `;
}

function layoutScrollbar() {
  const main = document.querySelector('main');
  const bar = document.getElementById('vbar');
  const thumb = document.getElementById('vbar-thumb');
  if (!main || !bar || !thumb) return;
  const overflow = main.scrollHeight - main.clientHeight;
  const needed = overflow > 1;
  bar.classList.toggle('on', needed);
  if (!needed) return;
  const track = bar.clientHeight;
  const thumbH = Math.max(36, Math.round(track * (main.clientHeight / main.scrollHeight)));
  const maxTop = Math.max(1, track - thumbH);
  const top = (main.scrollTop / overflow) * maxTop;
  thumb.style.height = `${thumbH}px`;
  thumb.style.transform = `translateY(${top}px)`;
}

function render() {
  applyChrome();
  renderUpcoming();
  renderTasks();
  renderCalendar();
  renderGuide();
  layoutScrollbar();
}

async function reload() {
  state = await api.getState();
  if (state.googleConnected) {
    try { calendars = await api.listCalendars(); } catch { calendars = []; }
  } else calendars = [];
  render();
}

document.querySelectorAll('nav button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach((item) => item.classList.toggle('active', item === button));
    const tab = button.dataset.tab;
    for (const [name, panel] of Object.entries(panels)) panel.hidden = name !== tab;
    const main = document.querySelector('main');
    if (main) main.scrollTop = 0;
    layoutScrollbar();
  });
});

(function bindScrollbar() {
  const main = document.querySelector('main');
  const bar = document.getElementById('vbar');
  const thumb = document.getElementById('vbar-thumb');
  if (!main || !bar || !thumb) return;
  main.addEventListener('scroll', layoutScrollbar, { passive: true });
  window.addEventListener('resize', layoutScrollbar);
  if (window.ResizeObserver) new ResizeObserver(layoutScrollbar).observe(main);
  bar.addEventListener('pointerdown', (event) => {
    if (event.target === thumb) return;
    const overflow = main.scrollHeight - main.clientHeight;
    const rect = bar.getBoundingClientRect();
    const thumbH = thumb.offsetHeight;
    const maxTop = Math.max(1, rect.height - thumbH);
    const top = Math.min(maxTop, Math.max(0, event.clientY - rect.top - thumbH / 2));
    main.scrollTop = (top / maxTop) * overflow;
  });
  thumb.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    bar.classList.add('drag');
    const startY = event.clientY;
    const startTop = main.scrollTop;
    function move(next) {
      const overflow = main.scrollHeight - main.clientHeight;
      const maxTop = Math.max(1, bar.clientHeight - thumb.offsetHeight);
      main.scrollTop = startTop + ((next.clientY - startY) / maxTop) * overflow;
    }
    function up() {
      bar.classList.remove('drag');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
})();

document.body.addEventListener('click', async (event) => {
  const id = event.target && event.target.dataset && event.target.dataset.delete;
  if (!id) return;
  await api.deleteTask(id);
  await reload();
});

document.getElementById('preview').addEventListener('click', () => api.preview());

let updateState = { status: 'idle', version: '', available: '', percent: 0, error: '' };
let updateOpen = false;
let updateRevealed = false;

function updateLabel() {
  const status = updateState.status;
  if (!updateRevealed) return tr('checkUpdate');
  if (status === 'available') return tr('downloadUpdate');
  if (status === 'downloaded') return tr('installUpdate');
  if (status === 'checking') return tr('updateChecking');
  if (status === 'downloading') return tr('updateDownloading', { percent: updateState.percent || 0 });
  if (status === 'none' || status === 'dev' || status === 'idle' || (status === 'error' && updateState.error === 'missing')) {
    return tr('updateNoneShort');
  }
  if (status === 'no-feed') return tr('updateNoFeed');
  if (status === 'error') return tr('updateError', { error: updateState.error || '' });
  return tr('checkUpdate');
}

function updatePending() {
  const status = updateState.status;
  return status === 'available' || status === 'downloading' || status === 'downloaded';
}

let dismissedUpdate = '';

function paintUpdate(next) {
  if (next) updateState = { ...updateState, ...next };
  const pendingVersion = updateState.available || updateState.status;
  if (updatePending() && dismissedUpdate !== pendingVersion) {
    updateOpen = true;
    updateRevealed = true;
  }
  const dock = document.getElementById('update-dock');
  const button = document.getElementById('update');
  const icon = document.getElementById('update-icon');
  const tip = document.getElementById('update-tip');
  const close = document.getElementById('update-close');
  if (!dock || !button) return;
  dock.classList.toggle('open', updateOpen);
  dock.classList.toggle('pending', updatePending());
  button.textContent = updateLabel();
  button.tabIndex = updateOpen ? 0 : -1;
  if (close) close.tabIndex = updateOpen ? 0 : -1;
  if (icon) icon.setAttribute('aria-label', tr('updatesTip'));
  if (tip) tip.textContent = tr('updatesTip');
  if (close) close.setAttribute('aria-label', tr('updateClose'));
}

document.getElementById('update-icon').addEventListener('click', () => {
  updateOpen = true;
  updateRevealed = updatePending();
  paintUpdate();
});

document.getElementById('update-close').addEventListener('click', () => {
  updateOpen = false;
  updateRevealed = false;
  if (updatePending()) dismissedUpdate = updateState.available || updateState.status;
  paintUpdate();
});

document.getElementById('update').addEventListener('click', async () => {
  if (!updateOpen || !api.checkForUpdates) return;
  if (updateRevealed && updateState.status === 'downloaded' && api.installUpdate) {
    await api.installUpdate();
    return;
  }
  if (updateRevealed && updateState.status === 'available' && api.downloadUpdate) {
    paintUpdate(await api.downloadUpdate());
    return;
  }
  updateRevealed = true;
  paintUpdate({ status: 'checking' });
  paintUpdate(await api.checkForUpdates());
});

if (api.onUpdateStatus) {
  api.onUpdateStatus((payload) => paintUpdate(payload));
}
if (api.updateStatus) {
  api.updateStatus().then((payload) => paintUpdate(payload)).catch(() => {});
}

document.querySelectorAll('#lang-switch button').forEach((button) => {
  button.addEventListener('click', async () => {
    await api.saveSettings({ language: button.dataset.lang });
    await reload();
  });
});

reload().catch((error) => {
  panels.upcoming.innerHTML = `<h1>Parcel</h1><p class="status bad">${escapeHtml(error.message || String(error))}</p>`;
});
