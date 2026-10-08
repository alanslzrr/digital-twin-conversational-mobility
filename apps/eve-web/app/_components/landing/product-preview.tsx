"use client";

import {
  Bike,
  Check,
  ChevronDown,
  Clock3,
  Database,
  MapPin,
  MessageCircle,
  TrainFront,
  Wrench,
} from "lucide-react";
import { MobaiBrand } from "@/components/mobai-brand";
import { Badge } from "@/components/ui/badge";
import { useUi } from "@/i18n/provider";
import s from "./preview.module.css";

export type PreviewView =
  | "conversation"
  | "tools"
  | "context"
  | "overview"
  | "bikes";

/** Presentation-only examples. Never passed to a tool, store, or chat runtime. */
export function ExampleLabel() {
  const { t } = useUi();
  return (
    <Badge variant="outline" className={s.exampleLabel}>
      {t("landing.exampleLabel")}
    </Badge>
  );
}

export function ConversationExample({
  followup = false,
  compact = false,
}: {
  followup?: boolean;
  compact?: boolean;
}) {
  const { t } = useUi();
  return (
    <div className={`${s.conversation} ${compact ? s.compact : ""}`}>
      <p className={s.userMessage}>{t("landing.exampleQuestion")}</p>
      <div className={s.toolStatus}>
        <Wrench size={14} aria-hidden="true" />
        <span>mobility__plan_journey</span>
        <Check size={14} aria-hidden="true" />
      </div>
      <p className={s.answer}>{t("landing.exampleAnswer")}</p>
      <div className={s.journey}>
        <TrainFront size={20} aria-hidden="true" />
        <div>
          <strong>
            Atocha <span aria-hidden="true">→</span> Chamartín
          </strong>
          <span>{t("landing.exampleJourney")}</span>
        </div>
        <Badge variant="secondary">{t("landing.rail")}</Badge>
      </div>
      <p className={s.evidenceNote}>
        <Clock3 size={14} aria-hidden="true" />
        {t("landing.exampleEvidenceNote")}
      </p>
      {followup && (
        <>
          <p className={s.userMessage}>{t("landing.exampleFollowup")}</p>
          <p className={s.answer}>{t("landing.exampleFollowupAnswer")}</p>
        </>
      )}
    </div>
  );
}

export function ToolsExample() {
  const { t } = useUi();
  return (
    <div className={s.tools}>
      <p className={s.miniHeading}>{t("landing.exampleToolsHeading")}</p>
      {["mobility__resolve_place", "mobility__plan_journey"].map(
        (tool, index) => (
          <details key={tool} open={index === 1} className={s.toolDisclosure}>
            <summary>
              <Wrench size={15} aria-hidden="true" />
              <code>{tool}</code>
              <ChevronDown size={15} aria-hidden="true" />
            </summary>
            <dl>
              {index === 0 ? (
                <>
                  <div>
                    <dt>{t("landing.exampleMode")}</dt>
                    <dd>Atocha</dd>
                  </div>
                  <div>
                    <dt>{t("landing.source")}</dt>
                    <dd>Renfe</dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt>{t("landing.exampleOrigin")}</dt>
                    <dd>Atocha</dd>
                  </div>
                  <div>
                    <dt>{t("landing.exampleDestination")}</dt>
                    <dd>Chamartín</dd>
                  </div>
                  <div>
                    <dt>{t("landing.exampleMode")}</dt>
                    <dd>{t("landing.exampleTransit")}</dd>
                  </div>
                </>
              )}
            </dl>
            <p className={s.toolResult}>
              <Check size={14} aria-hidden="true" />
              {t("landing.exampleToolResult")}
            </p>
          </details>
        ),
      )}
      <p className={s.evidenceNote}>{t("landing.exampleNoExecution")}</p>
    </div>
  );
}

