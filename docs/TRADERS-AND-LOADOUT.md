# Trader settings and loadout selection

Author: CA

## Shopping list, budget and appearance (1.9)

Each calculated build includes an expandable shopping list. It groups required attachments by eligible vendor and separates cash purchases, barter trades and Flea Market estimates. Repeated parts are counted together. Barter ingredients are shown for the number of trades needed, including rewards that contain multiple items. The list can be copied independently of the full build. The weapon, ammunition, stash contents and live stock are not included.

The optional **Maximum attachment budget** on the main screen is a hard RUB-equivalent cap on the complete attachment assembly. The optimizer applies it while choosing parts, including adapters, the selected scope and the magazine. Unknown-price parts cannot enter a budget build. The saved best eligible offer supplies each price; barter prices are only ingredient-value estimates. Trader loyalty and quest settings still apply. If no complete assembly fits, the app reports an infeasible build rather than silently exceeding the cap. Manually swapped equivalent alternatives must also stay within it. The budget and its on/off state are saved locally; off is the default.

Settings offers four appearance buttons: Original green (default), Steel blue, Bourbon and Graphite. Clicking one previews it; Cancel restores the saved choice, and Save settings retains it across restarts. Theme changes do not alter the optimizer or require a new database download.

Version 1.8 adds pictured magazine selection, complete-assembly checks for the scope and magazine pickers, trader-level filtering and vendor price tie-breaking.

## Settings

The first launch opens Settings. Select a numbered level box (1–4) per trader. Clicking the selected box again marks that trader as not unlocked (0). Settings can be reopened beside Update database. Defaults are level 1, **Apply trader level limits** on, **Include quest-unlocked offers** on, **Include barter offers** on, and **Include Flea Market items** on. The quest toggle assumes required quests have been completed; switch it off to exclude every quest-gated offer. It never bypasses trader-level requirements. No account or quest progress is downloaded.

Existing main-screen preferences remain on the main screen. **Allow underbarrel launchers** is off by default, independently of the practical-mount preference. This excludes the UBGL category and its attachment paths, so launchers cannot be used merely as recoil bonuses. Ordinary foregrips and GP-25 stock recoil pads remain eligible. Turning it on allows launchers but does not force one into the build.

## Availability and prices

The existing regular/PvP item export at https://json.tarkov.dev/regular/items includes `buyFromTrader` entries with trader ID, minimum loyalty level, quest requirement, currency, purchase price and RUB equivalent. The importer saves these offers with the item database. **Update database** refreshes them along with stats and compatibility, after the existing download confirmation. Startup remains offline.

The chosen weapon and the parts in its recorded default preset are treated as already owned. Factory parts remain available without a separate purchase offer and incur no additional purchase cost, up to the quantities included in that preset. Upgrades and extra copies require eligible cash, barter or enabled Flea Market offers when availability filtering is enabled. Equivalent factory parts are kept before spending on replacements; objective stats and lower weight still take priority. The implementation does not model other inventory, restock availability or individual purchase limits. Fence's randomized inventory is not guessed. Ref trades are included when the level, quest and Arena filters allow them, including for factory parts. Missing prices alone do not exclude an eligible upgrade unless a budget is active. Turn trader filtering off to plan with unrestricted attachments, including loot-only parts; Arena and launcher filters still apply.

**Include Flea Market items** allows items without trader offers when the export does not flag them as `noFlea`. The saved `minLevelForFlea` is shown as an item unlock level; the app assumes you have Flea Market access and meet this level. The saved `avg24hPrice` supplies an estimated RUB price, not live listings or a guarantee of stock. Among eligible purchase routes the lowest known price wins; trader cash wins a price tie. Items with no known price remain eligible without a budget, but cannot be added as budget purchases. Known Arena exclusions remain effective even if an item has a Flea Market route. Disable Flea Market inclusion for trader and factory parts only.

Version 1.9.0.6 adds these market fields to the catalog. Existing databases remain usable and show a notice when the fields are missing; use **Update database** once to import them. No new download host or automatic startup request is introduced.

Version 1.9.0.1 corrects factory-part availability, conflicting iron-sight routes and empty magazine choices caused by unsupported suppressor variants. The GUI disables variants without an available suppressor path and selects an available one. Old database snapshots can use reviewed factory-preset metadata bundled with the app; a database update imports current presets. Calculated caches from older optimizer versions are invalidated.

Within equal Ergo/recoil results and part counts, the optimizer prefers available purchase offers and then minimizes their total RUB-equivalent cost. In practical mounting, mount count, ergonomics and weight retain priority before the final price comparison. Unknown prices are counted separately, never treated as a zero-cost purchase. The displayed subtotal excludes the weapon. With trader filtering disabled, any unpriced parts are explicitly listed in the cost summary. Prices are snapshot values, not a live checkout quote.

