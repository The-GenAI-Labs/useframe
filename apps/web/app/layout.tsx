import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ThemeInitializer } from "@/components/ThemeInitializer";
import { AttributionCapture } from "@/components/AttributionCapture";
import {
  pageMetadata,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/metadata";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  ...pageMetadata(SITE_TITLE, SITE_DESCRIPTION),
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: `${SITE_TITLE} | ${SITE_NAME}`,
    template: `%s | ${SITE_NAME}`,
  },
  referrer: "strict-origin-when-cross-origin",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable}`}
        suppressHydrationWarning
      >
        <Providers>
          <ThemeInitializer />
          <AttributionCapture />
          {children}
        </Providers>
      </body>
    </html>
  );
}
