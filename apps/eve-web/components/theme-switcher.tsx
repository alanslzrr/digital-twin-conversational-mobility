"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import type { JSX } from "react";
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useUi } from "@/i18n/provider";

// Use the shared short crossfade; reduced motion updates immediately.
function withViewTransition(update: () => void) {
  if (
    typeof document.startViewTransition !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }
  document.startViewTransition(() => flushSync(update));
}

function ThemeOption({
  icon,
  value,
  isActive,
  onClick,
}: {
  icon: JSX.Element;
  value: string;
  isActive?: boolean;
  onClick: (value: string) => void;
}) {
  const { t } = useUi();
  return (
    <button
      type="button"
      className="ui-segment-option"
      aria-pressed={isActive}
      aria-label={
        value === "light"
          ? t("locale.light")
          : value === "dark"
            ? t("locale.dark")
            : t("locale.system")
      }
      onClick={() => onClick(value)}
    >
      {icon}
    </button>
  );
}

const THEME_OPTIONS = [
  {
    icon: <MonitorIcon aria-hidden="true" />,
    value: "system",
  },
  {
    icon: <SunIcon aria-hidden="true" />,
    value: "light",
  },
  {
    icon: <MoonIcon aria-hidden="true" />,
    value: "dark",
  },
];

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const { t } = useUi();

  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!isMounted) {
    return <div className="ui-segment-placeholder" aria-hidden="true" />;
  }

  return (
    <fieldset className="ui-segment" aria-label={t("locale.theme")}>
      {THEME_OPTIONS.map((option) => (
        <ThemeOption
          key={option.value}
          icon={option.icon}
          value={option.value}
          isActive={theme === option.value}
          onClick={(value) => {
            if (value !== theme) withViewTransition(() => setTheme(value));
          }}
        />
      ))}
    </fieldset>
  );
}

export { ThemeSwitcher };
