# Database updates

Author: CA

## Update from inside the app

Select **Update database** below the retrieval timestamp, then **Download update**. The app first shows the source hosts and asks for permission for this download. **Stay offline** closes the prompt without starting a network request. There are no startup checks, scheduled checks or automatic background downloads.

The public community sources are:

- https://json.tarkov.dev/regular/items: item stats and attachment compatibility.
- https://json.tarkov.dev/regular/items_en: English names and labels.
- https://assets.tarkov.dev: necessary additional item images.

The data comes from [tarkov.dev / The Hideout](https://tarkov.dev/api/), not an official Battlestate update feed. No API key or user account is needed. The exports total roughly 20 MB before compression, plus new images. Already bundled or locally cached images with the same source URL are reused. Updates use HTTPS, omit credentials and reject redirects and unexpected download hosts.

The image host does not allow direct browser fetches. The desktop app and local Node.js web launcher therefore provide a restricted same-origin image-download endpoint. It accepts only known item-image URL patterns on assets.tarkov.dev. A separately hosted web version needs that endpoint to import additional images; a static-only deployment can use its bundled snapshot.

An EFT patch does not immediately update the community export. The displayed retrieval date records the snapshot download; it does not guarantee that every value reflects the latest hotfix. There is no promised update schedule. Users can manually request a fresh export whenever they choose.

## Validation and recovery

The app stages the candidate in memory, checks required stats, item counts, missing attachment references, cyclic mounting chains, supported source format and image sources, and downloads required additional images. Downloads have time and size limits. A large unexplained decrease in item count is rejected. Validation does not replace in-game verification of the community data.

The complete catalog and its additional images are committed in a single IndexedDB transaction. Failed downloads, cancellation, invalid data or insufficient local storage leave the previous active database intact. One previous snapshot is retained for recovery. At startup the app validates saved snapshots and can fall back to the previous or bundled data. An app release with a newer bundled source can supersede an older downloaded snapshot.

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
