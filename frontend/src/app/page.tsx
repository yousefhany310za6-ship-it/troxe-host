"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function Home() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      {/* Language switcher */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      <div className="text-center space-y-8 px-4">
        <div className="space-y-2">
          <h1 className="text-5xl font-bold text-brand-400 tracking-tight">
            Troxe Host
          </h1>
          <p className="text-xl text-muted-foreground">
            {t("nav.dashboard")} - {t("servers.title")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="p-6 rounded-xl bg-card border border-border">
            <div className="text-3xl mb-3">🎮</div>
            <h3 className="font-semibold text-lg mb-2">
              {t("dashboard.totalServers")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("servers.egg")}, {t("servers.node")}, {t("nav.locations")}
            </p>
          </div>
          <div className="p-6 rounded-xl bg-card border border-border">
            <div className="text-3xl mb-3">🔒</div>
            <h3 className="font-semibold text-lg mb-2">
              {t("system.health")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("subusers.permissions")}, {t("auth.enable2fa")},{" "}
              {t("activity.title")}
            </p>
          </div>
          <div className="p-6 rounded-xl bg-card border border-border">
            <div className="text-3xl mb-3">🎨</div>
            <h3 className="font-semibold text-lg mb-2">{t("themes.title")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("themes.createTheme")}, {t("nav.eggs")},{" "}
              {t("dashboard.quickActions")}
            </p>
          </div>
        </div>

        <div className="flex gap-4 justify-center">
          <Link
            href="/auth/login"
            className="px-8 py-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium transition-colors"
          >
            {t("auth.login")}
          </Link>
          <Link
            href="/auth/register"
            className="px-8 py-3 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-medium transition-colors"
          >
            {t("auth.register")}
          </Link>
        </div>

        <p className="text-sm text-muted-foreground">v0.1.0</p>
      </div>
    </div>
  );
}
