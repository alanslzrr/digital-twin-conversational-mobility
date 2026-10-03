# V2 synthetic application evidence

Application revision: `ee56a5a`. Agent-browser 0.38.2, isolated authenticated QA on 3002/3003, disposable schema and identities. No user sessions, private messages, credentials, cookies or provider secrets included. The public raster basemap is anonymous OSM; fixture entity coordinates are synthetic. Capture times intentionally differ: observation freshness can expire while the matrix runs; a successful screen read does not rejuvenate observations.

- `before/`: matching Overview desktop/mobile dark/light at baseline `fdb650e`.
- `stage1-final/`: four reviewed neutral shell/Overview captures, gate before propagation.
- `application/`: 72 captures, snapshots, axe outputs and layout results — six views, two themes, six viewports.
- `interactions/`: 35 successful assertions and captured definition/timing, evidence, unknown-execution, Sources initial/cached/worker failure, DST, usage, mobile navigation and second-owner empty state.
- `reports/`: actual pnpm check (508 passed/99 skipped), component (28), SQL (26), HTTP (36), palette (94 contrast/32 neutrality), CLI dry-run, exact changed application files, dependency patch and separate high braces/Vercel audit.
- `SHA256SUMS`: integrity manifest, not a signature or privacy certification.

## Review and limitations

Implementer reviewed all six desktop views in dark/light and representative mobile 320/390 views, plus dark/light timing/definition and selected failure/detail states. Matrix automation checks overflow and axe; it does not certify every acceptance scenario. Incomplete axe rules are retained in each report, not treated as passing rules. Screenshots are first-fold viewport captures, not full-page certification.

Native 200% Chrome zoom and a real VoiceOver/browser walkthrough were attempted but blocked by the locked Mac. CSS zoom 2 is only additional layout coverage. Full screen-reader acceptance remains open. All six portal types/themes, native hover/tooltips, camera/cursor stress cases and long real content still need exhaustive manual acceptance. Compact footer Open chat text can truncate; activity lanes deliberately scroll horizontally, and their headings need further mobile usability review at the selected rightmost interval. Selected history is present in the evidence Sheet but first-fold density can still be improved for long entity content.

Sources succeeds in this isolated fixture only. The original failure in the ordinary installation has not been reproduced or attributed to an upstream cause. The existing dependency-security failure remains separate. No merge/deployment or model/provider call occurred.

[Acceptance report](../../../acceptance/2026-10-03-core-dashboard-refinement-v2.md)
