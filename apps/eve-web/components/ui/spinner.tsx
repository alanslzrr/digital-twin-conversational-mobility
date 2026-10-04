import { Loader2Icon } from "lucide-react";
import { useUi } from "@/i18n/provider";

import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const { t } = useUi();

  return (
    <Loader2Icon
      role="status"
      aria-label={t("spinner.loading")}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
