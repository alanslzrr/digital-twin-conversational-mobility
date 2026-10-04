import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUi } from "@/i18n/provider";
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
  const { t } = useUi();

  if (turns.length === 0)
    return (
      <p className="rf-meta">
        {t("UsagePerTurnRows.noRetainedTurnsOnThisPage")}
      </p>
    );
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
        {t("UsagePerTurnRows.reportedInputAndOutputReturnedTurnPageOnly")}
      </p>
      <p className="rf-meta">
        {t("UsagePerTurnRows.solidInputStripedOutputBarsIncludeTheTwoParent")}
      </p>
      <section
        className="rf-table-region"
        aria-label={t("UsagePerTurnRows.reportedUsageByReturnedTurn")}
      >
        <Table aria-label={t("UsagePerTurnRows.reportedTokenUsageByTurn")}>
          <caption className="sr-only">
            {t(
              "UsagePerTurnRows.exactParentTokenCountsIncompleteOrInconsistentUsageIs",
            )}
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead>{t("conversationView.turn")}</TableHead>
              <TableHead>{t("conversationView.input2")}</TableHead>
              <TableHead>{t("conversationView.output2")}</TableHead>
              <TableHead>{t("UsagePerTurnRows.total")}</TableHead>
              <TableHead>{t("UsagePerTurnRows.reportedVolume")}</TableHead>
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
                    : t("UsagePerTurnRows.inconsistent")}
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
                        : t("UsagePerTurnRows.incompleteReporting")}
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
