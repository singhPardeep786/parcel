const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

function mapGoogleEvents(items) {
  const events = [];
  for (const event of items || []) {
    if (!event || event.status === 'cancelled') continue;
    if (event.eventType === 'outOfOffice' || event.eventType === 'focusTime' || event.eventType === 'workingLocation') continue;
    const self = (event.attendees || []).find((a) => a.self);
    if (self && self.responseStatus === 'declined') continue;
    const allDay = Boolean(event.start && event.start.date && !event.start.dateTime);
    let start;
    let end;
    if (allDay) {
      const [y, m, d] = event.start.date.split('-').map(Number);
      start = new Date(y, m - 1, d, 9, 0, 0, 0);
      if (event.end && event.end.date) {
        const [ey, em, ed] = event.end.date.split('-').map(Number);
        end = new Date(ey, em - 1, ed, 18, 0, 0, 0);
      } else {
        end = new Date(start.getTime() + 8 * 60 * 60 * 1000);
      }
    } else if (event.start && event.start.dateTime) {
      start = new Date(event.start.dateTime);
      end = event.end && event.end.dateTime ? new Date(event.end.dateTime) : new Date(start.getTime() + 30 * 60 * 1000);
    } else {
      continue;
    }
    events.push({
      id: `g:${event.id}`,
      title: event.summary || 'Meeting',
      start: start.toISOString(),
      end: end.toISOString(),
      allDay,
      source: 'calendar',
    });
  }
  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  return events;
}

function authUrl({ clientId, redirectUri }) {
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ].join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

async function exchangeCode({ clientId, clientSecret, code, redirectUri }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  if (clientSecret) body.set('client_secret', clientSecret);
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(20000),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error_description || json.error || 'Google sign-in fail');
  return json;
}

async function refreshAccess({ clientId, clientSecret, refreshToken }) {
  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  if (clientSecret) body.set('client_secret', clientSecret);
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(20000),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error_description || json.error || 'Google token refresh fail');
  return json;
}

async function googleFetch(url, accessToken) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20000),
  });
  const json = await response.json();
  if (!response.ok) {
    const err = new Error(json.error && json.error.message ? json.error.message : 'Google Calendar error');
    err.status = response.status;
    throw err;
  }
  return json;
}

async function accountEmail(accessToken) {
  const json = await googleFetch('https://www.googleapis.com/oauth2/v2/userinfo', accessToken);
  return json.email || '';
}

async function calendarList(accessToken) {
  const json = await googleFetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader', accessToken);
  return (json.items || []).map((item) => ({
    id: item.id,
    summary: item.summary || item.id,
    primary: Boolean(item.primary),
  }));
}

async function fetchAllEvents(accessToken) {
  let calendars = [];
  try {
    calendars = await calendarList(accessToken);
  } catch {
    calendars = [];
  }
  const ids = calendars.map((item) => item.id).filter(Boolean);
  if (!ids.length) ids.push('primary');
  const batches = await Promise.all(ids.map((calendarId) => fetchEvents({ accessToken, calendarId }).catch(() => [])));
  const seen = new Set();
  const events = [];
  for (const batch of batches) {
    for (const event of batch) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      events.push(event);
    }
  }
  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  return events;
}

async function fetchEvents({ accessToken, calendarId }) {
  const id = encodeURIComponent(calendarId || 'primary');
  const timeMin = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${id}/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=50`;
  const json = await googleFetch(url, accessToken);
  return mapGoogleEvents(json.items);
}

module.exports = {
  mapGoogleEvents,
  authUrl,
  exchangeCode,
  refreshAccess,
  accountEmail,
  calendarList,
  fetchEvents,
  fetchAllEvents,
};
