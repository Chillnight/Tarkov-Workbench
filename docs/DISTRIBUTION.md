# Distribution

Author: CA

The GitHub repository is the source project. End users should use the `Tarkov-Workbench-Online-Portable.zip` GitHub Release asset instead of the green Code / Download ZIP button, which downloads source files and is not an installable application. Extract the complete portable ZIP and run the EXE in its root. An installer may be offered in a later release. The older offline portable build and the current local installer build contain a database snapshot and item images; neither is part of the public release.

For a release without a redistributed game-data snapshot or item images, run `npm run portable:online` and offer `Tarkov-Workbench-Online-Portable.zip`. Its root EXE opens an initial setup dialog naming the data and image hosts. The user chooses whether to download; the app validates the full data set and all required images before saving them for offline use. No download begins on startup without that choice. This edition needs an internet connection once and does not include the bundled images or catalog.

After synchronizing and verifying the local game data, build the installer with `npm run installer:build`. The output is `release/Tarkov-Workbench-Setup.exe`, with a stable filename, and `release/Tarkov-Workbench-Setup.sha256`. The one-click installer installs for the current user without requiring administrator rights, creates Start Menu and desktop shortcuts, and launches the app after setup. Building does not install or publish it. The source checkout's image and catalog exclusions have no effect on what the installer embeds.

Before making the release public, confirm permission to redistribute the Escape from Tarkov item images and snapshot. The tarkov.dev API is publicly available for community tools, but that alone is not an explicit license for repackaging game artwork. Moving the same images from Git history into an installer or Release asset does not change this question. If redistribution cannot be confirmed, use an installer that retrieves the data from the provider with clear first-run consent and local caching, subject to the provider's terms.

The installer and portable builds are unsigned. Self-signed test certificates are not used for distribution because they do not make the app or its DLLs trusted by Windows Smart App Control. A public release needs a separate distribution/signing decision; a new installer filename or GitHub hosting alone does not solve Windows reputation blocks.

Keep the repository's source history. GitHub Releases hold binary downloads separately from source commits. If a clean initial Git history is wanted later, prepare and review a replacement branch before changing the remote; deleting the entire repository is unnecessary for this distribution layout.
