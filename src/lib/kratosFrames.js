export const KRATOS_FRAME_COUNT = 24;

export const KRATOS_FRAMES = Array.from({ length: KRATOS_FRAME_COUNT }, (_, index) => {
  const n = String(index + 1).padStart(3, "0");
  return `/kratos/${n}.webp`;
});

/** Serial ranges for reminder phases (1-based inclusive). */
export const PHASE_FRAMES = {
  enter: [1, 6],
  spin: [7, 14],
  strike: [15, 21],
  hold: [21, 21],
  close: [6, 6],
  leave: [6, 1],
};

export const PHASE_DURATION = {
  enter: 1.4,
  spin: 1.1,
  strike: 1.35,
  close: 0.55,
  leave: 1.35,
};

export const PHASE_ORDER = {
  enter: "spin",
  spin: "strike",
  strike: "hold",
  close: "leave",
  leave: "done",
};

export function frameAtPhase(phase, phaseT) {
  const range = PHASE_FRAMES[phase] || PHASE_FRAMES.hold;
  const [from, to] = range;
  const duration = PHASE_DURATION[phase] || 1;
  if (from === to) return from - 1;

  const reverse = to < from;
  const start = from;
  const end = to;
  const span = Math.abs(end - start);
  const t = Math.min(1, Math.max(0, phaseT / duration));
  const stepped = Math.round(t * span);
  const frame = reverse ? start - stepped : start + stepped;
  return Math.min(KRATOS_FRAME_COUNT, Math.max(1, frame)) - 1;
}

export function smooth(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}
