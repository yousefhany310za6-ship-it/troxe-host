"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { fetchApi } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await fetchApi("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, email, password }),
      });

      router.push("/dashboard");
    } catch (err: any) {
      setError(
        err?.status === 409
          ? "An account with this email or username already exists."
          : t("common.error")
      );
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex relative overflow-hidden">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[128px]" />
      <div className="absolute bottom-1/3 left-1/4 w-80 h-80 bg-brand-600/8 rounded-full blur-[100px]" />

      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      <div className="hidden lg:flex w-1/2 relative items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-brand-600/10 to-transparent" />
        <div className="relative z-10 text-center space-y-6 px-12">
          <h1 className="text-5xl font-bold text-gradient">Troxe Host</h1>
          <p className="text-lg text-muted-foreground max-w-sm mx-auto">
            {t("auth.registerTitle")}
          </p>
          <div className="w-24 h-1 bg-gradient-to-r from-purple-500 to-brand-500 rounded-full mx-auto" />
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center relative z-10 px-4">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden text-center space-y-2">
            <h1 className="text-3xl font-bold text-gradient">Troxe Host</h1>
            <p className="text-muted-foreground">{t("auth.registerTitle")}</p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="glass-card rounded-2xl p-8 space-y-5 shadow-glass"
          >
            <div className="hidden lg:block text-center mb-6">
              <h2 className="text-xl font-semibold text-foreground">
                {t("auth.register")}
              </h2>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm shadow-glow-danger">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">
                {t("users.username")}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full h-11 px-4 rounded-xl glass-input text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 transition-all duration-200"
                placeholder="admin"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">
                {t("auth.email")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 px-4 rounded-xl glass-input text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 transition-all duration-200"
                placeholder="admin@troxe.dev"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">
                {t("auth.password")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 px-4 rounded-xl glass-input text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 transition-all duration-200"
                placeholder="••••••••"
                minLength={8}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-gradient-to-r from-brand-600 via-brand-500 to-purple-500 text-white font-medium shadow-glow-brand hover:shadow-glow-brand-lg hover:brightness-110 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t("common.loading") : t("auth.register")}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {t("auth.hasAccount")}{" "}
            <Link
              href="/auth/login"
              className="text-brand-400 hover:text-brand-300 transition-colors"
            >
              {t("auth.login")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
