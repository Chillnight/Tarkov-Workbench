# Source checkout and data

Author: CA

This repository contains the application source, tests, packaging scripts and the HiGHS optimizer distribution with its included MIT license. It intentionally does not track downloaded Escape from Tarkov item data or item images, generated releases, test output, local signing material or machine-specific hosting configuration. A fresh clone needs explicit data synchronization for the offline developer build; the online-setup build asks the user to download data on first launch.

On Windows, with Node.js and npm installed, run from the repository root:

```text
npm ci
npm run sync
npm test
node scripts/verify-catalog.mjs
npm run desktop
```

`npm run sync` downloads item data from `json.tarkov.dev` and item images from `assets.tarkov.dev`, then writes them into `dist/data/` and `dist/images/`. Review those sites' terms and the game-content rights before redistributing a build that includes the downloaded material. The sync is a developer command; opening the app does not run it automatically. `npm run prepare:vendor` can refresh the bundled HiGHS files after a dependency update.

To prepare a portable Windows build after the data sync and verification:

```text
npm run desktop:build
npm run portable:package
npm run installer:build
```

To package an edition without downloaded game data or images, run `npm ci` and `npm run portable:online`. It creates `Online-Portable/` and `Tarkov-Workbench-Online-Portable.zip`; the first launch asks the user before downloading the current data and all required images. This build does not require `npm run sync`. Check the archive contents before publication.

The source repository and a portable release have different contents. The offline ZIP and installer embed a snapshot; the online-setup ZIP omits it. Do not upload binary releases, signing keys/certificates or local portable folders as source files; attach reviewed ZIPs to a GitHub Release instead. If bundled-asset releases are published later, review their included third-party data and images separately. See [distribution](DISTRIBUTION.md).

The application source has no public reuse license yet. Add a license for the code only after deciding its terms and confirming which files can be covered. Third-party notices must remain intact; a code license does not grant rights to Escape from Tarkov artwork or game data.
