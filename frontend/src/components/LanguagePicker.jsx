import { useLanguage } from "../context/LanguageContext";

// A small "pick your language" control meant to show up as early as possible — the
// landing page, sign in, sign up — not buried in Settings, so a new visitor from
// Nepal, India, France or anywhere else can read the app in their own language from
// the very first screen. Also used (in a fuller form) inside Settings.
export default function LanguagePicker({ compact = true, className = "" }) {
  const { lang, setLang, langs, langNames, t } = useLanguage();
  return (
    <label className={`lang-picker ${compact ? "lang-picker-compact" : ""} ${className}`.trim()}>
      {!compact && <span className="settings-field-label">{t("common.language")}</span>}
      <select
        className="input"
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        aria-label={t("common.language")}
      >
        {langs.map((code) => (
          <option key={code} value={code}>
            {langNames[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
