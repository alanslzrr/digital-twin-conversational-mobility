import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUi } from "@/i18n/provider";
import { type DurationGroup, validateDuration } from "./core";
/** Present existing metrics.durations only after its authenticated read succeeds. */
export function OperationDurationRows({
  groups,
}: {
  groups: readonly DurationGroup[];
}) {
  const { t } = useUi();

  if (groups.length === 0)
    return (
      <p className="rf-meta">
        {t("OperationDurationRows.noRecordedOperationDurationSamplesReturned")}
      </p>
    );
  if (groups.length > 25)
    return (
      <p className="rf-meta">
        {t(
          "OperationDurationRows.durationGroupsExceedTheVerifiedReaderLimitInspectThe",
        )}
      </p>
    );
  const operations = [...new Set(groups.map((g) => g.operation))].sort();
  return (
    <div className="rf-duration-groups">
      <p className="rf-meta">
        {t(
          "OperationDurationRows.filledDotMedianOutlineSquareP95RecordedSummariesNot",
        )}
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
              <span className="rf-meta">
                {t("OperationDurationRows.recordedMsScale0")}
                {max}
              </span>
            </div>
            <section
              className="rf-table-region"
              aria-label={`${operation} recorded durations`}
            >
              <Table aria-label={`${operation.replaceAll("_", " ")} durations`}>
                <caption className="sr-only">
                  {t(
                    "OperationDurationRows.medianDotAndP95SquareAreSummaryStatisticsNot",
                  )}
                </caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("activityView.component")}</TableHead>
                    <TableHead className="rf-number">
                      {t("OperationDurationRows.samples")}
                    </TableHead>
                    <TableHead className="rf-number">
                      {t("OperationDurationRows.medianMs")}
                    </TableHead>
                    <TableHead className="rf-number">
                      {t("OperationDurationRows.p95Ms")}
                    </TableHead>
                    <TableHead>{t("OperationDurationRows.summary")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((g) => (
                    <TableRow key={`${g.component}:${g.operation}`}>
                      <TableCell>{g.component}</TableCell>
                      <TableCell className="rf-number">{g.n}</TableCell>
                      <TableCell className="rf-number">
                        {g.medianMs === null
                          ? t("activityView.unavailable")
                          : String(g.medianMs)}
                      </TableCell>
                      <TableCell className="rf-number">
                        {g.p95Ms === null
                          ? g.n < 20
                            ? t("OperationDurationRows.unavailableN20")
                            : t("activityView.unavailable")
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
                            {t(
                              "OperationDurationRows.summaryUnavailableInconsistentFields",
                            )}
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
