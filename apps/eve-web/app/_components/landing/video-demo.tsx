"use client";

import { ArrowUpRight, Play, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MobaiBrand } from "@/components/mobai-brand";
import { useUi } from "@/i18n/provider";
import layout from "./landing.module.css";
import { landingLinks } from "./links";
import s from "./showcase.module.css";

export function VideoDemo() {
  const { t, locale } = useUi();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (loaded) video.current?.focus({ preventScroll: true });
  }, [loaded]);
  return (
    <section id="demo" className={layout.section} aria-labelledby="demo-title">
      <div className={layout.sectionHeading}>
        <p className={layout.eyebrow}>{t("landing.demoEyebrow")}</p>
        <h2 id="demo-title">{t("landing.demoTitle")}</h2>
        <p>{t("landing.demoBody")}</p>
      </div>
      <div className={s.videoFrame}>
        {loaded ? (
          <video
            ref={video}
            controls
            autoPlay
            playsInline
            preload="none"
            tabIndex={0}
            aria-label={t("landing.demoTitle")}
            onError={() => setFailed(true)}
            src={landingLinks.video}
          >
            <track
              kind="captions"
              src={`/demo/captions-${locale}.vtt`}
              srcLang={locale}
              label={locale === "es" ? "Español" : "English"}
            />
            <a href={landingLinks.video}>{t("landing.video")}</a>
          </video>
        ) : (
          <button
            type="button"
            className={s.videoCover}
            onClick={() => setLoaded(true)}
            aria-label={t("landing.playDemo")}
          >
            <span className={s.videoBrand}>
              <MobaiBrand size="navigation" />
              <Video size={18} aria-hidden="true" />
            </span>
            <span className={s.videoHeadline}>{t("landing.demoCover")}</span>
            <span className={s.videoPlay}>
              <Play size={24} fill="currentColor" aria-hidden="true" />
            </span>
            <span className={s.videoPrompt}>{t("landing.playDemo")}</span>
          </button>
        )}
      </div>
      <div className={s.videoMeta}>
        <p>
          {t("landing.demoHistorical")} {t("landing.demoExternal")}
        </p>
        <a
          href={landingLinks.video}
          className={layout.textLink}
          target="_blank"
          rel="noreferrer"
        >
          {t("landing.demoOriginal")}
          <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </div>
      {failed && (
        <p role="status" className={s.videoError}>
          {t("landing.demoError")}
        </p>
      )}
      <details className={s.videoTranscript}>
        <summary>{t("landing.demoSummary")}</summary>
        <p>{t("landing.demoSummaryBody")}</p>
      </details>
    </section>
  );
}
