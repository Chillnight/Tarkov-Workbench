# Arena availability filter

Author: CA

Version 1.5 excludes known Arena unlock items by default. Uncheck **Exclude Arena unlocks** if you want to use those rewards. The preference is saved locally. The filter covers all three objectives, both suppressor variants, scope mounting paths and equivalent alternatives. The two known reward weapons are hidden while filtering. Changing the filter clears the displayed result; it never starts a calculation. An excluded selected sight is cleared with a notice and returns to iron sights.

**View known unlock items** shows the actual names and acquisition sources from the active catalog. The result caption and copied list record the filter. Included reward attachments carry an unlock badge. Caches include the filter and engine version, so an unrestricted build cannot be reused as a filtered result.

## Reviewed rules, 30 September 2026

Rules are explicit stable item IDs in `dist/availability.mjs`, applied to both bundled and downloaded catalogs. Current tarkov.dev item exports do not provide a reliable BattlePass/Tactical Map/crate unlock flag. Neither a missing trader offer nor a flea-market restriction proves an Arena requirement. Normal Ref items are deliberately retained, including the FC1 mount/spacer (the sight itself is restricted).

Sources checked:

- [Official EFT Wiki: Phase5 UMS](https://escapefromtarkov.fandom.com/wiki/AR-15_Phase5_Universal_Mini_Stock): Black via Factory Tactical Map, Yellow via Season 2, Red via Echo Belli.
- [Arena Season 1](https://tarkov-market.com/arena/battle-pass/season-1): FALKE LE, SwampFox Justice and Radian Model 1 weapon.
- [Arena Season 2](https://tarkov-market.com/arena/battle-pass/season-2): GRIDLOK handguards and yellow parts, IRBIS grips, FC1/R1X sights, yellow Chevron/UMS and Redline weapon.
- [Factory Tactical Map](https://tarkov-market.com/arena/battle-pass/factory-map): Gladman Skeleton, black Chevron/UMS, black GRIDLOK base/extension.
- [Echo Belli](https://tarkov-market.com/arena/battle-pass/echo-belli-crate): red GRIDLOK base/extension, Chevron and UMS.
- [Arena Season 3 rewards](https://tarkovbot.eu/arena/battlepass/levels): Ravage stock, Hexion Tech Seeker sight, Unique-ARs HEX handguard and grey heat shield, grey Cheese Grater mod.1/mod.2 handguards, and the Scourge P90. The red and yellow Ravage variants are grouped with the reward stock because they share the exclusive Arena item family; the source list names the base stock only.
- [Official EFT Wiki: FC1 mount](https://escapefromtarkov.fandom.com/wiki/DI_Optical_FC1_sight_mount): ordinary Ref LL2 offer; not marked as a BattlePass unlock.

The five Redline-specific components are conservatively classified through the Season 2 reward weapon and their catalog identity, rather than a separate confirmed trader-unlock flag. Their normal variants remain usable. Season 0, Customs Tactical Map and Ref's Drop I were also reviewed; no additional weapon attachments were identified in those reward lists. Armor, clothing and cosmetics are outside this builder's catalog.

## Limits and maintenance

This is a reviewed list, not an account/stash check or a guarantee of exhaustive future restrictions. This Arena filter does not infer loot, gifts or budget. Version 1.7 separately adds trader levels and a quest-offer toggle; see TRADERS-AND-LOADOUT.md. **Update database** refreshes stats, images, compatibility and trader cash offers but does not discover new Arena unlocks. Unknown future IDs remain available until reviewed. Update the registry and this document when rewards change, bump the engine version, run availability tests and regenerate precomputed results before distributing a new app release. Do not infer unlocks by matching names or excluding every Ref/noFlea item.
