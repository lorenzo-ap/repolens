import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "RepoLens", template: "%s · RepoLens" },
  description:
    "Understand your codebase before you change it. Deterministic analysis of architecture, quality, dependencies, testing, complexity and Git history for GitHub repositories.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-bg text-fg">
        <Providers>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-sm focus:border focus:border-border focus:bg-bg focus:px-3 focus:py-2 focus:text-sm"
          >
            Skip to content
          </a>
          {children}
        </Providers>
      </body>
    </html>
  );
}
