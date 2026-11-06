"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { KRATOS_FRAMES } from "@/lib/kratosFrames";
import styles from "./KratosFrames.module.scss";

/** x is the figure's left edge in vw; frames keep their natural aspect ratio. */
export default function KratosFrames({ frameIndex = 0, x = 0, bob = 0.14, scale = 1, turn = false }) {
  const bottom = `${(bob * 100).toFixed(2)}%`;
  const src = KRATOS_FRAMES[frameIndex] || KRATOS_FRAMES[0];
  const [shownSrc, setShownSrc] = useState("");

  useEffect(() => {
    KRATOS_FRAMES.forEach((url) => {
      const img = new window.Image();
      img.src = url;
    });
  }, []);

  useLayoutEffect(() => {
    const img = new window.Image();
    const mark = () => setShownSrc(src);
    img.onload = mark;
    img.src = src;
    if (img.complete && img.naturalWidth > 0) mark();
  }, [src]);

  return (
    <div className={styles.stage} aria-hidden="true">
      <div
        className={styles.figure}
        style={{
          left: `${x.toFixed(2)}vw`,
          bottom,
          transform: `scale(${scale}) rotateY(${turn ? 180 : 0}deg)`,
          transformOrigin: turn ? "center bottom" : "left bottom",
          visibility: shownSrc === src ? "visible" : "hidden",
        }}
      >
        <img src={src} alt="" className={styles.frame} draggable={false} />
      </div>
    </div>
  );
}
