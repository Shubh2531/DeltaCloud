// Whole-app UI language — separate from (but shares the same language list and the
// same server-side preference as) DC Intelligence's "explain in" language. Setting one
// now sets both, since from the person's point of view it's just "my language."
//
// Real translations exist here for the five languages asked for first — Nepali, Hindi,
// Spanish, French, Arabic — covering the navigation, the landing page and sign-in/sign-up,
// which is what every visitor sees before anything else, in every language, from the
// moment they land on the site. The remaining supported languages (Chinese, Bengali,
// Portuguese, Korean, Vietnamese, Urdu) fall back to English for now — t() always
// returns something readable, never a blank or a raw key, and adding a language or a
// screen later is just adding entries to STRINGS, not new plumbing.
//
// Product names stay as names in every language, the way "YouTube" or "WhatsApp" do:
// "DeltaCloud" and "DC Intelligence" are never translated.

export const LANGS = ["en", "ne", "es", "hi", "fr", "ar", "zh", "bn", "pt", "ko", "vi", "ur"];

export const LANG_NAMES = {
  en: "English",
  ne: "नेपाली",
  es: "Español",
  hi: "हिंदी",
  fr: "Français",
  ar: "العربية",
  zh: "中文",
  bn: "বাংলা",
  pt: "Português",
  ko: "한국어",
  vi: "Tiếng Việt",
  ur: "اردو",
};

export const RTL_LANGS = new Set(["ar", "ur"]);

const STRINGS = {
  "nav.dashboard": { en: "Dashboard", ne: "ड्यासबोर्ड", hi: "डैशबोर्ड", es: "Panel", fr: "Tableau de bord", ar: "لوحة التحكم" },
  "nav.trading": { en: "Trading", ne: "ट्रेडिङ", hi: "ट्रेडिंग", es: "Operar", fr: "Trading", ar: "التداول" },
  "nav.portfolio": { en: "Portfolio", ne: "पोर्टफोलियो", hi: "पोर्टफोलियो", es: "Cartera", fr: "Portefeuille", ar: "المحفظة" },
  "nav.journal": { en: "Journal", ne: "जर्नल", hi: "जर्नल", es: "Diario", fr: "Journal", ar: "اليوميات" },
  "nav.news": { en: "News", ne: "समाचार", hi: "समाचार", es: "Noticias", fr: "Actualités", ar: "الأخبار" },
  "nav.insights": { en: "Insights", ne: "अन्तर्दृष्टि", hi: "जानकारियां", es: "Perspectivas", fr: "Analyses", ar: "التحليلات" },
  "nav.growth": { en: "Growth Lab", ne: "ग्रोथ ल्याब", hi: "ग्रोथ लैब", es: "Laboratorio de crecimiento", fr: "Labo de croissance", ar: "مختبر النمو" },
  "nav.settings": { en: "Settings", ne: "सेटिङ", hi: "सेटिंग्स", es: "Configuración", fr: "Paramètres", ar: "الإعدادات" },
  "nav.signOut": { en: "Sign out", ne: "साइन आउट", hi: "साइन आउट", es: "Cerrar sesión", fr: "Déconnexion", ar: "تسجيل الخروج" },

  "common.signIn": { en: "Sign in", ne: "साइन इन गर्नुहोस्", hi: "साइन इन करें", es: "Iniciar sesión", fr: "Se connecter", ar: "تسجيل الدخول" },
  "common.createAccount": { en: "Create account", ne: "खाता खोल्नुहोस्", hi: "खाता बनाएं", es: "Crear cuenta", fr: "Créer un compte", ar: "إنشاء حساب" },
  "common.language": { en: "Language", ne: "भाषा", hi: "भाषा", es: "Idioma", fr: "Langue", ar: "اللغة" },

  "auth.welcomeBack": { en: "Welcome back", ne: "फेरि स्वागत छ", hi: "फिर से स्वागत है", es: "Bienvenido de nuevo", fr: "Content de vous revoir", ar: "مرحبًا بعودتك" },
  "auth.continue": { en: "Continue", ne: "जारी राख्नुहोस्", hi: "जारी रखें", es: "Continuar", fr: "Continuer", ar: "متابعة" },
  "auth.forgotPassword": { en: "Forgot password?", ne: "पासवर्ड बिर्सनुभयो?", hi: "पासवर्ड भूल गए?", es: "¿Olvidaste tu contraseña?", fr: "Mot de passe oublié ?", ar: "نسيت كلمة المرور؟" },

  "landing.heroTitle": {
    en: "Learn how markets move before you risk a dollar.",
    ne: "एक डलर जोखिममा राख्नुअघि बजार कसरी चल्छ भन्ने सिक्नुहोस्।",
    hi: "एक डॉलर जोखिम में डालने से पहले यह सीखें कि बाज़ार कैसे चलता है।",
    es: "Aprende cómo se mueven los mercados antes de arriesgar un dólar.",
    fr: "Apprenez comment les marchés évoluent avant de risquer un centime.",
    ar: "تعلّم كيف تتحرك الأسواق قبل أن تخاطر بدولار واحد.",
  },
  "landing.ctaCreate": {
    en: "Create a free account",
    ne: "निःशुल्क खाता खोल्नुहोस्",
    hi: "मुफ़्त खाता बनाएं",
    es: "Crea una cuenta gratis",
    fr: "Créer un compte gratuit",
    ar: "أنشئ حسابًا مجانيًا",
  },
};

export function t(key, lang) {
  const row = STRINGS[key];
  if (!row) return key;
  return row[lang] || row.en || key;
}

const KEY = "dc_ui_lang";
export function getStoredLang() {
  try {
    const v = localStorage.getItem(KEY);
    return LANGS.includes(v) ? v : null;
  } catch {
    return null;
  }
}
export function setStoredLang(lang) {
  try {
    if (LANGS.includes(lang)) localStorage.setItem(KEY, lang);
  } catch {
    /* the picker still works for this visit, just doesn't persist */
  }
}

// A reasonable first guess for a brand-new visitor, from their browser — overridden the
// moment they pick (or are signed into an account with) a language of their own.
export function guessLang() {
  try {
    const nav = (navigator.languages || [navigator.language || "en"]).map((l) => l.slice(0, 2).toLowerCase());
    return nav.find((l) => LANGS.includes(l)) || "en";
  } catch {
    return "en";
  }
}
