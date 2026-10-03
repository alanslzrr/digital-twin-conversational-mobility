"use client";
import { Check, Minus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
    return <p className="rf-meta">Readiness breakdown unavailable.</p>;
  }
  if (!observed) return <p className="rf-meta">No enabled products.</p>;
  return (
    <TooltipProvider>
      <section
        className="rf-product-units"
        aria-label={`${included} of ${observed} enabled products have usable evidence. One cell per product.`}
      >
        {enabled.map((p) => (
          <Tooltip key={p.id}>
            <TooltipTrigger asChild>
              <a
                href={`/dashboard/sources/${encodeURIComponent(p.source)}`}
                className="rf-product-unit"
                data-usable={p.usable}
                aria-label={`${p.label}: ${p.usable ? "usable evidence" : "no usable evidence"}`}
              >
                {p.usable ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <Minus size={14} aria-hidden="true" />
                )}
              </a>
            </TooltipTrigger>
            <TooltipContent className="dashboard-dialog rf-tooltip">
              {p.label} · {p.usable ? "Usable evidence" : "No usable evidence"}
            </TooltipContent>
          </Tooltip>
        ))}
      </section>
    </TooltipProvider>
  );
}
