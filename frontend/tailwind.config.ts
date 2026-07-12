import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b",
        },
        surface: {
          DEFAULT: "rgba(255,255,255,0.03)",
          hover: "rgba(255,255,255,0.06)",
          active: "rgba(255,255,255,0.09)",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        "glow-brand":
          "0 0 20px rgba(99,102,241,0.15), 0 0 40px rgba(99,102,241,0.05)",
        "glow-brand-lg":
          "0 0 30px rgba(99,102,241,0.25), 0 0 60px rgba(99,102,241,0.1)",
        "glow-cyan":
          "0 0 20px rgba(34,211,238,0.15), 0 0 40px rgba(34,211,238,0.05)",
        "glow-success": "0 0 12px rgba(34,197,94,0.3)",
        "glow-danger": "0 0 12px rgba(239,68,68,0.3)",
        "glow-warning": "0 0 12px rgba(234,179,8,0.3)",
        glass:
          "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
        "glass-hover":
          "0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(99,102,241,0.1), inset 0 1px 0 rgba(255,255,255,0.08)",
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "gradient-shift": "gradient-shift 8s ease infinite",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.5s ease-out forwards",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "gradient-shift": {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
