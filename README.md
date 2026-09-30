# Tarkov Workbench

Author: CA

An English-language Escape from Tarkov weapon builder for Windows and the web. The prepared desktop release contains a snapshot with 172 weapons, 2,314 attachments and their images, retrieved on 27 September 2026. Calculations run locally. Startup and building weapons work offline. A manual, confirmed database update downloads new community data. Source checkouts do not include the downloaded game-data snapshot or item images; see [source setup](docs/SOURCE-SETUP.md).

## Windows desktop app

Version 1.8.4 starts the bundled runtime directly, without extracting it to a temporary folder. Weapon search shows complete standard-preset reference images. Startup still shows the workbench banner with no selected weapon or calculated build. Close an older running instance before opening the new EXE. The GUI header displays **v1.8.4**. The Arena filter now also excludes reviewed Season 3 weapon rewards, including every Ravage stock variant.

Extract the entire `Tarkov-Workbench-Portable.zip` to a new folder, then double-click `Tarkov-Workbench.exe`. The prepared folder is `Portable/`. The application, database and images are in `resources/`, translations in `locales/`, and instructions/checksums in `docs/`. Electron's runtime DLLs and data files must stay beside the EXE. Keep all extracted files together. The raw developer runtime remains in `release/win-unpacked/`.

The portable Windows 10/11 x64 app opens in its own window. No browser, separate Node.js/.NET installation, account or internet connection is needed. The root EXE is the Electron application itself; there is no additional launcher. Copy the entire extracted folder when moving it to another PC. No application extraction, compilation or download happens at startup. Windows security scanning and disk speed can still affect launch time. Manually downloaded updates are stored separately in the same local Windows profile as earlier versions. Close the window to quit. The standard Portable ZIP is unsigned; the separate SelfSigned ZIP carries a CA test signature.

1. Open **Select weapon**, type into the search field inside the dropdown, then click a result or use the arrow keys and Enter. `Mod`, `Mod4` and `VAL MOD.4` find the AS VAL MOD.4. Escape dismisses the dropdown. Searching alone does not change the current selection. Weapons without a mountable attachment are hidden (nine entries in this snapshot, leaving 163 moddable weapons before the Arena filter).
2. Optionally click **Choose scope** and select a pictured sight. Filter by 1x, 1-4x, 1-6x, 1-8x, other magnification or thermal/night vision. With no scope selected, **Iron sights** is the default.
3. Select **Ergo**, **Recoil** or **Balanced**.
4. Select **Silenced** or **Unsilenced**.
5. Use **Choose magazine** to select a specific pictured magazine, or keep automatic selection with a capacity target. Set the Balanced target if needed.
6. Click **Calculate build**. The attachment list includes thumbnails, short and full names, assembly paths and expandable incompatibility details.

**Copy list** copies the build for use outside the app. Optional source links open your default browser; building weapons does not require opening any browser.

## Trader settings and accessories

The first launch opens **Settings**, also reachable beside **Update database**. Set each trader to 0–4; cash and barter offers are filtered to those levels. Quest-unlocked offers are **included by default**, with an opt-out toggle. Both pictured accessory pickers verify complete assemblies with the current settings. Underbarrel launchers are excluded unless **Allow underbarrel launchers** is enabled. Vendor, required level and purchase price are displayed beside each part. Barters are included by default with exchange recipes and estimated ingredient values; disable them in Settings if desired. Flea purchases, live stock and parts obtained from weapon bundles are not included. See [trader and loadout rules](docs/TRADERS-AND-LOADOUT.md).

## Self-signed experiment

`npm run portable:self-sign` creates a separate `Portable-SelfSigned/` folder and `Tarkov-Workbench-SelfSigned.zip` from the prepared `Portable/` folder. It creates or reuses a CA test code-signing certificate in the current Windows user's Personal certificate store, with a non-exportable private key. Only the public certificate is included in the ZIP. Existing trusted signatures are preserved; unsigned EXE/DLL files receive SHA-256 test signatures. Move the previous test output folder aside before rerunning. This does not install a trusted root/publisher or alter Smart App Control. Self-signing does not establish a publicly trusted publisher or guarantee that Windows permits execution. See [self-signed test instructions](docs/SELF-SIGNED.txt).

## Browser version

Double-click `Start-Workbench.cmd`, or run `npm start` from this folder. This source-based launcher requires Node.js 18 or later and opens `http://127.0.0.1:4173/`. No dependency installation is required for normal browser use: all runtime files are included. Press Ctrl+C or close the server console to stop. The server binds only to the local computer.

## Optimization objectives

