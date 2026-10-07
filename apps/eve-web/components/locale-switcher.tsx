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
    <fieldset aria-label={t("locale.language")} className="ui-segment">
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
          className="ui-segment-option"
        >
          {value.toUpperCase()}
        </button>
      ))}
    </fieldset>
  );
}
