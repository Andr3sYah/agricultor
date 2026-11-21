import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { OfflineStatus } from "@/components/offline-status";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agricultor",
  description:
    "Conecta con productores y explora productos del campo en Agricultor.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#166534",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <OfflineStatus />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
