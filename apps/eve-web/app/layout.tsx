import type { Metadata } from "next";
import localFont from "next/font/local";
import { getLocale } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UiProvider } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import "./globals.css";

const body = localFont({
  src: "./fonts/inter-variable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const display = localFont({
  src: "./fonts/geist-variable.woff2",
  variable: "--font-geist",
  weight: "100 900",
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
      className={cn(body.variable, display.variable)}
      lang={locale}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider
          attribute="data-dashboard-theme"
          storageKey="dashboard-theme"
          defaultTheme="system"
          enableSystem
          enableColorScheme={false}
          disableTransitionOnChange
        >
          <UiProvider initialLocale={locale}>
            <TooltipProvider>{children}</TooltipProvider>
          </UiProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
