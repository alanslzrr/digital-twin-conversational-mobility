import { useUi } from "@/i18n/provider";
import { type PartitionInput, partitionCounts } from "./core";

const labels = { recent: "Recent", stale: "Stale", unavailable: "Unavailable" };
/** Table-row variant: bar plus total; exact counts live in adjacent columns. */
export function FreshnessBar({
  unit,
  counts,
}: {
  unit: string;
  counts: PartitionInput;
}) {
  const { t, copy, numberLocale } = useUi();

  const partition = partitionCounts(counts);
  const exact = t("presentation.freshnessExact", {
    recent: counts.recent ?? t("conversationView.unknown"),
    stale: counts.stale ?? t("conversationView.unknown"),
    unavailable: counts.unavailable ?? t("conversationView.unknown"),
  });
  return (
    <div className="rf-freshness-row">
      {partition.status === "available" ? (
        <div
          className="rf-freshness-track"
          role="img"
          aria-label={`${partition.total.toLocaleString(numberLocale)} ${copy(unit)}: ${exact}`}
        >
          {partition.parts
            .filter((p) => p.count > 0)
            .map((p) => (
              <span
                key={p.id}
                data-state={p.id}
                style={{ width: `${p.fraction * 100}%` }}
              />
            ))}
        </div>
      ) : (
        <div className="rf-freshness-track" data-empty="true" />
      )}
      <span className="rf-freshness-caption">
        {partition.status === "available"
          ? [
              "stations",
              "measurements",
              "records",
              "samples",
              "resources",
            ].includes(unit)
            ? t(`presentation.${unit}` as "presentation.records", {
                count: partition.total,
              })
            : `${partition.total.toLocaleString(numberLocale)} ${copy(unit)}`
          : counts.total === null
            ? t("FreshnessGraphic.countUnavailable")
            : copy(partition.reason).replace(/\.$/, "")}
      </span>
      <span className="rf-freshness-inline">{exact}</span>
    </div>
  );
}
/** Supplied counts must form a disjoint, exhaustive partition. Check the DTO semantics first. */
export function FreshnessGraphic({
  label,
  unit,
  counts,
}: {
  label: string;
  unit: string;
  counts: PartitionInput;
}) {
  const { t, copy, numberLocale } = useUi();

  const partition = partitionCounts(counts);
  if (partition.status !== "available")
    return (
      <div className="rf-meta">
        {counts.total === null
          ? t("FreshnessGraphic.countUnavailable")
          : `${counts.total.toLocaleString(numberLocale)} ${copy(unit)}`}{" "}
        · {copy(partition.reason)}
        <br />
        {t("map.recent")}
        {counts.recent ?? t("conversationView.unknown")}{" "}
        {t("FreshnessGraphic.stale")}
        {counts.stale ?? t("conversationView.unknown")}{" "}
        {t("FreshnessGraphic.unavailable")}
        {counts.unavailable ?? t("conversationView.unknown")}
      </div>
    );
  return (
    <figure className="rf-freshness">
      <figcaption>
        {label}{" "}
        <span className="rf-meta">
          · {partition.total.toLocaleString(numberLocale)} {copy(unit)}
        </span>
      </figcaption>
      <div className="rf-freshness-track" aria-hidden="true">
        {partition.parts.map((p) => (
          <span
            key={p.id}
            data-state={p.id}
            style={{ width: `${p.fraction * 100}%` }}
          />
        ))}
      </div>
      <dl className="rf-freshness-legend">
        {partition.parts.map((p) => (
          <div key={p.id}>
            <dt>{copy(labels[p.id])}</dt>
            <dd>{p.count.toLocaleString(numberLocale)}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
