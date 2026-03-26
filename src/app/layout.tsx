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
  title: "Agentic Website - Make Any Site Agent-Ready",
  description: "Transform your website into an AI-agent-ready service. Generate skill.md files that help AI agents understand, navigate, and interact with your site.",
  keywords: ["AI agents", "skill.md", "agent-ready", "AI integration", "website automation", "LLM tools"],
  authors: [{ name: "Agentic Website" }],
  creator: "Agentic Website",
  publisher: "Agentic Website",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://agenticwebsite.io",
    siteName: "Agentic Website",
    title: "Agentic Website - Make Any Site Agent-Ready",
    description: "Transform your website into an AI-agent-ready service. Generate skill.md files that help AI agents understand and interact with your site.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Agentic Website - Make your site agent-ready",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agentic Website - Make Any Site Agent-Ready",
    description: "Transform your website into an AI-agent-ready service.",
    images: ["/og-image.png"],
    creator: "@agenticwebsite",
  },
  alternates: {
    canonical: "https://agenticwebsite.io",
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="root flex-1">
          {children}
        </div>
      </body>
    </html>
  );
}
