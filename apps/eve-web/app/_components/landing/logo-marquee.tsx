"use client";

import { Pause, Play } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useUi } from "@/i18n/provider";
import s from "./showcase.module.css";
import { useLandingReducedMotion } from "./use-flow-clock";

type IntegrationLogo = {
  name: string;
  file: string;
  darkFile?: string;
  negativeOnDark?: boolean;
  width: number;
  height: number;
  displayWidth: number;
  kind: "data" | "technology";
};
export const integrationLogos: readonly IntegrationLogo[] = [
  {
    name: "Renfe",
    file: "renfe.svg",
    width: 106,
    height: 41,
    displayWidth: 126,
    kind: "data",
  },
  {
    name: "EMT Madrid",
    file: "emt.png",
    width: 375,
    height: 100,
    displayWidth: 144,
    kind: "data",
  },
  {
    name: "BiciMAD",
    file: "bicimad.svg",
    width: 171,
    height: 43,
    displayWidth: 142,
    negativeOnDark: true,
    kind: "data",
  },
  {
    name: "AEMET",
    file: "aemet.svg",
    width: 206,
    height: 55,
    displayWidth: 164,
    negativeOnDark: true,
    kind: "data",
  },
  {
    name: "eve",
    file: "eve-light.svg",
    darkFile: "eve-dark.svg",
    width: 169,
    height: 53,
    displayWidth: 110,
    kind: "technology",
  },
  {
    name: "Next.js",
    file: "nextjs-light.svg",
    darkFile: "nextjs-dark.svg",
    width: 278,
    height: 56,
    displayWidth: 138,
    kind: "technology",
  },
  {
    name: "React",
    file: "react.svg",
    width: 569,
    height: 512,
    displayWidth: 48,
    kind: "technology",
  },
];

export function LogoMarquee() {
  const { t } = useUi();
  const reduced = useLandingReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry?.isIntersecting ?? false),
    );
    if (root.current) observer.observe(root.current);
    const update = () => setPageVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return (
    <div ref={root} className={s.integrations}>
      <div className={s.integrationHeading}>
        <h3>{t("landing.integrationsTitle")}</h3>
        <p>{t("landing.integrationsBody")}</p>
      </div>
      <div
        className={s.marquee}
        data-reduced={reduced}
        data-running={!paused && !reduced && visible && pageVisible}
      >
        <div className={s.marqueeTrack}>
          {[false, true].map((duplicate) => (
            <ul
              key={String(duplicate)}
              aria-hidden={duplicate || undefined}
              className={s.logoGroup}
            >
              {integrationLogos.map((logo) => (
                <li key={logo.name}>
                  <div
                    className={s.logoAsset}
                    data-negative={logo.negativeOnDark || undefined}
                    style={{ width: logo.displayWidth }}
                  >
                    <Image
                      src={`/brand/integrations/${logo.file}`}
                      className={logo.darkFile ? s.logoLight : undefined}
                      alt=""
                      width={logo.width}
                      height={logo.height}
                      unoptimized
                      loading="lazy"
                    />
                    {logo.darkFile && (
                      <Image
                        src={`/brand/integrations/${logo.darkFile}`}
                        className={s.logoDark}
                        alt=""
                        width={logo.width}
                        height={logo.height}
                        unoptimized
                        loading="lazy"
                      />
                    )}
                  </div>
                  <span>{logo.name}</span>
                  <small>
                    {t(
                      logo.kind === "data"
                        ? "landing.integrationData"
                        : "landing.integrationTech",
                    )}
                  </small>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
      <div className={s.marqueeFooter}>
        <p>{t("landing.integrationDisclaimer")}</p>
        <Button
          variant="ghost"
          size="sm"
          disabled={reduced}
          onClick={() => setPaused((value) => !value)}
          aria-label={t(
            reduced
              ? "landing.staticMotion"
              : paused
                ? "landing.resumeLogos"
                : "landing.pauseLogos",
          )}
        >
          {paused || reduced ? (
            <Play aria-hidden="true" />
          ) : (
            <Pause aria-hidden="true" />
          )}
          {t(
            reduced
              ? "landing.staticShort"
              : paused
                ? "landing.playShort"
                : "landing.pauseShort",
          )}
        </Button>
      </div>
    </div>
  );
}
