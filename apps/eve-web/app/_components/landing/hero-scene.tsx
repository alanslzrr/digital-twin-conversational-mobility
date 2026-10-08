"use client";

import {
  Database,
  MapPin,
  MessageCircle,
  Pause,
  Play,
  Route,
  UserRound,
} from "lucide-react";
import { type MotionValue, motion, useTransform } from "motion/react";
import { Button } from "@/components/ui/button";
import { useUi } from "@/i18n/provider";
import { flowPacket } from "./flow-clock";
import s from "./landing.module.css";
import { useFlowClock } from "./use-flow-clock";

const stages = ["Question", "Places", "Data", "Provenance", "Answer"] as const;
type Point = readonly [number, number];
type Curve = readonly [Point, Point, Point, Point];
function point(curve: Curve, t: number, axis: 0 | 1) {
  const u = 1 - t;
  return (
    u ** 3 * curve[0][axis] +
    3 * u ** 2 * t * curve[1][axis] +
    3 * u * t ** 2 * curve[2][axis] +
    t ** 3 * curve[3][axis]
  );
}
function Packet({
  curve,
  elapsed,
  edge,
  packet,
}: {
  curve: Curve;
  elapsed: MotionValue<number>;
  edge: number;
  packet: number;
}) {
  const position = useTransform(
    elapsed,
    (time) => flowPacket(time, edge, packet).progress,
  );
  const x = useTransform(position, (value) => point(curve, value, 0));
  const y = useTransform(position, (value) => point(curve, value, 1));
  const opacity = useTransform(
    elapsed,
    (time) => flowPacket(time, edge, packet).opacity,
  );
  return (
    <motion.circle
      data-flow-particle=""
      cx={x}
      cy={y}
      r={packet % 2 ? 3.5 : 3}
      className={packet % 2 ? s.returnParticle : s.particle}
      style={{ opacity }}
    />
  );
}
function Edge({
  curve,
  elapsed,
  edge,
  reduced,
}: {
  curve: Curve;
  elapsed: MotionValue<number>;
  edge: number;
  reduced: boolean;
}) {
  const opacity = useTransform(
    elapsed,
    (time) => flowPacket(time, edge, 0).opacity * 0.5,
  );
  const d = `M${curve[0].join(",")} C${curve[1].join(",")} ${curve[2].join(",")} ${curve[3].join(",")}`;
  return (
    <g>
      <path d={d} className={s.edge} />
      {!reduced && (
        <>
          <motion.path d={d} className={s.activeEdge} style={{ opacity }} />
          {[0, 1, 2, 3].map((packet) => (
            <Packet
              key={packet}
              curve={curve}
              elapsed={elapsed}
              edge={edge}
              packet={packet}
            />
          ))}
        </>
      )}
    </g>
  );
}
function Platform({
  x,
  y,
  kind,
  active,
  compact,
  reduced,
}: {
  x: number;
  y: number;
  kind: "Person" | "Chat" | "Core" | "Data" | "Planner";
  active: boolean;
  compact: boolean;
  reduced: boolean;
}) {
  const { t } = useUi();
  const width = compact ? 112 : kind === "Core" ? 184 : 158;
  const h = compact ? 28 : 40;
  const w = width / 2;
  const Icon = {
    Person: UserRound,
    Chat: MessageCircle,
    Core: MapPin,
    Data: Database,
    Planner: Route,
  }[kind];
  return (
    <g
      transform={`translate(${x} ${y})`}
      className={s.platform}
      data-active={active}
    >
      {reduced ? (
        <rect
          x={-w}
          y={-h}
          width={width}
          height={h * 2}
          rx="18"
          className={s.plateTop}
        />
      ) : (
        <>
          <path
            d={`M${-w} 0 L0 ${h} L${w} 0 V16 L0 ${h + 16} L${-w} 16 Z`}
            className={s.plateSide}
          />
          <path
            d={`M0 ${-h} L${w} 0 L0 ${h} L${-w} 0 Z`}
            className={s.plateTop}
          />
          <path d={`M0 ${h} V${h + 16}`} className={s.plateSeam} />
        </>
      )}
      <g transform="translate(-15 -21)">
        <Icon width="30" height="30" strokeWidth="1.4" />
      </g>
      <text y={h + 45} className={s.nodeTitle}>
        {compact && kind === "Data"
          ? t("landing.nodeData")
              .split(" ")
              .map((word, index) => (
                <tspan key={word} x="0" dy={index === 0 ? 0 : 20}>
                  {word}
                </tspan>
              ))
          : t(`landing.node${kind}`)}
      </text>
      {(!compact || (kind !== "Data" && kind !== "Planner")) && (
        <text y={h + 65} className={s.nodeSubtitle}>
          {t(`landing.node${kind}Sub`)}
        </text>
      )}
    </g>
  );
}
function Diagram({
  compact,
  elapsed,
  phase,
  reduced,
}: {
  compact: boolean;
  elapsed: MotionValue<number>;
  phase: number;
  reduced: boolean;
}) {
  const nodes = compact
    ? ([
        [170, 42],
        [170, 173],
        [170, 307],
        [82, 478],
        [258, 478],
      ] as const)
    : ([
        [112, 236],
        [369, 197],
        [659, 200],
        [983, 76],
        [983, 337],
      ] as const);
  const curves: Curve[] = compact
    ? [
        [
          [226, 42],
          [282, 78],
          [282, 140],
          [226, 173],
        ],
        [
          [114, 173],
          [58, 210],
          [58, 270],
          [114, 307],
        ],
        [
          [114, 307],
          [20, 342],
          [8, 450],
          [26, 478],
        ],
        [
          [226, 307],
          [320, 342],
          [332, 450],
          [314, 478],
        ],
      ]
    : [
        [
          [174, 215],
          [227, 148],
          [267, 148],
          [304, 180],
        ],
        [
          [435, 180],
          [495, 148],
          [539, 148],
          [584, 180],
        ],
        [
          [730, 181],
          [814, 97],
          [853, 76],
          [920, 76],
        ],
        [
          [730, 216],
          [807, 231],
          [865, 287],
          [918, 319],
        ],
      ];
  const kinds = ["Person", "Chat", "Core", "Data", "Planner"] as const;
  const active =
    [
      [0, 1],
      [1, 2],
      [2, 3, 4],
      [1, 2, 3, 4],
      [0, 1, 2],
    ][phase] ?? [];
  return (
    <svg
      viewBox={compact ? "0 0 340 600" : "0 0 1136 460"}
      className={compact ? s.mobileDiagram : s.desktopDiagram}
      aria-hidden="true"
    >
      {curves.map((curve, index) => (
        <Edge
          key={kinds[index]}
          curve={curve}
          elapsed={elapsed}
          reduced={reduced}
          edge={index}
        />
      ))}
      {nodes.map(([x, y], index) => (
        <Platform
          key={kinds[index]}
          x={x}
          y={y}
          kind={kinds[index] ?? "Core"}
          compact={compact}
          reduced={reduced}
          active={active.includes(index)}
        />
      ))}
    </svg>
  );
}
export function HeroScene() {
  const { t } = useUi();
  const { root, elapsed, phase, playing, reduced, toggle, select } =
    useFlowClock();
  const current = stages[phase] ?? "Question";
  return (
    <figure ref={root} className={s.scene} aria-label={t("landing.flowLabel")}>
      <div className={s.sceneStage}>
        <Diagram
          compact={false}
          elapsed={elapsed}
          phase={phase}
          reduced={reduced}
        />
        <Diagram compact elapsed={elapsed} phase={phase} reduced={reduced} />
      </div>
      <div className={s.sceneControls}>
        <Button
          variant="outline"
          size="icon-lg"
          onClick={toggle}
          disabled={reduced}
          aria-label={t(
            reduced
              ? "landing.staticMotion"
              : playing
                ? "landing.pause"
                : "landing.play",
          )}
          className={s.playButton}
        >
          {playing && !reduced ? (
            <Pause aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" />
          )}
        </Button>
        <ol className={s.stages} aria-label={t("landing.flowSteps")}>
          {stages.map((stage, index) => (
            <li key={stage}>
              <button
                type="button"
                onClick={() => select(index)}
                aria-current={phase === index ? "step" : undefined}
                className={s.stageButton}
              >
                <span className={s.stageRail} />
                <span className={s.stageNumber}>0{index + 1}</span>
                {t(`landing.flow${stage}`)}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className={s.sceneDescription}>
        <p>{t(`landing.flow${current}Body`)}</p>
      </div>
      <figcaption className={s.diagramNote}>
        {t("landing.diagramNote")}
      </figcaption>
    </figure>
  );
}
