import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Mono, Playfair_Display, Lora } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import "./globals.css";
import { SITE } from "@/lib/seo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "Athena Finance",
    template: "%s · Athena Finance",
  },
  description: "Finanzübersicht: Konten, Depots, Verträge und Strategien an einem Ort.",
  applicationName: "Athena Finance",
  appleWebApp: {
    capable: true,
    title: "Athena",
    statusBarStyle: "black-translucent",
  },
  authors: [{ name: SITE.author, url: SITE.url }],
  creator: SITE.author,
  publisher: SITE.author,
  /*
   * Voreinstellung für alle Seiten, die nichts Eigenes sagen. Die drei
   * googleBot-Werte sind der eigentliche Gewinn: ohne sie liefert Google für
   * eine unbekannte Domain nur eine Miniatur-Vorschau und einen gekürzten
   * Textausschnitt. `large` erlaubt das grosse Vorschaubild in Discover und in
   * der Bildersuche, `-1` hebt die Längenbegrenzung des Ausschnitts auf.
   *
   * Seiten, die NICHT in den Index sollen (Impressum, Datenschutz), setzen ihr
   * eigenes `robots` und überschreiben das hier.
   */
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  /* Verhindert, dass iOS Safari Zahlenkolonnen im Mockup eigenmächtig als
     Telefonnummern verlinkt und blau einfärbt. */
  formatDetection: { telephone: false, address: false, email: false },
  openGraph: {
    title: "Athena Finance",
    description: "Finanzübersicht: Konten, Depots, Verträge und Strategien an einem Ort.",
    url: "/",
    siteName: "Athena Finance",
    locale: SITE.locale,
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Athena Finance" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Athena Finance",
    description: "Finanzübersicht: Konten, Depots, Verträge und Strategien an einem Ort.",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F3F5" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A09" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        {/* Theme vor dem ersten Paint setzen (sonst Aufblitzen bis zur
            Hydration). Gespiegelt aus SettingsProvider: Preset liegt in
            localStorage, ohne Eintrag gilt Athena Light, 'none' = eigene Farbe.
            Öffentliche Seiten bleiben unberührt. Schreibt auch `theme`, damit
            next-themes dieselbe Hell/Dunkel-Klasse wählt statt System. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=location.pathname;if(p==='/'||/^\\/(login|auth|datenschutz|impressum|interesse)(\\/|$)/.test(p))return;var v=localStorage.getItem('athena-theme-preset');if(v===null)v='athena';if(v==='none')return;var d=['obsidian','aurum','void','copper','athena-dark'].indexOf(v)>-1;var r=document.documentElement;r.setAttribute('data-theme',v);r.classList.add(d?'dark':'light');r.classList.remove(d?'light':'dark');localStorage.setItem('theme',d?'dark':'light')}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${spaceMono.variable} ${playfair.variable} ${lora.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
