import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CreatorFlo",
  description:
    "The content OS for creators — plan, script, organize, and publish from one workspace. Never wonder what to post again.",
  applicationName: "CreatorFlo",
  appleWebApp: {
    capable: true,
    title: "CreatorFlo",
    statusBarStyle: "black-translucent",
  },
  // Next 16 emits the standardized `mobile-web-app-capable`; add the legacy
  // Apple name too so older iOS (<16.4) still opens full-screen from the home
  // screen with no browser chrome.
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: {
    icon: "/icon.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#181A20",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
