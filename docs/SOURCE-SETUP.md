# Source checkout and data

Author: CA

This repository contains the application source, tests, packaging scripts and the HiGHS optimizer distribution with its included MIT license. It intentionally does not track downloaded Escape from Tarkov item data or item images, generated releases, test output, local signing material or machine-specific hosting configuration. A fresh clone needs an explicit data synchronization before the app can run.

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
```

The source repository and a portable release have different contents. A release ZIP embeds the snapshot used for offline operation. Do not upload release ZIPs, signing keys/certificates or the local `Portable/` folder as source files. If releases are published later, review their included third-party data and images separately.

The application source has no public reuse license yet. Add a license for the code only after deciding its terms and confirming which files can be covered. Third-party notices must remain intact; a code license does not grant rights to Escape from Tarkov artwork or game data.
