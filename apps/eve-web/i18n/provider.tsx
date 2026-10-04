"use client";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  formatLocale,
  persistLocale,
  resolveLocale,
  UI_TIME_ZONE,
  type UiLocale,
} from "./config";
import { type MessageKey, messages, ownedCopyKeys } from "./messages";

type LocaleContextValue = {
  locale: UiLocale;
  setLocale: (locale: UiLocale) => void;
};
const LocaleContext = createContext<LocaleContextValue | null>(null);
export function UiProvider({
  initialLocale,
  children,
}: {
  initialLocale: UiLocale;
  children?: ReactNode;
}) {
  const [locale, updateLocale] = useState(initialLocale);
  const setLocale = useCallback((next: UiLocale) => {
    const value = resolveLocale(next);
    persistLocale(value, document, window.location.protocol === "https:");
    document.documentElement.lang = value;
    updateLocale(value);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return (
    <LocaleContext.Provider value={value}>
      <NextIntlClientProvider
        locale={locale}
        messages={messages[locale]}
        timeZone={UI_TIME_ZONE}
      >
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
export function useUi() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("UI locale provider required");
  const translate = useTranslations();
  const t = useCallback(
    (key: MessageKey, values?: Record<string, string | number>) =>
      translate(key, values),
    [translate],
  );
  // Only call at owned presentation boundaries. Never translate provider text,
  // messages, technical JSON or other untrusted content through this mapping.
  const copy = useCallback(
    <T extends string | undefined>(value: T): T => {
      const key = value === undefined ? undefined : ownedCopyKeys[value];
      return (key ? t(key) : value) as T;
    },
    [t],
  );
  return { ...context, t, copy, numberLocale: formatLocale(context.locale) };
}
