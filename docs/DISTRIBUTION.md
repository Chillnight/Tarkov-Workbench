# Distribution

Author: CA

Offer both Windows release assets: `Tarkov-Workbench-Setup.exe` for installation and `Tarkov-Workbench-Online-Portable.zip` for portable use. Publish each with its matching `.sha256` asset. GitHub's Code / Download ZIP contains source files, not a ready-to-run app.

## Installer

Run `npm run installer:build` after preparing the pinned native solver runtime. The output is `release/installer/Tarkov-Workbench-Setup.exe` and `Tarkov-Workbench-Setup.sha256`. The English setup wizard offers installation for everyone or only the current Windows account, a selectable installation directory and an optional desktop shortcut. It adds a Start menu shortcut and an uninstaller in Windows Installed apps. The default system-wide installation requests administrator access and uses Program Files. Choose 'Only for me' for a writable user location without administrator access. Setup checks write access before copying app files and asks to close only the Workbench executable in the selected target folder. Other portable copies, setup executables and uninstallers are not terminated.

Existing installed copies can be updated with the same installer. The setup remembers the existing location and desktop shortcut preference. Updates replace the installed program; they do not leave a separate old app copy. Uninstalling removes program files and shortcuts while retaining settings and downloaded data in the user's Roaming profile. Keep personal files outside the application folder.

## Portable

Run `npm run portable:online` to create `Online-Portable/`, `Tarkov-Workbench-Online-Portable.zip` and its checksum. Extract the complete ZIP into a dedicated writable folder and open its root `Tarkov-Workbench.exe`.

## Local data and updates

Both public editions exclude downloaded Escape from Tarkov item data and images. First launch asks before downloading from the named providers. Existing database, settings and saved builds under `AppData/Roaming/Tarkov Workbench` are shared by both editions and preserved when installing, updating or uninstalling. Nothing is downloaded by the setup wizard.

**Check for updates** selects the matching distribution. Portable updates verify and replace the ZIP contents at the same location. Installed app updates verify the setup executable and open the English wizard with the existing target directory; the app closes after the installer starts. The user must complete setup. Cancelling setup leaves the installed version in place. The downloaded setup is cached under the user profile and removed on a later app launch when it is no longer locked. Database updates remain separate and manual.

Both builds include the native solver runtimes and their third-party notices. Neither requires Node.js, Python or a compiler on the user's PC. Both are unsigned; an installer does not add Windows trust or avoid Smart App Control. Building does not install or publish the output.
