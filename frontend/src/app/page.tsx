"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Server, Shield, Palette } from "lucide-react";

export default function Home() {
  const { t } = useI18n();

  const features = [
    {
      icon: Server,
      title: t("dashboard.totalServers"),
      description: `${t("servers.egg")}, ${t("servers.node")}, ${t("nav.locations")}`,
      gradient: "from-brand-500 to-blue-500",
      glow: "group-hover:shadow-glow-brand",
    },
    {
      icon: Shield,
      title: t("system.health"),
      description: `${t("subusers.permissions")}, ${t("auth.enable2fa")}, ${t("activity.title")}`,
      gradient: "from-emerald-500 to-cyan-500",
      glow: "group-hover:shadow-glow-success",
    },
    {
      icon: Palette,
      title: t("themes.title"),
      description: `${t("themes.createTheme")}, ${t("nav.eggs")}, ${t("dashboard.quickActions")}`,
      gradient: "from-purple-500 to-pink-500",
      glow: "",
    },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
      {/* Background effects */}
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-grid opacity-40" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-600/10 rounded-full blur-[128px] animate-pulse-glow" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-600/8 rounded-full blur-[100px] animate-pulse-glow" style={{ animationDelay: "1.5s" }} />

      {/* Language switcher */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      <div className="relative z-10 text-center space-y-10 px-4 max-w-5xl mx-auto">
        {/* Hero */}
        <div className="space-y-4 animate-fade-in-up">
          <h1 className="text-6xl md:text-7xl font-bold text-gradient tracking-tight">
            Troxe Host
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground font-light">
            {t("nav.dashboard")} — {t("servers.title")}
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
          {features.map((feature, i) => (
            <div
              key={i}
              className={`group relative rounded-2xl glass-card p-7 transition-all duration-300 hover:-translate-y-1 ${feature.glow}`}
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div
                className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} mb-5 shadow-lg`}
              >
                <feature.icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="font-semibold text-lg text-foreground mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* CTA buttons */}
        <div className="flex gap-4 justify-center items-center animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
          <Link
            href="/auth/login"
            className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 via-brand-500 to-purple-500 text-white font-medium shadow-glow-brand hover:shadow-glow-brand-lg hover:brightness-110 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            {t("auth.login")}
          </Link>
          <Link
            href="/auth/register"
            className="px-8 py-3.5 rounded-xl glass-card text-foreground font-medium hover:bg-white/[0.06] hover:border-white/10 transition-all duration-200"
          >
            {t("auth.register")}
          </Link>
        </div>

        {/* Version badge */}
        <div className="animate-fade-in-up" style={{ animationDelay: "0.5s" }}>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium glass-card text-muted-foreground">
            v0.1.0
          </span>
        </div>
      </div>
    </div>
  );
}
