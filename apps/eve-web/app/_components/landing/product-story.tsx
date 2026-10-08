"use client";

import { useEffect, useRef, useState } from "react";
import { useUi } from "@/i18n/provider";
import s from "./landing.module.css";
import { ProductPreview } from "./product-preview";
import { useLandingReducedMotion } from "./use-flow-clock";

function StoryVisual({ index }: { index: number }) {
  const { t } = useUi();
  const [evidence, setEvidence] = useState<"overview" | "bikes">("overview");
  const view =
    index === 3
      ? evidence
      : index === 1
        ? "tools"
        : index === 2
          ? "context"
          : "conversation";
  return (
    <div>
      <div className={s.storyToolbar}>
        {index === 3 ? (
          <fieldset
            className={s.evidenceSelector}
            aria-label={t("landing.evidenceViews")}
          >
            {(["overview", "bikes"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={evidence === value}
                onClick={() => setEvidence(value)}
              >
                {t(`landing.${value}Tab`)}
              </button>
            ))}
          </fieldset>
        ) : (
          <p className={s.previewLabel}>{t("landing.exampleInteractive")}</p>
        )}
      </div>
      <ProductPreview view={view} />
    </div>
  );
}
const steps = ["Question", "Tools", "Context", "Explore"] as const;
export function ProductStory() {
  const { t } = useUi();
  const reduced = useLandingReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => {
    setEnhanced(true);
    let observer: IntersectionObserver;
    const observe = () => {
      observer?.disconnect();
      // Vertical percentage root margins resolve against viewport width, not
      // height. A pixel centerline stays valid on wide and short viewports.
      const top = Math.floor(window.innerHeight / 2);
      const bottom = Math.max(0, window.innerHeight - top - 1);
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting)
              setActive(Number((entry.target as HTMLElement).dataset.step));
          }
        },
        { rootMargin: `-${top}px 0px -${bottom}px 0px` },
      );
      for (const row of root.current?.querySelectorAll("[data-step]") ?? [])
        observer.observe(row);
    };
    observe();
    window.addEventListener("resize", observe);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", observe);
    };
  }, []);
  return (
    <section
      id="producto"
      className={`${s.section} ${s.product}`}
      aria-labelledby="product-title"
    >
      <div className={s.sectionHeading}>
        <p className={s.eyebrow}>{t("landing.productEyebrow")}</p>
        <h2 id="product-title" tabIndex={-1}>
          {t("landing.productTitle")}
        </h2>
        <p>{t("landing.productBody")}</p>
      </div>
      <div
        ref={root}
        className={s.storyGrid}
        data-enhanced={enhanced && !reduced}
      >
        <div className={s.storyCopy}>
          {steps.map((step, index) => (
            <article
              key={step}
              data-step={index}
              data-active={active === index}
              className={s.storyStep}
            >
              <div className={s.storyStepCopy}>
                <span className={s.stepNumber}>0{index + 1}</span>
                <h3>{t(`landing.story${step}`)}</h3>
                <p>{t(`landing.story${step}Body`)}</p>
              </div>
              <div className={s.inlineVisual}>
                <StoryVisual index={index} />
              </div>
            </article>
          ))}
        </div>
        <div className={s.stickyVisual}>
          <div className={s.stickyInner}>
            <StoryVisual index={active} />
          </div>
        </div>
      </div>
    </section>
  );
}
