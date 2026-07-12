"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { fetchApi } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [requires2fa, setRequires2fa] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const data = await fetchApi<{
        user?: { id: string; username: string; email: string; role: string };
        requires2fa?: boolean;
        error?: string;
      }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          totpCode: requires2fa ? totpCode : undefined,
        }),
      });

      if (data.requires2fa) {
        setRequires2fa(true);
        setLoading(false);
        return;
      }

      router.push("/dashboard");
    } catch (err: any) {
      if (err?.status === 200) {
        router.push("/dashboard");
        return;
      }
      setError(
        err?.status === 401 || err?.status === 400
          ? "Invalid credentials. Please try again."
          : t("common.error")
      );
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex relative overflow-hidden">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-brand-600/10 rounded-full blur-[128px]" />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-purple-600/8 rounded-full blur-[100px]" />

      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      <div className="hidden lg:flex w-1/2 relative items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600/20 via-purple-600/10 to-transparent" />
        <div className="relative z-10 text-center space-y-6 px-12">
          <h1 className="text-5xl font-bold text-gradient">Troxe Host</h1>
          <p className="text-lg text-muted-foreground max-w-sm mx-auto">
            {t("auth.loginTitle")}
          </p>
          <div className="w-24 h-1 bg-gradient-to-r from-brand-500 to-purple-500 rounded-full mx-auto" />
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center relative z-10 px-4">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden text-center space-y-2">
            <h1 className="text-3xl font-bold text-gradient">Troxe Host</h1>
            <p className="text-muted-foreground">{t("auth.loginTitle")}</p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="glass-card rounded-2xl p-8 space-y-5 shadow-glass"
          >
            <div className="hidden lg:block text-center mb-6">
              <h2 className="text-xl font-semibold text-foreground">
                {t("auth.login")}
              </h2>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm shadow-glow-danger">
                {error}
              </div>
            )}

            {!requires2fa ? (
              <>
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
                    required
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">
                  {t("auth.twoFactorCode")}
                </label>
                <input
                  type="text"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl glass-input text-foreground font-mono text-center text-lg tracking-[0.3em] placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 transition-all duration-200"
                  placeholder="000000"
                  maxLength={6}
                  required
                  autoFocus
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-gradient-to-r from-brand-600 via-brand-500 to-purple-500 text-white font-medium shadow-glow-brand hover:shadow-glow-brand-lg hover:brightness-110 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? t("common.loading")
                : requires2fa
                ? t("auth.twoFactorCode")
                : t("auth.login")}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {t("auth.noAccount")}{" "}
            <Link
              href="/auth/register"
              className="text-brand-400 hover:text-brand-300 transition-colors"
            >
              {t("auth.register")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
