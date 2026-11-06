"use client";

import { useState } from "react";
import { useLang } from "@/components/i18n/LanguageProvider";
import styles from "./panels.module.scss";

export default function TasksPanel() {
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [tasks, setTasks] = useState([]);
  const { tr } = useLang();

  const addTask = (event) => {
    event.preventDefault();
    if (!title.trim() || !when) return;
    setTasks((prev) => [
      ...prev,
      {
        id: `task_${Date.now()}`,
        title: title.trim(),
        start: when,
      },
    ]);
    setTitle("");
    setWhen("");
  };

  return (
    <section className={styles.panel}>
      <h1>{tr("tasks")}</h1>
      <p className={styles.lede}>{tr("nextTasksLede")}</p>
      <form className={styles.form} onSubmit={addTask}>
        <label>
          {tr("title")}
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr("whatPlaceholder")} />
        </label>
        <label>
          {tr("time")}
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <button type="submit">{tr("addTask")}</button>
      </form>
      <div className={styles.list}>
        {tasks.length === 0 ? (
          <p className={styles.empty}>{tr("noTasks")}</p>
        ) : (
          tasks.map((task) => (
            <article key={task.id} className={styles.item}>
              <div>
                <strong>{task.title}</strong>
                <span>{new Date(task.start).toLocaleString("en-IN")}</span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
