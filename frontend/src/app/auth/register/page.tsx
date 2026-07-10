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
      setError(err?.message || t("common.error"));
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-md space-y-8 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-brand-400">Troxe Host</h1>
          <p className="text-muted-foreground mt-2">
            {t("auth.registerTitle")}
          </p>
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

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("users.username")}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-background border border-input focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="admin"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("auth.email")}</label>
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
              minLength={8}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium transition-colors disabled:opacity-50"
          >
            {loading ? t("common.loading") : t("auth.register")}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {t("auth.hasAccount")}{" "}
          <Link href="/auth/login" className="text-brand-400 hover:underline">
            {t("auth.login")}
          </Link>
        </p>
      </div>
    </div>
  );
}
