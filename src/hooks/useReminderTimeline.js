"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  PHASE_DURATION,
  PHASE_ORDER,
  frameAtPhase,
  smooth,
} from "@/lib/kratosFrames";

const GROUND = 0.14;
const LEFT_REST = 2; // vw, stays on the left for the whole sequence
const LEFT_OFFSCREEN = -36;

function pose(phaseName, t) {
  const uEnter = phaseName === "enter" ? smooth(t / PHASE_DURATION.enter) : 1;
  const uLeave = phaseName === "leave" ? smooth(t / PHASE_DURATION.leave) : 0;
  const walking = phaseName === "enter" || phaseName === "leave";
  const steps = phaseName === "enter" ? uEnter : uLeave;
  const x =
    phaseName === "enter"
      ? LEFT_OFFSCREEN + uEnter * (LEFT_REST - LEFT_OFFSCREEN)
      : phaseName === "leave"
        ? LEFT_REST + uLeave * (LEFT_OFFSCREEN - LEFT_REST)
        : LEFT_REST;
  const scale =
    phaseName === "enter" ? 0.62 + uEnter * 0.38 : phaseName === "leave" ? 1 - uLeave * 0.38 : 1;
  return {
    x,
    bob: (walking ? Math.abs(Math.sin(steps * Math.PI * 4)) * 0.025 : 0) + GROUND,
    scale,
  };
}

export function useReminderTimeline({ active, onDone, fastForwardTo }) {
  const [phase, setPhase] = useState("idle");
  const [frameIndex, setFrameIndex] = useState(0);
  const [progress, setProgress] = useState({ x: LEFT_OFFSCREEN, bob: GROUND });

  const phaseRef = useRef("idle");
  const phaseTRef = useRef(0);
  const closingRef = useRef(false);
  const lastRef = useRef(0);
  const timerRef = useRef(0);
  const onDoneRef = useRef(onDone);
  const genRef = useRef(0);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const sync = useCallback((phaseName, t) => {
    const nextFrame = frameAtPhase(phaseName, t);
    const nextProgress = pose(phaseName, t);
    setPhase((prev) => (prev === phaseName ? prev : phaseName));
    setFrameIndex((prev) => (prev === nextFrame ? prev : nextFrame));
    setProgress((prev) => {
      if (
        prev.x === nextProgress.x &&
        prev.bob === nextProgress.bob &&
        prev.scale === nextProgress.scale
      ) {
        return prev;
      }
      return nextProgress;
    });
  }, []);

  const armClose = useCallback(() => {
    if (closingRef.current || phaseRef.current !== "hold") return false;
    closingRef.current = true;
    phaseRef.current = "close";
    phaseTRef.current = 0;
    sync("close", 0);
    return true;
  }, [sync]);

  useLayoutEffect(() => {
    window.clearTimeout(timerRef.current);
    const gen = ++genRef.current;

    if (!active) {
      phaseRef.current = "idle";
      closingRef.current = false;
      phaseTRef.current = 0;
      setPhase("idle");
      setFrameIndex(0);
      setProgress({ x: LEFT_OFFSCREEN, bob: GROUND, scale: 0.62 });
      return undefined;
    }

    phaseRef.current = "enter";
    phaseTRef.current = 0;
    closingRef.current = false;
    lastRef.current = performance.now();
    sync("enter", 0);

    const advance = (dt) => {
      let current = phaseRef.current;
      if (current === "hold" || current === "idle" || current === "done") return current;

      phaseTRef.current += dt;
      const limit = PHASE_DURATION[current] || 0;
      if (phaseTRef.current < limit) return current;

      const next = PHASE_ORDER[current];
      phaseTRef.current = 0;
      phaseRef.current = next;
      return next;
    };

    if (typeof fastForwardTo === "number" && fastForwardTo > 0) {
      let left = fastForwardTo;
      while (left > 0) {
        const current = phaseRef.current;
        if (current === "hold" || current === "done") break;
        const step = Math.min(0.05, left);
        advance(step);
        left -= step;
      }
      sync(phaseRef.current, phaseTRef.current);
      lastRef.current = performance.now();
    }

    const tick = () => {
      if (gen !== genRef.current) return;

      const now = performance.now();
      let remain = Math.min(1, Math.max(0, (now - lastRef.current) / 1000));
      lastRef.current = now;

      let current = phaseRef.current;
      while (remain > 0 && current !== "hold" && current !== "idle" && current !== "done") {
        const step = Math.min(0.08, remain);
        current = advance(step);
        remain -= step;
        if (current === "done") {
          sync("done", 0);
          onDoneRef.current?.();
          return;
        }
      }

      if (current !== "idle" && current !== "done") {
        sync(current, phaseTRef.current);
      }

      timerRef.current = window.setTimeout(tick, 16);
    };

    timerRef.current = window.setTimeout(tick, 16);

    return () => {
      genRef.current += 1;
      window.clearTimeout(timerRef.current);
    };
  }, [active, fastForwardTo, sync]);

  return { phase, frameIndex, progress, armClose };
}
