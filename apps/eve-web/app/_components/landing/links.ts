const repository =
  "https://github.com/alanslzrr/digital-twin-conversational-mobility";

export const landingLinks = {
  access: "/evaluation",
  repository,
  docs: `${repository}/blob/main/docs/index.md`,
  sources: `${repository}/blob/main/docs/sources/README.md`,
  license: `${repository}/blob/main/LICENSE`,
  video:
    "https://github.com/user-attachments/assets/0e122168-1229-4229-b2bd-24607de5f756",
  attribution: "https://www.openstreetmap.org/copyright",
} as const;

export const landingNavigation = [
  { href: "#producto", key: "landing.navProduct" },
  { href: "#capacidades", key: "landing.navCapabilities" },
  { href: "#fuentes", key: "landing.navSources" },
  { href: "#demo", key: "landing.video" },
  { href: "#preguntas", key: "landing.navFaq" },
] as const;
