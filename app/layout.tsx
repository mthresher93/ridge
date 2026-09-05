import type { Metadata } from "next";
import { Exo_2, Instrument_Serif, JetBrains_Mono, Orbitron } from "next/font/google";
import "./globals.css";
import "./current.css";
import "./dialer.css";
import "./design.css";
import "./map.css";
import { Providers } from "./providers";

const sans = Exo_2({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const display = Orbitron({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-serif",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Current",
  description: "Solar revenue workspace",
  icons: { icon: "/current.svg" },
  appleWebApp: { title: "Current", capable: true, statusBarStyle: "black-translucent" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={`${sans.variable} ${display.variable} ${serif.variable} ${mono.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
