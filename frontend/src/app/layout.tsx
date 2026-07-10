import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { I18nProvider } from "@/i18n/provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Troxe Host - Game Server Management",
  description: "Modern game server management panel",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicons/favicon.ico" />
      </head>
      <body className={inter.className}>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
