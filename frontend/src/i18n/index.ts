import en from "./locales/en.json";
import ar from "./locales/ar.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";

export type Locale = "en" | "ar" | "es" | "fr" | "de";

export interface LocaleConfig {
  name: string;
  nativeName: string;
  dir: "ltr" | "rtl";
  flag: string;
}

export const locales: Record<Locale, LocaleConfig> = {
  en: { name: "English", nativeName: "English", dir: "ltr", flag: "🇺🇸" },
  ar: { name: "Arabic", nativeName: "العربية", dir: "rtl", flag: "🇸🇦" },
  es: { name: "Spanish", nativeName: "Español", dir: "ltr", flag: "🇪🇸" },
  fr: { name: "French", nativeName: "Français", dir: "ltr", flag: "🇫🇷" },
  de: { name: "German", nativeName: "Deutsch", dir: "ltr", flag: "🇩🇪" },
};

export type TranslationKeys = typeof en;

const translations: Record<Locale, TranslationKeys> = {
  en,
  ar: ar as unknown as TranslationKeys,
  es: es as unknown as TranslationKeys,
  fr: fr as unknown as TranslationKeys,
  de: de as unknown as TranslationKeys,
};

export function getTranslation(locale: Locale): TranslationKeys {
  return translations[locale] || translations.en;
}

export function getLocaleConfig(locale: Locale): LocaleConfig {
  return locales[locale] || locales.en;
}

// Nested key resolver: "servers.title" -> translations.servers.title
export function t(
  translations: TranslationKeys,
  key: string,
  fallback?: string
): string {
  const keys = key.split(".");
  let value: any = translations;

  for (const k of keys) {
    if (value && typeof value === "object" && k in value) {
      value = value[k];
    } else {
      return fallback || key;
    }
  }

  return typeof value === "string" ? value : fallback || key;
}
