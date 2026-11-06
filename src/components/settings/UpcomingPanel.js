"use client";

import { useLang } from "@/components/i18n/LanguageProvider";
import styles from "./panels.module.scss";

const SAMPLE = [
  {
    id: "1",
    title: "Morning Standup",
    when: "Aaj, 11:00 am",
    remain: "18m",
    source: "calendar",
  },
  {
    id: "2",
    title: "Design review",
    when: "Aaj, 10:05 pm",
    remain: "8m",
    source: "calendar",
  },
];

export default function UpcomingPanel() {
  const { tr } = useLang();
  return (
    <section className={styles.panel}>
      <h1>{tr("upcoming")}</h1>
      <p className={styles.lede}>{tr("upcomingLede")}</p>
      <div className={styles.list}>
        {SAMPLE.map((item) => (
          <article key={item.id} className={styles.item}>
            <div>
              <strong>{item.title}</strong>
              <span>{item.when}</span>
            </div>
            <em>{item.remain}</em>
          </article>
        ))}
      </div>
    </section>
  );
}
