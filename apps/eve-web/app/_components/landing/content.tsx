"use client";

import {
  ArrowDown,
  ArrowRight,
  Bike,
  BusFront,
  Check,
  ChevronDown,
  CloudSun,
  Database,
  Footprints,
  History,
  Menu,
  MessageCircle,
  Search,
  TrainFront,
} from "lucide-react";
import { useRef } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { MobaiBrand } from "@/components/mobai-brand";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useUi } from "@/i18n/provider";
import s from "./landing.module.css";
import { landingLinks, landingNavigation } from "./links";
import { LogoMarquee } from "./logo-marquee";
import {
  BikesExample,
  ConversationExample,
  ExampleLabel,
  OverviewExample,
} from "./product-preview";

export function LandingHeader() {
  const { t } = useUi();
  const firstNavigation = useRef<HTMLAnchorElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const homeLink = useRef<HTMLAnchorElement>(null);
  return (
    <header className={s.header}>
      <a href="#main-content" className={s.skip}>
        {t("landing.skip")}
      </a>
      <div className={s.headerInner}>
        <a ref={homeLink} href="/" aria-label={t("landing.home")}>
          <MobaiBrand size="navigation" />
        </a>
        <nav className={s.desktopNav} aria-label={t("landing.navigation")}>
          {landingNavigation.map(({ href, key }) => (
            <a key={href} href={href}>
              {t(key)}
            </a>
          ))}
        </nav>
        <div className={s.headerActions}>
          <div className={s.desktopPreferences}>
            <LocaleSwitcher />
            <ThemeSwitcher />
          </div>
          <Button asChild size="sm" className={s.headerAccess}>
            <a href={landingLinks.access}>
              {t("landing.access")}
              <ArrowRight aria-hidden="true" />
            </a>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button
                ref={menuTrigger}
                variant="ghost"
                size="icon-lg"
                className={s.mobileMenu}
                aria-label={t("landing.menu")}
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent
              className={s.menuPanel}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                firstNavigation.current?.focus();
              }}
              onCloseAutoFocus={(event) => {
                if (menuTrigger.current?.getClientRects().length) return;
                event.preventDefault();
                // The menu trigger disappears when resizing to desktop.
                const target = homeLink.current?.getClientRects().length
                  ? homeLink.current
                  : menuTrigger.current;
                target?.focus({ preventScroll: true });
              }}
            >
              <SheetHeader>
                <SheetTitle>{t("landing.menu")}</SheetTitle>
                <SheetDescription>
                  {t("landing.footerDescription")}
                </SheetDescription>
              </SheetHeader>
              <nav aria-label={t("landing.navigation")} className={s.mobileNav}>
                {landingNavigation.map(({ href, key }, index) => (
                  <SheetClose asChild key={href}>
                    <a
                      href={href}
                      ref={index === 0 ? firstNavigation : undefined}
                    >
                      {t(key)}
                      <ArrowRight aria-hidden="true" />
                    </a>
                  </SheetClose>
                ))}
              </nav>
              <div className={s.menuPreferences}>
                <LocaleSwitcher />
                <ThemeSwitcher />
              </div>
              <Button asChild>
                <a href={landingLinks.access}>
                  {t("landing.access")}
                  <ArrowRight aria-hidden="true" />
                </a>
              </Button>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