- **Ergo:** maximize ergonomics, then minimize recoil when ergonomics are equal.
- **Recoil:** minimize the additive recoil modifier, then maximize ergonomics.
- **Balanced:** minimize recoil at a configurable target on the 0-100 Ergo scale (default 80). If unreachable, use the highest achievable Ergo. Equal-recoil results prefer higher ergonomics.
- Equal-performing builds prefer lower weight, then fewer parts, then eligible vendor offers and lower RUB-equivalent cost.

Ergonomics are base ergonomics plus attachment modifiers, capped to 0-100. Vertical and horizontal recoil are the corresponding base values multiplied by `1 + sum of attachment recoil modifiers`. Rounding can differ slightly from game and preset displays.

Automatic magazine selection defaults to a 30-round capacity target. The main GUI saves your preference (10, 20, 30 or 60 rounds, any capacity, or no magazine required) across weapons and restarts. A specifically chosen magazine overrides the target; returning to Automatic restores it. If no complete build can meet the target, the optimizer uses the highest feasible lower capacity and clearly displays the target and chosen capacity. The complete build is still checked by the optimizer. Known Arena unlocks are excluded by default. Trader-level filtering is enabled by default, with quest-unlocked offers included. See docs/TRADERS-AND-LOADOUT.md. There is no budget cap. Scope selection is optional. Without a selected scope, the builder uses iron sights and requires available front/rear iron-sight mounting paths, including the supports needed to carry the sights. Built-in sights are not separate attachments. With a selected scope, exactly that optic and its compatible mounting chain must be present. Other optics and empty dedicated optic mounts are excluded. Scopes and mounts change ergonomics, including whether the Balanced target can be reached. The GUI explicitly shows whether a scope is selected and explains this effect. Tactical devices are optional.

Ammunition, character skills, durability, folded stocks and situational bonuses such as deployed bipods are outside the model. The weapon image shows a reference weapon, not a rendered preview of the calculated assembly.

## Practical mounting

**Prefer practical mounts** is enabled by default. It prioritizes reviewed lower-profile mounts and then simplifies sight mounting within 4 Ergo of the reference build, at the same recoil, while retaining main weapon parts. Turn it off for maximum stats. Balanced may fall below its target within this allowance. Results show the actual tradeoff. See [mounting rules](docs/PRACTICAL-MOUNTS.md).

## Equivalent alternatives

Each attachment can list **compatible alternatives** with thumbnails and a **Use** button. Ergonomics, recoil, capacity, suppressor status and additional recorded performance modifiers must match. Weight and price may differ and are displayed explicitly. Installed children are remapped to compatible slots and the full assembly is validated, including direct/reverse conflicts, blocked slots, required parts and pinned accessories. Conflicts with absent items and unused slot capabilities do not hide valid swaps. Current trader/unlock settings still apply. Swapping updates total weight and cost. At equal performance, calculated builds prefer lower weight, then fewer redundant parts, then cheaper available offers. Alternatives remain visible regardless of price and sort by weight, then price.

Alternatives are recalculated after each swap; independently listed alternatives are not a promise that arbitrary simultaneous substitutions will work. The selected optic and specific magazine are kept fixed. Changing optics is done through **Change scope** and requires recalculation.

## Compatibility and verification

The HiGHS mixed-integer optimizer runs in a Web Worker. It models adapter chains, repeated parts, required and optional slots, item conflicts, category exclusions and blocked slot IDs. One-sided source conflicts are treated symmetrically. A separate validator checks the reconstructed assembly before it is displayed.

Optional branches with no positive ergonomics, recoil reduction or needed suppressor can be removed without changing the optimum. There is no arbitrary shortlist of attachment candidates.

**Optimum confirmed** or **Practical build confirmed** means every optimization stage proved its optimum for the stored data and selected constraints. Each stage has a 30-second limit. A valid result found before a time limit is explicitly labelled as unconfirmed; an unproved Balanced baseline is reported separately. Calculations can be cancelled. Small weapons often finish quickly, while complex builds can take considerably longer.

The source data comes from a community-maintained export. Its retrieval date does not prove that every value reflects the latest game hotfix. In-game correctness depends on the completeness and accuracy of that data. These limitations and the timestamp are also displayed in the app.

## Stored data and updates

The bundled database is in `dist/data/catalog.json`. The app starts without a selected weapon, cached build lookup, precomputed build download or calculation. Builds appear only after **Calculate build** (or an explicitly invoked calculation tool). Balanced 80% is a configurable default target, not an initial calculated result.

Use **Update database** below the retrieval timestamp. The confirmation names **json.tarkov.dev** (item data and English names) and **assets.tarkov.dev** (new or changed-source item images). Choose **Download update** to start, or **Stay offline** to close it without contacting those hosts. Permission applies to this one download. There are no automatic startup checks or background updates. Community exports can lag behind EFT patches; their retrieval date does not prove hotfix accuracy.

