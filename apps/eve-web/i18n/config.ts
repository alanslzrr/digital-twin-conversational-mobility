export const locales = ["es", "en"] as const;
export type UiLocale = (typeof locales)[number];
export const LOCALE_COOKIE = "mobility-locale";
export const LOCALE_MAX_AGE = 365 * 24 * 60 * 60;
export const UI_TIME_ZONE = "Europe/Madrid";
export function resolveLocale(value: unknown): UiLocale {
  return value === "en" ? "en" : "es";
}
export function localeCookie(locale: UiLocale, secure: boolean): string {
  return `${LOCALE_COOKIE}=${resolveLocale(locale)}; Path=/; Max-Age=${LOCALE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}
export function persistLocale(
  locale: UiLocale,
  target: { cookie: string },
  secure: boolean,
): void {
  try {
    target.cookie = localeCookie(locale, secure);
  } catch {
    /* The in-memory preference remains usable when cookies are blocked. */
  }
}
export function formatLocale(locale: UiLocale): "es-ES" | "en-GB" {
  return locale === "es" ? "es-ES" : "en-GB";
}
