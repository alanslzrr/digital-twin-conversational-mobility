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
  const partition = partitionCounts(counts);
  const exact = `Recent ${counts.recent ?? "unknown"} · Stale ${counts.stale ?? "unknown"} · Unavailable ${counts.unavailable ?? "unknown"}`;
  return (
    <div className="rf-freshness-row">
      {partition.status === "available" ? (
        <div
          className="rf-freshness-track"
          role="img"
          aria-label={`${partition.total} ${unit}: ${exact}`}
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
          ? `${partition.total.toLocaleString("en-GB")} ${partition.total === 1 ? unit.replace(/s$/, "") : unit}`
          : counts.total === null
            ? "Count unavailable"
            : partition.reason.replace(/\.$/, "")}
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
