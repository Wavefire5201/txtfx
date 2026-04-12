import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { RootProvider } from "fumadocs-ui/provider/next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jb-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "txtfx - ascii art effects",
  description: "composite animated character effects over photographs. real-time ascii art engine with effects, mask painting, and timeline.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jakartaSans.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body>
        <RootProvider
          theme={{ defaultTheme: "dark" }}
        >
          {children}
        </RootProvider>
        <Analytics />
      </body>
    </html>
  );
}
