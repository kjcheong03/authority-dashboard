import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter — neutral, modern, dense sans used widely in dashboards and gov data UIs.
// Kept under --font-rounded so existing references (globals.css, DraftPanel) don't change.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-rounded", display: "swap" });

export const metadata: Metadata = {
  title: "CARA · Authority Dashboard",
  description: "Validate public-health emergency topics and detect misinformation, powered by live agentic research.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
