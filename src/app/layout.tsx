import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Mono, Playfair_Display, Lora } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import "./globals.css";

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
  metadataBase: new URL("https://athena-finance.de"),
  title: {
    default: "Athena Finance",
    template: "%s · Athena Finance",
  },
  description: "Personal finance & trading dashboard",
  applicationName: "Athena Finance",
  appleWebApp: {
    capable: true,
    title: "Athena",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "Athena Finance",
    description: "Personal finance & trading dashboard",
    url: "/",
    siteName: "Athena Finance",
    locale: "de_DE",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Athena Finance" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Athena Finance",
    description: "Personal finance & trading dashboard",
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
      <body className={`${geistSans.variable} ${geistMono.variable} ${spaceMono.variable} ${playfair.variable} ${lora.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
