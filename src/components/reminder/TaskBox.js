"use client";

import styles from "./TaskBox.module.scss";

const SHARDS = [
  { dx: 0.9, dy: -1.1, rot: 220 },
  { dx: 1.4, dy: -0.8, rot: -160 },
  { dx: 1.9, dy: -1.3, rot: 300 },
  { dx: 0.5, dy: -0.7, rot: -90 },
  { dx: 2.3, dy: -0.6, rot: 140 },
  { dx: 1.1, dy: -1.6, rot: -240 },
];

/**
 * state: "intact" (waiting for the blade), "broken" (shattered, falls forward),
 * "gone" (fades away once Kratos is called back).
 */
export default function TaskBox({ state }) {
  return (
    <div className={styles.box} data-state={state} aria-hidden="true">
      <div className={`${styles.crate} ${styles.whole}`} />
      <div className={`${styles.crate} ${styles.halfL}`} />
      <div className={`${styles.crate} ${styles.halfR}`} />
      {SHARDS.map((s, i) => (
        <span
          key={i}
          className={styles.shard}
          style={{ "--dx": s.dx, "--dy": s.dy, "--rot": `${s.rot}deg` }}
        />
      ))}
    </div>
  );
}
