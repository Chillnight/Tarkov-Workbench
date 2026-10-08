TARKOV WORKBENCH 1.9.0.8
Author: CA

Handguard heat and cooling are shown beside attachment stats. Compatible
replacements with better known thermal values can win at equal Ergo/recoil,
without worsening either value or replacing mounted children. Weight and
price decide between incomparable improvements. Run Update database once
after upgrading an older saved snapshot to load these fields.

Extract the entire ZIP to a new folder. Double-click Tarkov-Workbench.exe.
Keep all extracted files and folders together; they are required.
Close any older running instance first. The GUI header shows v1.9.0.6.

Windows 10/11 x64. No installation, browser, Node.js or account required.
The root EXE starts the bundled Electron runtime directly. The application,
initial database, images and optimizer are in resources/. Some runtime
DLLs must stay beside the EXE. Nothing is extracted at startup.
No extra launcher or separate .NET installation is needed.
Security scanning and disk speed can still affect startup time.

The app opens with a workbench banner and no selected weapon or build.
Open Select weapon and type inside the dropdown (Mod, Mod4, VAL...).
Use arrow keys and Enter, or click a result. Escape closes the menu.
Non-moddable weapons, including flares, are hidden.
Dropdown pictures show complete standard weapon reference builds.
Choose scope offers pictures, magnification filters and a scope search.
No scope defaults to iron sights. Scope and mount effects are included.
Select an objective and suppressor variant, then Calculate build.
No build is loaded or calculated before this explicit action.
Copy list exports a build as text. There is no personal preset library yet.

MANUAL DATABASE UPDATES
Choose Update database below Retrieved, then Download update to confirm.
Data source: tarkov.dev / The Hideout (community data).
Hosts: json.tarkov.dev for data/names, assets.tarkov.dev for additional images.
Stay offline closes the prompt without starting a download.
There are no automatic startup checks or background updates.
New data is validated and saved before replacing the active database.
A failed or cancelled update keeps the previous local database.
Updates remain available offline after restarting this app on the same PC.
After data changes, cached results are cleared; Calculate build is still manual.
An EFT patch can precede the community source update. Check the data timestamp.
Normal data updates no longer require a new EXE; app/importer changes still do.
See UPDATES.md in this folder for details.

Downloaded data, additional images and calculation caches are stored in the
Windows user profile (AppData/Roaming/Tarkov Workbench), not beside the EXE.
Portable means no installer; local profile data does not travel with the ZIP.
Optional wiki/source links open the browser only when clicked.
The Portable ZIP is unsigned. An installer may also be offered as a
separate GitHub Release download.
Electron and Chromium licenses are in the root. Copy the entire folder to move
the app to another PC. An app release replaces the complete package.

Escape from Tarkov and item images belong to Battlestate Games or their owners.
Independent community tool, not operated by Battlestate Games.

PRACTICAL MOUNTS
Prefer practical mounts is enabled by default: fewer sight mounts, at most
4 Ergo less and the same recoil. Turn it off for maximum stats.
Balanced uses a 0-100 Ergo target; an unreachable target falls back to the
highest achievable value. Practical mounts may lower it by up to 4 more points.
See PRACTICAL-MOUNTS.md for details and AVAILABILITY.md for Arena filtering.

Trader settings and loadout (v1.8):
Settings opens on first launch and is available beside Update database.
Set trader loyalty levels; quest-unlocked offers are included by default.
Choose pictured scopes and magazines with complete compatibility checks.
Underbarrel launchers are excluded by default; opt in on the main screen.
Vendor prices break ties between equivalent builds.
Barters are included by default, with recipes and estimated ingredient values.
Disable barter offers in Settings if desired. Flea Market items are enabled by default;
prices use saved 24-hour averages and access/item unlock levels are assumed.
Use Update database once if your saved catalog has no market data yet.
Disable Include Flea Market items for trader and factory parts only.
Live listings and other weapon bundles are not modeled.
See TRADERS-AND-LOADOUT.md for details.

Selected scopes remain mandatory in every mode.
Trader levels use clickable 1-4 boxes.
Practical mounting prioritizes reviewed low-profile routes within four Ergo.

Version 1.9.0.6 checks complete suppressor assemblies and explains unavailable
variants in a popup. Invalid budgets also show a popup. Scope and magazine
lists refresh when the budget changes. Equivalent leaf choices are reduced
before optimization without changing performance or compatibility priorities.
Factory-preset parts remain available without standalone offers, and
iron-sight routes are checked across the assembly.
Factory parts are included with the selected weapon and need no extra purchase.

PROGRAM UPDATES
Check for updates is separate from Update database. It checks GitHub only
when clicked. Equal or older releases are never offered as updates.
Confirm Download and restart to download and verify the complete app ZIP.
Your database and settings in your user profile are kept. The app stays
at the same location; old and temporary files are removed after success.
See UPDATES.md for recovery and manual download instructions.
