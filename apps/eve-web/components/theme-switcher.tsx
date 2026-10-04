"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import { useTheme } from "next-themes";
import type { JSX } from "react";
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useUi } from "@/i18n/provider";

// Pairs with the circle-blur view-transition styles in the consuming stylesheet.
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
      data-active={isActive}
      className="relative flex size-8 items-center justify-center rounded-full text-muted-foreground transition-[color] hover:text-foreground data-[active=true]:text-foreground [&_svg]:size-4"
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

      {isActive && (
        <motion.span
          layoutId="theme-option"
          transition={{ type: "spring", bounce: 0.3, duration: 0.6 }}
          className="absolute inset-0 rounded-full border"
        />
      )}
    </button>
  );
}

const THEME_OPTIONS = [
  {
    icon: <MonitorIcon />,
    value: "system",
  },
  {
    icon: <SunIcon />,
    value: "light",
  },
  {
    icon: <MoonIcon />,
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
    return <div className="flex h-8 w-24" />;
  }

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        key={String(isMounted)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="inline-flex items-center overflow-clip rounded-full bg-background inset-ring-1 inset-ring-border"
        role="group"
        aria-label={t("locale.theme")}
      >
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
      </motion.div>
    </MotionConfig>
  );
}

export { ThemeSwitcher };
