"use client";

import { Check, Minus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUi } from "@/i18n/provider";
export interface ReadinessProduct {
  id: string;
  source: string;
  label: string;
  enabled: boolean;
  usable: boolean;
}
export function ProductUnits({
  products,
  included,
  observed,
}: {
  products: readonly ReadinessProduct[];
  included: number | null;
  observed: number | null;
}) {
  const { t } = useUi();

  const enabled = products.filter((p) => p.enabled);
  const unique = new Set(products.map((p) => p.id)).size === products.length;
  const usable = enabled.filter((p) => p.usable).length;
  if (
    !unique ||
    observed === null ||
    included === null ||
    observed !== enabled.length ||
    included !== usable
  ) {
    return (
      <p className="rf-meta">
        {t("ProductUnits.readinessBreakdownUnavailable")}
      </p>
    );
  }
  if (!observed)
    return <p className="rf-meta">{t("ProductUnits.noEnabledProducts")}</p>;
  return (
    <TooltipProvider>
      <div className="rf-readiness">
        <section
          className="rf-product-units"
          aria-label={t("presentation.readiness", { included, observed })}
        >
          {enabled.map((p) => (
            <Tooltip key={p.id}>
              <TooltipTrigger asChild>
                <a
                  href={`/dashboard/sources/${encodeURIComponent(p.source)}`}
                  className="rf-product-unit"
                  data-usable={p.usable}
                  aria-label={`${p.label}: ${p.usable ? t("ProductUnits.usableEvidence") : t("ProductUnits.noUsableEvidence")}`}
                >
                  {p.usable ? (
                    <Check size={12} aria-hidden="true" />
                  ) : (
                    <Minus size={12} aria-hidden="true" />
                  )}
                </a>
              </TooltipTrigger>
              <TooltipContent className="dashboard-dialog rf-tooltip">
                {p.label} ·{" "}
                {p.usable
                  ? t("ProductUnits.usableEvidence2")
                  : t("insights.noUsableEvidence")}
              </TooltipContent>
            </Tooltip>
          ))}
        </section>
        <dl className="rf-readiness-legend">
          <div data-usable="true">
            <dt>{t("ProductUnits.usableEvidence2")}</dt>
            <dd>{included}</dd>
          </div>
          <div data-usable="false">
            <dt>{t("insights.noUsableEvidence")}</dt>
            <dd>{observed - included}</dd>
          </div>
        </dl>
      </div>
    </TooltipProvider>
  );
}