export function OverviewExample({ compact = false }: { compact?: boolean }) {
  const { t } = useUi();
  const rows = [
    {
      key: "rail",
      state: "stateRecent",
      kind: "recent",
      observed: "14:30",
      received: "14:32",
    },
    {
      key: "forecast",
      state: "stateStale",
      kind: "stale",
      observed: "09:00",
      received: "09:02",
    },
    {
      key: "exampleParking",
      state: "stateMissing",
      kind: "missing",
      observed: "—",
      received: "—",
    },
  ] as const;
  return (
    <div className={s.overview}>
      {!compact && (
        <div className={s.metrics}>
          <div>
            <span>{t("landing.exampleProducts")}</span>
            <strong>16</strong>
          </div>
          <div>
            <span>{t("landing.exampleUsable")}</span>
            <strong>12</strong>
          </div>
          <div>
            <span>{t("landing.exampleAttention")}</span>
            <strong>4</strong>
          </div>
        </div>
      )}
      <div className={s.evidenceTable}>
        <table>
          <caption>{t("landing.exampleTableTitle")}</caption>
          <thead>
            <tr>
              <th>{t("landing.source")}</th>
              <th>{t("landing.exampleState")}</th>
              {!compact && (
                <th>
                  {t("landing.observed")} / {t("landing.ingested")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{t(`landing.${row.key}`)}</th>
                <td>
                  <span className={s.status} data-kind={row.kind}>
                    {t(`landing.${row.state}`)}
                  </span>
                </td>
                {!compact && (
                  <td className={s.time}>
                    {row.observed} / {row.received}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={s.evidenceNote}>{t("landing.exampleTimes")}</p>
    </div>
  );
}

export function BikesExample({ compact = false }: { compact?: boolean }) {
  const { t } = useUi();
  return (
    <div className={`${s.bikes} ${compact ? s.compact : ""}`}>
      <div className={s.schematic} aria-hidden="true">
        <svg viewBox="0 0 360 170" aria-hidden="true">
          <path
            className={s.mapBlock}
            d="M-30 22L96 0 144 58 88 102 0 75ZM178 0H350L385 58 260 85ZM160 91L213 129 195 190H80Z"
          />
          <path
            className={s.mapStreet}
            d="M-10 112L370 25M83 -10L280 190M-20 40L378 156"
          />
          <path className={s.mapWalk} d="M110 79Q149 118 245 119" />
          <circle cx="110" cy="79" r="14" />
          <circle cx="245" cy="119" r="14" />
          <text x="110" y="84">
            A
          </text>
          <text x="245" y="124">
            B
          </text>
        </svg>
        <span>{t("landing.exampleMap")}</span>
      </div>
      <div className={s.station}>
        <span className={s.stationIcon}>
          <Bike size={21} aria-hidden="true" />
        </span>
        <div>
          <strong>{t("landing.exampleStation")} A</strong>
          <span>{t("landing.exampleBikesSource")}</span>
        </div>
        <Badge variant="secondary">{t("landing.stateRecent")}</Badge>
      </div>
      <div className={s.availability}>
        <div>
          <strong>8</strong>
          <span>{t("landing.exampleBikes")}</span>
        </div>
        <div>
          <strong>12</strong>
          <span>{t("landing.exampleDocks")}</span>
        </div>
      </div>
      {!compact && (
        <div className={s.station}>
          <span className={s.stationIcon}>
            <MapPin size={21} aria-hidden="true" />
          </span>
          <div>
            <strong>{t("landing.exampleStation")} B</strong>
            <span>{t("landing.stateMissing")}</span>
          </div>
          <strong className={s.missing}>—</strong>
        </div>
      )}
    </div>
  );
}

export function ProductPreview({ view }: { view: PreviewView }) {
  const { t } = useUi();
  return (
    <div className={s.preview} data-preview={view}>
      <div className={s.previewHeader}>
        <MobaiBrand size="navigation" />
        <ExampleLabel />
      </div>
      <div className={s.previewTitle}>
        {view === "overview" || view === "bikes" ? (
          <Database size={16} aria-hidden="true" />
        ) : (
          <MessageCircle size={16} aria-hidden="true" />
        )}
        <span>
          {t(
            view === "overview"
              ? "landing.overviewTab"
              : view === "bikes"
                ? "landing.exampleBikesTitle"
                : view === "tools"
                  ? "landing.exampleToolsTitle"
                  : "landing.exampleChatTitle",
          )}
        </span>
      </div>
      <div className={s.previewBody}>
        {(view === "conversation" || view === "context") && (
          <ConversationExample followup={view === "context"} />
        )}
        {view === "tools" && <ToolsExample />}
        {view === "overview" && <OverviewExample />}
        {view === "bikes" && <BikesExample />}
      </div>
      <p className={s.previewFootnote}>{t("landing.exampleDisclaimer")}</p>
    </div>
  );
}
