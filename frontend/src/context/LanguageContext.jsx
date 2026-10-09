import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LANGS, LANG_NAMES, RTL_LANGS, t as translate, getStoredLang, setStoredLang, guessLang } from "../lib/i18n";

const LanguageContext = createContext(null);

// Whole-app language, available everywhere (signed in or not) so the picker can show
// up as early as the landing page — the "first phase" the person asked for — not
// buried three taps deep in Settings. Persists on this device immediately; when
// someone is signed in, Settings' language control also saves it to their account
// (see useSettings' updatePrefs), so it follows them to their next device too.
export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => getStoredLang() || guessLang());

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL_LANGS.has(lang) ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((next) => {
    if (!LANGS.includes(next)) return;
    setStoredLang(next);
    setLangState(next);
  }, []);

  // For when the server tells us the signed-in account's saved language (e.g. right
  // after Settings loads) — syncs this device to it without a page reload.
  const adoptServerLang = useCallback(
    (serverLang) => {
      if (serverLang && LANGS.includes(serverLang) && serverLang !== lang) setLang(serverLang);
    },
    [lang, setLang]
  );

  const value = useMemo(
    () => ({
      lang,
      setLang,
      adoptServerLang,
      t: (key) => translate(key, lang),
      dir: RTL_LANGS.has(lang) ? "rtl" : "ltr",
      langs: LANGS,
      langNames: LANG_NAMES,
    }),
    [lang, setLang, adoptServerLang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside <LanguageProvider>");
  return ctx;
}
