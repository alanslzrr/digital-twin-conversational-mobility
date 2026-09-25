# Versioned local routing releases

The release unit is the GTFS archives, normalized catalogs, OSM extract, OTP configuration/image and built graph. A SHA-256 manifest identifies every input and the graph. Preparation and building take place under `data/routing-releases/<id>` and do not change the active database or router. `data/otp` becomes an atomic symlink on first activation; its original directory is retained.

## Prepare and build

```sh
# Reuse already prepared official data; reject conflicting archives.
python3 scripts/prepare-routing-release.py
# Or explicitly fetch new official datasets into staging:
python3 scripts/prepare-routing-release.py --refresh
node scripts/build-routing-release.mjs <release-id>
```

No scheduler is added. Refresh is explicit; a failed download/build leaves the current release usable. An expired feed is excluded from the graph but its catalog remains available. Calendar envelopes are preliminary eligibility only: OTP applies GTFS calendars, exceptions and frequencies. Keep Metro excluded until a current official timetable is available.

The current build includes Renfe, EMT, Metro Ligero and interurban networks. EMT official GTFS: CRTM ArcGIS item `868df0e58fca47e79b942902dffd7da0`, [CRTM license](https://www.crtm.es/licencia-de-uso). Its prepared version has service envelope 24/07/2026–31/12/2026 and 72,510 frequency rows. Non-exact frequencies produce planning estimates, not precise scheduled departures. Source versions and per-feed coverage are in the release manifest. Graph build warnings remain in the build report/log; no network-wide accuracy or accessibility guarantee is implied.

## Maintenance activation

Stop the known `start:local` supervisor (SIGTERM) and verify Core, Web, agent and worker have stopped. Do not kill unrelated processes by port. Take a private PostgreSQL custom-format backup and list its archive contents before migrating; the archive contains authentication/conversation data and must not be committed.

```sh
pnpm db:migrate
node --env-file=.env.local scripts/activate-routing-release.mjs activate <release-id> --maintenance
pnpm check
pnpm build:agent
pnpm start:local
```

Use compatible built Core/Web/agent code. The script rejects a running app, takes an exclusive local lock, verifies checksums, records the rollback target before modifying the active installation, imports catalogs and recreates OTP. It verifies the loaded feed set before completing. This is a **maintenance transaction with compensating rollback**, not a zero-downtime database transaction: applications remain stopped across the transition. Core refuses routing while the journal exists and verifies graph/catalog versions on queries. The old release and stable place identities are retained. No authentication or conversation tables are rolled back.

EMT API stops are linked to GTFS stops only by identical published stop identifiers and coordinates within 100 m, with a unique match. UUIDs remain separate. Actual itinerary transfers expose both stop identifiers and walking evidence from OTP's street graph; names alone never merge stations. These paths do not prove accessible or guaranteed transfers.

## Rollback and interrupted activation

With applications stopped:

```sh
node --env-file=.env.local scripts/activate-routing-release.mjs rollback --maintenance
# Following a terminated/crashed transition, restore the journal's prior release:
node --env-file=.env.local scripts/activate-routing-release.mjs recover --maintenance
```

The recovery command refuses to steal a live process lock. If activation fails, automatic compensating rollback is attempted; if that also fails, retain the journal and keep applications stopped. Resolve the underlying Docker/database/filesystem failure, then run recovery. Do not delete a journal to bypass the guard. Filesystem operations use atomic renames; this is not a guarantee against disk corruption or power-loss durability. Keep the independent database backup and release directories. Do not run legacy `otp:prepare`/`otp:build` against the active symlink; they reject overwriting it.

## Real-time application and limits

OTP has **no RT updaters**. Core reads snapshots produced by the existing activity-window worker. It applies fresh Renfe updates only when static version, trip identity and service date match. An explicit service date is preferred; when Renfe omits it, the existing Madrid observation-day policy is bounded to the same civil departure day and a two-hour schedule window, and reported as `observation_day_nearby_schedule`. This is a conservative fallback, not a provider-published date. Endpoint estimates require unique static and RT stop identity; trip-level delay is propagated only when all supplied stop updates agree and none is ambiguous or NO_DATA (absolute endpoint estimates take precedence), following the [GTFS-RT reference](https://gtfs.org/documentation/realtime/reference/#message-tripupdate). circular/repeated stops without sufficient sequence evidence fall back to scheduled times. Cancellation/skipped endpoints remove candidates; updated transfer walking times and missed connections are checked before sorting alternatives. Original scheduled times remain visible. For near-now queries, positive fresh delays permit one additional OTP window, capped at 30 minutes and ten candidates, to discover still-boardable delayed trains; access walking is recomputed from the requested instant. Larger delays or interrupted supplemental searches are not exhaustive coverage. Active, explicitly scoped Renfe alerts annotate affected legs; NO_SERVICE removes affected alternatives. Old alerts without retained selectors cannot cancel routes.

Fresh EMT notices are attached by exact public line label (leading zeroes preserved) and overlapping validity. They warn about possible diversions, but do not invent revised geometry or cancel a specific trip without evidence.

No stale update is applied. Partial endpoint evidence remains partial, not a wholly live journey. EMT arrival API predictions lack a demonstrated GTFS trip mapping and are not attached by line alone; query them separately. CRTM real-time sources are not implemented. Absence of matched alerts is not evidence of normal service. Bicycle/car routing, operational accessibility and network-wide RT coverage remain separate roadmap items.
