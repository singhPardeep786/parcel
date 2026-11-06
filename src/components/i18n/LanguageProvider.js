"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { t } from "@/lib/copy";

const LanguageContext = createContext({
  lang: "hi",
  setLang: () => {},
  tr: (key) => key,
});

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState("hi");

  useEffect(() => {
    const saved = window.localStorage.getItem("parcel-language");
    if (saved === "en" || saved === "hi") setLangState(saved);
  }, []);

  const setLang = (next) => {
    const value = next === "en" ? "en" : "hi";
    setLangState(value);
    window.localStorage.setItem("parcel-language", value);
    document.documentElement.lang = value === "en" ? "en" : "hi";
  };

  const value = useMemo(
    () => ({
      lang,
      setLang,
      tr: (key, vars) => t(lang, key, vars),
    }),
    [lang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  return useContext(LanguageContext);
}
