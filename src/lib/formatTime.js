import { t } from "@/lib/copy";

export function formatWhen(start, end, lang = "hi") {
  if (!start) return "";
  const s = new Date(start);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const day =
    s.toDateString() === now.toDateString()
      ? t(lang, "today")
      : s.toDateString() === tomorrow.toDateString()
        ? t(lang, "tomorrow")
        : s.toLocaleDateString(lang === "en" ? "en-IN" : "hi-IN", { weekday: "short", day: "numeric", month: "short" });
  const time = s.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (!end) return `${day}, ${time}`;
  const endTime = new Date(end).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time} – ${endTime}`;
}

export function formatRemain(ms, lang = "hi") {
  if (ms <= 15000) return t(lang, "now");
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
