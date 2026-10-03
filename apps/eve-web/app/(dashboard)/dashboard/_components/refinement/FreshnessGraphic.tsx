import { type PartitionInput, partitionCounts } from "./core";

const labels = { recent: "Recent", stale: "Stale", unavailable: "Unavailable" };
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
  const partition = partitionCounts(counts);
  if (partition.status !== "available")
    return (
      <div className="rf-meta">
        {counts.total === null
          ? "Count unavailable"
          : `${counts.total} ${unit}`}{" "}
        · {partition.reason}
        <br />
        Recent {counts.recent ?? "unknown"} · Stale {counts.stale ?? "unknown"}{" "}
        · Unavailable {counts.unavailable ?? "unknown"}
      </div>
    );
  return (
    <figure className="rf-freshness">
      <figcaption>
        {label}{" "}
        <span className="rf-meta">
          · {partition.total.toLocaleString("en-GB")} {unit}
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
            <dt>{labels[p.id]}</dt>
            <dd>{p.count.toLocaleString("en-GB")}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