The same importer powers runtime updates and the developer sync script. It validates stats, counts, attachment references, cycles and allowed image sources. Existing bundled/cached images are reused; necessary additional images are downloaded with size limits. The complete candidate is saved in one IndexedDB transaction before activation. A failed, cancelled or unsavable update preserves the old database. One previous snapshot is retained as a fallback. Updated data and images remain available offline after restart in that browser/Windows profile.

Cache keys include the data hash, optimizer version and complete selection. A changed database clears the displayed result and stale derived caches; recalculation still requires an explicit click. The weapon/scope choice is retained where available. There is currently no personal preset library. **Copy list** exports text; a future preset library should preserve user builds and mark changed stats/conflicts for review.

Ordinary item/stat/compatibility updates no longer need a new EXE. Changes to application features, source format or compatibility corrections still require a new release. See [the full update workflow](docs/UPDATES.md).

Developers can run `npm run sync` or `Update-Data.cmd` to refresh the bundled snapshot, then run tests/catalog verification, build and package a new release. `scripts/overrides.json` contains documented classifications for the DVL-10 suppressed barrel and integral-suppressed Velociraptor; the importer copies these into the bundled runtime configuration. Runtime updates use the corrections shipped with the app. Ammunition-only slots are excluded from attachment optimization.

## Development and tests

On Windows with Node.js and npm installed:

```text
npm ci
npm run sync
npm test
node scripts/verify-catalog.mjs
npm run desktop
npm run desktop:build
npm run portable:package
```

`npm run sync` is an explicit download from `json.tarkov.dev` and `assets.tarkov.dev`; it is needed once after cloning this source repository. It creates the local catalog and images that are excluded from Git. The released portable ZIP already contains its own snapshot and does not run this source-setup step on startup. See [source setup](docs/SOURCE-SETUP.md) for the complete workflow and redistribution notes.

If installation scripts are disabled by your npm policy, run `node node_modules/electron/install.js` before starting/building the desktop app. `desktop:build` creates the unpacked runtime in `release/win-unpacked/`. Packaging includes that complete runtime and creates `Portable/`, `Tarkov-Workbench-Portable.zip` and a ZIP checksum in the project root. A file checksum manifest is in `docs/SHA256SUMS.txt`. The previous prepared folder is retained in `release/portable-previous/`. Distribute the complete ZIP, not a standalone EXE or the source folder. The EXE has a stable filename without a version suffix. Downloaded snapshots, images and calculation caches live in AppData/Roaming/Tarkov Workbench on each PC; they do not travel with the ZIP.

Optimizer tests compare results with exhaustive enumeration and cover adapter chains, repeated parts, asymmetric conflicts, blocked slots, categories, magazines, required parts, ergonomics caps and malformed graphs. `node scripts/verify-catalog.mjs` validates all weapon graphs and images, checks six variants for seven representative weapons plus six explicit-scope scenarios, and writes `dist/data/precomputed.json` plus `test-results/catalog-report.json`.

`npm run prepare:vendor` refreshes bundled HiGHS browser files and its license after an intentional dependency update. `dist/` can be hosted on a static web server that serves `.mjs` and `.wasm` with the correct MIME types. No backend is required. Opening `index.html` through `file://` is unsupported because workers and WebAssembly require a suitable origin.

The desktop wrapper uses Electron with renderer sandboxing, context isolation and no renderer Node.js access. It serves bundled files over a private application protocol and does not start an HTTP server. Its restricted image-download endpoint permits only known tarkov.dev item-image URLs. The local web launcher provides the same endpoint because the image host does not allow direct browser fetches. A separately hosted web version needs this endpoint for updates containing additional images; static hosting alone supports the bundled offline snapshot.

## Sources and licenses

- [tarkov.dev API documentation](https://tarkov.dev/api/)
- [Game data export](https://json.tarkov.dev/regular/items)
- [English item names](https://json.tarkov.dev/regular/items_en)
- [Data manager source](https://github.com/the-hideout/tarkov-data-manager)
- [DVL-10 suppressed barrel wiki](https://escapefromtarkov.fandom.com/wiki/DVL-10_7.62x51_500mm_suppressed_barrel)
- [Velociraptor wiki](https://escapefromtarkov.fandom.com/wiki/Aklys_Defense_Velociraptor_.300_Blackout_assault_rifle)
- [HiGHS WebAssembly optimizer](https://github.com/lovasoa/highs-js) - MIT license in `dist/vendor/HIGHS-LICENSE.txt`.
- [Electron](https://www.electronjs.org/) - runtime and third-party licenses are included in the packaged application.

Escape from Tarkov, game content and item images belong to Battlestate Games or their respective rights holders. Community data is provided by tarkov.dev / The Hideout. This is an independent community tool and is not operated by Battlestate Games. Third-party licenses and attributions are preserved.