export function HeroIntro() {
  const { t } = useUi();
  return (
    <div className={s.heroIntro}>
      <p className={s.eyebrow}>{t("landing.eyebrow")}</p>
      <h1 id="landing-title">
        {t("landing.heroTitle")}
        <br />
        <span>{t("landing.heroTitleEnd")}</span>
      </h1>
      <p className={s.heroBody}>{t("landing.heroBody")}</p>
      <div className={s.ctas}>
        <Button asChild size="lg">
          <a href={landingLinks.access}>
            {t("landing.access")}
            <ArrowRight aria-hidden="true" />
          </a>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href="#producto">
            {t("landing.seeProduct")}
            <ArrowDown aria-hidden="true" />
          </a>
        </Button>
      </div>
      <p className={s.accessNote}>{t("landing.accessNote")}</p>
    </div>
  );
}
function EvidenceFields() {
  const { t } = useUi();
  return (
    <div className={s.evidenceFields}>
      {(["source", "observed", "ingested"] as const).map((key) => (
        <div key={key}>
          <Check size={16} aria-hidden="true" />
          <span>{t(`landing.${key}`)}</span>
          <span className={s.fieldRule} />
        </div>
      ))}
    </div>
  );
}
export function Capabilities() {
  const { t } = useUi();
  return (
    <section
      id="capacidades"
      className={s.section}
      aria-labelledby="capabilities-title"
    >
      <div className={s.sectionHeading}>
        <p className={s.eyebrow}>{t("landing.capEyebrow")}</p>
        <h2 id="capabilities-title">{t("landing.capTitle")}</h2>
        <p>{t("landing.capBody")}</p>
      </div>
      <div className={s.bento}>
        <Card className={`${s.capCard} ${s.contextCard}`}>
          <div className={s.capCopy}>
            <MessageCircle size={22} aria-hidden="true" />
            <h3>{t("landing.capContext")}</h3>
            <p>{t("landing.capContextBody")}</p>
          </div>
          <div className={s.componentExample}>
            <ExampleLabel />
            <ConversationExample compact />
          </div>
        </Card>
        <Card className={`${s.capCard} ${s.transportCard}`}>
          <div className={s.transportGraphic} aria-hidden="true">
            <div>
              <TrainFront />
              <span>{t("landing.rail")}</span>
            </div>
            <span className={s.connector} />
            <div>
              <BusFront />
              <span>{t("landing.bus")}</span>
            </div>
            <span className={s.connector} />
            <div>
              <Footprints />
              <span>{t("landing.walk")}</span>
            </div>
          </div>
          <div className={s.capCopy}>
            <h3>{t("landing.capTransport")}</h3>
            <p>{t("landing.capTransportBody")}</p>
          </div>
        </Card>
        <Card className={`${s.capCard} ${s.placesCard}`}>
          <div className={s.componentExample}>
            <ExampleLabel />
            <BikesExample compact />
          </div>
          <div className={s.capCopy}>
            <Bike size={22} aria-hidden="true" />
            <h3>{t("landing.capPlaces")}</h3>
            <p>{t("landing.capPlacesBody")}</p>
          </div>
        </Card>
        <Card className={`${s.capCard} ${s.weatherCard}`}>
          <div className={s.weatherGraphic} aria-hidden="true">
            <CloudSun strokeWidth={1} />
            <div>
              <span>{t("landing.observation")}</span>
              <span>{t("landing.forecast")}</span>
            </div>
          </div>
          <div className={s.capCopy}>
            <h3>{t("landing.capWeather")}</h3>
            <p>{t("landing.capWeatherBody")}</p>
          </div>
        </Card>
        <Card className={`${s.capCard} ${s.evidenceCard}`}>
          <EvidenceFields />
          <div className={s.capCopy}>
            <h3>{t("landing.capEvidence")}</h3>
            <p>{t("landing.capEvidenceBody")}</p>
          </div>
        </Card>
        <Card className={`${s.capCard} ${s.historyCard}`}>
          <div className={s.capCopy}>
            <History size={22} aria-hidden="true" />
            <h3>{t("landing.capHistory")}</h3>
            <p>{t("landing.capHistoryBody")}</p>
          </div>
          <div className={s.componentExample}>
            <ExampleLabel />
            <OverviewExample compact />
          </div>
        </Card>
      </div>
      <p className={s.sectionNote}>{t("landing.exampleDisclaimer")}</p>
    </section>
  );
}
export function Provenance() {
  const { t } = useUi();
  const flow = [
    ["Publish", Database],
    ["Store", History],
    ["Query", Search],
    ["Result", MessageCircle],
  ] as const;
  return (
    <section
      id="fuentes"
      className={`${s.section} ${s.sources}`}
      aria-labelledby="sources-title"
    >
      <div className={s.sectionHeading}>
        <p className={s.eyebrow}>{t("landing.sourcesEyebrow")}</p>
        <h2 id="sources-title">
          {t("landing.sourcesTitle")}
          <br />
          <span>{t("landing.sourcesTitleEnd")}</span>
        </h2>
        <p>{t("landing.sourcesBody")}</p>
      </div>
      <ol className={s.sourceFlow}>
        {flow.map(([key, Icon], index) => (
          <li key={key}>
            <span className={s.flowIndex}>0{index + 1}</span>
            <Icon size={26} strokeWidth={1.4} aria-hidden="true" />
            <h3>{t(`landing.source${key}`)}</h3>
            <p>{t(`landing.source${key}Sub`)}</p>
            {index < 3 && (
              <ArrowRight className={s.flowArrow} aria-hidden="true" />
            )}
          </li>
        ))}
      </ol>
      <div className={s.provenanceDetails}>
        <div>
          <h3>{t("landing.observed")}</h3>
          <p>{t("landing.observedBody")}</p>
        </div>
        <div>
          <h3>{t("landing.ingested")}</h3>
          <p>{t("landing.ingestedBody")}</p>
        </div>
        <div>
          <div className={s.states}>
            <span data-kind="recent">{t("landing.stateRecent")}</span>
            <span data-kind="stale">{t("landing.stateStale")}</span>
            <span data-kind="missing">{t("landing.stateMissing")}</span>
          </div>
          <p>{t("landing.stateBody")}</p>
        </div>
      </div>
      <LogoMarquee />
      <div className={s.sourceList}>
        <a href={landingLinks.sources} className={s.textLink}>
          {t("landing.sourceDetails")}
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
export function Faq() {
  const { t } = useUi();
  return (
    <section
      id="preguntas"
      className={`${s.section} ${s.faq}`}
      aria-labelledby="faq-title"
    >
      <div className={s.sectionHeading}>
        <p className={s.eyebrow}>{t("landing.faqEyebrow")}</p>
        <h2 id="faq-title">{t("landing.faqTitle")}</h2>
      </div>
      <div className={s.faqList}>
        {(["Access", "Coverage", "Live", "Modes", "Code"] as const).map(
          (key) => (
            <details key={key}>
              <summary>
                {t(`landing.faq${key}Q`)}
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <p>
                {t(`landing.faq${key}A`)}
                {key === "Code" && (
                  <>
                    {" "}
                    <a href={landingLinks.repository}>{t("landing.code")}</a> ·{" "}
                    <a href={landingLinks.docs}>{t("landing.docs")}</a>
                  </>
                )}
              </p>
            </details>
          ),
        )}
      </div>
    </section>
  );
}
export function Closing() {
  const { t } = useUi();
  return (
    <section className={s.closing} aria-labelledby="closing-title">
      <div>
        <h2 id="closing-title">{t("landing.closingTitle")}</h2>
        <p>{t("landing.closingBody")}</p>
      </div>
      <div className={s.ctas}>
        <Button asChild size="lg">
          <a href={landingLinks.access}>
            {t("landing.access")}
            <ArrowRight aria-hidden="true" />
          </a>
        </Button>
        <a className={s.textLink} href={landingLinks.docs}>
          {t("landing.docs")}
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
export function LandingFooter() {
  const { t } = useUi();
  return (
    <footer className={s.footer}>
      <div className={s.footerMain}>
        <div>
          <a href="/" aria-label={t("landing.home")}>
            <MobaiBrand size="navigation" />
          </a>
          <p>{t("landing.footerDescription")}</p>
        </div>
        <nav aria-label={t("landing.navigation")}>
          {landingNavigation.map(({ href, key }) => (
            <a key={href} href={href}>
              {t(key)}
            </a>
          ))}
        </nav>
        <nav aria-label={t("landing.footerLinks")}>
          {(["docs", "repository", "license", "video"] as const).map((key) => (
            <a key={key} href={key === "video" ? "#demo" : landingLinks[key]}>
              {t(`landing.${key === "repository" ? "code" : key}`)}
            </a>
          ))}
        </nav>
      </div>
      <div className={s.footerBottom}>
        <p>{t("landing.footerScope")}</p>
      </div>
    </footer>
  );
}
