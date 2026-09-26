# Calibre import integration review

Integrated PR #13 with main while retaining the existing book discovery, Agent and Home entry points. The manifest remains at 4.4.0; this merge does not publish a release or replace existing release assets.

Additional review fixes:
- Check the actual source file size before reading, and resolve symlinks before enforcing the Calibre library boundary.
- Invalidate pending search results when the modal closes.
- Keep translation validation for both main's tx(key) and the Calibre modal's tx(plugin, key).
- Raise the project-defined bundle budget from 5.2 MB to 5.3 MB: the standard bundle is 5,226,947 bytes, versus 5,180,754 on main. This accommodates the import implementation and translated UI without removing existing features; it is not an official Obsidian limit.

Validation: 267 tests pass, including a real Python/SQLite fixture search and file-copy checks for exact bytes, oversized files and symlink escape. Source ESLint, 1,351 translation keys, standard build/release verification and community build/release verification pass. Dependencies were installed from the lockfile with npm ci.

The contributor reports macOS testing with a real Calibre library. This integration review has not independently exercised the modal in Obsidian or tested Windows/Linux devices. No public release is included.
