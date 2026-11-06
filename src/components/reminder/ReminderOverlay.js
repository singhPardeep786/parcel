"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReminderTimeline } from "@/hooks/useReminderTimeline";
import KratosFrames from "./KratosFrames";
import ReminderBanner from "./ReminderBanner";
import TaskBox from "./TaskBox";
import styles from "./ReminderOverlay.module.scss";

function demoReminder() {
  const start = Date.now() + 8 * 60 * 1000;
  return {
    id: "demo",
    title: "Design review",
    start: new Date(start).toISOString(),
    end: new Date(start + 30 * 60 * 1000).toISOString(),
    source: "calendar",
  };
}

export default function ReminderOverlay({
  reminder,
  autoStart = true,
  fastForwardTo,
  onDismiss,
  onSnooze,
}) {
  const payloadRef = useRef(reminder || demoReminder());
  if (reminder) payloadRef.current = reminder;
  const payload = payloadRef.current;

  const [active, setActive] = useState(Boolean(autoStart));
  const [remainMs, setRemainMs] = useState(0);
  const [bannerReady, setBannerReady] = useState(false);
  const exitActionRef = useRef(null);

  const handleDone = useCallback(() => {
    setActive(false);
    const action = exitActionRef.current;
    exitActionRef.current = null;
    if (action === "snooze") onSnooze?.(payload);
    else if (action === "dismiss") onDismiss?.(payload);
  }, [onDismiss, onSnooze, payload]);

  const { phase, frameIndex, progress, armClose } = useReminderTimeline({
    active,
    onDone: handleDone,
    fastForwardTo,
  });

  useEffect(() => {
    if (autoStart) setActive(true);
  }, [autoStart]);

  useEffect(() => {
    if (!payload?.start) return undefined;
    const tick = () => setRemainMs(new Date(payload.start) - Date.now());
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [payload.start]);

  useEffect(() => {
    if (phase !== "hold") {
      setBannerReady(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setBannerReady(true), 800);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const boxState =
    phase === "hold" || phase === "close"
      ? "broken"
      : phase === "leave" || phase === "done"
        ? "gone"
        : "intact";

  const close = (action) => {
    if (!armClose()) return;
    exitActionRef.current = action;
  };

  return (
    <div className={styles.overlay} data-phase={phase}>
      <KratosFrames
        frameIndex={frameIndex}
        x={progress.x}
        bob={progress.bob}
        scale={progress.scale || 1}
        turn={phase === "close" || phase === "leave"}
      />
      <TaskBox state={boxState} />
      <ReminderBanner
        reminder={payload}
        open={bannerReady}
        shutting={phase === "close"}
        remainMs={remainMs}
        onDismiss={() => close("dismiss")}
        onSnooze={() => close("snooze")}
      />
    </div>
  );
}
