import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { LocaleProvider } from "@/components/i18n-provider";
import { getServerLocale } from "@/lib/i18n-server";
import { ExportModeProvider } from "@/components/export-mode";
import { headers } from "next/headers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WeChat Explorer",
  description: "Local-first explorer for your WeChat chat history",
};

// Anti-FOUC: read the stored theme and apply the class to <html> before
// React hydrates. Kept inline in <head> via dangerouslySetInnerHTML
// instead of inside a React component, which Next 16 flags.
const THEME_INIT_SCRIPT = `
(function(){try{
  var k='wechat-explorer:theme';
  var t=localStorage.getItem(k)||'light';
  var d=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;
  var c=document.documentElement.classList;
  c.toggle('dark',d==='dark'); c.toggle('light',d==='light');
  document.documentElement.style.colorScheme=d;
}catch(e){}})();
`.trim();

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Pull locale from the `we-locale` cookie so the very first server render
  // already uses the right dictionary — no flash of English on a Chinese
  // user's reload. The `<html lang>` attribute follows.
  const locale = await getServerLocale();
  // `x-export-mode: 1` is set by /api/export/page when it server-fetches a
  // page for the HTML exporter. Threads through ExportModeProvider so client
  // chart wrappers can pick a fixed-pixel container instead of the
  // SSR-blanking `ResponsiveContainer width="100%"`.
  const isExport = (await headers()).get("x-export-mode") === "1";
  return (
    <html
      lang={locale === "zh" ? "zh-Hans" : "en"}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground" suppressHydrationWarning>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <Providers>
          <LocaleProvider initial={locale}>
            <ExportModeProvider value={isExport}>
              <AppShell>{children}</AppShell>
            </ExportModeProvider>
          </LocaleProvider>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
