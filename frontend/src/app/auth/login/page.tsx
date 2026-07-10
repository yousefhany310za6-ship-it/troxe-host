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
      setError(err?.message || t("common.error"));
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      {/* Language switcher in top right */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-md space-y-8 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-brand-400">Troxe Host</h1>
          <p className="text-muted-foreground mt-2">{t("auth.loginTitle")}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 bg-card p-8 rounded-xl border border-border"
        >
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {error}
            </div>
          )}

          {!requires2fa ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("auth.email")}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-background border border-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="admin@troxe.dev"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("auth.password")}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-background border border-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="••••••••"
                  required
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("auth.twoFactorCode")}
              </label>
              <input
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-background border border-input focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono text-center text-lg tracking-widest"
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
            className="w-full py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium transition-colors disabled:opacity-50"
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
            className="text-brand-400 hover:underline"
          >
            {t("auth.register")}
          </Link>
        </p>
      </div>
    </div>
  );
}
