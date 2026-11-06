"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import ReminderOverlay from "@/components/reminder/ReminderOverlay";

function OverlayInner() {
  // Overlay is composited over the desktop, so the page itself must stay transparent.
  useEffect(() => {
    const els = [document.documentElement, document.body];
    const prev = els.map((el) => el.style.background);
    els.forEach((el) => el.style.setProperty("background", "transparent", "important"));
    return () => els.forEach((el, i) => (el.style.background = prev[i]));
  }, []);

  const params = useSearchParams();
  const at = params.get("at");
  const fastForwardTo = at ? Number(at) : undefined;

  const reminder = useMemo(
    () => ({
      id: "demo",
      title: "Design review",
      start: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
      end: new Date(Date.now() + 38 * 60 * 1000).toISOString(),
      source: "calendar",
    }),
    []
  );

  return (
    <ReminderOverlay
      reminder={reminder}
      autoStart
      fastForwardTo={Number.isFinite(fastForwardTo) ? fastForwardTo : undefined}
    />
  );
}

export default function OverlayPage() {
  return (
    <Suspense fallback={null}>
      <OverlayInner />
    </Suspense>
  );
}
