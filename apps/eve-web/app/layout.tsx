import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UiProvider } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import "./globals.css";

const sans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

export const metadata: Metadata = {
  title: "mobai",
  applicationName: "mobai",
  icons: { icon: "/brand/favicon.svg" },
  description: "Evaluación privada de movilidad de Madrid.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const locale = await getLocale();
  return (
    <html
      className={cn(sans.variable, mono.variable)}
      lang={locale}
      suppressHydrationWarning
    >
      <body>
        <UiProvider initialLocale={locale}>
          <TooltipProvider>{children}</TooltipProvider>
        </UiProvider>
      </body>
    </html>
  );
}
