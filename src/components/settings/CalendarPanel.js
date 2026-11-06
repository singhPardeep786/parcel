"use client";

import { useLang } from "@/components/i18n/LanguageProvider";
import styles from "./panels.module.scss";

export default function CalendarPanel() {
  const { tr } = useLang();
  return (
    <section className={styles.panel}>
      <h1>{tr("calendar")}</h1>
      <p className={styles.lede}>{tr("nextCalendarLede")}</p>
      <div className={styles.cardish}>
        <label>
          {tr("clientId")}
          <input placeholder="xxxx.apps.googleusercontent.com" disabled />
        </label>
        <p className={styles.hint}>{tr("nextGoogleHint")}</p>
      </div>
    </section>
  );
}
