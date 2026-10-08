import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Capabilities,
  Closing,
  Faq,
  HeroIntro,
  LandingFooter,
  LandingHeader,
  Provenance,
} from "./_components/landing/content";
import { HeroScene } from "./_components/landing/hero-scene";
import styles from "./_components/landing/landing.module.css";
import { ProductStory } from "./_components/landing/product-story";
import { Reveal } from "./_components/landing/reveal";
import { VideoDemo } from "./_components/landing/video-demo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

/** Public presentation only. Protected runtimes are mounted on their own routes. */
export default function HomePage() {
  return (
    <div className={styles.page}>
      <LandingHeader />
      <main id="main-content" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="landing-title">
          <HeroIntro />
          <HeroScene />
        </section>
        <ProductStory />
        <Reveal>
          <Capabilities />
        </Reveal>
        <Reveal>
          <Provenance />
        </Reveal>
        <Reveal>
          <VideoDemo />
        </Reveal>
        <Reveal>
          <Faq />
        </Reveal>
        <Reveal>
          <Closing />
        </Reveal>
      </main>
      <LandingFooter />
    </div>
  );
}
