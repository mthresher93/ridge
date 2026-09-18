import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { PRODUCT_NAME } from "@/lib/brand";
import "./globals.css";
import "./current.css";
import "./dialer.css";
import "./design.css";
import "./map.css";
import "./settings.css";
import "./lumen.css";
import { Providers } from "./providers";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: "Freight CRM",
  icons: {
    icon: [{ url: "/haul.svg", type: "image/svg+xml" }],
    apple: "/haul.svg",
    shortcut: "/haul.svg",
  },
  appleWebApp: { title: PRODUCT_NAME, capable: true, statusBarStyle: "default" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} ${mono.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
