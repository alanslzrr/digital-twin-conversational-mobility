import Image from "next/image";
import { cn } from "@/lib/utils";

/** Original monochrome marks; theme selection is CSS-only (no hydration flash). */
export function MobaiBrand({
  size = "navigation",
  className,
  labelClassName,
}: {
  readonly size?: "navigation" | "hero" | "login";
  readonly className?: string;
  readonly labelClassName?: string;
}) {
  const pixels = size === "hero" ? 64 : size === "login" ? 48 : 28;
  return (
    <span className={cn("mobai-brand", className)} data-size={size}>
      <span className="mobai-brand-symbol" aria-hidden="true">
        <Image
          className="mobai-logo-light"
          src="/brand/logo-light.svg"
          width={pixels}
          height={pixels}
          alt=""
          unoptimized
        />
        <Image
          className="mobai-logo-dark"
          src="/brand/logo-dark.svg"
          width={pixels}
          height={pixels}
          alt=""
          unoptimized
        />
      </span>
      <span className={cn("mobai-brand-name", labelClassName)}>mobai</span>
    </span>
  );
}
