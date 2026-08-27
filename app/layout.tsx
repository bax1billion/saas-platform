import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";
import { siteConfig, pageTitle } from "@/config/site";
import AmplifyProvider from "./components/AmplifyProvider";
import AuthProvider from "./components/AuthContext";
import EarlyAccessProvider from "./components/EarlyAccessContext";
import ThemeProvider from "./components/ThemeProvider";

// Fonts are part of the theme: swap the faces here, keep the variable
// names (--font-body / --font-heading) so components never change.
const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const headingFont = Lora({
  variable: "--font-heading",
  weight: ["400", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.urls.base),
  title: pageTitle(),
  description: siteConfig.product.description,
  keywords: [siteConfig.product.name, ...siteConfig.seo.keywords],
  icons: {
    icon: "/icon.png",
    apple: "/apple-touch-icon.png",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: pageTitle(),
    description: siteConfig.product.description,
    siteName: siteConfig.product.name,
    type: "website",
    url: siteConfig.urls.base,
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle(),
    description: siteConfig.product.description,
    ...(siteConfig.seo.twitterHandle
      ? { site: siteConfig.seo.twitterHandle }
      : {}),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${bodyFont.variable} ${headingFont.variable} antialiased`}
      >
        <ThemeProvider>
          <AmplifyProvider>
            <AuthProvider>
              <EarlyAccessProvider>{children}</EarlyAccessProvider>
            </AuthProvider>
          </AmplifyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
