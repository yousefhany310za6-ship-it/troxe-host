"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, initialized, checkAuth } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (initialized && !user) {
      router.push("/auth/login");
    }
  }, [initialized, user, router]);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
