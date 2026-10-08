# Integration marks

Locally served artwork, retrieved 8 October 2026. These marks identify sources
and software used by the project, not endorsement or a commercial partnership.
Brand rights remain with their respective owners, outside this repository's MIT
license. Exact source URLs are recorded in `sources.json`.

- **Renfe:** transparent SVG from the official Grupo Renfe website:
  https://grupo.renfe.com/content/dam/grupo-renfe/logos/logo-renfe.svg
  Brand information: https://grupo.renfe.com/es/es/sala-de-prensa/marca
- **EMT Madrid:** transparent blue PNG referenced by the official website's
  stylesheet, replacing the white-background press thumbnail:
  https://www.emtmadrid.es/App_Themes/EMTMadrid/images/logo_emtmadrid_m.png
  The press gallery at https://www.emtmadrid.es/Sala-de-prensa/logos requests
  contact before logo use. No permission is claimed; resolve before publication.
- **BiciMAD:** original transparent website SVG:
  https://www.bicimad.com/themes/custom/bicimad/logo.svg
- **AEMET:** the standalone `aemet_institucional_pos` path from the official
  header SVG at https://www.aemet.es/es/imagen-logo1. The government lockup and
  its yellow background are omitted, rather than recolored or redrawn. The
  standalone viewBox has transparent space around the unchanged path; its SHA256
  is recorded in `sources.json` and checked by a presentation regression.
- **eve / Next.js:** official transparent light and dark SVG variants from
  https://vercel.com/geist/brands, replacing the former boxed symbols. The exact
  hashed asset URLs are recorded; upstream bundles are also available at:
  https://k2mkucxia43oc7fa.public.blob.vercel-storage.com/front/press/eve-assets.zip
  https://k2mkucxia43oc7fa.public.blob.vercel-storage.com/front/press/nextjs-assets.zip
  The existing upstream Apache-2.0 license/notices remain in the vendor directory.
- **React:** original colored SVG from https://github.com/glincker/thesvg at the
  pinned commit in `sources.json`; its MIT notice remains in `LICENSE-thesvg`.

## Theme adaptations

Marks sit directly on the page, without colored tiles or a surrounding panel.
Official light/dark variants are selected using the existing root theme attribute.
For BiciMAD and AEMET, CSS supplies a white negative in dark mode without
changing alpha or path geometry. This is a local presentation adaptation, not a
claim that the derivative is an officially supplied negative. Renfe keeps its original magenta in both themes; EMT and React
retain their original blues. No raster pixels were edited or logos traced.

SVG title elements were added for accessibility. Images are served locally and
rendered as images, not injected markup; no scripts or external resource links
are embedded. Proportions remain intact through object-fit sizing.

Vercel, the Vercel design, Next.js and related marks, designs and logos are
trademarks or registered trademarks of Vercel, Inc. or its affiliates in the US
and other countries.
