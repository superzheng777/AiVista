import type { Metadata } from "next";
import "./globals.css";

import { AuthProviders } from "@/features/auth/ui/auth-providers";

export const metadata: Metadata = {
  title: "AiVista",
  description: "AiVista AI 文生图平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AuthProviders>{children}</AuthProviders>
      </body>
    </html>
  );
}
