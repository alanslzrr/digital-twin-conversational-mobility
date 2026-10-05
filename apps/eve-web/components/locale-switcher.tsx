"use client";
import { useRef } from "react";
import { locales, type UiLocale } from "@/i18n/config";
import { useUi } from "@/i18n/provider";
export function LocaleSwitcher() {
  const { locale, setLocale, t } = useUi();
  const buttons = useRef<Partial<Record<UiLocale, HTMLButtonElement | null>>>(
    {},
  );
  return (
    <fieldset
      aria-label={t("locale.language")}
      className="inline-flex h-8 shrink-0 items-center rounded-full bg-background p-0.5 inset-ring-1 inset-ring-border"
    >
      {locales.map((value) => (
        <button
          key={value}
          ref={(button) => {
            buttons.current[value] = button;
          }}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? "es"
                : event.key === "End"
                  ? "en"
                  : value === "es"
                    ? "en"
                    : "es";
            buttons.current[next]?.focus();
            setLocale(next);
          }}
          type="button"
          lang={value}
          aria-label={value === "es" ? "Español" : "English"}
          aria-pressed={locale === value}
          onClick={() => setLocale(value)}
          className="h-7 min-w-8 rounded-full px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:bg-muted aria-pressed:text-foreground motion-reduce:transition-none"
        >
          {value.toUpperCase()}
        </button>
      ))}
    </fieldset>
  );
}
