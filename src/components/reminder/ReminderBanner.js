"use client";

import { formatRemain, formatWhen } from "@/lib/formatTime";
import { useLang } from "@/components/i18n/LanguageProvider";
import styles from "./ReminderBanner.module.scss";

export default function ReminderBanner({
  reminder,
  open,
  shutting,
  remainMs,
  onDismiss,
  onSnooze,
}) {
  const { lang, tr } = useLang();
  if (!reminder) return null;

  const className = [
    styles.card,
    open ? styles.show : "",
    shutting ? styles.shut : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={className} aria-hidden={!(open || shutting)}>
      <p className={styles.kicker}>{reminder.source === "task" ? tr("task") : tr("meeting")}</p>
      <h2 className={styles.title}>{reminder.title || tr("reminder")}</h2>
      <p className={styles.when}>{formatWhen(reminder.start, reminder.end, lang)}</p>
      <div className={styles.remain}>
        <strong>{formatRemain(remainMs, lang)}</strong>
        <span>{remainMs <= 15000 ? tr("startingNow") : tr("untilStart")}</span>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.snooze} onClick={onSnooze}>
          {tr("snooze")}
        </button>
        <button type="button" className={styles.dismiss} onClick={onDismiss}>
          {tr("ok")}
        </button>
      </div>
      <p className={styles.credit}>{tr("credit")}</p>
    </article>
  );
}
