import { create } from "zustand";
import { fetchApi } from "@/lib/api";

interface User {
  id: string;
  username: string;
  email: string;
  rootAdmin: boolean;
  isAdmin: boolean;
}

interface AuthState {
  user: User | null;
  initialized: boolean;
  setUser: (user: User | null) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  initialized: false,

  setUser: (user) => set({ user }),

  login: async (email, password) => {
    const data = await fetchApi<{ user: User }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    set({ user: data.user });
  },

  logout: async () => {
    await fetchApi("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
    set({ user: null });
  },

  checkAuth: async () => {
    try {
      const data = await fetchApi<{ user: User }>("/api/v1/auth/me");
      set({ user: data.user, initialized: true });
    } catch {
      set({ user: null, initialized: true });
    }
  },
}));
