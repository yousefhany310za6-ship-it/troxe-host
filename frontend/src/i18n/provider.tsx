"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  type Locale,
  type TranslationKeys,
  getTranslation,
  getLocaleConfig,
  locales,
} from "@/i18n";

interface I18nContextType {
  locale: Locale;
  t: (key: string, fallback?: string) => string;
  setLocale: (locale: Locale) => void;
  dir: "ltr" | "rtl";
  config: ReturnType<typeof getLocaleConfig>;
  availableLocales: typeof locales;
}

const I18nContext = createContext<I18nContextType | null>(null);

const STORAGE_KEY = "troxe-locale";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [translations, setTranslations] = useState<TranslationKeys>(
    getTranslation("en")
  );

  // Load saved locale
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved && saved in locales) {
      setLocaleState(saved);
      setTranslations(getTranslation(saved));
    }
  }, []);

  // Update HTML dir attribute when locale changes
  useEffect(() => {
    const config = getLocaleConfig(locale);
    document.documentElement.dir = config.dir;
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    setTranslations(getTranslation(newLocale));
    localStorage.setItem(STORAGE_KEY, newLocale);
  }, []);

  const t = useCallback(
    (key: string, fallback?: string): string => {
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
    },
    [translations]
  );

  const config = getLocaleConfig(locale);

  return (
    <I18nContext.Provider
      value={{
        locale,
        t,
        setLocale,
        dir: config.dir,
        config,
        availableLocales: locales,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
