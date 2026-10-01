# Trader settings and loadout selection

Author: CA

## Shopping list, budget and appearance (1.9)

Each calculated build now includes an expandable trader shopping list. It groups required attachments by eligible vendor and separates cash purchases from barter trades. Repeated parts are counted together. Barter ingredients are shown for the number of trades needed, including rewards that contain multiple items. The list can be copied independently of the full build. The weapon, ammunition, stash contents and live trader stock are not included.

The optional **Maximum attachment budget** on the main screen is a hard RUB-equivalent cap on the complete attachment assembly. The optimizer applies it while choosing parts, including adapters, the selected scope and the magazine. Unknown-price parts cannot enter a budget build. The saved best eligible offer supplies each price; barter prices are only ingredient-value estimates. Trader loyalty and quest settings still apply. If no complete assembly fits, the app reports an infeasible build rather than silently exceeding the cap. Manually swapped equivalent alternatives must also stay within it. The budget and its on/off state are saved locally; off is the default.

Settings offers four appearance buttons: Original green (default), Steel blue, Bourbon and Graphite. Clicking one previews it; Cancel restores the saved choice, and Save settings retains it across restarts. Theme changes do not alter the optimizer or require a new database download.

Version 1.8 adds pictured magazine selection, complete-assembly checks for the scope and magazine pickers, trader-level filtering and vendor price tie-breaking.

## Settings

The first launch opens Settings. Select a numbered level box (1–4) per trader. Clicking the selected box again marks that trader as not unlocked (0). Settings can be reopened beside Update database. Defaults are level 1, **Use only unlocked trader offers** on, **Include quest-unlocked offers** on, and **Include barter offers** on. The quest toggle assumes required quests have been completed; switch it off to exclude every quest-gated offer. It never bypasses trader-level requirements. No account or quest progress is downloaded.

Existing main-screen preferences remain on the main screen. **Allow underbarrel launchers** is off by default, independently of the practical-mount preference. This excludes the UBGL category and its attachment paths, so launchers cannot be used merely as recoil bonuses. Ordinary foregrips and GP-25 stock recoil pads remain eligible. Turning it on allows launchers but does not force one into the build.

## Availability and prices

The existing regular/PvP item export at https://json.tarkov.dev/regular/items includes `buyFromTrader` entries with trader ID, minimum loyalty level, quest requirement, currency, purchase price and RUB equivalent. The importer saves these offers with the item database. **Update database** refreshes them along with stats and compatibility, after the existing download confirmation. Startup remains offline.

The chosen weapon and the parts in its recorded default preset are treated as already owned. Factory parts remain available without a separate trader offer and incur no additional purchase cost, up to the quantities included in that preset. Upgrades and extra copies require eligible cash or barter offers when trader filtering is enabled. Equivalent factory parts are kept before spending on replacements; objective stats and lower weight still take priority. The implementation does not model flea purchases, other inventory, restock availability or individual purchase limits. Fence's randomized inventory is not guessed. Ref trades are included when the level, quest and Arena filters allow them, including for factory parts. Missing prices alone do not exclude an eligible upgrade unless a budget is active. Turn trader filtering off to plan with unrestricted attachments; Arena and launcher filters still apply.

Version 1.9.0.1 corrects factory-part availability, conflicting iron-sight routes and empty magazine choices caused by unsupported suppressor variants. The GUI disables variants without an available suppressor path and selects an available one. Old database snapshots can use reviewed factory-preset metadata bundled with the app; a database update imports current presets. Calculated caches from older optimizer versions are invalidated.

Within equal Ergo/recoil results and part counts, the optimizer prefers available purchase offers and then minimizes their total RUB-equivalent cost. In practical mounting, mount count, ergonomics and weight retain priority before the final price comparison. Unknown prices are counted separately, never treated as a zero-cost purchase. The displayed subtotal excludes the weapon. With trader filtering disabled, any unpriced parts are explicitly listed in the cost summary. Prices are snapshot values, not a live checkout quote.

## Scope and magazine pickers

Choose a weapon first. Both pickers show pictures, English short/full names, Ergo impact and eligible vendor offers. Magazine cards also show capacity. Search and category/capacity filters narrow the list.

Each candidate is checked by the same integer constraint model used for builds, including required parts, mount chains, reverse/category conflicts, blocked slots, trader settings, suppressor variant and the other selected accessory. A mounting path alone is insufficient. Results stream into the picker in the background. Only proven feasible candidates are shown. A timed-out check is reported as unverified, not compatible. Closing the dialog stops unfinished checks. Completed results are cached in memory for the same database and requirements.

A specific magazine is mandatory and overrides the automatic capacity target. The optimizer and equivalent-alternative swaps cannot silently replace it. Automatic magazine mode prefers the target capacity and falls back to the highest compatible lower capacity when necessary. No scope still means iron sights. Changing the objective, weapon or availability settings preserves the explicit accessory selections. A missing mounting path is reported with a notice, and incompatible requirements yield no build. Only an explicit picker choice clears or replaces a selected optic or magazine. The page tool also preserves omitted accessory arguments; explicit null selects iron sights or automatic magazines.

## Migration

Engine 1.8.4 invalidates older calculated-result caches. Snapshots without purchase/barter-offer fields cannot supply trader filtering: the app restores the bundled verified database and displays a notice. A manual database update imports current offers. Trader settings are stored separately from data snapshots and survive updates. No build is calculated automatically on startup, selection changes or settings saves.

## Barter import and valuation (1.8)

The separate https://json.tarkov.dev/regular/barters export is downloaded with the item export during a confirmed update. All three downloads must succeed before replacing the local snapshot. The data hash includes barter contents. The bundled barter retrieval date is stored separately from the item-stat retrieval date.

Barter cards display the trader, required loyalty level, exchange items, quantities and any recorded ingredient attributes. Quest offers remain included by default. A barter-only mod such as the AK-74 6L18 45-round magazine is available through its recorded Prapor LL1 trade. Disabling barters removes these acquisition routes from trader-filtered builds. With unrestricted attachments, owned/looted items remain usable, but disabled barter offers are not used for pricing.

A barter's RUB value is an estimate per reward item: saved ingredient average prices, or recorded cash prices when an average is unavailable. It is not a cash purchase or a guarantee that the user can buy the ingredients. Attributes such as dogtag levels make the estimate unknown. Unknown values remain eligible but are never treated as free; totals explicitly distinguish estimated barter content and unpriced parts.

## Scope priority and mount profile

A selected scope is a hard constraint in every objective, including maximum Ergo. An infeasible selection never falls back to iron sights. Practical mounting retains the selected scope and main weapon parts, with the same recoil and at most 4 displayed Ergo points lost. It first minimizes reviewed high-profile mounts/risers, then reviewed specialized housings, then non-low sight mounts, then total sight mounts; it then optimizes Ergo, weight, part count and price. This can choose a lower route even with the same or a larger mount count.

Profiles use reviewed stable IDs in dist/mount-profiles.mjs, based on source item names and descriptions. Unknown mounts are neutral; there is no claim to measure all possible sight heights or sight-picture obstruction. The four-point tolerance applies to the entire simplification, not separately to each stage.
