import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground" suppressHydrationWarning>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <Providers>
          <AppShell>{children}</AppShell>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