## Scope and magazine pickers

Choose a weapon first. Both pickers show pictures, English short/full names, Ergo impact and eligible vendor offers. Magazine cards also show capacity. Search and category/capacity filters narrow the list.

Each candidate is checked by the same integer constraint model used for builds, including required parts, mount chains, reverse/category conflicts, blocked slots, trader settings, suppressor variant and the other selected accessory. A mounting path alone is insufficient. Results stream into the picker in the background. Only proven feasible candidates are shown. A timed-out check is reported as unverified, not compatible. Closing the dialog stops unfinished checks. Completed results are cached in memory for the same database and requirements.

A specific magazine is mandatory and overrides the automatic capacity target. The optimizer and equivalent-alternative swaps cannot silently replace it. Automatic magazine mode prefers the target capacity and falls back to the highest compatible lower capacity when necessary. No scope still means iron sights. Changing the objective or availability settings preserves explicit accessory selections. Changing the weapon resets the scope to iron sights and the magazine to automatic selection. A missing mounting path is reported with a notice, and incompatible requirements yield no build. The page tool also preserves omitted accessory arguments for the same weapon; explicit null selects iron sights or automatic magazines.

## Migration

Engine 1.8.4 invalidates older calculated-result caches. Snapshots without purchase/barter-offer fields cannot supply trader filtering: the app restores the bundled verified database and displays a notice. A manual database update imports current offers. Trader settings are stored separately from data snapshots and survive updates. No build is calculated automatically on startup, selection changes or settings saves.

## Barter import and valuation (1.8)

The separate https://json.tarkov.dev/regular/barters export is downloaded with the item export during a confirmed update. All three downloads must succeed before replacing the local snapshot. The data hash includes barter contents. The bundled barter retrieval date is stored separately from the item-stat retrieval date.

Barter cards display the trader, required loyalty level, exchange items, quantities and any recorded ingredient attributes. Quest offers remain included by default. A mod such as the AK-74 6L18 45-round magazine is available through its recorded Prapor LL1 trade. Disabling barters removes that acquisition route, but an enabled Flea Market route can still make the item available. With unrestricted attachments, owned/looted items remain usable, but disabled barter offers are not used for pricing.

A barter's RUB value is an estimate per reward item: saved ingredient average prices, or recorded cash prices when an average is unavailable. It is not a cash purchase or a guarantee that the user can buy the ingredients. Attributes such as dogtag levels make the estimate unknown. Unknown values remain eligible but are never treated as free; totals explicitly distinguish estimated barter content and unpriced parts.

## Handguard heat and cooling (1.9.0.7)

The item importer saves the source `heatFactor` and `coolingFactor`. Lower heat and higher cooling are preferred. Missing values remain unknown rather than being assumed neutral. Run **Update database** once after upgrading an older snapshot; existing catalogs remain usable and show a notice when the fields are absent.

After optimizing the main build and its practical mounts, the builder checks compatible replacements for each installed handguard. A replacement must retain Ergo, recoil and every other recorded performance value, preserve all installed children, and pass the complete compatibility, availability and budget checks. Only replacements that improve at least one known thermal value without worsening the other can be preferred automatically. Both values must be supplied for both parts. Parts are not added solely to improve cooling. This checks handguard replacements in the current assembly; it is not a simulation of whole-weapon temperature or a search for different attachment chains.

When several incomparable improvements remain, lower weight and then purchase cost break the tie. Heat/cooling tradeoffs remain visible as compatible alternatives, with the actual modifiers beside their names. Manual selection can choose a different thermal tradeoff; Ergo and recoil remain fixed. Displayed percentages are individual item modifiers, not predicted build temperature or cooling time. Parts with different thermal or other recorded performance fields are no longer discarded as identical during leaf reduction.

## Scope priority and mount profile

A selected scope is a hard constraint in every objective, including maximum Ergo. An infeasible selection never falls back to iron sights. Practical mounting retains the selected scope and main weapon parts, with the same recoil and at most 4 displayed Ergo points lost. It first minimizes reviewed high-profile mounts/risers, then reviewed specialized housings, then non-low sight mounts, then total sight mounts; it then optimizes Ergo, weight, part count and price. This can choose a lower route even with the same or a larger mount count.

Profiles use reviewed stable IDs in dist/mount-profiles.mjs, based on source item names and descriptions. Unknown mounts are neutral; there is no claim to measure all possible sight heights or sight-picture obstruction. The four-point tolerance applies to the entire simplification, not separately to each stage.
