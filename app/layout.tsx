import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/layout/theme-provider";

export const metadata: Metadata = {
  title: { default: "AdPilot AI — SketchDeck.ai", template: "%s · AdPilot AI" },
  description: "The AI Operating System for B2B Marketing. From ad spend to pipeline — automatically.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
