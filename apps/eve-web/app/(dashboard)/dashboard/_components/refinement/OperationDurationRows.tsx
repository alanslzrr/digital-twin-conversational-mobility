import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type DurationGroup, validateDuration } from "./core";
/** Present existing metrics.durations only after its authenticated read succeeds. */
export function OperationDurationRows({
  groups,
}: {
  groups: readonly DurationGroup[];
}) {
  if (groups.length === 0)
    return (
      <p className="rf-meta">
        No recorded operation duration samples returned.
      </p>
    );
  if (groups.length > 25)
    return (
      <p className="rf-meta">
        Duration groups exceed the verified reader limit; inspect the response.
      </p>
    );
  const operations = [...new Set(groups.map((g) => g.operation))].sort();
  return (
    <div className="rf-duration-groups">
      <p className="rf-meta">
        Filled dot: median. Outline square: p95. Recorded summaries, not a
        distribution.
      </p>
      {operations.map((operation) => {
        const rows = groups
          .filter((g) => g.operation === operation)
          .slice()
          .sort((a, b) => a.component.localeCompare(b.component));
        const valid = rows.filter(validateDuration);
        const max = Math.max(
          1,
          ...valid.flatMap((g) => [g.medianMs ?? 0, g.p95Ms ?? 0]),
        );
        const x = (value: number) => 6 + (value / max) * 132;
        return (
          <section key={operation} className="rf-duration-group">
            <div className="rf-panel-heading">
              <h3>{operation.replaceAll("_", " ")}</h3>
              <span className="rf-meta">Recorded ms · scale 0–{max}</span>
            </div>
            <section
              className="rf-table-region"
              aria-label={`${operation} recorded durations`}
            >
              <Table>
                <caption className="sr-only">
                  Median dot and p95 square are summary statistics, not a
                  distribution or confidence interval.
                </caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead>Samples</TableHead>
                    <TableHead>Median (ms)</TableHead>
                    <TableHead>p95 (ms)</TableHead>
                    <TableHead>Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((g) => (
                    <TableRow key={`${g.component}:${g.operation}`}>
                      <TableCell>{g.component}</TableCell>
                      <TableCell>{g.n}</TableCell>
                      <TableCell>
                        {g.medianMs === null
                          ? "Unavailable"
                          : String(g.medianMs)}
                      </TableCell>
                      <TableCell>
                        {g.p95Ms === null
                          ? g.n < 20
                            ? "Unavailable: n < 20"
                            : "Unavailable"
                          : String(g.p95Ms)}
                      </TableCell>
                      <TableCell>
                        {validateDuration(g) && g.medianMs !== null ? (
                          <svg
                            width="144"
                            height="24"
                            viewBox="0 0 144 24"
                            aria-hidden="true"
                          >
                            <line
                              x1="6"
                              y1="12"
                              x2="138"
                              y2="12"
                              stroke="var(--dash-line-soft)"
                            />
                            {g.p95Ms !== null && (
                              <>
                                <line
                                  x1={x(g.medianMs)}
                                  y1="12"
                                  x2={x(g.p95Ms)}
                                  y2="12"
                                  stroke="var(--dash-series)"
                                />
                                <rect
                                  x={x(g.p95Ms) - 3}
                                  y="9"
                                  width="6"
                                  height="6"
                                  fill="var(--dash-panel)"
                                  stroke="var(--dash-series)"
                                  strokeWidth="1.5"
                                />
                              </>
                            )}
                            <circle
                              cx={x(g.medianMs)}
                              cy="12"
                              r="3"
                              fill="var(--dash-series)"
                            />
                          </svg>
                        ) : (
                          <span className="rf-meta">
                            Summary unavailable; inconsistent fields.
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          </section>
        );
      })}
    </div>
  );
}
