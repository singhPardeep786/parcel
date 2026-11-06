const params = new URLSearchParams(location.search);
const demo = params.has("demo");
if (demo) document.body.classList.add("demo");

const FRAME_COUNT = 24;
const FRAMES = Array.from({ length: FRAME_COUNT }, (_, i) => {
  const n = String(i + 1).padStart(3, "0");
  return `../../public/kratos/${n}.webp`;
});

const PHASE_FRAMES = {
  enter: [1, 6],
  spin: [7, 14],
  strike: [15, 21],
  hold: [21, 21],
  close: [6, 6],
  leave: [6, 1],
};

const DUR = {
  enter: 1.4,
  spin: 1.1,
  strike: 1.35,
  close: 0.55,
  leave: 1.35,
};

const NEXT = {
  enter: "spin",
  spin: "strike",
  strike: "hold",
  close: "leave",
  leave: "done",
};

const card = document.getElementById("card");
const frameEl = document.getElementById("frame");
const figure = document.getElementById("figure");
const shadow = document.getElementById("shadow");
const errorEl = document.getElementById("error");

let active = false;
let phase = "idle";
let phaseT = 0;
let closing = false;
let exitAction = "dismiss";
let reminder = null;
let last = 0;
let timer = 0;
let clockTimer = 0;
let bannerTimer = 0;
let frameIndex = 0;
let language = "hi";

function tr(key, vars) {
  return window.PARCEL_COPY ? window.PARCEL_COPY.t(language, key, vars) : key;
}

function applyCopy() {
  language = window.PARCEL_COPY ? window.PARCEL_COPY.normalize(language) : "hi";
  document.documentElement.lang = language === "en" ? "en" : "hi";
  document.getElementById("snooze").textContent = tr("snooze");
  document.getElementById("dismiss").textContent = tr("ok");
  document.querySelector(".credit").textContent = tr("credit");
}

FRAMES.forEach((src) => {
  const img = new Image();
  img.src = src;
});

function showError(message) {
  errorEl.hidden = false;
  errorEl.textContent = message;
}

function smooth(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function frameAtPhase(name, t) {
  const range = PHASE_FRAMES[name] || PHASE_FRAMES.hold;
  const [from, to] = range;
  const duration = DUR[name] || 1;
  if (from === to) return from - 1;
  const reverse = to < from;
  const span = Math.abs(to - from);
  const u = Math.min(1, Math.max(0, t / duration));
  const stepped = Math.round(u * span);
  const frame = reverse ? from - stepped : from + stepped;
  return Math.min(FRAME_COUNT, Math.max(1, frame)) - 1;
}

const LEFT_REST = 2;
const LEFT_OFF = -36;

function pose(name, t) {
  const uEnter = name === "enter" ? smooth(t / DUR.enter) : 1;
  const uLeave = name === "leave" ? smooth(t / DUR.leave) : 0;
  const walking = name === "enter" || name === "leave";
  const steps = name === "enter" ? uEnter : uLeave;
  const x =
    name === "enter"
      ? LEFT_OFF + uEnter * (LEFT_REST - LEFT_OFF)
      : name === "leave"
        ? LEFT_REST + uLeave * (LEFT_OFF - LEFT_REST)
        : LEFT_REST;
  const scale =
    name === "enter" ? 0.62 + uEnter * 0.38 : name === "leave" ? 1 - uLeave * 0.38 : 1;
  return {
    x,
    bob: (walking ? Math.abs(Math.sin(steps * Math.PI * 4)) * 0.025 : 0) + 0.14,
    scale,
  };
}

function hideFigure() {
  figure.style.visibility = "hidden";
}

function parkOffstage() {
  hideFigure();
  phase = "enter";
  phaseT = 0;
  frameIndex = 0;
  frameEl.src = FRAMES[0];
  figure.style.left = "-36vw";
  figure.style.bottom = "14%";
  figure.style.width = "auto";
  figure.style.transform = "scale(0.62)";
  figure.style.transformOrigin = "left bottom";
}

window.parcelPrepare = parkOffstage;

function revealFigure() {
  if (!active || phase === "idle" || phase === "done") return;
  figure.style.visibility = "visible";
}

function render() {
  const p = pose(phase, phaseT);
  frameIndex = frameAtPhase(phase, phaseT);
  frameEl.src = FRAMES[frameIndex];

  const leftVw = p.x;

  figure.style.left = `${leftVw.toFixed(2)}vw`;
  figure.style.bottom = `${(p.bob * 100).toFixed(2)}%`;
  figure.style.width = "auto";
  const turned = phase === "close" || phase === "leave";
  figure.style.transform = `scale(${(p.scale || 1).toFixed(3)}) rotateY(${turned ? 180 : 0}deg)`;
  figure.style.transformOrigin = turned ? "center bottom" : "left bottom";
  figure.dataset.throw = "false";
  shadow.style.left = `${leftVw.toFixed(2)}vw`;
  shadow.style.width = "44px";
}

function openBanner() {
  card.classList.remove("shut");
  card.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => card.classList.add("show"));
}

