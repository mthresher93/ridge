import type { Metadata } from "next";
import { Barlow, Big_Shoulders_Display, IBM_Plex_Mono } from "next/font/google";
import { PRODUCT_NAME } from "@/lib/brand";
import "./globals.css";
import "./current.css";
import "./dialer.css";
import "./design.css";
import "./map.css";
import "./settings.css";
import "./lumen.css";
import { Providers } from "./providers";

const sans = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

const display = Big_Shoulders_Display({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: "Freight prospecting operating system",
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
