import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
import { getSiteUrl, isSearchIndexingEnabled } from "@/lib/site";
import "./globals.css";

const tajawal = Tajawal({
  subsets: ["arabic"],
  weight: ["300", "400", "500", "700", "800", "900"],
  variable: "--font-tajawal",
});

const indexingEnabled = isSearchIndexingEnabled();

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  applicationName: "HATAB Office Furniture",
  title: {
    default: "HATAB | أثاث مكتبي وحلول مساحات العمل",
    template: "%s | HATAB",
  },
  description: "أثاث مكتبي وحلول متكاملة لتجهيز المكاتب وقاعات الاجتماعات ومساحات العمل.",
  keywords: ["أثاث مكتبي", "مكاتب", "كراسي مكتبية", "محطات عمل", "تجهيز مكاتب"],
  openGraph: {
    type: "website",
    locale: "ar_EG",
    siteName: "HATAB Office Furniture",
    title: "HATAB | أثاث مكتبي وحلول مساحات العمل",
    description: "استكشف الأثاث حسب المساحة واجمع القطع في لوحة مشروع واحدة.",
  },
  twitter: {
    card: "summary",
    title: "HATAB | أثاث مكتبي وحلول مساحات العمل",
    description: "استكشف الأثاث حسب المساحة واجمع القطع في لوحة مشروع واحدة.",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
  },
  formatDetection: { address: false, email: false, telephone: false },
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION?.trim()
      ? { google: process.env.GOOGLE_SITE_VERIFICATION.trim() }
      : {}),
    ...(process.env.BING_SITE_VERIFICATION?.trim()
      ? { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION.trim() } }
      : {}),
  },
  robots: {
    index: indexingEnabled,
    follow: indexingEnabled,
    googleBot: {
      index: indexingEnabled,
      follow: indexingEnabled,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={tajawal.variable} suppressHydrationWarning>
      <body className="antialiased min-h-screen bg-[var(--bg-primary)] font-sans text-[var(--text-primary)]" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
