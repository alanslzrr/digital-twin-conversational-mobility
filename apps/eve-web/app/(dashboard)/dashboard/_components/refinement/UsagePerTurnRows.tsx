import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { summarizeUsage, type UsageInput } from "./core";
/** Presentation type, not a new Core DTO. Map only actually reported source fields. */
export interface TurnUsageRow {
  id: string;
  label: string;
  usage: UsageInput;
}
const exact = (v: number | null) =>
  v === null
    ? "Unavailable"
    : !Number.isSafeInteger(v) || v < 0
      ? "Inconsistent"
      : String(v);
export function UsagePerTurnRows({
  turns,
}: {
  turns: readonly TurnUsageRow[];
}) {
  if (turns.length === 0)
    return <p className="rf-meta">No retained turns on this page.</p>;
  const rows = turns.map((turn) => ({
    turn,
    result: summarizeUsage(turn.usage),
  }));
  const totals = rows.flatMap((r) =>
    r.result.status === "valid" && r.result.total !== null
      ? [r.result.total]
      : [],
  );
  const max = Math.max(1, ...totals);
  return (
    <section>
      <p className="rf-coverage">
        Reported input and output · returned turn page only
      </p>
      <p className="rf-meta">
        Solid: input. Striped: output. Bars include the two parent totals once.
        Cache and reasoning are subsets, not additional segments.
      </p>
      <section
        className="rf-table-region"
        aria-label="Reported usage by returned turn"
      >
        <Table>
          <caption className="sr-only">
            Exact parent token counts. Incomplete or inconsistent usage is not
            plotted.
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead>Turn</TableHead>
              <TableHead>Input</TableHead>
              <TableHead>Output</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Reported volume</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ turn, result }) => (
              <TableRow key={turn.id}>
                <TableCell>{turn.label}</TableCell>
                <TableCell>{exact(turn.usage.input)}</TableCell>
                <TableCell>{exact(turn.usage.output)}</TableCell>
                <TableCell>
                  {result.status === "valid"
                    ? exact(result.total)
                    : "Inconsistent"}
                </TableCell>
                <TableCell>
                  {result.status === "valid" && result.total !== null ? (
                    <div className="rf-usage-bar" aria-hidden="true">
                      <span
                        className="rf-usage-input"
                        style={{
                          width: `${((turn.usage.input as number) / max) * 100}%`,
                        }}
                      />
                      <span
                        className="rf-usage-output"
                        style={{
                          width: `${((turn.usage.output as number) / max) * 100}%`,
                        }}
                      />
                    </div>
                  ) : (
                    <span className="rf-meta">
                      {result.status === "invalid"
                        ? result.reason
                        : "Incomplete reporting"}
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
}
