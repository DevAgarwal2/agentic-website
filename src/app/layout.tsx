import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "Agentic Website — Make Any Site Agent-Ready",
  description:
    "Transform your website into an AI-agent-ready service. Generate skill.md files that help AI agents understand, navigate, and interact with your site.",
  keywords: ["AI agents", "skill.md", "agent-ready", "AI integration", "website automation"],
  authors: [{ name: "Agentic Website" }],
  creator: "Agentic Website",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://agenticwebsite.io",
    siteName: "Agentic Website",
    title: "Agentic Website — Make Any Site Agent-Ready",
    description: "Transform your website into an AI-agent-ready service.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  icons: { icon: "/favicon.ico", shortcut: "/favicon.ico" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased bg-background text-foreground">
        <div className="root flex-1">{children}</div>
      </body>
    </html>
  );
}
