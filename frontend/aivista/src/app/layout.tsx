import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

import { AuthProviders } from "@/features/auth/ui/auth-providers";
import { ThemeProvider } from "@/features/theme/model/theme-provider";

export const metadata: Metadata = {
  title: "AiVista",
  description: "AiVista AI 文生图平台",
};

const themeBootstrapScript = `
  try {
    const preference = window.localStorage.getItem("aivista-theme-preference");
    const isDark = preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
  } catch {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <Script id="theme-bootstrap" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <ThemeProvider>
          <AuthProviders>{children}</AuthProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}
