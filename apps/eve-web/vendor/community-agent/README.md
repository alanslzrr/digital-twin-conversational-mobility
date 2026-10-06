# Community Agent dashboard shell adaptation

Reference: [Community Agent](https://github.com/vercel-labs/community-agent-template), pinned
at revision 9c9efb50f79d3211ecf8ff15ba278eb5457a2a1b (MIT).

Only the navigation/header composition is adapted: compact desktop sidebar,
mobile navigation dialog, title and actions. No backend, authentication,
data, mocked metrics or application theme were imported. The local implementation
lives in app/(dashboard)/dashboard/_components/shell.tsx.

The header uses a local light/dark/system theme switch, scoped to the dashboard
through `data-dashboard-theme`, alongside the shared ES/EN interface control.
Geist typography, EVE semantic tokens and the existing Button, Dialog, Field,
Input, Badge and Spinner components remain authoritative. The official EVE chat
keeps its system theme and upstream layout.

The upstream MIT license is retained in LICENSE. OpenStreetMap is a separate,
anonymous external basemap loaded only when requested; data reads go through the
authenticated Core BFF.
