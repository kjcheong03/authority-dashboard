import type { Metadata } from "next";
import { Quicksand } from "next/font/google";
import "./globals.css";

const quicksand = Quicksand({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-rounded", display: "swap" });

export const metadata: Metadata = {
  title: "CARA · Authority Dashboard",
  description: "Validate public-health emergency topics and detect misinformation, powered by live agentic research.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={quicksand.variable}>
      <body>{children}</body>
    </html>
  );
}
