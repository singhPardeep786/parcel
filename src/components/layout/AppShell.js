"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLang } from "@/components/i18n/LanguageProvider";
import styles from "./AppShell.module.scss";

const NAV = [
  { href: "/", key: "upcoming" },
  { href: "/tasks", key: "tasks" },
  { href: "/calendar", key: "calendar" },
];

export default function AppShell({ children }) {
  const pathname = usePathname();
  const { lang, setLang, tr } = useLang();

  return (
    <div className={styles.shell}>
      <aside className={styles.aside}>
        <div className={styles.brand}>
          <strong>Parcel</strong>
          <span>{tr("nextTagline")}</span>
        </div>
        <nav className={styles.nav}>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? styles.active : undefined}
            >
              {tr(item.key)}
            </Link>
          ))}
        </nav>
        <div className={styles.lang}>
          <button type="button" className={lang === "hi" ? styles.on : undefined} onClick={() => setLang("hi")}>
            हिंदी
          </button>
          <button type="button" className={lang === "en" ? styles.on : undefined} onClick={() => setLang("en")}>
            English
          </button>
        </div>
        <Link href="/overlay?demo=1" className={styles.preview}>
          {tr("preview")}
        </Link>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
