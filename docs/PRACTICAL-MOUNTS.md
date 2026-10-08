# Practical mounts and Balanced targets

Author: CA

Version 1.6 enables **Prefer practical mounts** by default. Turn it off to use the maximum-stat reference build for your chosen objective. The preference is stored locally and included in the calculation cache key. Changing it clears the displayed build without calculating automatically.

## Practical mounting

The optimizer first calculates the reference build for Ergo, Recoil or Balanced. It then searches for fewer sight-supporting mounts, with at most **4 displayed Ergo points** lost and the **same recoil modifier**. The selected optic, suppressor requirement, magazine and main weapon part counts are retained. Mounts and iron sights may change to support a simpler mounting route. Mixed-use sight rails count; magwells and ordinary non-sight accessories do not count as sight mounts.

In version 1.6 it changed results only when sight-mount count decreased; version 1.8 also accepts a lower-profile route (see below). Among equally simple routes, it maximizes ergonomics, then minimizes weight and redundant parts. It never removes necessary mounts or ignores compatibility. A long mounting chain remains if no shorter compatible route meets the limits. This is a bounded simplification of the reference build, not a claim that all possible changes to the entire weapon were compared for simplicity.

The result and copied list report the Ergo difference, unchanged recoil and number of removed mounting parts. If no improvement exists, the reference build is retained. Turning the toggle off restores strict statistical optimization.

## Balanced target

The slider now represents a target on the **0–100 Ergo scale**: 75% means 75 Ergo, rather than 75% of a weapon-specific maximum. The default target is 80. The reference build minimizes recoil while reaching that target when possible. If the highest achievable Ergo is below the target, that achievable maximum becomes the reference target instead; equal-recoil results prefer higher ergonomics.

Practical mounting may reduce the reference Ergo by up to 4 points, even below the requested Balanced target. The result displays requested and achieved Ergo, any shortfall, and explains when the weapon cannot reach the requested value. An incompatible scope, missing required part or impossible suppressor variant still yields no valid build: only the Ergo target is flexible.

Existing caches are invalidated by engine version 1.6.0. Data exports, saved database snapshots and copied text are not rewritten by this change.

## Mount profile priority (1.8)

Before minimizing mount count, practical mode avoids reviewed high-profile mounts and risers, then prefers reviewed low-profile routes. A switch can apply at equal mount count. The total Ergo loss remains at most four points with exactly the same recoil. Selected optics and magazines remain fixed. See TRADERS-AND-LOADOUT.md for the current priority order and classification limits.

## Standard mounts and weight (1.8.1)

Practical mode avoids reviewed specialized housings (currently the T-1 Sunshade) after high-profile mounts and before preferring low routes and minimizing mount count. An ordinary compatible mount wins even if it costs more. Specialized mounts remain available when needed and as manual alternatives. The same total four-Ergo bound and unchanged recoil apply.

At equal objective performance, every mode minimizes total weight before redundant part count and vendor price while **Prefer lighter parts** is on (the default). Since 1.9.0.8 the toggle can be turned off: known offers and price then come first, followed by part count and weight. Slim Line and DS150 stocks, for example, have matching performance in the bundled snapshot but differ by 295 g; DS150 wins despite its higher price. Both can appear as alternatives, with the weight difference shown.
