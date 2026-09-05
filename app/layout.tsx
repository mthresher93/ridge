import type { Metadata } from "next";
import { Figtree, Fraunces, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import "./current.css";
import "./dialer.css";
import "./design.css";
import "./map.css";
import "./settings.css";
import "./lumen.css";
import { Providers } from "./providers";

const sans = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const display = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
});

const serif = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["italic"],
  variable: "--font-serif",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Lumen",
  description: "Solar revenue workspace",
  icons: {
    icon: "/lumen.svg",
    apple: "/lumen-mark.png",
  },
  appleWebApp: { title: "Lumen", capable: true, statusBarStyle: "black-translucent" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} ${serif.variable} ${mono.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
