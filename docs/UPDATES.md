# Database and program updates

Author: CA

## Program updates

**Check for updates** checks the latest stable release at [Chillnight/Tarkov-Workbench](https://github.com/Chillnight/Tarkov-Workbench/releases/latest). It is separate from **Update database**, needs no GitHub account and runs only when clicked. A numeric version comparison supports three- and four-component release tags, including `v1.9.0.3`. Equal or lower versions show **You’re up to date — No newer version was found**. Drafts and prereleases are not installed. Offline, rate-limited, malformed or incomplete responses show an error rather than claiming the app is current.

If a newer release exists, the Windows portable app asks before **Download and restart**. It downloads the release ZIP and its matching `.sha256` asset from GitHub, checks the exact length and SHA-256 hash, and validates archive paths before extraction. No extra native dependency or signing certificate is added. Both assets must be published together using the existing portable filenames.

The complete app is staged beside its current folder on the same drive. After verification, an independent hidden helper confirms that it is running before the app closes. It waits for this app to exit, replaces the complete portable folder at its original path and starts the new EXE. Settings and the downloaded database under `AppData/Roaming/Tarkov Workbench` are kept. Leave the portable folder writable and close other copies before updating. No administrator permissions are requested. Source-code folders, linked folders and drive-root locations are refused. If preparation fails or is cancelled, the running app is unchanged; if replacement or launch fails, the helper retains or restores the old version and reports the failure on restart. Once the verified update begins restarting, cancellation is no longer available.

Rollback files exist only during installation. After a successful replacement and launch, the helper automatically removes the old version, downloaded ZIP and staging folder. If cleanup is blocked, it records a notice rather than rolling back the installed update. Keep personal documents outside the application folder: the entire folder is replaced. Browser and development versions provide a direct portable-download link rather than rewriting source files. Manual extraction remains available as a fallback.

Versions 1.9.0.3 and 1.9.0.4 have a Windows helper-launch defect and need one manual upgrade to 1.9.0.5 or later: close the app and replace the complete portable folder with the new ZIP contents. A successful download alone does not repair the old updater.

## Update from inside the app

Select **Update database** below the retrieval timestamp, then **Download update**. The app first shows the source hosts and asks for permission for this download. **Stay offline** closes the prompt without starting a network request. There are no startup checks, scheduled checks or automatic background downloads.

The online-setup portable edition has no bundled game data or item images. On its first launch, the same dialog opens automatically and offers **Download data** or **Stay offline**. Only the button starts a network request. If setup is deferred or fails, the app remains empty and **Update database** reopens the prompt. A successful setup saves all required images and the catalog together; later launches work offline.

The public community sources are:

- https://json.tarkov.dev/regular/items: item stats and attachment compatibility.
- https://json.tarkov.dev/regular/items_en: English names and labels.
- https://json.tarkov.dev/regular/barters: trader barter offers.
- https://assets.tarkov.dev: necessary additional item images.

The data comes from [tarkov.dev / The Hideout](https://tarkov.dev/api/), not an official Battlestate update feed. No API key or user account is needed. The exports total roughly 20 MB before compression, plus new images. Already bundled or locally cached images with the same source URL are reused. Updates use HTTPS, omit credentials and reject redirects and unexpected download hosts.

The image host does not allow direct browser fetches. The desktop app and local Node.js web launcher therefore provide a restricted same-origin image-download endpoint. It accepts only known item-image URL patterns on assets.tarkov.dev. A separately hosted web version needs that endpoint to import additional images; a static-only deployment can use its bundled snapshot.

An EFT patch does not immediately update the community export. The displayed retrieval date records the snapshot download; it does not guarantee that every value reflects the latest hotfix. There is no promised update schedule. Users can manually request a fresh export whenever they choose.

## Validation and recovery

The app stages the candidate in memory, checks required stats, item counts, missing attachment references, cyclic mounting chains, supported source format and image sources, and downloads required additional images. Downloads have time and size limits. A large unexplained decrease in item count is rejected. Validation does not replace in-game verification of the community data.

The complete catalog and its additional images are committed in a single IndexedDB transaction. Failed downloads, cancellation, invalid data or insufficient local storage leave the previous active database intact; on first setup, the app remains empty. One previous snapshot is retained for recovery. At startup the app validates saved snapshots and can fall back to the previous or bundled data when available. An app release with a newer bundled source can supersede an older downloaded snapshot.

Downloaded data is stored in the Windows user profile under AppData/Roaming/Tarkov Workbench. Browser use stores it for that browser/site. It remains available offline after restarting. Application files are not rewritten; copying the complete portable folder to another PC does not transfer this local profile. Version 1.5 uses the same profile as earlier versions. The portable ZIP needs no installer.

## Calculated builds and personal presets

Startup shows the workbench banner without choosing a weapon or loading/calculating a build. Select a weapon, configure it and choose **Calculate build**. Cached and bundled precomputed results are read only when a calculation is explicitly requested.

When data changes, the app clears the displayed result and obsolete calculation caches. Available weapon/scope choices are retained, but no calculation is triggered automatically. Cache keys include the data hash, optimizer version and full selection. A source check that finds identical data leaves valid results alone.

There is currently no personal preset library. **Copy list** exports text and exported files are never modified. If personal presets are added, keep their stable item IDs, slot paths, chosen constraints, original data version and stats separately from the calculation cache. On update, recalculate and validate them; show **Up to date**, **Stats changed**, or **Needs repair**. Offer explicit repair/re-optimize and export actions. Do not silently delete presets or replace the user's chosen parts.

## When a new app package is still needed

Normal stats, item and compatibility updates can now be downloaded inside the application. Feature changes, importer/source-schema changes and shipped source corrections still need a new app release. The app validates current-format data but does not download or execute application code from the data service. Images at unchanged source URLs are reused, so a new app snapshot may also be needed to refresh an image replaced at the same URL.

For developer releases:

1. Run `npm run sync` or `Update-Data.cmd` to update the bundled data. The importer is shared with the runtime updater.
2. Review changes, source timestamps, item totals, image warnings and compatibility corrections.
3. Run `npm test` and `node scripts/verify-catalog.mjs`; resolve failures.
4. Run `npm run desktop:build`, then `npm run portable:package`.
5. Distribute `Tarkov-Workbench-Portable.zip` and its checksum. Users extract it, close the older app and open `Tarkov-Workbench.exe`.

The ZIP includes the complete unpacked Electron runtime. Start `Tarkov-Workbench.exe` in the root. Application files, data and images are in `resources/`, translations in `locales/`, and documentation in `docs/`; runtime DLLs and supporting data files must remain beside the EXE. Startup does not extract a runtime to Temp, and no additional launcher is used. For application updates, extract the complete new ZIP to a fresh folder and open its EXE after closing the previous version. Replacing only the EXE does not update the application. The filename remains stable; the GUI and executable metadata show the version. Do not distribute the developer directory or `node_modules`.

## Arena unlock rules

Version 1.5 adds a default-on **Exclude Arena unlocks** filter. Its preference survives data updates. The reviewed acquisition rules are part of the app, not the downloaded statistics export. New rewards require a rules review and app release. See AVAILABILITY.md for scope, sources and limitations.

## Trader offers and settings (v1.7)

The same item export now supplies saved cash purchase offers, levels, quest locks and RUB-equivalent prices. Manual updates refresh these fields. Legacy snapshots without these fields fall back to the bundled database. Trader levels and the default-on quest-offer preference are stored separately and survive data updates. See TRADERS-AND-LOADOUT.md.

## Barter offers (v1.8)

Confirmed database updates also download /regular/barters. The new snapshot is activated only when item data, names, barters and required images validate. Older snapshots without barter fields fall back to the bundled snapshot with a notice. User-selected optics and magazines remain pinned after settings changes.

## Flea Market availability (v1.9.0.6)

The existing item export supplies Flea Market eligibility, item unlock levels and saved 24-hour average prices. **Include Flea Market items** in Settings is enabled by default and assumes the player's market access and item unlock level. No live listings are queried. Trader, barter and factory-part routes remain available; known Arena exclusions still apply. Older snapshots without market fields remain usable, with a notice to run **Update database** once. A confirmed update imports the fields even if the source item data has otherwise stayed the same.

## Handguard thermal data (v1.9.0.7)

The same confirmed item download imports recorded heat and cooling factors. Old databases remain usable, but require **Update database** once to load these fields. The catalog hash changes for the importer revision, so unchanged source exports still refresh old snapshots. Engine 1.9.0.7 invalidates earlier calculation caches. No new data host or automatic download is introduced. Unknown factors are displayed as not supplied and never used to claim a thermal improvement. See TRADERS-AND-LOADOUT.md for selection rules and limitations.