function shutBanner() {
  card.classList.remove("show");
  card.classList.add("shut");
}

function finishExit() {
  active = false;
  hideFigure();
  card.classList.remove("show", "shut");
  card.setAttribute("aria-hidden", "true");
  const id = reminder && reminder.id;
  if (!window.parcel) return;
  if (exitAction === "snooze") window.parcel.snooze(id);
  else window.parcel.dismiss();
}

function advance(dt) {
  if (phase === "hold" || phase === "idle" || phase === "done") return;
  phaseT += dt;
  if (phaseT < (DUR[phase] || 0)) return;
  const next = NEXT[phase];
  phaseT = 0;
  phase = next;
  if (phase === "hold") {
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(openBanner, 320);
  }
  if (phase === "done") finishExit();
}

function tick() {
  if (!active) return;
  const now = performance.now();
  let remain = Math.min(1, Math.max(0, (now - last) / 1000));
  last = now;
  while (remain > 0 && phase !== "hold" && phase !== "idle" && phase !== "done") {
    const step = Math.min(0.08, remain);
    advance(step);
    remain -= step;
  }
  if (phase === "close" || phase === "retract" || phase === "leave") {
    while (remain > 0 && phase !== "done" && phase !== "idle") {
      const step = Math.min(0.08, remain);
      advance(step);
      remain -= step;
    }
  }
  render();
  timer = setTimeout(tick, 16);
}

function fillCard(payload) {
  document.getElementById("kicker").textContent = payload.source === "task" ? tr("task") : tr("meeting");
  document.getElementById("title").textContent = payload.title || tr("reminder");
  document.getElementById("when").textContent = formatWhen(payload.start, payload.end);
  tickRemain();
}

function formatWhen(start, end) {
  if (!start) return "";
  const s = new Date(start);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const day =
    s.toDateString() === now.toDateString()
      ? tr("today")
      : s.toDateString() === tomorrow.toDateString()
        ? tr("tomorrow")
        : s.toLocaleDateString(language === "en" ? "en-IN" : "hi-IN", { weekday: "short", day: "numeric", month: "short" });
  const time = s.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (!end) return `${day}, ${time}`;
  const endTime = new Date(end).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time} – ${endTime}`;
}

function formatRemain(ms) {
  if (ms <= 15000) return tr("now");
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function tickRemain() {
  if (!reminder) return;
  const ms = new Date(reminder.start) - Date.now();
  document.getElementById("remain").textContent = formatRemain(ms);
  document.getElementById("remain-label").textContent = ms <= 15000 ? tr("startingNow") : tr("untilStart");
}

function begin(payload) {
  if (!payload) return;
  if (payload.language) language = payload.language;
  applyCopy();
  if (window.parcel && payload.key) window.parcel.reminderShown(payload.key);
  reminder = payload;
  active = true;
  closing = false;
  exitAction = "dismiss";
  phase = "enter";
  phaseT = 0;
  card.classList.remove("show", "shut");
  card.setAttribute("aria-hidden", "true");
  fillCard(payload);
  clearInterval(clockTimer);
  clockTimer = setInterval(tickRemain, 250);
  clearTimeout(timer);
  last = performance.now();
  parkOffstage();
  render();
  const walkReady = () => (frameEl.currentSrc || frameEl.src || "").includes("001.webp") && frameEl.naturalWidth > 0;
  if (frameEl.complete && walkReady()) revealFigure();
  else frameEl.addEventListener("load", () => {
    if (walkReady()) revealFigure();
  }, { once: true });
  timer = setTimeout(tick, 16);
}

function armClose(action) {
  if (closing || phase !== "hold") return;
  closing = true;
  exitAction = action;
  shutBanner();
  window.parcel?.setIgnoreMouse(true);
  phase = "close";
  phaseT = 0;
  clearTimeout(timer);
  last = performance.now();
  timer = setTimeout(tick, 16);
}

card.addEventListener("pointerenter", () => {
  window.parcel?.setIgnoreMouse(false);
  window.parcel?.holdOpen();
});
card.addEventListener("pointerleave", () => {
  if (phase !== "hold") return;
  window.parcel?.setIgnoreMouse(true);
  window.parcel?.releaseOpen();
});
document.getElementById("dismiss").addEventListener("click", () => armClose("dismiss"));
document.getElementById("snooze").addEventListener("click", () => armClose("snooze"));

if (window.parcel) {
  window.parcel.onReminder((payload) => begin(payload));
  window.parcel.takePending().then((payload) => {
    if (payload) begin(payload);
  });
}

if (demo) {
  begin({
    id: "demo",
    title: "Design review",
    start: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
    end: new Date(Date.now() + 38 * 60 * 1000).toISOString(),
    source: "calendar",
    phase: "lead",
    preview: true,
  });
}

window.addEventListener("unhandledrejection", (event) => {
  showError(String(event.reason && event.reason.message || event.reason));
});
