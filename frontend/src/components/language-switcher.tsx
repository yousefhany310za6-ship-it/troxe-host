"use client";

import { useI18n } from "@/i18n/provider";
import { locales, type Locale } from "@/i18n";

export function LanguageSwitcher() {
  const { locale, setLocale, availableLocales } = useI18n();

  return (
    <div className="relative group">
      <button className="flex items-center gap-2 px-3 py-2 rounded-xl glass-card text-sm transition-all duration-200 hover:bg-white/[0.06]">
        <span className="text-lg">{availableLocales[locale].flag}</span>
        <span className="hidden sm:inline text-foreground">
          {availableLocales[locale].nativeName}
        </span>
        <svg
          className="w-4 h-4 text-muted-foreground transition-transform group-hover:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      <div className="absolute right-0 top-full mt-2 w-48 glass-card rounded-xl shadow-glass opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
        <div className="p-1">
          {(Object.keys(availableLocales) as Locale[]).map((lang) => (
            <button
              key={lang}
              onClick={() => setLocale(lang)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                locale === lang
                  ? "bg-brand-600/15 text-brand-400 border border-brand-500/20"
                  : "hover:bg-white/[0.04] text-foreground border border-transparent"
              }`}
            >
              <span className="text-lg">{availableLocales[lang].flag}</span>
              <div className="flex flex-col items-start">
                <span className="font-medium">
                  {availableLocales[lang].nativeName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {availableLocales[lang].name}
                </span>
              </div>
              {locale === lang && (
                <svg
                  className="w-4 h-4 ml-auto text-brand-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
